// src/controllers/user.controller.js
// -----------------------------------------------
// Yahan sab kuch hota hai:
// Register, Login, Transactions, Balance, Goals, etc.
// -----------------------------------------------

// ✅ Yeh karo
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// -----------------------------------------------
// REGISTER — naya account banana
// POST /api/register
// -----------------------------------------------
const register = async (req, res) => {
  try {
    const { name, mobile, cnic, email, pin } = req.body;

    // Validation
    if (!name || !mobile || !cnic || !email || !pin) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (mobile.length !== 11 || !mobile.startsWith("03")) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }
    if (pin.length !== 5) {
      return res.status(400).json({ message: "PIN must be 5 digits" });
    }

    // Check karo ke mobile already registered hai
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: "Mobile number already registered" });
    }

    // PIN hash karo before saving
    const hashedPin = await bcrypt.hash(pin, 10);

    // Naya user banao
    const newUser = new User({
      name,
      mobile,
      cnic,
      email,
      pin: hashedPin,
      balance: 25000,
    });
    await newUser.save();

    res.status(201).json({
      message: "Account created successfully",
      user: {
        name: newUser.name,
        mobile: newUser.mobile,
        email: newUser.email,
        balance: newUser.balance,
      },
    });
  } catch (error) {
    console.error("Register error:", error.message);
    res.status(500).json({ message: "Server error during registration" });
  }
};

