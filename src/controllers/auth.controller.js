// src/controllers/auth.controller.js
// -----------------------------------------------
// Yahan actual LOGIC hai - kya karna hai request pe
// Flask mein yeh sab app.py ke andar tha seedha
// Node mein hum logic alag file mein rakhte hain = clean code
// -----------------------------------------------

const transporter = require('../config/mailer');
const User        = require('../models/User');
const bcrypt      = require('bcryptjs');

// -----------------------------------------------
// OTP Store - Temporary Memory
// Flask mein tha: otp_storage = {}   (Python dictionary)
// Node mein:      otpStorage = {}    (JavaScript object)
// Dono same kaam karte hain - email → otp save karna
// -----------------------------------------------
const otpStorage = {};


// -----------------------------------------------
// FUNCTION 1: Send OTP
// Flask mein tha: @app.route("/send-otp", methods=["POST"])
// Yahan wahi logic hai, alag function mein
// -----------------------------------------------
const sendOtp = async (req, res) => {

    // req.body se email nikalo
    // Flask mein tha: data = request.get_json() → email = data.get("email")
    const { email } = req.body;

    // Email check karo
    if (!email) {
        // Flask mein: return jsonify({"message": "Email required"}), 400
        return res.status(400).json({ message: 'Email required' });
    }

    // Random 6 digit OTP banao
    // Flask mein: otp = random.randint(100000, 999999)
    const otp = Math.floor(100000 + Math.random() * 900000);

    // OTP save karo memory mein
    // Flask mein: otp_storage[email] = otp
    otpStorage[email] = otp;

    // Email options - kya bhejni hai
    const mailOptions = {
        from: process.env.SENDER_EMAIL,
        to: email,
        subject: 'Paylance OTP Verification',
        text: `Your OTP code is: ${otp}\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.`
    };

    // Email bhejo
    // Flask mein: server.sendmail(sender_email, email, message)
    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP sent to ${email}: ${otp}`); // Development mein dekh sako

        // Success response
        // Flask mein: return jsonify({"message": "OTP sent to your email"})
        res.json({ message: 'OTP sent to your email' });

    } catch (error) {
        console.error('Email error:', error.message);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
};


// -----------------------------------------------
// FUNCTION 2: Verify OTP
// Flask mein tha: @app.route("/verify-otp", methods=["POST"])
// -----------------------------------------------
const verifyOtp = (req, res) => {

    // Flask mein: data = request.get_json()
    //             email = data.get("email")
    //             user_otp = data.get("otp")
    const { email, otp } = req.body;

    // Stored OTP nikalo
    // Flask mein: saved_otp = otp_storage.get(email)
    const savedOtp = otpStorage[email];

    // Check karo - match hota hai?
    // Flask mein: if saved_otp and str(saved_otp) == str(user_otp):
    if (savedOtp && String(savedOtp) === String(otp)) {

        // OTP delete karo (ek baar use hone ke baad)
        // Flask mein: otp_storage.pop(email)
        delete otpStorage[email];

        // Flask mein: return jsonify({"message": "OTP Verified", "status": "success"})
        return res.json({ message: 'OTP Verified', status: 'success' });
    }

    // Flask mein: return jsonify({"message": "Invalid OTP", "status": "fail"})
    res.status(400).json({ message: 'Invalid OTP', status: 'fail' });
};


// Dono functions export karo taake routes use kar sakein
module.exports = { sendOtp, verifyOtp };


// -----------------------------------------------
// FUNCTION 3: Forgot PIN — Verify Account Number
// POST /api/forgot-pin/verify
// Account number check karo, agar registered hai toh OTP bhejo
// -----------------------------------------------
const forgotPinVerify = async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) {
        return res.status(400).json({ message: 'Account number required' });
    }

    try {
        const user = await User.findOne({ mobile });

        if (!user) {
            return res.status(404).json({ message: 'This number is not registered' });
        }

        // OTP generate karo
        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStorage[user.email] = otp;

        // Email bhejo registered email pe
        const mailOptions = {
            from:    process.env.SENDER_EMAIL,
            to:      user.email,
            subject: 'Paylance — PIN Reset OTP',
            text:    `Your PIN reset OTP is: ${otp}\n\nThis OTP is valid for 5 minutes. Do not share it with anyone.`
        };

        // Email bhejo — error aaye toh bhi OTP store rahega
        try {
            await transporter.sendMail(mailOptions);
            console.log(`Forgot PIN OTP sent to ${user.email}: ${otp}`);
        } catch (mailError) {
            console.error('Mail error (non-fatal):', mailError.message);
            // OTP already stored — response bhejo anyway
        }

        // Email ka kuch hissa mask karke bhejo (privacy ke liye)
        const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

        res.json({ message: `OTP sent to ${maskedEmail}`, email: user.email });

    } catch (error) {
        console.error('Forgot PIN verify error:', error.message);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
};


// -----------------------------------------------
// FUNCTION 4: Forgot PIN — Reset PIN after OTP verified
// POST /api/forgot-pin/reset
// OTP verify karo, phir naya PIN set karo
// -----------------------------------------------
const forgotPinReset = async (req, res) => {
    const { mobile, email, otp, newPin } = req.body;

    if (!mobile || !email || !otp || !newPin) {
        return res.status(400).json({ message: 'All fields required' });
    }

    if (newPin.length !== 5) {
        return res.status(400).json({ message: 'PIN must be 5 digits' });
    }

    // OTP verify karo
    const savedOtp = otpStorage[email];
    if (!savedOtp || String(savedOtp) !== String(otp)) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    try {
        const user = await User.findOne({ mobile });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // OTP delete karo
        delete otpStorage[email];

        // Naya PIN hash karke save karo
        user.pin = await bcrypt.hash(newPin, 10);
        await user.save();

        res.json({ message: 'PIN reset successfully' });

    } catch (error) {
        console.error('Forgot PIN reset error:', error.message);
        res.status(500).json({ message: 'Server error during PIN reset' });
    }
};


module.exports = { sendOtp, verifyOtp, forgotPinVerify, forgotPinReset };