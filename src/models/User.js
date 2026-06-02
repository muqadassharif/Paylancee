// src/models/User.js
// -----------------------------------------------
// MongoDB mein User ka structure define karna
// Har user ka ek document hoga database mein
// -----------------------------------------------

const mongoose = require('mongoose');

// Transaction ka structure
const transactionSchema = new mongoose.Schema({
    type:      { type: String, enum: ['sent', 'received', 'bill'], required: true },
    title:     { type: String, required: true },
    recipient: { type: String, default: '' },
    amount:    { type: Number, required: true },
    date:      { type: Date, default: Date.now }
});

// Financial Goal ka structure
const goalSchema = new mongoose.Schema({
    name:      { type: String, required: true },
    target:    { type: Number, required: true },
    current:   { type: Number, default: 0 },
    date:      { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Recurring Payment ka structure
const recurringSchema = new mongoose.Schema({
    title:    { type: String, required: true },
    amount:   { type: Number, required: true },
    schedule: { type: String, default: 'Monthly' },
    date:     { type: String },
    active:   { type: Boolean, default: true }
});

// Passkey (WebAuthn) ka structure
const passkeySchema = new mongoose.Schema({
    credentialID:  { type: String, required: true },
    publicKey:     { type: String, required: true },
    counter:       { type: Number, default: 0 },
    transports:    [{ type: String }],
    registeredAt:  { type: Date, default: Date.now }
});

/// ✅ Naya — required hatao
const cardSchema = new mongoose.Schema({
    cardNumber: { type: String, default: '' },
    expiry:     { type: String, default: '' },
    cvv:        { type: String, default: '' },
    cardType:   { type: String, enum: ['virtual', 'physical'], default: 'virtual' },
    status:     { type: String, enum: ['active', 'frozen', 'hidden'], default: 'active' },
    issuedAt:   { type: Date, default: Date.now }
});

// KYC ka structure
const kycSchema = new mongoose.Schema({
    fullName:     { type: String },
    dateOfBirth:  { type: String },
    address:      { type: String },
    cnicFront:    { type: String },
    cnicBack:     { type: String },
    selfie:       { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'none'], default: 'none' },
    submittedAt:  { type: Date, default: Date.now },
    reviewedAt:   { type: Date },
    rejectReason: { type: String }
});

// Suspicious activity log ka structure
const suspiciousSchema = new mongoose.Schema({
    type:        { type: String, required: true }, // e.g. 'large_transaction', 'multiple_fails'
    description: { type: String },
    amount:      { type: Number },
    flaggedAt:   { type: Date, default: Date.now },
    resolved:    { type: Boolean, default: false }
});

// Main User schema
const userSchema = new mongoose.Schema({
    name:               { type: String, required: true },
    mobile:             { type: String, required: true, unique: true },
    cnic:               { type: String, required: true },
    email:              { type: String, required: true },
    pin:                { type: String, required: true },
    balance:            { type: Number, default: 25000 },
    cashbackPoints:     { type: Number, default: 0 },
    monthlyBudget:      { type: Number, default: 50000 },
    monthlySpent:       { type: Number, default: 0 },
    accountType:        { type: String, enum: ['basic', 'verified'], default: 'basic' },
    transactionLimit:   { type: Number, default: 25000 },  // basic: 25k, verified: 500k
    biometricEnabled:   { type: Boolean, default: false },
    passkeys:           [passkeySchema],
    twoFactorEnabled:   { type: Boolean, default: false },
    kyc:                { type: kycSchema, default: null },
    cards:              [cardSchema],
    suspiciousActivity: [suspiciousSchema],
    transactions:       [transactionSchema],
    goals:              [goalSchema],
    recurringPayments:  [recurringSchema],
    createdAt:          { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
