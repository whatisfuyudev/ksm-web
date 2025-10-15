const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 280 },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date, default: null }
});
PostSchema.index({ createdAt: -1 });
module.exports = mongoose.model('Post', PostSchema);
