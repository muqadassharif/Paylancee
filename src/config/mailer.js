// src/config/mailer.js
// -----------------------------------------------
// Yeh file Nodemailer setup karti hai
// Flask mein tha: smtplib.SMTP_SSL("smtp.gmail.com")
// Node mein same kaam Nodemailer karta hai
// -----------------------------------------------

const nodemailer = require('nodemailer');

// "Transporter" matlab email bhejna ka darwaza
// Flask mein: server = smtplib.SMTP_SSL(...)
//             server.login(sender_email, app_password)
const transporter = nodemailer.createTransport({
    service: 'gmail',           // Gmail use kar raha hai
    auth: {
        user: process.env.SENDER_EMAIL,   // .env se aata hai
        pass: process.env.APP_PASSWORD    // .env se aata hai
    }
});

module.exports = transporter;