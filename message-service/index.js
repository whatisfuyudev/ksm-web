require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const messageRoutes = require('./routes/messages');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
require('./models/User');          // <- register User model

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: true,
        credentials: true
    }
});

app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

app.use('/api/messages', messageRoutes);

// Socket.IO authentication middleware
io.use((socket, next) => {
  try {
    const token = (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) ||
                  (socket.handshake && socket.handshake.headers && socket.handshake.headers.authorization && socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '').trim());

    if (!token) {
      console.error('Socket auth error: no token provided');
      return next(new Error('Authentication error'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'change_this_jwt_secret_for_dev');

    const userId = decoded.id || decoded.userId || decoded.sub;
    if (!userId) {
      console.error('Socket auth error: no user id in token');
      return next(new Error('Authentication error'));
    }

    socket.userId = String(userId);
    socket.user = {
      id: socket.userId,
      username: decoded.username || decoded.name || null
    };
    next();
  } catch (err) {
    console.error('Socket auth error:', err && err.message ? err.message : err);
    next(new Error('Authentication error'));
  }
});


// Store online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.userId);

    // Add user to online users
    onlineUsers.set(socket.userId, socket.id);

    // Broadcast user online status
    io.emit('user-online', { userId: socket.userId });

    // Join user's personal room
    socket.join(socket.userId);

    // Handle typing indicator
    socket.on('typing', ({ receiverId }) => {
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user-typing', {
                userId: socket.userId
            });
        }
    });

    socket.on('stop-typing', ({ receiverId }) => {
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('user-stop-typing', {
                userId: socket.userId
            });
        }
    });

    // Handle new message via socket
    socket.on('send-message', async ({ receiverId, content }) => {
        try {
            // Create the message
            const message = new Message({
                sender: socket.userId,
                receiver: receiverId,
                content: content.trim()
            });

            await message.save();
            await message.populate('sender', 'username profilePicture');
            await message.populate('receiver', 'username profilePicture');

            // Update or create conversation
            let conversation = await Conversation.findBetweenUsers(socket.userId, receiverId);

            if (!conversation) {
                conversation = new Conversation({
                    participants: [socket.userId, receiverId],
                    lastMessage: message._id,
                    lastMessageAt: new Date()
                });
            } else {
                conversation.lastMessage = message._id;
                conversation.lastMessageAt = new Date();
            }

            await conversation.save();

            // Send to receiver if online
            const receiverSocketId = onlineUsers.get(receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new-message', message);
            }

            // Send confirmation to sender
            socket.emit('message-sent', message);

        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('message-error', { error: 'Failed to send message' });
        }
    });

    // Handle message read
    socket.on('mark-read', async ({ senderId }) => {
        try {
            await Message.updateMany(
                {
                    sender: senderId,
                    receiver: socket.userId,
                    read: false
                },
                {
                    read: true,
                    readAt: new Date()
                }
            );

            // Notify sender that messages were read
            const senderSocketId = onlineUsers.get(senderId);
            if (senderSocketId) {
                io.to(senderSocketId).emit('messages-read', {
                    readBy: socket.userId
                });
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.userId);
        onlineUsers.delete(socket.userId);

        // Broadcast user offline status
        io.emit('user-offline', { userId: socket.userId });
    });
});

const MONGO = process.env.MONGO_URI || 'mongodb://mongodb:27017/twitter_clone';
mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        const PORT = parseInt(process.env.PORT || '4003', 10);
        server.listen(PORT, () => {
            console.log('Message service running on port', PORT);
        });
    })
    .catch(err => console.error('Mongo connect error', err));
