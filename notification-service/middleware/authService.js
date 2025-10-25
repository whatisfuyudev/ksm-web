const axios = require('axios');
const jwt = require('jsonwebtoken');

module.exports = function makeAuthMiddleware(opts = {}) {
  const { authUrl, jwtSecret } = opts;

  return async function authMiddleware(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ message: 'missing authorization' });
    const token = auth.replace(/^Bearer\s+/i, '');

    if (authUrl) {
      try {
        const r = await axios.get(`${authUrl}/api/auth/me`, { headers: { Authorization: 'Bearer ' + token }, timeout: 3000 });
        req.user = r.data.user || r.data;
        return next();
      } catch (e) {
        console.warn('auth-service /me call failed, fallback to local JWT if configured');
      }
    }

    if (jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        req.user = { id: payload.id || payload.sub, username: payload.username || payload.user || null };
        return next();
      } catch (e) {
        return res.status(401).json({ message: 'invalid token' });
      }
    }

    return res.status(401).json({ message: 'cannot validate token (no auth method available)' });
  };
};
