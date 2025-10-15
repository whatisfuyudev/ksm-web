require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);

const MONGO = process.env.MONGO_URI || 'mongodb://mongodb:27017/twitter_clone';
mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> app.listen(process.env.PORT || 4000, ()=> console.log('Auth service running on port', process.env.PORT || 4000)))
  .catch(err=> console.error('Mongo connect error', err));
