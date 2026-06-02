// src/routes/auth.routes.js
// -----------------------------------------------
// Routes = URL paths define karna
// Flask mein: @app.route("/send-otp", methods=["POST"])
// Node mein:  router.post('/send-otp', controller)
//
// Farak yeh hai ke Node mein:
//   - URL (route) alag file mein
//   - Logic (controller) alag file mein
// Flask mein dono ek saath the
// -----------------------------------------------

const express = require('express');

// express.Router() - ek mini app banata hai sirf routes ke liye
const router = express.Router();

// Controller import karo - wahan actual logic hai
const { sendOtp, verifyOtp, forgotPinVerify, forgotPinReset } = require('../controllers/auth.controller');

router.post('/send-otp',           sendOtp);
router.post('/verify-otp',         verifyOtp);
router.post('/forgot-pin/verify',  forgotPinVerify);
router.post('/forgot-pin/reset',   forgotPinReset);

module.exports = router;