// src/middleware/auth.middleware.js
// JWT token verify karna — protected routes ke liye

const jwt = require('jsonwebtoken');

const protect = (req, res, next) => {
    // ❌ Pehle: Header se token leta tha
    // ✅ Ab: Cookie se token lo
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { mobile }
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

module.exports = protect;