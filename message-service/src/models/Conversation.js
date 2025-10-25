const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Ensure we have exactly 2 participants
conversationSchema.index({ participants: 1 });

// Find conversation between two users
conversationSchema.statics.findBetweenUsers = function (userId1, userId2) {
    return this.findOne({
        participants: { $all: [userId1, userId2] }
    });
};

module.exports = mongoose.model('Conversation', conversationSchema);
