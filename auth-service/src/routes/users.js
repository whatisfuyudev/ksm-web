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
    delete user.passwordHash;
    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

// PATCH /api/users/:id
// Update profile fields (displayName, avatarUrl) — only owner allowed
router.patch('/:id', async (req, res) => {
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

    const userId = req.params.id;
    if (String(payload.id) !== String(userId)) {
      return res.status(403).json({ message: 'forbidden' });
    }

    const allowed = {};
    if (typeof req.body.displayName !== 'undefined') allowed.displayName = req.body.displayName;
    if (typeof req.body.avatarUrl !== 'undefined') allowed.avatarUrl = req.body.avatarUrl;

    // if nothing to update
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ message: 'nothing to update' });
    }

    const user = await User.findByIdAndUpdate(userId, { $set: allowed }, { new: true })
      .select('username displayName avatarUrl createdAt')
      .lean();

    if (!user) return res.status(404).json({ message: 'not found' });

    res.json({ user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

// GET /api/users/search?q=...&limit=...&page=...
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ users: [], total: 0 });

    // escape regex special chars
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(esc, 'i');

    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({
        $or: [
          { username: regex },
          { displayName: regex }
        ]
      })
        .select('username displayName avatarUrl createdAt')
        .limit(limit)
        .skip(skip)
        .lean(),
      User.countDocuments({
        $or: [
          { username: regex },
          { displayName: regex }
        ]
      })
    ]);

    res.json({ users, total });
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
