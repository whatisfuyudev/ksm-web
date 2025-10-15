require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const postsRoutes = require('./routes/posts');
const commentRoutes = require('./routes/comments');

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

app.use('/api/posts', postsRoutes);
app.use('/api/comments', commentRoutes);

const MONGO = process.env.MONGO_URI || 'mongodb://mongodb:27017/twitter_clone';
mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> app.listen(process.env.PORT || 4001, ()=> console.log('Post service running on port', process.env.PORT || 4001)))
  .catch(err=> console.error('Mongo connect error', err));
