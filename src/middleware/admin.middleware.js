// src/middleware/admin.middleware.js
// Admin JWT token verify karna

const jwt = require('jsonwebtoken');

const adminProtect = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Admin access denied. No token.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized as admin.' });
        }

        req.admin = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired admin token.' });
    }
};

module.exports = adminProtect;
