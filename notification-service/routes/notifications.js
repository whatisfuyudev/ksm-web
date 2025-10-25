const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');

// GET /api/notifications?limit=20&unreadOnly=true
router.get('/', async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if(!userId) return res.status(400).json({ message: 'missing user id' });

    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));
    const unreadOnly = req.query.unreadOnly === 'true';

    const q = { recipientId: userId };
    if(unreadOnly) q.read = false;

    const items = await Notification.find(q).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ notifications: items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

// PATCH /api/notifications/:id/read  (mark as read)
router.patch('/:id/read', async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if(!userId) return res.status(400).json({ message: 'missing user id' });

    const n = await Notification.findOneAndUpdate({ _id: req.params.id, recipientId: userId }, { $set: { read: true }}, { new: true }).lean();
    if(!n) return res.status(404).json({ message: 'not found' });
    res.json({ notification: n });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

router.patch('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user && (req.user.id || req.user._id);
    if(!userId) return res.status(400).json({ message: 'missing user id' });

    await Notification.updateMany({ recipientId: userId, read: false }, { $set: { read: true }});
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

module.exports = router;
