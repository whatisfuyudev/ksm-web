const API_URL = 'http://localhost:4002/api/messages';
const AUTH_API_URL = 'http://localhost:4000/api/users';
const SOCKET_URL = 'http://localhost:4002';

let socket = null;
let currentChatUserId = null;
let currentUser = null;
let typingTimeout = null;
let onlineUsers = new Set();

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        // Get current user info
        const userResponse = await fetch(`${AUTH_API_URL}/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (userResponse.ok) {
            const data = await userResponse.json();
            currentUser = data.user || data;
            currentUser._id = currentUser._id || currentUser.id;
        }        // Initialize socket connection
        initializeSocket();

        // Load conversations
        await loadConversations();

        // Setup message input handlers
        setupMessageInput();

    } catch (error) {
        console.error('Initialization error:', error);
    }
});

function initializeSocket() {
    const token = localStorage.getItem('token');

    socket = io(SOCKET_URL, {
        auth: {
            token: token
        }
    });

    socket.on('connect', () => {
        console.log('Socket connected');
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });

    socket.on('new-message', (message) => {
        handleNewMessage(message);
    });

    socket.on('message-sent', (message) => {
        appendMessage(message);
        scrollToBottom();
    });

    socket.on('user-typing', ({ userId }) => {
        if (userId === currentChatUserId) {
            showTypingIndicator();
        }
    });

    socket.on('user-stop-typing', ({ userId }) => {
        if (userId === currentChatUserId) {
            hideTypingIndicator();
        }
    });

    socket.on('user-online', ({ userId }) => {
        onlineUsers.add(userId);
        updateUserStatus(userId, true);
    });

    socket.on('user-offline', ({ userId }) => {
        onlineUsers.delete(userId);
        updateUserStatus(userId, false);
    });

    socket.on('messages-read', ({ readBy }) => {
        // Update UI to show messages were read
        console.log('Messages read by:', readBy);
    });
}

async function loadConversations() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/conversations`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const conversations = await response.json();
            displayConversations(conversations);
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

function displayConversations(conversations) {
    const list = document.getElementById('conversationList');
    list.innerHTML = '';

    if (conversations.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #8899a6;">No messages yet</div>';
        return;
    }

    conversations.forEach(conv => {
        const otherUser = conv.participants.find(p => p._id !== currentUser._id);
        if (!otherUser) return;

        const item = document.createElement('li');
        item.className = 'conversation-item';
        if (currentChatUserId === otherUser._id) {
            item.classList.add('active');
        }

        const avatar = otherUser.username.charAt(0).toUpperCase();
        const lastMessageText = conv.lastMessage ?
            (conv.lastMessage.sender === currentUser._id ? 'You: ' : '') + conv.lastMessage.content :
            'Start a conversation';

        const timeAgo = conv.lastMessage ? formatTimeAgo(new Date(conv.lastMessage.createdAt)) : '';

        item.innerHTML = `
      <div class="conversation-avatar">${avatar}</div>
      <div class="conversation-info">
        <div class="conversation-header">
          <span class="conversation-username">${otherUser.username}</span>
          <span class="conversation-time">${timeAgo}</span>
        </div>
        <div class="conversation-preview">
          ${lastMessageText}
          ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
        </div>
      </div>
    `;

        item.onclick = () => openChat(otherUser);
        list.appendChild(item);
    });
}

async function openChat(user) {
    currentChatUserId = user._id;

    // Update UI
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('chatView').style.display = 'flex';
    document.getElementById('chatAvatar').textContent = user.username.charAt(0).toUpperCase();
    document.getElementById('chatUsername').textContent = user.username;

    // Update online status
    updateUserStatus(user._id, onlineUsers.has(user._id));

    // Update active conversation in sidebar
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
    });
    event.currentTarget?.classList.add('active');

    // Mobile: show chat container
    document.getElementById('chatContainer').classList.add('active');

    // Load messages
    await loadMessages(user._id);

    // Mark messages as read
    markMessagesAsRead(user._id);

    // Focus input
    document.getElementById('messageInput').focus();
}

