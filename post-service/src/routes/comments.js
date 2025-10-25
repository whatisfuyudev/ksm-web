// post-service/src/routes/comments.js
const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const axios = require('axios');

const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:4000';

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

    // attach author info
    try {
      const r = await axios.get(`${AUTH_URL}/api/users/${comment.authorId}`, { timeout: 2000 });
      comment.author = r.data.user || { username: comment.authorId };
    } catch(e){
      comment.author = { username: comment.authorId };
    }

    res.json({ comment });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

// get comments for post (top-level only)
router.get('/:postId', async (req,res) => {
  try {
    const { postId } = req.params;
    if(!mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ message: 'invalid post id' });

    // top-level comments (parentCommentId == null)
    let comments = await Comment.find({ postId, parentCommentId: null }).sort({ createdAt: 1 }).lean();

    // for each comment determine if it has children and attach author info
    const commentsWithMeta = await Promise.all(comments.map(async c => {
      try {
        const r = await axios.get(`${AUTH_URL}/api/users/${c.authorId}`);
        c.author = r.data.user || { username: c.authorId };
      } catch(e){
        c.author = { username: c.authorId };
      }
      // hasChildren: is there any comment with parentCommentId == c._id
      try {
        const cnt = await Comment.countDocuments({ parentCommentId: c._id });
        c.hasChildren = cnt > 0;
      } catch(e){
        c.hasChildren = false;
      }
      return c;
    }));

    res.json({ comments: commentsWithMeta });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

// get immediate replies for a comment (one level)
router.get('/replies/:commentId', async (req,res) => {
  try {
    const { commentId } = req.params;
    if(!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ message: 'invalid comment id' });

    const replies = await Comment.find({ parentCommentId: commentId }).sort({ createdAt: 1 }).lean();

    // attach author + hasChildren for each reply
    const repliesWithMeta = await Promise.all(replies.map(async r => {
      try {
        const rr = await axios.get(`${AUTH_URL}/api/users/${r.authorId}`);
        r.author = rr.data.user || { username: r.authorId };
      } catch(e){ r.author = { username: r.authorId }; }

      try {
        const cnt = await Comment.countDocuments({ parentCommentId: r._id });
        r.hasChildren = cnt > 0;
      } catch(e) {
        r.hasChildren = false;
      }
      return r;
    }));

    res.json({ replies: repliesWithMeta });
  } catch(e){ console.error(e); res.status(500).json({ message:'error' }); }
});

module.exports = router;