// -----------------------------------------------
// LOGIN — mobile + PIN se login karna
// POST /api/login
// -----------------------------------------------
const login = async (req, res) => {
  try {
    const { mobile, pin } = req.body;

    if (!mobile || !pin) {
      return res.status(400).json({ message: "Mobile and PIN required" });
    }

    // Mobile se user dhundho
    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(401).json({ message: "Invalid mobile number or PIN" });
    }

    // PIN verify karo
    // Pehle check karo ke PIN already hashed hai ya plain text (purane users ke liye)
    let pinMatch = false;
    const isHashed = user.pin.startsWith("$2");
    if (isHashed) {
      pinMatch = await bcrypt.compare(pin, user.pin);
    } else {
      // Purana plain text PIN — match karo aur hash kar ke save karo
      pinMatch = user.pin === pin;
      if (pinMatch) {
        user.pin = await bcrypt.hash(pin, 10);
        await user.save();
      }
    }

    if (!pinMatch) {
      return res.status(401).json({ message: "Invalid mobile number or PIN" });
    }
    // ✅ Yeh karo — token banao aur cookie mein set karo
    const token = jwt.sign({ mobile: user.mobile }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

   // ✅ Naya
    res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // ← Fix
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
   });

    res.json({
      message: "Login successful",
      user: {
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        cnic: user.cnic,
        balance: user.balance,
        cashbackPoints: user.cashbackPoints,
        monthlyBudget: user.monthlyBudget,
        monthlySpent: user.monthlySpent,
        accountType: user.accountType,
        transactionLimit: user.transactionLimit,
        kyc: user.kyc
          ? { status: user.kyc.status, rejectReason: user.kyc.rejectReason }
          : null,
        cards: user.cards,
        biometricEnabled: user.biometricEnabled,
        twoFactorEnabled: user.twoFactorEnabled,
        transactions: user.transactions,
        goals: user.goals,
        recurringPayments: user.recurringPayments,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Server error during login" });
  }
};

// -----------------------------------------------
// GET USER — user ki poori info lena
// GET /api/user/:mobile
// -----------------------------------------------
const getUser = async (req, res) => {
  try {
    const user = await User.findOne({ mobile: req.params.mobile });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      cnic: user.cnic,
      balance: user.balance,
      cashbackPoints: user.cashbackPoints,
      monthlyBudget: user.monthlyBudget,
      accountType: user.accountType,
      monthlySpent: user.monthlySpent,
      kyc: user.kyc
        ? { status: user.kyc.status, rejectReason: user.kyc.rejectReason }
        : null,
      cards: user.cards,
      biometricEnabled: user.biometricEnabled,
      twoFactorEnabled: user.twoFactorEnabled,
      transactions: user.transactions,
      goals: user.goals,
      recurringPayments: user.recurringPayments,
    });
  } catch (error) {
    console.error("Get user error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// ADD TRANSACTION — transaction add karna aur balance update karna
// POST /api/transaction
// -----------------------------------------------
const addTransaction = async (req, res) => {
  try {
    const { mobile, type, title, recipient, amount } = req.body;

    if (!mobile || !type || !title || !amount) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Sirf checks ke liye read
    const userCheck = await User.findOne({ mobile });
    if (!userCheck) {
      return res.status(404).json({ message: "User not found" });
    }

    // Balance check
    if ((type === "sent" || type === "bill") && amount > userCheck.balance) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // Transaction limit check
    const limit =
      userCheck.transactionLimit ||
      (userCheck.accountType === "verified" ? 500000 : 25000);
    if ((type === "sent" || type === "bill") && amount > limit) {
      return res.status(400).json({
        message: `Transaction limit exceeded. Your limit is Rs ${limit.toLocaleString()}`,
      });
    }

    // Suspicious activity entry (agar large txn ho)
    const suspiciousEntry =
      (type === "sent" || type === "bill") && amount >= limit * 0.8
        ? {
            type: "large_transaction",
            description: `Large ${type} of Rs ${amount} (${Math.round((amount / limit) * 100)}% of limit)`,
            amount,
            date: new Date(),
          }
        : null;

    const newTxn = { type, title, recipient, amount, date: new Date() };
    const balanceDelta = type === "received" ? amount : -amount;
    const cashbackDelta = type !== "received" ? Math.floor(amount / 100) : 0;

    // ✅ Atomic update — version conflict nahi hoga
    const pushOp = {
      transactions: { $each: [newTxn], $position: 0, $slice: 50 },
    };
    if (suspiciousEntry) pushOp.suspiciousActivity = suspiciousEntry;

    const updatedUser = await User.findOneAndUpdate(
      { mobile },
      {
        $inc: { balance: balanceDelta, cashbackPoints: cashbackDelta },
        $push: pushOp,
      },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Recipient ka balance bhi atomic update
    if (
      type === "sent" &&
      recipient &&
      recipient.length === 11 &&
      recipient.startsWith("03")
    ) {
      await User.findOneAndUpdate(
        { mobile: recipient },
        {
          $inc: { balance: amount },
          $push: {
            transactions: {
              $each: [{
                type: "received",
                title: `Received from ${userCheck.name || mobile}`,
                recipient: mobile,
                amount,
                date: new Date(),
              }],
              $position: 0,
              $slice: 50,
            },
          },
        }
      );
    }

    res.json({
      message: "Transaction successful",
      balance: updatedUser.balance,
      cashbackPoints: updatedUser.cashbackPoints,
      transaction: updatedUser.transactions[0],
    });
  } catch (error) {
    console.error("Transaction error:", error.message);
    res.status(500).json({ message: "Server error during transaction" });
  }
};

// -----------------------------------------------
// UPDATE BALANCE — sirf balance update karna (add money)
// PATCH /api/user/:mobile/balance
// -----------------------------------------------
const updateBalance = async (req, res) => {
  try {
    const { amount, method } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valid amount required" });
    }

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.balance += amount;
    user.transactions.unshift({
      type: "received",
      title: `Added via ${method || "Bank"}`,
      recipient: "Paylance Account",
      amount,
    });
    if (user.transactions.length > 50)
      user.transactions = user.transactions.slice(0, 50);

    await user.save();
    res.json({
      message: "Balance updated",
      balance: user.balance,
      transaction: user.transactions[0],
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// UPDATE PIN — PIN change karna
// PATCH /api/user/:mobile/pin
// -----------------------------------------------
const updatePin = async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    const pinMatch = await bcrypt.compare(currentPin, user.pin);
    if (!pinMatch) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }

    user.pin = await bcrypt.hash(newPin, 10);
    await user.save();

    res.json({ message: "PIN updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// UPDATE PROFILE — name/email update karna
// PATCH /api/user/:mobile/profile
// -----------------------------------------------
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;

    await user.save();
    res.json({
      message: "Profile updated",
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// UPDATE SETTINGS — biometric/2FA/budget
// PATCH /api/user/:mobile/settings
// -----------------------------------------------
const updateSettings = async (req, res) => {
  try {
    const { biometricEnabled, twoFactorEnabled, monthlyBudget } = req.body;

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (biometricEnabled !== undefined)
      user.biometricEnabled = biometricEnabled;
    if (twoFactorEnabled !== undefined)
      user.twoFactorEnabled = twoFactorEnabled;
    if (monthlyBudget !== undefined) user.monthlyBudget = monthlyBudget;

    await user.save();
    res.json({ message: "Settings updated" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// ADD GOAL — financial goal add karna
// POST /api/user/:mobile/goals
// -----------------------------------------------
const addGoal = async (req, res) => {
  try {
    const { name, target, current, date } = req.body;

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.goals.push({ name, target, current: current || 0, date });
    await user.save();

    res.json({ message: "Goal added", goals: user.goals });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// UPDATE GOAL — goal mein paise add karna
// PATCH /api/user/:mobile/goals/:goalId
// -----------------------------------------------
const updateGoal = async (req, res) => {
  try {
    const { amount } = req.body;

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    const goal = user.goals.id(req.params.goalId);
    if (!goal) return res.status(404).json({ message: "Goal not found" });

    goal.current += amount;
    await user.save();

    res.json({ message: "Goal updated", goals: user.goals });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// DELETE GOAL
// DELETE /api/user/:mobile/goals/:goalId
// -----------------------------------------------
const deleteGoal = async (req, res) => {
  try {
    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.goals.pull(req.params.goalId);
    await user.save();

    res.json({ message: "Goal deleted", goals: user.goals });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// ADD RECURRING PAYMENT
// POST /api/user/:mobile/recurring
// -----------------------------------------------
const addRecurring = async (req, res) => {
  try {
    const { title, amount, schedule, date } = req.body;

    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.recurringPayments.push({
      title,
      amount,
      schedule,
      date,
      active: true,
    });
    await user.save();

    res.json({
      message: "Recurring payment added",
      recurringPayments: user.recurringPayments,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// TOGGLE RECURRING PAYMENT
// PATCH /api/user/:mobile/recurring/:paymentId
// -----------------------------------------------
const toggleRecurring = async (req, res) => {
  try {
    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    const payment = user.recurringPayments.id(req.params.paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    payment.active = !payment.active;
    await user.save();

    res.json({
      message: "Recurring payment toggled",
      recurringPayments: user.recurringPayments,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// REDEEM CASHBACK
// POST /api/user/:mobile/redeem
// -----------------------------------------------
const redeemCashback = async (req, res) => {
  try {
    const user = await User.findOne({ mobile: req.params.mobile });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.cashbackPoints < 100) {
      return res
        .status(400)
        .json({ message: "Need at least 100 points to redeem" });
    }

    const redeemAmount = Math.floor(user.cashbackPoints / 100) * 10;
    user.balance += redeemAmount;
    user.cashbackPoints = user.cashbackPoints % 100;

    user.transactions.unshift({
      type: "received",
      title: "Cashback Redeemed",
      recipient: "Paylance Rewards",
      amount: redeemAmount,
    });

    await user.save();

    res.json({
      message: `Redeemed Rs ${redeemAmount}`,
      balance: user.balance,
      cashbackPoints: user.cashbackPoints,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// -----------------------------------------------
// FORGOT PIN DIRECT RESET — CNIC/DOB flow
// PATCH /api/forgot-pin/direct-reset
// -----------------------------------------------
const forgotPinDirectReset = async (req, res) => {
  try {
    const { mobile, newPin } = req.body;

    if (!mobile || !newPin) {
      return res.status(400).json({ message: "Mobile and new PIN required" });
    }
    if (newPin.length !== 5) {
      return res.status(400).json({ message: "PIN must be 5 digits" });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.pin = await bcrypt.hash(newPin, 10);
    await user.save();

    res.json({ message: "PIN reset successfully" });
  } catch (error) {
    console.error("Direct PIN reset error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};


// -----------------------------------------------
// GET CURRENT USER — cookie se verify karke user data do
// GET /api/user/me
// -----------------------------------------------
const getCurrentUser = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.user.mobile });
        if (!user) return res.status(404).json({ message: 'User not found' });

        res.json({
            user: {
                name:              user.name,
                mobile:            user.mobile,
                email:             user.email,
                cnic:              user.cnic,
                balance:           user.balance,
                cashbackPoints:    user.cashbackPoints,
                monthlyBudget:     user.monthlyBudget,
                monthlySpent:      user.monthlySpent,
                accountType:       user.accountType,
                transactionLimit:  user.transactionLimit,
                kyc:               user.kyc ? { status: user.kyc.status, rejectReason: user.kyc.rejectReason } : null,
                cards:             user.cards,
                biometricEnabled:  user.biometricEnabled,
                twoFactorEnabled:  user.twoFactorEnabled,
                transactions:      user.transactions,
                goals:             user.goals,
                recurringPayments: user.recurringPayments
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// -----------------------------------------------
// LOGOUT — cookie clear karo
// POST /api/logout
// -----------------------------------------------
// ✅ Naya
const logout = (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ message: 'Logged out successfully' });
};

// -----------------------------------------------
// VERIFY RECEIVER — send money se pehle check karo
// GET /api/user/verify/:mobile
// -----------------------------------------------
const verifyReceiver = async (req, res) => {
    try {
        const user = await User.findOne({ mobile: req.params.mobile });
        if (!user) {
            return res.status(404).json({ message: 'User not registered on Paylance' });
        }
        return res.json({ name: user.name, mobile: user.mobile });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
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
    verifyReceiver  // ← naya
};