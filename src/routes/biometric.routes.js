// src/routes/biometric.routes.js
// WebAuthn / Biometric routes

const express = require('express');
const router  = express.Router();

const {
    getRegisterOptions,
    verifyRegister,
    getAuthOptions,
    verifyAuth,
    disableBiometric,
} = require('../controllers/biometric.controller');

// Registration flow
router.post('/biometric/register-options', getRegisterOptions);
router.post('/biometric/register-verify',  verifyRegister);

// Authentication flow
router.post('/biometric/auth-options', getAuthOptions);
router.post('/biometric/auth-verify',  verifyAuth);

// Disable
router.post('/biometric/disable', disableBiometric);

module.exports = router;
