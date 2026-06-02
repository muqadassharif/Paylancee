// src/routes/kyc.routes.js

const express = require('express');
const router  = express.Router();

const { submitKyc, getKycStatus, getCards, updateCardStatus } = require('../controllers/kyc.controller');

// KYC
router.post ('/kyc/submit',           submitKyc);
router.get  ('/kyc/status/:mobile',   getKycStatus);

// Cards
router.get  ('/cards/:mobile',             getCards);
router.patch('/cards/:mobile/:cardId',     updateCardStatus);

module.exports = router;
