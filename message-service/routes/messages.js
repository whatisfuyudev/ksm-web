const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const authMiddleware = require('../middleware/auth');

// Get all conversations for the current user
router.get('/conversations', authMiddleware, async (req, res) => {
    try {
        const conversations = await Conversation.find({
            participants: req.userId
        })
            .populate('lastMessage')
            .populate('participants', 'username profilePicture')
            .sort({ lastMessageAt: -1 });

        // Get unread count for each conversation
        const conversationsWithUnread = await Promise.all(
            conversations.map(async (conv) => {
                const unreadCount = await Message.countDocuments({
                    receiver: req.userId,
                    sender: conv.participants.find(p => p._id.toString() !== req.userId),
                    read: false
                });

                return {
                    _id: conv._id,
                    participants: conv.participants,
                    lastMessage: conv.lastMessage,
                    lastMessageAt: conv.lastMessageAt,
                    unreadCount
                };
            })
        );

        res.json(conversationsWithUnread);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get messages between current user and another user
router.get('/conversation/:userId', authMiddleware, async (req, res) => {
    try {
        const otherUserId = req.params.userId;

        const messages = await Message.find({
            $or: [
                { sender: req.userId, receiver: otherUserId, deletedBySender: false },
                { sender: otherUserId, receiver: req.userId, deletedByReceiver: false }
            ]
        })
            .populate('sender', 'username profilePicture')
            .populate('receiver', 'username profilePicture')
            .sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Send a new message
router.post('/send', authMiddleware, async (req, res) => {
    try {
        const { receiverId, content } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({ error: 'Receiver and content are required' });
        }

        if (receiverId === req.userId) {
            return res.status(400).json({ error: 'Cannot send message to yourself' });
        }

        // Create the message
        const message = new Message({
            sender: req.userId,
            receiver: receiverId,
            content: content.trim()
        });

        await message.save();

        // Update or create conversation
        let conversation = await Conversation.findBetweenUsers(req.userId, receiverId);

        if (!conversation) {
            conversation = new Conversation({
                participants: [req.userId, receiverId],
                lastMessage: message._id,
                lastMessageAt: new Date()
            });
        } else {
            conversation.lastMessage = message._id;
            conversation.lastMessageAt = new Date();
        }

        await conversation.save();

        // Populate sender and receiver info
        await message.populate('sender', 'username profilePicture');
        await message.populate('receiver', 'username profilePicture');

        res.status(201).json(message);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Mark messages as read
router.put('/read/:userId', authMiddleware, async (req, res) => {
    try {
        const senderId = req.params.userId;

        const result = await Message.updateMany(
            {
                sender: senderId,
                receiver: req.userId,
                read: false
            },
            {
                read: true,
                readAt: new Date()
            }
        );

        res.json({
            success: true,
            markedAsRead: result.modifiedCount
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ error: 'Failed to mark messages as read' });
    }
});

// Delete a message (soft delete)
router.delete('/:messageId', authMiddleware, async (req, res) => {
    try {
        const message = await Message.findById(req.params.messageId);

        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        // Check if user is sender or receiver
        if (message.sender.toString() === req.userId) {
            message.deletedBySender = true;
        } else if (message.receiver.toString() === req.userId) {
            message.deletedByReceiver = true;
        } else {
            return res.status(403).json({ error: 'Not authorized to delete this message' });
        }

        await message.save();

        // If both deleted, actually remove it
        if (message.deletedBySender && message.deletedByReceiver) {
            await Message.findByIdAndDelete(req.params.messageId);
        }

        res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

// Get unread message count
router.get('/unread/count', authMiddleware, async (req, res) => {
    try {
        const count = await Message.countDocuments({
            receiver: req.userId,
            read: false
        });

        res.json({ unreadCount: count });
    } catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});

module.exports = router;
