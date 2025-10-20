// auth-service/src/routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';

// GET /api/users/me
// Extract token from Authorization header, verify it, and return the user limited fields.
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ message: 'no token' });
    const token = authHeader.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: 'invalid token' });
    }

    const user = await User.findById(payload.id)
      .select('username displayName avatarUrl email createdAt') // adjust allowed fields
      .lean();
    if (!user) return res.status(404).json({ message: 'not found' });
    // avoid returning sensitive fields like passwordHash
    delete user.passwordHash;
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

// GET /api/users/search?q=...&limit=...
// Search users by username or displayName (case-insensitive).
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ users: [] });

    // escape regex special chars
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(esc, 'i');

    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const users = await User.find({
      $or: [
        { username: regex },
        { displayName: regex },
        { email: regex }
      ]
    })
      .select('username displayName avatarUrl createdAt')
      .limit(limit)
      .lean();

    res.json({ users });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

// GET /api/users/:id (existing)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('username displayName avatarUrl createdAt').lean();
    if (!user) return res.status(404).json({ message: 'not found' });
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

module.exports = router;
