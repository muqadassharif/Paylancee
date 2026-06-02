require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const connectDB    = require('./src/config/db');
const cookieParser = require('cookie-parser');
const dns          = require('dns');

// DNS fix for mobile hotspot / restrictive networks
dns.setServers(['1.1.1.1', '8.8.8.8']);

connectDB();

const app = express();

app.use(express.json());
app.use(cors({
    origin: process.env.ORIGIN || 'http://localhost:5000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser());

const authRoutes      = require('./src/routes/auth.routes');
const userRoutes      = require('./src/routes/user.routes');
const paymentRoutes   = require('./src/routes/payment.routes');
const adminRoutes     = require('./src/routes/admin.routes');
const biometricRoutes = require('./src/routes/biometric.routes');
const kycRoutes       = require('./src/routes/kyc.routes');

app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', paymentRoutes);
app.use('/api', adminRoutes);
app.use('/api', biometricRoutes);
app.use('/api', kycRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ✅ Cache fix — browser ko har baar fresh files milein
app.use(express.static(path.join(__dirname), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            // HTML files kabhi cache nahi hongi
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.match(/\.(js|css)$/)) {
            // JS/CSS — 1 minute cache, phir revalidate
            res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
        }
    }
}));
app.use('/static', express.static(path.join(__dirname, 'static'), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.match(/\.(js|css)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
        }
    }
}));

const PORT = process.env.PORT || 5000;

// Vercel serverless ke liye module.exports, local ke liye app.listen
if (process.env.VERCEL) {
    module.exports = app;
} else {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Paylance Server: http://localhost:${PORT}`);
        console.log(`🌐 Network: http://192.168.0.106:${PORT}`);
        console.log(`💳 JazzCash: Sandbox Mode`);
    });
}
