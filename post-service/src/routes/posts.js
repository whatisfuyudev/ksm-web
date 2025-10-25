// post-service/src/routes/posts.js
const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const auth = require('../middleware/auth');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:4000';
const NOTIF_URL = process.env.NOTIF_SERVICE_URL || 'http://notification-service:4002';
const NOTIF_KEY = process.env.NOTIF_SERVICE_KEY || process.env.SERVICE_KEY || 'super-secret-service-key-CHANGE_THIS';

// create post (text-only)
router.post('/', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'missing content' });
    const post = await Post.create({ authorId: req.user.id, content });
    res.json({ post });
  } catch (e) {
    console.error('POST /api/posts error:', e);
    res.status(500).json({ message: 'error' });
  }
});

// toggle like for a post (requires auth)
router.post('/:id/like', auth, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;
    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'post not found' });

    const idx = (post.likes || []).findIndex(x => String(x) === String(userId));
    let liked = false;
    if (idx === -1) {
      post.likes = post.likes || [];
      post.likes.push(userId);
      liked = true;
    } else {
      post.likes.splice(idx, 1);
      liked = false;
    }
    await post.save();
    const likesCount = (post.likes || []).length;

    // send notification only when newly liked (not when unliked)
    if (liked) {
      try {
        const recipientId = post.authorId || (post.author && post.author._id);
        if (recipientId && String(recipientId) !== String(userId)) {
          const payload = {
            recipientId,
            actorId: userId,
            actorUsername: req.user.username || null,
            type: 'like',
            postId,
            meta: {}
          };
          await axios.post(`${NOTIF_URL}/api/internal/notify`, payload, {
            headers: { 'X-SERVICE-KEY': NOTIF_KEY },
            timeout: 2000
          });
        }
      } catch(e) {
        console.warn('notify like failed', e && e.message ? e.message : e);
      }
    }

    return res.json({ liked, likesCount });
  } catch (err) {
    console.error('POST /:id/like error:', err);
    return res.status(500).json({ message: 'error' });
  }
});

/**
 * SEARCH (must be before /:id)
 * GET /api/posts/search?q=...&page=1&limit=10
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ posts: [], total: 0 });

    // pagination
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));
    const skip = (page - 1) * limit;

    // escape regex
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(esc, 'i');

    // fetch matching posts with pagination
    const [posts, total] = await Promise.all([
      Post.find({ content: regex }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Post.countDocuments({ content: regex })
    ]);

    // map meta (likesCount, liked default false)
    const postsWithMeta = posts.map(p => {
      return {
        ...p,
        likesCount: (p.likes && Array.isArray(p.likes)) ? p.likes.length : 0,
        liked: false
      };
    });

    res.json({ posts: postsWithMeta, total });
  } catch (e) {
    console.error('GET /api/posts/search error:', e);
    res.status(500).json({ message: 'error' });
  }
});

// posts by author
router.get('/author/:authorId', async (req, res) => {
  try {
    const { authorId } = req.params;
    const posts = await Post.find({ authorId }).sort({ createdAt: -1 }).lean();
    const postsWithMeta = posts.map(p => ( {
      ...p,
      likesCount: (p.likes || []).length,
      liked: false,
      author: { username: p.authorId }
    }));
    res.json({ posts: postsWithMeta });
  } catch (e) {
    console.error('GET /author/:authorId error:', e);
    res.status(500).json({ message: 'error' });
  }
});

// posts liked by user
router.get('/liked-by/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;
    const posts = await Post.find({ likes: userId }).sort({ createdAt: -1 }).lean();
    const result = posts.map(p => ({ ...p, likesCount: (p.likes || []).length, liked: true }));
    res.json({ posts: result });
  } catch (e) {
    console.error('GET /liked-by/:userId error:', e);
    res.status(500).json({ message: 'error' });
  }
});

// get single post (with likesCount & liked flag if token present)
// Keep this after /search to avoid route collision
router.get('/:id', async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await Post.findById(postId).lean();
    if (!post) return res.status(404).json({ message: 'not found' });

    // optional: detect logged user for liked flag
    let currentUserId = null;
    try {
      const authHeader = (req.headers.authorization || '');
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded && decoded.id;
      }
    } catch (e) { /* ignore token errors */ }

    const likesCount = (post.likes && Array.isArray(post.likes)) ? post.likes.length : 0;
    const liked = currentUserId ? (post.likes || []).some(id => String(id) === String(currentUserId)) : false;

    // embed author best-effort
    try {
      const r = await axios.get(`${AUTH_URL}/api/users/${post.authorId}`, { timeout: 2000 });
      post.author = r.data.user || { username: post.authorId };
    } catch (e) {
      post.author = { username: post.authorId };
    }

    post.likesCount = likesCount;
    post.liked = liked;
    delete post.likes;

    return res.json({ post });
  } catch (e) {
    console.error('GET /:id error:', e);
    res.status(500).json({ message: 'error' });
  }
});

// list feed (with likesCount and liked if token)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1));
    const limit = Math.min(50, parseInt(req.query.limit || 20));
    const posts = await Post.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();

    let currentUserId = null;
    try {
      const authHeader = (req.headers.authorization || '');
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded && decoded.id;
      }
    } catch (e) { /* ignore invalid token */ }

    const postsWithMeta = await Promise.all(posts.map(async p => {
      const likesCount = (p.likes && Array.isArray(p.likes)) ? p.likes.length : 0;
      const liked = currentUserId ? (p.likes || []).some(id => String(id) === String(currentUserId)) : false;

      try {
        const r = await axios.get(`${AUTH_URL}/api/users/${p.authorId}`, { timeout: 2000 });
        p.author = r.data.user || { username: p.authorId };
      } catch (e) {
        p.author = { username: p.authorId };
      }

      p.likesCount = likesCount;
      p.liked = liked;
      delete p.likes;
      return p;
    }));

    res.json({ posts: postsWithMeta });
  } catch (e) {
    console.error('GET /api/posts (feed) error:', e);
    res.status(500).json({ message: 'error' });
  }
});

module.exports = router;
