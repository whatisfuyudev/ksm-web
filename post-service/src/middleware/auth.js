const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

module.exports = (req,res,next) => {
  const h = req.headers.authorization;
  if(!h) return res.status(401).json({ message:'no token' });
  const t = h.split(' ')[1];
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch(e) { return res.status(401).json({ message:'invalid token' }); }
};
