const express = require('express');
const router  = express.Router();
const { jazzCashPay, paymentStatus } = require('../controllers/payment.controller');

router.post('/payment/jazzcash',         jazzCashPay);
router.get ('/payment/status/:txnRefNo', paymentStatus);

module.exports = router;
