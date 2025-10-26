// message-service/src/middleware/auth.js
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'Invalid token format' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change_this_jwt_secret_for_dev');

    const userId = decoded.id || decoded.userId || decoded.sub;
    if (!userId) return res.status(401).json({ error: 'Invalid token payload' });

    req.userId = String(userId);
    req.user = {
      id: req.userId,
      username: decoded.username || decoded.name || null,
      email: decoded.email || null
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error && error.message ? error.message : error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
