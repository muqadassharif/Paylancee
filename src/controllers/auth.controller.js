const transporter = require('../config/mailer');
const User        = require('../models/User');
const bcrypt      = require('bcryptjs');

// OTP ab DB mein store hota hai — Vercel serverless safe

// FUNCTION 1: Send OTP
const sendOtp = async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email required' });

    const otp = Math.floor(100000 + Math.random() * 900000);

    await User.findOneAndUpdate(
        { email },
        { otpCode: String(otp), otpExpiry: new Date(Date.now() + 5 * 60 * 1000) }
    );

    const mailOptions = {
        from:    process.env.SENDER_EMAIL,
        to:      email,
        subject: 'Paylance OTP Verification',
        text:    `Your OTP code is: ${otp}\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ message: 'OTP sent to your email' });
    } catch (error) {
        console.error('Email error:', error.message);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
};

// FUNCTION 2: Verify OTP
const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user || !user.otpCode) {
            return res.status(400).json({ message: 'Invalid OTP', status: 'fail' });
        }
        if (user.otpExpiry && new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'OTP expired', status: 'fail' });
        }
        if (String(user.otpCode) !== String(otp)) {
            return res.status(400).json({ message: 'Invalid OTP', status: 'fail' });
        }
        await User.findOneAndUpdate({ email }, { otpCode: null, otpExpiry: null });
        return res.json({ message: 'OTP Verified', status: 'success' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', status: 'fail' });
    }
};

// FUNCTION 3: Forgot PIN — mobile verify karke OTP bhejo
const forgotPinVerify = async (req, res) => {
    const { mobile } = req.body;
    if (!mobile) return res.status(400).json({ message: 'Account number required' });

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'This number is not registered' });

        const otp = Math.floor(100000 + Math.random() * 900000);

        // DB mein store karo
        await User.findOneAndUpdate(
            { mobile },
            { otpCode: String(otp), otpExpiry: new Date(Date.now() + 5 * 60 * 1000) }
        );

        const mailOptions = {
            from:    process.env.SENDER_EMAIL,
            to:      user.email,
            subject: 'Paylance — PIN Reset OTP',
            text:    `Your PIN reset OTP is: ${otp}\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.`
        };

        try {
            await transporter.sendMail(mailOptions);
        } catch (mailError) {
            console.error('Mail error (non-fatal):', mailError.message);
        }

        const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        res.json({ message: `OTP sent to ${maskedEmail}`, email: user.email });

    } catch (error) {
        console.error('Forgot PIN verify error:', error.message);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
};

// FUNCTION 4: Forgot PIN — OTP verify karke PIN reset karo
const forgotPinReset = async (req, res) => {
    const { mobile, email, otp, newPin } = req.body;

    if (!mobile || !email || !otp || !newPin) {
        return res.status(400).json({ message: 'All fields required' });
    }
    if (newPin.length !== 5) {
        return res.status(400).json({ message: 'PIN must be 5 digits' });
    }

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.otpCode || String(user.otpCode) !== String(otp)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }
        if (user.otpExpiry && new Date() > user.otpExpiry) {
            return res.status(400).json({ message: 'OTP expired' });
        }

        user.pin = await bcrypt.hash(newPin, 10);
        user.otpCode = null;
        user.otpExpiry = null;
        await user.save();

        res.json({ message: 'PIN reset successfully' });

    } catch (error) {
        console.error('Forgot PIN reset error:', error.message);
        res.status(500).json({ message: 'Server error during PIN reset' });
    }
};

module.exports = { sendOtp, verifyOtp, forgotPinVerify, forgotPinReset };
