// src/controllers/admin.controller.js
// -----------------------------------------------
// Admin Panel ke liye saara logic yahan hai
// -----------------------------------------------

const Admin = require('../models/Admin');
const User  = require('../models/User');
const jwt   = require('jsonwebtoken');

// -----------------------------------------------
// ADMIN SETUP — pehli baar admin account banana
// POST /api/admin/setup
// Sirf tab kaam karta hai jab koi admin na ho
// -----------------------------------------------
const setupAdmin = async (req, res) => {
    try {
        const count = await Admin.countDocuments();
        if (count > 0) {
            return res.status(403).json({ message: 'Admin already exists. Use login.' });
        }

        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const admin = new Admin({ username, password });
        await admin.save();

        res.status(201).json({ message: 'Admin account created successfully! You can now login.' });

    } catch (error) {
        console.error('Admin setup error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// ADMIN LOGIN
// POST /api/admin/login
// -----------------------------------------------
const adminLogin = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password required' });
        }

        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const match = await admin.matchPassword(password);
        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // JWT token banao — 8 ghante valid
        const token = jwt.sign(
            { id: admin._id, username: admin.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({ message: 'Login successful', token, username: admin.username });

    } catch (error) {
        console.error('Admin login error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// DASHBOARD STATS
// GET /api/admin/stats
// -----------------------------------------------
const getDashboardStats = async (req, res) => {
    try {
        const totalUsers    = await User.countDocuments();
        const verifiedUsers = await User.countDocuments({ accountType: 'verified' });
        const pendingKyc    = await User.countDocuments({ 'kyc.status': 'pending' });
        const allUsers      = await User.find({}, 'balance transactions createdAt');

        const totalBalance = allUsers.reduce((sum, u) => sum + (u.balance || 0), 0);
        const totalTx      = allUsers.reduce((sum, u) => sum + (u.transactions?.length || 0), 0);

        // Aaj ke naye users
        const today     = new Date();
        today.setHours(0, 0, 0, 0);
        const newToday  = await User.countDocuments({ createdAt: { $gte: today } });

        // Is hafte ke naye users
        const weekAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newWeek   = await User.countDocuments({ createdAt: { $gte: weekAgo } });

        // Total sent / received amount
        let totalSent = 0, totalReceived = 0;
        allUsers.forEach(u => {
            u.transactions?.forEach(t => {
                if (t.type === 'sent' || t.type === 'bill') totalSent += t.amount;
                if (t.type === 'received') totalReceived += t.amount;
            });
        });

        res.json({
            totalUsers,
            verifiedUsers,
            pendingKyc,
            totalBalance,
            totalTransactions: totalTx,
            newUsersToday: newToday,
            newUsersThisWeek: newWeek,
            totalSent,
            totalReceived
        });

    } catch (error) {
        console.error('Stats error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// ALL USERS LIST (with search + pagination)
// GET /api/admin/users?search=xxx&page=1&limit=20
// -----------------------------------------------
const getAllUsers = async (req, res) => {
    try {
        const { search = '', page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = search
            ? {
                $or: [
                    { name:   { $regex: search, $options: 'i' } },
                    { mobile: { $regex: search, $options: 'i' } },
                    { email:  { $regex: search, $options: 'i' } },
                    { cnic:   { $regex: search, $options: 'i' } }
                ]
              }
            : {};

        const total = await User.countDocuments(query);
        const users = await User.find(query, '-pin')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });

    } catch (error) {
        console.error('Get users error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// SINGLE USER DETAIL
// GET /api/admin/users/:mobile
// -----------------------------------------------
const getUserDetail = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile }, '-pin');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// EDIT USER (name, email, cnic, balance)
// PATCH /api/admin/users/:mobile
// -----------------------------------------------
const editUser = async (req, res) => {
    try {
        const { name, email, cnic } = req.body;

        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (name)  user.name  = name;
        if (email) user.email = email;
        if (cnic)  user.cnic  = cnic;

        await user.save();
        res.json({ message: 'User updated successfully', user: { name: user.name, email: user.email, cnic: user.cnic } });

    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// ADJUST BALANCE (admin se manually add/subtract)
// PATCH /api/admin/users/:mobile/balance
// -----------------------------------------------
const adjustBalance = async (req, res) => {
    try {
        const { amount, note } = req.body;

        if (amount === undefined || amount === null) {
            return res.status(400).json({ message: 'Amount required' });
        }

        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const parsedAmount = parseFloat(amount);
        user.balance += parsedAmount;

        if (user.balance < 0) {
            return res.status(400).json({ message: 'Balance cannot go below 0' });
        }

        // Transaction log mein bhi add karo
        user.transactions.unshift({
            type:      parsedAmount >= 0 ? 'received' : 'sent',
            title:     note || `Admin Balance Adjustment`,
            recipient: 'Admin Panel',
            amount:    Math.abs(parsedAmount)
        });
        if (user.transactions.length > 50) user.transactions = user.transactions.slice(0, 50);

        await user.save();
        res.json({ message: 'Balance adjusted successfully', newBalance: user.balance });

    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// DELETE USER
// DELETE /api/admin/users/:mobile
// -----------------------------------------------
const deleteUser = async (req, res) => {
    try {
        const user = await User.findOneAndDelete({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ message: `User ${user.name} deleted successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// USER TRANSACTIONS
// GET /api/admin/users/:mobile/transactions
// -----------------------------------------------
const getUserTransactions = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile }, 'name mobile transactions');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json({ name: user.name, mobile: user.mobile, transactions: user.transactions });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// GET ALL PENDING KYC REQUESTS
// GET /api/admin/kyc
// -----------------------------------------------
const getPendingKyc = async (req, res) => {
    try {
        const users = await User.find({ 'kyc.status': { $in: ['pending', 'approved', 'rejected'] } },
            'name mobile email cnic accountType kyc createdAt');
        res.json({ kyc: users });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// APPROVE KYC — user ko verified banao + cards issue karo
// PATCH /api/admin/kyc/:mobile/approve
// -----------------------------------------------
const approveKyc = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.kyc) return res.status(400).json({ message: 'No KYC submitted' });

        user.kyc.status     = 'approved';
        user.kyc.reviewedAt = new Date();
        user.accountType    = 'verified';
        user.transactionLimit = 500000;

        // Issue cards if not already issued
        if (!user.cards || user.cards.length === 0) {
            const rand = () => Math.floor(1000 + Math.random() * 9000);
            const expiry = () => {
                const d = new Date();
                d.setFullYear(d.getFullYear() + 4);
                return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
            };
            user.cards = [
                {
                    cardNumber: `4${rand()} ${rand()} ${rand()} ${rand()}`,
                    expiry: expiry(),
                    cvv: String(Math.floor(100 + Math.random() * 900)),
                    cardType: 'virtual',
                    status: 'active'
                },
                {
                    cardNumber: `5${rand()} ${rand()} ${rand()} ${rand()}`,
                    expiry: expiry(),
                    cvv: String(Math.floor(100 + Math.random() * 900)),
                    cardType: 'physical',
                    status: 'active'
                },
                {
                    cardNumber: `5${rand()} ${rand()} ${rand()} ${rand()}`,
                    expiry: expiry(),
                    cvv: String(Math.floor(100 + Math.random() * 900)),
                    cardType: 'physical',
                    status: 'active'
                }
            ];
        }

        await user.save();
        res.json({ message: `KYC approved for ${user.name}. Account upgraded to Verified.` });
    } catch (error) {
        console.error('KYC approve error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// REJECT KYC
// PATCH /api/admin/kyc/:mobile/reject
// Body: { reason: 'Documents unclear' }
// -----------------------------------------------
const rejectKyc = async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.kyc) return res.status(400).json({ message: 'No KYC submitted' });

        user.kyc.status       = 'rejected';
        user.kyc.reviewedAt   = new Date();
        user.kyc.rejectReason = reason || 'Documents not acceptable';

        await user.save();
        res.json({ message: `KYC rejected for ${user.name}.` });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// GET SUSPICIOUS ACTIVITY
// GET /api/admin/suspicious
// -----------------------------------------------
const getSuspiciousActivity = async (req, res) => {
    try {
        const users = await User.find(
            { 'suspiciousActivity.0': { $exists: true } },
            'name mobile email accountType suspiciousActivity'
        );

        const flags = [];
        users.forEach(u => {
            u.suspiciousActivity.forEach(a => {
                flags.push({
                    _id:         a._id,
                    userId:      u._id,
                    name:        u.name,
                    mobile:      u.mobile,
                    email:       u.email,
                    accountType: u.accountType,
                    type:        a.type,
                    description: a.description,
                    amount:      a.amount,
                    flaggedAt:   a.flaggedAt,
                    resolved:    a.resolved
                });
            });
        });

        // Sort by newest first
        flags.sort((a, b) => new Date(b.flaggedAt) - new Date(a.flaggedAt));
        res.json({ flags });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// RESOLVE SUSPICIOUS FLAG
// PATCH /api/admin/suspicious/:mobile/:flagId
// -----------------------------------------------
const resolveSuspiciousFlag = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        const flag = user.suspiciousActivity.id(req.params.flagId);
        if (!flag) return res.status(404).json({ message: 'Flag not found' });

        flag.resolved = true;
        await user.save();
        res.json({ message: 'Flag resolved' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    setupAdmin,
    adminLogin,
    getDashboardStats,
    getAllUsers,
    getUserDetail,
    editUser,
    adjustBalance,
    deleteUser,
    getUserTransactions,
    getPendingKyc,
    approveKyc,
    rejectKyc,
    getSuspiciousActivity,
    resolveSuspiciousFlag
};
