// src/controllers/payment.controller.js
// JazzCash Sandbox Integration

const crypto = require('crypto');

// JazzCash Sandbox Credentials (.env se aate hain)
const MERCHANT_ID   = process.env.JAZZCASH_MERCHANT_ID;
const PASSWORD      = process.env.JAZZCASH_PASSWORD;
const INTEGRITY_SALT = process.env.JAZZCASH_INTEGRITY_SALT;
const SANDBOX_URL   = 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction';

// HMAC-SHA256 hash banana — JazzCash signature
function generateHash(params) {
    // Sort keys alphabetically, concat values with integrity salt
    const sortedKeys = Object.keys(params).sort();
    const hashString = INTEGRITY_SALT + '&' + sortedKeys.map(k => params[k]).join('&');
    return crypto.createHmac('sha256', INTEGRITY_SALT).update(hashString).digest('hex');
}

// Format date: YYYYMMDDHHmmss
function getDateTime() {
    return new Date().toISOString().replace(/[-T:.Z]/g, '').substring(0, 14);
}

// Unique transaction ref
function getTxnRef() {
    return 'T' + Date.now();
}

// -----------------------------------------------
// POST /api/payment/jazzcash
// Body: { mobile, amount, description }
// -----------------------------------------------
const jazzCashPay = async (req, res) => {
    try {
        const { mobile, amount, description } = req.body;

        if (!mobile || !amount) {
            return res.status(400).json({ message: 'Mobile and amount required' });
        }

        const txnRefNo  = getTxnRef();
        const dateTime  = getDateTime();
        const expiryTime = getDateTime(); // same for sandbox

        const params = {
            pp_Version:        '2.0',
            pp_TxnType:        'MWALLET',
            pp_Language:       'EN',
            pp_MerchantID:     MERCHANT_ID,
            pp_Password:       PASSWORD,
            pp_TxnRefNo:       txnRefNo,
            pp_Amount:         String(Math.round(amount * 100)), // paisas mein
            pp_TxnCurrency:    'PKR',
            pp_TxnDateTime:    dateTime,
            pp_BillReference:  'billRef',
            pp_Description:    description || 'Paylance Payment',
            pp_TxnExpiryDateTime: expiryTime,
            pp_ReturnURL:      process.env.JAZZCASH_RETURN_URL || 'http://localhost:5000/api/payment/callback',
            pp_MobileNumber:   mobile,
        };

        params.pp_SecureHash = generateHash(params);

        // JazzCash API call
        const response = await fetch(SANDBOX_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(params)
        });

        const result = await response.json();

        // pp_ResponseCode '000' = success in JazzCash
        if (result.pp_ResponseCode === '000') {
            return res.json({
                success:    true,
                message:    'Payment successful',
                txnRefNo:   result.pp_TxnRefNo,
                amount:     amount,
                responseCode: result.pp_ResponseCode
            });
        } else {
            return res.status(400).json({
                success:      false,
                message:      result.pp_ResponseMessage || 'Payment failed',
                responseCode: result.pp_ResponseCode
            });
        }

    } catch (error) {
        console.error('JazzCash error:', error.message);
        res.status(500).json({ message: 'Payment gateway error', error: error.message });
    }
};

// -----------------------------------------------
// GET /api/payment/status/:txnRefNo
// -----------------------------------------------
const paymentStatus = async (req, res) => {
    try {
        const { txnRefNo } = req.params;

        const params = {
            pp_Version:    '2.0',
            pp_TxnType:    'MWALLET',
            pp_Language:   'EN',
            pp_MerchantID: MERCHANT_ID,
            pp_Password:   PASSWORD,
            pp_TxnRefNo:   txnRefNo,
        };

        params.pp_SecureHash = generateHash(params);

        const response = await fetch('https://sandbox.jazzcash.com.pk/ApplicationAPI/API/PaymentInquiry/Inquire', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(params)
        });

        const result = await response.json();
        res.json(result);

    } catch (error) {
        res.status(500).json({ message: 'Status check failed', error: error.message });
    }
};

module.exports = { jazzCashPay, paymentStatus };
