// src/controllers/biometric.controller.js
// -----------------------------------------------
// WebAuthn (Passkeys / Biometric) Logic
// Face ID / Fingerprint ke liye
// -----------------------------------------------

const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const User = require('../models/User');

// App ka domain (Render pe deploy hone ke baad woh URL use hoga)
const RP_NAME = 'Paylance';
const RP_ID   = process.env.RP_ID   || 'localhost';      // Render pe: yourapp.onrender.com
const ORIGIN  = process.env.ORIGIN  || 'http://localhost:5000';

// Temporary challenge store (production mein Redis use karo)
const challengeStore = {};


// -----------------------------------------------
// STEP 1: Registration Options generate karo
// POST /api/biometric/register-options
// User pehli baar biometric enroll karta hai
// -----------------------------------------------
const getRegisterOptions = async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) return res.status(400).json({ message: 'Mobile required' });

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const options = await generateRegistrationOptions({
            rpName:                 RP_NAME,
            rpID:                   RP_ID,
            userID:                 Buffer.from(user._id.toString()),
            userName:               user.mobile,
            userDisplayName:        user.name,
            timeout:                60000,
            attestationType:        'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',  // Device ka biometric use karo
                userVerification:        'required',
                residentKey:             'preferred',
            },
            excludeCredentials: (user.passkeys || []).map(pk => ({
                id:         Buffer.from(pk.credentialID, 'base64').toString('base64url'),
                type:       'public-key',
                transports: pk.transports || [],
            })),
        });

        // Challenge save karo temporarily
        challengeStore[mobile] = options.challenge;

        res.json(options);

    } catch (err) {
        console.error('Register options error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};


// -----------------------------------------------
// STEP 2: Registration verify karo
// POST /api/biometric/register-verify
// Browser ne biometric scan kiya, ab verify karo
// -----------------------------------------------
const verifyRegister = async (req, res) => {
    const { mobile, credential } = req.body;

    if (!mobile || !credential) return res.status(400).json({ message: 'Missing fields' });

    const expectedChallenge = challengeStore[mobile];
    if (!expectedChallenge) return res.status(400).json({ message: 'Challenge expired. Try again.' });

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const verification = await verifyRegistrationResponse({
            response:          credential,
            expectedChallenge,
            expectedOrigin:    ORIGIN,
            expectedRPID:      RP_ID,
        });

        if (!verification.verified) {
            return res.status(400).json({ message: 'Biometric verification failed' });
        }

        // Check if registrationInfo exists and has required fields
        if (!verification.registrationInfo || !verification.registrationInfo.credential) {
            return res.status(400).json({ message: 'Invalid registration data' });
        }

        const { credential: newCredential } = verification.registrationInfo;

        // Passkey save karo user ke document mein
        if (!user.passkeys) user.passkeys = [];

        user.passkeys.push({
            credentialID:     newCredential.id,
            publicKey:        Buffer.from(newCredential.publicKey).toString('base64'),
            counter:          newCredential.counter,
            transports:       credential.response?.transports || [],
            registeredAt:     new Date(),
        });

        user.biometricEnabled = true;
        await user.save();

        // Challenge delete karo
        delete challengeStore[mobile];

        res.json({ message: 'Biometric registered successfully!', verified: true });

    } catch (err) {
        console.error('Register verify error:', err);
        res.status(500).json({ message: 'Verification error: ' + err.message });
    }
};


// -----------------------------------------------
// STEP 3: Authentication Options generate karo
// POST /api/biometric/auth-options
// Dobara login ke waqt
// -----------------------------------------------
const getAuthOptions = async (req, res) => {
    const { mobile } = req.body;

    if (!mobile) return res.status(400).json({ message: 'Mobile required' });

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.biometricEnabled || !user.passkeys || user.passkeys.length === 0) {
            return res.status(400).json({ message: 'Biometric not registered for this account' });
        }

        const options = await generateAuthenticationOptions({
            rpID:    RP_ID,
            timeout: 60000,
            allowCredentials: user.passkeys.map(pk => ({
                id:         Buffer.from(pk.credentialID, 'base64').toString('base64url'),
                type:       'public-key',
                transports: pk.transports || [],
            })),
            userVerification: 'required',
        });

        // Challenge save karo
        challengeStore[mobile + '_auth'] = options.challenge;

        res.json(options);

    } catch (err) {
        console.error('Auth options error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};


// -----------------------------------------------
// STEP 4: Authentication verify karo
// POST /api/biometric/auth-verify
// -----------------------------------------------
const verifyAuth = async (req, res) => {
    const { mobile, credential } = req.body;

    if (!mobile || !credential) return res.status(400).json({ message: 'Missing fields' });

    const expectedChallenge = challengeStore[mobile + '_auth'];
    if (!expectedChallenge) return res.status(400).json({ message: 'Challenge expired. Try again.' });

    try {
        const user = await User.findOne({ mobile })
            .populate('transactions goals recurringPayments');

        if (!user) return res.status(404).json({ message: 'User not found' });

        // Matching passkey dhoondo
        const passkey = user.passkeys.find(
            pk => pk.credentialID === credential.id ||
                  Buffer.from(pk.credentialID, 'base64').toString('base64url') === credential.id
        );

        if (!passkey) return res.status(400).json({ message: 'Passkey not found' });

        const verification = await verifyAuthenticationResponse({
            response:          credential,
            expectedChallenge,
            expectedOrigin:    ORIGIN,
            expectedRPID:      RP_ID,
            credential: {
                id:        credential.id,
                publicKey: Buffer.from(passkey.publicKey, 'base64'),
                counter:   passkey.counter,
                transports: passkey.transports,
            },
        });

        if (!verification.verified) {
            return res.status(400).json({ message: 'Biometric authentication failed' });
        }

        // Counter update karo (replay attack prevention)
        passkey.counter = verification.authenticationInfo.newCounter;
        await user.save();

        // Challenge delete karo
        delete challengeStore[mobile + '_auth'];

        // Login success — user data bhejo (same as normal login)
        res.json({
            message: 'Biometric login successful',
            user: {
                _id:               user._id,
                name:              user.name,
                mobile:            user.mobile,
                email:             user.email,
                balance:           user.balance,
                cashbackPoints:    user.cashbackPoints,
                monthlyBudget:     user.monthlyBudget,
                biometricEnabled:  user.biometricEnabled,
                goals:             user.goals,
                recurringPayments: user.recurringPayments,
                transactions:      user.transactions,
            }
        });

    } catch (err) {
        console.error('Auth verify error:', err);
        res.status(500).json({ message: 'Verification error: ' + err.message });
    }
};


// -----------------------------------------------
// DISABLE biometric
// POST /api/biometric/disable
// -----------------------------------------------
const disableBiometric = async (req, res) => {
    const { mobile } = req.body;
    if (!mobile) return res.status(400).json({ message: 'Mobile required' });

    try {
        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.biometricEnabled = false;
        user.passkeys         = [];
        await user.save();

        res.json({ message: 'Biometric disabled' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};


module.exports = {
    getRegisterOptions,
    verifyRegister,
    getAuthOptions,
    verifyAuth,
    disableBiometric,
};
