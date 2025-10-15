const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');

// create comment/reply
router.post('/:postId', auth, async (req,res) => {
  try {
    const { postId } = req.params;
    const { content, parentCommentId } = req.body;
    if(!mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ message: 'invalid post id' });
    if(parentCommentId && !mongoose.Types.ObjectId.isValid(parentCommentId)) return res.status(400).json({ message: 'invalid parent id' });
    if(!content) return res.status(400).json({ message: 'missing content' });
    const comment = await Comment.create({
      postId, parentCommentId: parentCommentId || null,
      authorId: req.user.id, content
    });
    res.json({ comment });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

// get comments for post (flat)
router.get('/:postId', async (req,res) => {
  try {
    const { postId } = req.params;
    const comments = await Comment.find({ postId }).sort({ createdAt: 1 }).lean();
    res.json({ comments });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

module.exports = router;
