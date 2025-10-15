const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// register
router.post('/register', async (req,res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if(!username || !email || !password) return res.status(400).json({ message: 'missing fields' });
    const exists = await User.findOne({ $or: [{username},{email}] });
    if(exists) return res.status(409).json({ message: 'username/email taken' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, email, passwordHash: hash, displayName });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, displayName: user.displayName } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'server error' });
  }
});

// login
router.post('/login', async (req,res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    const user = await User.findOne({ $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }] });
    if(!user) return res.status(401).json({ message: 'invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if(!ok) return res.status(401).json({ message: 'invalid credentials' });
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, username: user.username, displayName: user.displayName } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'server error' });
  }
});

const authMiddleware = (req,res,next) => {
  const header = req.headers.authorization;
  if(!header) return res.status(401).json({ message: 'no token' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) { return res.status(401).json({ message: 'invalid token' }); }
};

router.get('/me', authMiddleware, async (req,res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    res.json({ user });
  } catch(e) { res.status(500).json({ message: 'server error' }); }
});

module.exports = router;
