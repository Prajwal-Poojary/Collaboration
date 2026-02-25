const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            token = req.headers.authorization.split(' ')[1];

            if (token === 'null' || token === 'undefined' || !token) {
                console.log(`[AuthMiddleware] Error: Received string '${token}' on ${req.originalUrl}`);
                return res.status(401).json({ message: 'Not authorized, token failed' });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            req.user = await User.findById(decoded.id).select('-password');

            next();
        } catch (error) {
            console.error(`[AuthMiddleware] JWT Error on ${req.originalUrl} with token '${token}':`, error.message);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

module.exports = { protect };
