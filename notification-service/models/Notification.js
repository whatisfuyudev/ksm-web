const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true, index: true },
  actorId: { type: String, required: true },
  actorUsername: { type: String },
  type: { type: String, enum: ['comment','reply','like'], required: true },
  postId: { type: String },
  commentId: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

NotificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
