// post-service/src/routes/comments.js
const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const axios = require('axios');

const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:4000';
const POST_SERVICE = process.env.POST_SERVICE_URL || 'http://post-service:4001';
const NOTIF_URL = process.env.NOTIF_SERVICE_URL || 'http://notification-service:4002';
const NOTIF_KEY = process.env.NOTIF_SERVICE_KEY || process.env.SERVICE_KEY || 'super-secret-service-key-CHANGE_THIS';

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

    // Attach author info (best-effort). Also ensure username is available immediately from req.user
    try {
      // try auth-service first (fast)
      const r = await axios.get(`${AUTH_URL}/api/users/${comment.authorId}`, { timeout: 2000 });
      comment.author = r.data.user || { username: req.user.username || comment.authorId };
    } catch(e){
      // fallback to token-provided username (so UI doesn't show id briefly)
      comment.author = { username: req.user.username || comment.authorId };
    }

    // --- background: build and send notification (non-blocking) ---
    (async () => {
      try {
        const actorId = req.user.id;
        const actorUsername = req.user.username || null;

        let recipientId = null;
        let notifType = parentCommentId ? 'reply' : 'comment';

        if(parentCommentId) {
          // notify owner of parent comment
          try {
            const parent = await Comment.findById(parentCommentId).lean();
            if(parent && parent.authorId) recipientId = parent.authorId;
          } catch(e) {
            console.warn('notify: failed to fetch parent comment', e && e.message ? e.message : e);
          }
        } else {
          // top-level comment -> notify post owner (ask post service)
          try {
            const pr = await axios.get(`${POST_SERVICE}/api/posts/${postId}`, { timeout: 2000 });
            if(pr.data && pr.data.post) {
              const postObj = pr.data.post;
              recipientId = postObj.authorId || (postObj.author && postObj.author._id) || null;
            }
          } catch(e) {
            console.warn('notify: cannot fetch post owner', e && e.message ? e.message : e);
          }
        }

        // do not notify actor themself
        if(recipientId && String(recipientId) !== String(actorId)) {
          // build payload minimal
          const payload = {
            recipientId,
            actorId,
            actorUsername,
            type: notifType,
            postId,
            commentId: comment._id,
            meta: { snippet: String(content || '').slice(0,200) }
          };

          // call notification service internal endpoint (service key required)
          try {
            await axios.post(`${NOTIF_URL}/api/internal/notify`, payload, {
              headers: { 'X-SERVICE-KEY': NOTIF_KEY },
              timeout: 2000
            });
          } catch(e) {
            console.warn('notify: post to notif service failed', e && e.message ? e.message : e);
          }
        }
      } catch(e) {
        console.warn('notify: unexpected error', e && e.message ? e.message : e);
      }
    })();

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
        const r = await axios.get(`${AUTH_URL}/api/users/${c.authorId}`, { timeout: 2000 });
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
        const rr = await axios.get(`${AUTH_URL}/api/users/${r.authorId}`, { timeout: 2000 });
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
