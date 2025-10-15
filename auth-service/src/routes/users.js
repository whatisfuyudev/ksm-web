const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/:id', async (req,res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select('username displayName avatarUrl createdAt').lean();
    if(!user) return res.status(404).json({ message: 'not found' });
    res.json({ user });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

module.exports = router;
