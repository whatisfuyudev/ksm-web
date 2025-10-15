const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/auth');
const axios = require('axios');

// create post
router.post('/', auth, async (req,res) => {
  try {
    const { content } = req.body;
    if(!content) return res.status(400).json({ message: 'missing content' });
    const post = await Post.create({ authorId: req.user.id, content });
    res.json({ post });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

// list feed (with optional embedding author via auth-service)
router.get('/', async (req,res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page||1));
    const limit = Math.min(50, parseInt(req.query.limit||20));
    const posts = await Post.find().sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).lean();
    // optional: embed author info by calling auth-service
    const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:4000';
    const postsWithAuthor = await Promise.all(posts.map( async (p) => {
      try {
        const r = await axios.get(`${AUTH_URL}/api/users/${p.authorId}`);
        p.author = r.data.user || { username: p.authorId };
      } catch(e) {
        p.author = { username: p.authorId };
      }
      return p;
    }));
    res.json({ posts: postsWithAuthor });
  } catch(e) { console.error(e); res.status(500).json({ message:'error' }); }
});

module.exports = router;
