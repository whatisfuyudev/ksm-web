require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');

const Notification = require('./models/Notification');
const makeAuthMiddleware = require('./middleware/authService');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('tiny'));

const {
  PORT = 4002,
  MONGODB_URI = 'mongodb://localhost:27017/notifications',
  SERVICE_KEY = 'CHANGE_ME',
  AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || '',
  JWT_SECRET = process.env.JWT_SECRET || ''
} = process.env;

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('mongodb connected'))
  .catch(e => { console.error(e); process.exit(1); });

// internal create notification endpoint (called by other services) protected by SERVICE_KEY
app.post('/api/internal/notify', async (req, res) => {
  try {
    const key = req.headers['x-service-key'];
    if(!key || key !== SERVICE_KEY) return res.status(401).json({ message: 'invalid service key' });

    const { recipientId, actorId, actorUsername, type, postId, commentId, meta } = req.body;
    if(!recipientId || !actorId || !type) return res.status(400).json({ message: 'missing fields' });

    if(recipientId === actorId) return res.json({ ok: true, skipped: 'self' });

    // For like: remove previous like notifications from same actor on same post (prevents duplicates)
    if(type === 'like') {
      await Notification.deleteMany({ recipientId, actorId, type: 'like', postId });
    }

    const note = await Notification.create({
      recipientId, actorId, actorUsername: actorUsername || null,
      type, postId: postId || null, commentId: commentId || null, meta: meta || {}
    });

    res.json({ ok: true, notification: note });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'error' });
  }
});

const authMiddleware = makeAuthMiddleware({ authUrl: AUTH_SERVICE_URL || null, jwtSecret: JWT_SECRET || null });
app.use('/api/notifications', authMiddleware, require('./routes/notifications'));

app.listen(PORT, () => console.log('notification service listening on', PORT));
