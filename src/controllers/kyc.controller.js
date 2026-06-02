// src/controllers/kyc.controller.js

const User = require('../models/User');

// -----------------------------------------------
// SUBMIT KYC
// POST /api/kyc/submit
// -----------------------------------------------
const submitKyc = async (req, res) => {
    try {
        const { mobile, fullName, dateOfBirth, address, cnicFront, cnicBack, selfie } = req.body;

        if (!mobile || !fullName || !dateOfBirth || !address || !cnicFront || !cnicBack || !selfie) {
            return res.status(400).json({ message: 'All KYC fields are required' });
        }

        const user = await User.findOne({ mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.accountType === 'verified') {
            return res.status(400).json({ message: 'Account is already verified' });
        }

        if (user.kyc && user.kyc.status === 'pending') {
            return res.status(400).json({ message: 'KYC already submitted and under review' });
        }

        user.kyc = { fullName, dateOfBirth, address, cnicFront, cnicBack, selfie, status: 'pending', submittedAt: new Date() };
        await user.save();

        res.json({ message: 'KYC submitted successfully. Under review.' });

    } catch (err) {
        console.error('KYC submit error:', err.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// GET KYC STATUS
// GET /api/kyc/status/:mobile
// -----------------------------------------------
const getKycStatus = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile }, 'accountType kyc');
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            accountType: user.accountType,
            kyc: user.kyc ? {
                status:       user.kyc.status,
                submittedAt:  user.kyc.submittedAt,
                reviewedAt:   user.kyc.reviewedAt,
                rejectReason: user.kyc.rejectReason
            } : null
        });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// GET CARDS
// GET /api/cards/:mobile
// -----------------------------------------------
const getCards = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile }, 'cards accountType');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ cards: user.cards, accountType: user.accountType });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// UPDATE CARD STATUS
// PATCH /api/cards/:mobile/:cardId
// Body: { status: 'frozen' | 'active' | 'hidden' }
// -----------------------------------------------
const updateCardStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'frozen', 'hidden'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const card = user.cards.id(req.params.cardId);
        if (!card) return res.status(404).json({ message: 'Card not found' });

        card.status = status;
        await user.save();

        res.json({ message: `Card ${status}`, cards: user.cards });

    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = { submitKyc, getKycStatus, getCards, updateCardStatus };
