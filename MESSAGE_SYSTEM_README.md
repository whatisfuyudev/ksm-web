# Direct Message System - Installation Guide

## Overview
This is a complete real-time direct messaging system for your Twitter-like social media application. It includes:

- Real-time messaging with Socket.IO
- Message conversations view
- Typing indicators
- Online/offline status
- Unread message counts
- Message read receipts
- User search to start new conversations
- Responsive design (mobile & desktop)

## Installation Steps

### 1. Install Dependencies

Navigate to the message-service directory and install packages:

```bash
cd message-service
npm install
```

### 2. Build and Start Services

From the project root directory, rebuild and start all services with Docker Compose:

```bash
docker-compose down
docker-compose build
docker-compose up -d
```

### 3. Verify Services are Running

Check that all services are running:

```bash
docker-compose ps
```

You should see:
- `mongodb` on port 27017
- `auth-service` on port 4000
- `post-service` on port 4001
- `message-service` on port 4002
- `frontend` on port 3000

### 4. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

## Features

### For Users

1. **View Conversations**
   - See all your message conversations
   - View unread message counts
   - See last message preview
   - Conversations sorted by most recent

2. **Send Messages**
   - Click "New" to start a conversation with any user
   - Search for users by username
   - Type and send messages in real-time
   - Messages appear instantly for both sender and receiver

3. **Real-time Features**
   - See when users are online/offline
   - See typing indicators when someone is typing
   - Receive messages instantly without refresh
   - Messages marked as read automatically

4. **Mobile Responsive**
   - Full mobile support
   - Touch-friendly interface
   - Bottom navigation on mobile devices

## API Endpoints

### Message Service (Port 4002)

#### REST API

- `GET /api/messages/conversations` - Get all conversations
- `GET /api/messages/conversation/:userId` - Get messages with a specific user
- `POST /api/messages/send` - Send a new message
- `PUT /api/messages/read/:userId` - Mark messages as read
- `DELETE /api/messages/:messageId` - Delete a message
- `GET /api/messages/unread/count` - Get unread message count

#### Socket.IO Events

**Client → Server:**
- `send-message` - Send a message
- `typing` - User is typing
- `stop-typing` - User stopped typing
- `mark-read` - Mark messages as read

**Server → Client:**
- `new-message` - Receive a new message
- `message-sent` - Confirmation message was sent
- `user-typing` - Someone is typing
- `user-stop-typing` - Someone stopped typing
- `user-online` - User came online
- `user-offline` - User went offline
- `messages-read` - Messages were read by recipient

## Database Schema

### Message Collection
```javascript
{
  sender: ObjectId,          // User who sent the message
  receiver: ObjectId,        // User who receives the message
  content: String,           // Message content (max 1000 chars)
  read: Boolean,            // Whether message has been read
  readAt: Date,             // When message was read
  deletedBySender: Boolean, // Soft delete flag
  deletedByReceiver: Boolean, // Soft delete flag
  createdAt: Date,
  updatedAt: Date
}
```

### Conversation Collection
```javascript
{
  participants: [ObjectId],  // Two users in conversation
  lastMessage: ObjectId,     // Reference to last message
  lastMessageAt: Date,       // Timestamp of last message
  createdAt: Date,
  updatedAt: Date
}
```

## Configuration

### Environment Variables (.env)

The message service uses these environment variables:

```env
PORT=4002
MONGO_URI=mongodb://mongodb:27017/twitter_clone
JWT_SECRET=your_jwt_secret_key_here
AUTH_SERVICE_URL=http://auth-service:4000
```

**Important:** Make sure `JWT_SECRET` matches across all services.

## Troubleshooting

### Messages not appearing in real-time
1. Check that Socket.IO is connecting properly (check browser console)
2. Verify the message-service is running on port 4002
3. Check that JWT token is valid

### "Authentication error" in console
- The JWT token might be expired or invalid
- Make sure you're logged in
- Verify JWT_SECRET is consistent across services

### Cannot find users to message
- Make sure auth-service is running
- Check that users exist in the database
- Verify the search endpoint is working: `http://localhost:4000/api/users/search?q=`

### Docker issues
```bash
# Stop all services
docker-compose down

# Remove volumes (careful: deletes data)
docker-compose down -v

# Rebuild and restart
docker-compose build --no-cache
docker-compose up -d
```

### View logs
```bash
# View all logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f message-service
```

## Testing the System

### Manual Testing Steps

1. **Create two test accounts:**
   - Register user1 (e.g., "alice")
   - Register user2 (e.g., "bob")

2. **Login as user1:**
   - Navigate to Messages page
   - Click "New" button
   - Search for "bob"
   - Click on bob to start conversation

3. **Send a message:**
   - Type a message
   - Click "Send" or press Enter
   - Message should appear immediately

4. **Login as user2 (in incognito/different browser):**
   - Navigate to Messages page
   - You should see the conversation with user1
   - The message should be visible
   - Send a reply

5. **Check real-time features:**
   - Keep both browsers open side by side
   - Start typing in one browser
   - "is typing..." should appear in the other
   - Send messages and see them appear instantly

## Security Features

- JWT authentication for all API calls
- Socket.IO authentication middleware
- Users can only see their own messages
- Soft delete prevents data loss
- Input validation and sanitization
- Message length limits (1000 characters)

## Performance Considerations

- Messages are paginated on load
- Indexes on frequently queried fields
- Socket.IO rooms for efficient message delivery
- Optimistic UI updates for instant feedback

## Future Enhancements

Potential features to add:
- Message search functionality
- Image/file attachments
- Message reactions (like, heart, etc.)
- Group messaging
- Message editing
- Voice/video calls
- Push notifications
- Message forwarding
- Blocking/muting users

## Support

If you encounter issues:
1. Check the troubleshooting section
2. Review the service logs
3. Verify all environment variables are set correctly
4. Ensure all services are running and healthy

## License

This messaging system is part of the Twitter Clone project.
