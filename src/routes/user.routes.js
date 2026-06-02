const express  = require('express');
const router   = express.Router();
const protect  = require('../middleware/auth.middleware');

const {
    register,
    login,
    getUser,
    addTransaction,
    updateBalance,
    updatePin,
    updateProfile,
    updateSettings,
    addGoal,
    updateGoal,
    deleteGoal,
    addRecurring,
    toggleRecurring,
    redeemCashback,
    forgotPinDirectReset,
    getCurrentUser,
    logout,
    verifyReceiver
} = require('../controllers/user.controller');

router.post('/register', register);
router.post('/login',    login);

router.get  ('/user/me',             protect, getCurrentUser);
router.get  ('/user/verify/:mobile',          verifyReceiver);
router.get  ('/user/:mobile',                 getUser);

router.patch('/user/:mobile/balance',              updateBalance);
router.patch('/user/:mobile/pin',                  updatePin);
router.patch('/user/:mobile/profile',              updateProfile);
router.patch('/user/:mobile/settings',             updateSettings);

router.post ('/transaction',                       addTransaction);

router.post ('/user/:mobile/goals',                addGoal);
router.patch('/user/:mobile/goals/:goalId',        updateGoal);
router.delete('/user/:mobile/goals/:goalId',       deleteGoal);

router.post ('/user/:mobile/recurring',            addRecurring);
router.patch('/user/:mobile/recurring/:paymentId', toggleRecurring);

router.post ('/user/:mobile/redeem',               redeemCashback);

router.patch('/forgot-pin/direct-reset',           forgotPinDirectReset);

router.post ('/logout',                            logout);

module.exports = router;