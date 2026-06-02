// src/routes/admin.routes.js

const express      = require('express');
const router       = express.Router();
const adminProtect = require('../middleware/admin.middleware');

const {
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
} = require('../controllers/admin.controller');

// Public routes (no auth needed)
router.post('/admin/setup', setupAdmin);
router.post('/admin/login', adminLogin);

// Protected routes (admin token required)
router.get   ('/admin/stats',                              adminProtect, getDashboardStats);
router.get   ('/admin/users',                              adminProtect, getAllUsers);
router.get   ('/admin/users/:mobile',                      adminProtect, getUserDetail);
router.patch ('/admin/users/:mobile',                      adminProtect, editUser);
router.patch ('/admin/users/:mobile/balance',              adminProtect, adjustBalance);
router.delete('/admin/users/:mobile',                      adminProtect, deleteUser);
router.get   ('/admin/users/:mobile/transactions',         adminProtect, getUserTransactions);

// KYC routes
router.get   ('/admin/kyc',                                adminProtect, getPendingKyc);
router.patch ('/admin/kyc/:mobile/approve',                adminProtect, approveKyc);
router.patch ('/admin/kyc/:mobile/reject',                 adminProtect, rejectKyc);

// Suspicious activity routes
router.get   ('/admin/suspicious',                         adminProtect, getSuspiciousActivity);
router.patch ('/admin/suspicious/:mobile/:flagId',         adminProtect, resolveSuspiciousFlag);

module.exports = router;
