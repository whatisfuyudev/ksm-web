// message-service/src/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { type: String },
  email: { type: String },
  displayName: { type: String },
  avatarUrl: { type: String }
}, { collection: 'users' });

module.exports = mongoose.model('User', UserSchema);