async function loadMessages(userId) {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/conversation/${userId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const messages = await response.json();
            displayMessages(messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    messages.forEach(message => {
        appendMessage(message);
    });

    scrollToBottom();
}

function appendMessage(message) {
    const container = document.getElementById('messagesContainer');

    const isSent = message.sender._id === currentUser._id;
    const avatar = isSent ?
        currentUser.username.charAt(0).toUpperCase() :
        message.sender.username.charAt(0).toUpperCase();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : ''}`;

    messageDiv.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div>
      <div class="message-content">${escapeHtml(message.content)}</div>
      <div class="message-time">${formatTimeAgo(new Date(message.createdAt))}</div>
    </div>
  `;

    container.appendChild(messageDiv);
}

function setupMessageInput() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    input.addEventListener('input', () => {
        sendBtn.disabled = input.value.trim() === '';

        // Send typing indicator
        if (currentChatUserId && socket) {
            socket.emit('typing', { receiverId: currentChatUserId });

            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('stop-typing', { receiverId: currentChatUserId });
            }, 1000);
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();

    if (!content || !currentChatUserId || !socket) return;

    // Send via socket
    socket.emit('send-message', {
        receiverId: currentChatUserId,
        content: content
    });

    // Clear input
    input.value = '';
    document.getElementById('sendBtn').disabled = true;

    // Stop typing indicator
    socket.emit('stop-typing', { receiverId: currentChatUserId });

    // Reload conversations to update preview
    loadConversations();
}

function handleNewMessage(message) {
    // If message is from current chat, append it
    if (message.sender._id === currentChatUserId) {
        appendMessage(message);
        scrollToBottom();

        // Mark as read
        markMessagesAsRead(message.sender._id);
    }

    // Reload conversations to update unread count
    loadConversations();
}

function markMessagesAsRead(userId) {
    if (!socket) return;

    socket.emit('mark-read', { senderId: userId });
}

function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    const username = document.getElementById('chatUsername').textContent;
    document.getElementById('typingUsername').textContent = username;
    indicator.classList.add('active');
    scrollToBottom();
}

function hideTypingIndicator() {
    document.getElementById('typingIndicator').classList.remove('active');
}

function updateUserStatus(userId, isOnline) {
    if (userId === currentChatUserId) {
        const statusEl = document.getElementById('chatUserStatus');
        statusEl.textContent = isOnline ? 'Online' : 'Offline';
        statusEl.className = `chat-user-status ${isOnline ? 'online' : ''}`;
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

// New message modal functions
async function openNewMessageModal() {
    document.getElementById('newMessageModal').classList.add('active');
    await loadUsers();
}

function closeNewMessageModal() {
    document.getElementById('newMessageModal').classList.remove('active');
    document.getElementById('userSearch').value = '';
}

async function loadUsers() {
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${AUTH_API_URL}/search?q=`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const users = (data.users || data).filter(u => {
                const userId = u._id || u.id;
                const currentUserId = currentUser._id || currentUser.id;
                return userId !== currentUserId;
            });
            displayUsers(users);
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function displayUsers(users) {
    const list = document.getElementById('userList');
    list.innerHTML = '';

    if (users.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #8899a6;">No users found</div>';
        return;
    }

    users.forEach(user => {
        const item = document.createElement('li');
        item.className = 'user-item';

        const userId = user._id || user.id;
        const avatar = user.username.charAt(0).toUpperCase();

        item.innerHTML = `
      <div class="user-avatar">${avatar}</div>
      <div>
        <div style="font-weight: bold;">${user.username}</div>
        <div style="font-size: 14px; color: #8899a6;">@${user.username}</div>
      </div>
    `;

        item.onclick = () => {
            closeNewMessageModal();
            openChat({ ...user, _id: userId });
        };

        list.appendChild(item);
    });
}

// Search users
document.getElementById('userSearch')?.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${AUTH_API_URL}/search?q=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            const users = (data.users || data).filter(u => {
                const userId = u._id || u.id;
                const currentUserId = currentUser._id || currentUser.id;
                return userId !== currentUserId;
            });
            displayUsers(users);
        }
    } catch (error) {
        console.error('Error searching users:', error);
    }
}); function backToConversations() {
    document.getElementById('chatContainer').classList.remove('active');
}

// Utility functions
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;

    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal when clicking outside
document.getElementById('newMessageModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'newMessageModal') {
        closeNewMessageModal();
    }
});
