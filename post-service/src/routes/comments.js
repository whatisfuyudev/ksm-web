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

    // try to attach author info
    try {
      const r = await axios.get(`${AUTH_URL}/api/users/${comment.authorId}`);
      comment.author = r.data.user || { username: comment.authorId };
    } catch(e){
      comment.author = { username: comment.authorId };
    }

    res.json({ comment });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

// get comments for post (default: top-level only)
router.get('/:postId', async (req,res) => {
  try {
    const { postId } = req.params;
    if(!mongoose.Types.ObjectId.isValid(postId)) return res.status(400).json({ message: 'invalid post id' });

    // Default: return top-level comments only (parentCommentId == null)
    const comments = await Comment.find({ postId, parentCommentId: null }).sort({ createdAt: 1 }).lean();

    // attach author info for each comment
    const commentsWithAuthor = await Promise.all(comments.map( async c => {
      try {
        const r = await axios.get(`${AUTH_URL}/api/users/${c.authorId}`);
        c.author = r.data.user || { username: c.authorId };
      } catch(e){
        c.author = { username: c.authorId };
      }
      return c;
    }));

    res.json({ comments: commentsWithAuthor });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

// get immediate replies for a comment (one level)
router.get('/replies/:commentId', async (req,res) => {
  try {
    const { commentId } = req.params;
    if(!mongoose.Types.ObjectId.isValid(commentId)) return res.status(400).json({ message: 'invalid comment id' });
    const replies = await Comment.find({ parentCommentId: commentId }).sort({ createdAt: 1 }).lean();
    const repliesWithAuthor = await Promise.all(replies.map( async r => {
      try {
        const rr = await axios.get(`${AUTH_URL}/api/users/${r.authorId}`);
        r.author = rr.data.user || { username: r.authorId };
      } catch(e){ r.author = { username: r.authorId }; }
      return r;
    }));
    res.json({ replies: repliesWithAuthor });
  } catch(e){ console.error(e); res.status(500).json({ message:'error' }); }
});

module.exports = router;
