// frontend/js/messages.js
// Updated to use message-service on port 4003 and made robust against various payload shapes
// + dedupe optimistic messages, show username, align messages (current user left, other user right)

const API_URL = 'http://localhost:4003/api/messages';
const AUTH_API_URL = 'http://localhost:4000/api/users';
const SOCKET_URL = 'http://localhost:4003';

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
            // normalize id field
            currentUser._id = currentUser._id || currentUser.id;
            currentUser.username = currentUser.username || currentUser.displayName || currentUser.name || '';
        } else {
            // fallback decode token lightly (best-effort)
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                currentUser = { _id: payload.id || payload.userId, username: payload.username || '' };
            } catch (e) {
                console.warn('Could not decode token payload', e);
            }
        }

        // Initialize socket connection
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

    // When other user receives a message (server -> receiver)
    socket.on('new-message', (message) => {
        // Remove/replace any optimistic message that matches
        reconcileIncomingMessage(message);
        // If message pertains to current conversation, show it
        const incomingSenderId = (message.sender && (message.sender._id || message.sender)) || message.sender;
        if (String(incomingSenderId) === String(currentChatUserId)) {
            // append (if not already shown)
            appendMessageIfMissing(message);
            scrollToBottom();
            markMessagesAsRead(incomingSenderId);
        }
        loadConversations();
    });

    // Confirmation to sender that message is saved
    socket.on('message-sent', (message) => {
        // The server created the message (sender confirmation)
        reconcileIncomingMessage(message); // replace optimistic if exists, or append
        // if currently chatting with that participant, update view
        if (String(message.receiver && (message.receiver._id || message.receiver)) === String(currentChatUserId) ||
            String(message.sender && (message.sender._id || message.sender)) === String(currentChatUserId)) {
            appendMessageIfMissing(message);
            scrollToBottom();
        }
        loadConversations(); // update previews/unread badges
    });

    socket.on('user-typing', ({ userId }) => {
        if (String(userId) === String(currentChatUserId)) showTypingIndicator();
    });

    socket.on('user-stop-typing', ({ userId }) => {
        if (String(userId) === String(currentChatUserId)) hideTypingIndicator();
    });

    socket.on('user-online', ({ userId }) => {
        onlineUsers.add(String(userId));
        updateUserStatus(userId, true);
    });

    socket.on('user-offline', ({ userId }) => {
        onlineUsers.delete(String(userId));
        updateUserStatus(userId, false);
    });

    socket.on('messages-read', ({ readBy }) => {
        // optionally update UI to show read receipts
        console.log('Messages read by:', readBy);
        loadConversations();
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
            // backend returns an array; if server wraps it in object, try to handle both
            const list = Array.isArray(conversations) ? conversations : (conversations || []);
            displayConversations(list);
        } else {
            console.warn('Failed to fetch conversations', response.status);
        }
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

function displayConversations(conversations) {
    const list = document.getElementById('conversationList');
    list.innerHTML = '';

    if (!conversations || conversations.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #8899a6;">No messages yet</div>';
        return;
    }

    conversations.forEach(conv => {
        // participants likely populated: find the other participant
        const otherUser = (conv.participants || []).find(p => String(p._id || p.id) !== String(currentUser._id));
        if (!otherUser) return;

        const item = document.createElement('li');
        item.className = 'conversation-item';
        if (String(currentChatUserId) === String(otherUser._id || otherUser.id)) {
            item.classList.add('active');
        }

        const avatar = (otherUser.username || '?').charAt(0).toUpperCase();
        const lastMessage = conv.lastMessage || null;

        // lastMessage may have sender populated (object) or just id; normalize
        let lastMessageSenderId = null;
        if (lastMessage) {
            lastMessageSenderId = (lastMessage.sender && (lastMessage.sender._id || lastMessage.sender)) || lastMessage.sender;
        }

        const youPrefix = lastMessage && String(lastMessageSenderId) === String(currentUser._id) ? 'You: ' : '';
        const lastMessageText = lastMessage ? `${youPrefix}${(lastMessage.content || '').slice(0, 200)}` : 'Start a conversation';

        const timeAgo = lastMessage ? formatTimeAgo(new Date(lastMessage.createdAt || lastMessage.updatedAt || conv.lastMessageAt)) : '';

        item.innerHTML = `
      <div class="conversation-avatar">${avatar}</div>
      <div class="conversation-info">
        <div class="conversation-header">
          <span class="conversation-username">${escapeHtml(otherUser.username || otherUser.displayName || 'unknown')}</span>
          <span class="conversation-time">${timeAgo}</span>
        </div>
        <div class="conversation-preview">
          ${escapeHtml(lastMessageText)}
          ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
        </div>
      </div>
    `;

        // need closure to capture `otherUser` and `item`
        item.addEventListener('click', (ev) => {
            // set active style
            document.querySelectorAll('.conversation-item').forEach(it => it.classList.remove('active'));
            item.classList.add('active');
            openChat(otherUser);
        });

        list.appendChild(item);
    });
}

// Replace the place in openChat that referenced chatContainer
async function openChat(user) {
    const userId = user._id || user.id;
    currentChatUserId = userId;

    // Update UI
    const empty = document.getElementById('emptyState');
    const chatView = document.getElementById('chatView');
    if (empty) empty.style.display = 'none';
    if (chatView) chatView.style.display = 'flex';

    const avatarEl = document.getElementById('chatAvatar');
    const nameEl = document.getElementById('chatUsername');
    if (avatarEl) avatarEl.textContent = (user.username || '?').charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = user.username || user.displayName || 'Unknown';

    // Update online status
    updateUserStatus(userId, onlineUsers.has(String(userId)));

    // Load messages and mark read
    await loadMessages(userId);
    markMessagesAsRead(userId);

    // Focus input if available
    const inp = document.getElementById('messageInput');
    if (inp) inp.focus();
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
            displayMessages(messages || []);
        } else {
            console.warn('Failed to load messages', response.status);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

function displayMessages(messages) {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    (messages || []).forEach(message => {
        appendMessage(message);
    });

    scrollToBottom();
}

/**
 * Append message DOM element. Uses tailwind-friendly classes:
 * - current user messages: aligned LEFT (items-start), blue bubble
 * - other user messages: aligned RIGHT (items-end), gray bubble
 *
 * message may be:
 *  - server object (has _id and populated sender/receiver)
 *  - optimistic object we created locally (has tempId)
 */
function appendMessage(message, opts = {}) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    // normalize sender info
    const senderObj = message.sender || {};
    const senderId = senderObj._id || senderObj.id || message.sender;
    const username = senderObj.username || message.username || (senderId === currentUser._id ? currentUser.username : 'unknown');

    const isSent = String(senderId) === String(currentUser._id);

    // create wrapper row (full width) and align left/right appropriately
    const row = document.createElement('div');
    row.className = 'w-full flex'; // will set justify based on side
    row.style.marginBottom = '12px';
    if (isSent) {
        // current user => LEFT (per your requirement)
        row.classList.add('justify-start');
    } else {
        // other user => RIGHT
        row.classList.add('justify-end');
    }

    // message bubble container (shows username above bubble)
    const col = document.createElement('div');
    col.className = 'flex flex-col';
    col.style.maxWidth = '70%';

    // username (small)
    const nameEl = document.createElement('div');
    nameEl.className = isSent ? 'text-sm text-gray-700 mb-1 font-medium' : 'text-sm text-gray-500 mb-1 font-medium text-right';
    nameEl.textContent = username || 'unknown';

    // bubble
    const bubble = document.createElement('div');
    bubble.className = 'bubble inline-block px-4 py-2 rounded-lg';
    bubble.style.wordBreak = 'break-word';
    bubble.style.whiteSpace = 'pre-wrap';

    if (isSent) {
        // current user style (blue)
        bubble.classList.add('bg-blue-500', 'text-white', 'self-start');
    } else {
        bubble.classList.add('bg-gray-100', 'text-gray-800', 'self-end');
    }

    // message text
    bubble.innerHTML = escapeHtml(message.content || '');

    // time
    const timeEl = document.createElement('div');
    timeEl.className = isSent ? 'text-xs text-gray-500 mt-1' : 'text-xs text-gray-400 mt-1 text-right';
    timeEl.textContent = message.createdAt ? formatTimeAgo(new Date(message.createdAt)) : '';

    // store metadata for dedupe/reconciliation
    if (message._id) row.dataset.msgid = message._id;
    if (message.tempId) row.dataset.tempId = message.tempId;
    if (senderId) row.dataset.sender = String(senderId);
    if (message.createdAt) row.dataset.created = message.createdAt;
    // content snippet for matching
    row.dataset.content = (message.content || '').slice(0, 200);

    // assemble
    col.appendChild(nameEl);
    col.appendChild(bubble);
    col.appendChild(timeEl);
    row.appendChild(col);
    container.appendChild(row);
}

/**
 * Append message only if there's no existing message with same _id or matching optimistic match.
 */
function appendMessageIfMissing(message) {
    // if message has _id and an element exists with that id, don't append
    if (message._id) {
        const existing = document.querySelector(`[data-msgid="${message._id}"]`);
        if (existing) return;
    }

    // attempt to find optimistic match and replace it (handled by reconcileIncomingMessage first)
    // if not found, append new
    appendMessage(message);
}

/**
 * When the server returns a real saved message, try to find and replace matching optimistic message element.
 * Matching heuristic:
 *  - find element with data.tempId or element with no data-msgid and same sender + same content (or very similar),
 *    created within a small time window OR exact content match.
 */
function reconcileIncomingMessage(message) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const senderId = (message.sender && (message.sender._id || message.sender)) || message.sender;
    const content = (message.content || '').trim();

    // 1) If there's already an element with the real msgid, nothing to do
    if (message._id && document.querySelector(`[data-msgid="${message._id}"]`)) return;

    // 2) try to find optimistic element by tempId (if the optimistic set a tempId and you happen to have it)
    if (message.tempId) {
        const byTemp = document.querySelector(`[data-temp-id="${message.tempId}"], [data-tempid="${message.tempId}"]`);
        if (byTemp) {
            // attach real id
            byTemp.dataset.msgid = message._id;
            delete byTemp.dataset.tempid;
            return;
        }
    }

    // 3) fallback: heuristic matching - find an element without data-msgid, same sender, and similar content.
    const rows = Array.from(container.children || []);
    let found = null;
    for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i];
        if (r.dataset && r.dataset.msgid) continue; // already a real message
        const rSender = r.dataset.sender;
        const rContent = (r.dataset.content || '').trim();
        if (!rSender) continue;
        if (String(rSender) !== String(senderId)) continue;

        // content equality or substring match
        if (rContent && (rContent === content || content.includes(rContent) || rContent.includes(content))) {
            found = r;
            break;
        }
    }

    if (found) {
        // mark as real; update time and data
        if (message._id) found.dataset.msgid = message._id;
        if (message.createdAt) found.dataset.created = message.createdAt;
        // update displayed time if we can
        const timeEl = found.querySelector('.text-xs');
        if (timeEl && message.createdAt) timeEl.textContent = formatTimeAgo(new Date(message.createdAt));
        return;
    }

    // 4) if we didn't find anything to replace, simply append (server message)
    appendMessage(message);
}

/**
 * Called before optimistic append: creates tempId and returns optimistic object
 */
function createOptimisticMessageObject(content) {
    const tempId = 'temp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    return {
        tempId,
        sender: { _id: currentUser._id, username: currentUser.username },
        receiver: currentChatUserId,
        content,
        createdAt: new Date().toISOString()
    };
}

function setupMessageInput() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    if (!input) return;

    input.addEventListener('input', () => {
        if (sendBtn) sendBtn.disabled = input.value.trim() === '';

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

    // create optimistic object with tempId
    const optimistic = createOptimisticMessageObject(content);

    // Append optimistic to UI (and mark data-tempid)
    appendMessage(optimistic, { optimistic: true });
    // set data-tempid on last appended element for easier reconciliation
    const container = document.getElementById('messagesContainer');
    const last = container && container.lastElementChild;
    if (last && optimistic.tempId) last.dataset.tempid = optimistic.tempId;

    scrollToBottom();

    // Send via socket; include the tempId so backend could echo it (if you later update backend)
    socket.emit('send-message', {
        receiverId: currentChatUserId,
        content: content,
        tempId: optimistic.tempId // harmless if backend ignores it
    });

    // Clear input
    input.value = '';
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    // Stop typing indicator
    socket.emit('stop-typing', { receiverId: currentChatUserId });

    // reload conversations to update preview/unread (small delay)
    setTimeout(() => loadConversations(), 300);
}

function handleNewMessage(message) {
    // ensure message has sender populated; server populates sender/receiver
    const incomingSenderId = (message.sender && (message.sender._id || message.sender)) || message.sender;

    if (String(incomingSenderId) === String(currentChatUserId)) {
        appendMessageIfMissing(message);
        scrollToBottom();
        markMessagesAsRead(incomingSenderId);
    }

    // Refresh sidebar to update unread counts
    loadConversations();
}

function markMessagesAsRead(userId) {
    if (!socket) return;
    socket.emit('mark-read', { senderId: userId });
}

function showTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    const username = document.getElementById('chatUsername')?.textContent || '';
    const typingUsername = document.getElementById('typingUsername');
    if (typingUsername) typingUsername.textContent = username;
    if (indicator) indicator.classList.remove('hidden');
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.classList.add('hidden');
}

function updateUserStatus(userId, isOnline) {
    if (String(userId) === String(currentChatUserId)) {
        const statusEl = document.getElementById('chatUserStatus');
        if (statusEl) {
            statusEl.textContent = isOnline ? 'Online' : 'Offline';
            statusEl.className = `chat-user-status ${isOnline ? 'online' : ''}`;
        }
    }
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    container.scrollTop = container.scrollHeight;
}

// New message modal functions (tailwind-friendly)
async function openNewMessageModal() {
    const modal = document.getElementById('newMessageModal');
    if (!modal) return console.warn('newMessageModal element not found');

    // tailwind: remove hidden, add flex (so modal becomes visible)
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // focus search box if present
    const search = document.getElementById('userSearch');
    if (search) {
        search.focus();
        search.select && search.select();
    }

    // populate users
    try {
        await loadUsers();
    } catch (err) {
        console.error('Failed to load users for modal:', err);
    }
}

function closeNewMessageModal() {
    const modal = document.getElementById('newMessageModal');
    if (!modal) return;
    // hide modal using tailwind utilities
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    const s = document.getElementById('userSearch');
    if (s) s.value = '';
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
                return String(userId) !== String(currentUserId);
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
        const avatar = (user.username || '?').charAt(0).toUpperCase();

        item.innerHTML = `
      <div class="user-avatar">${avatar}</div>
      <div>
        <div style="font-weight: bold;">${escapeHtml(user.username || user.displayName || '')}</div>
        <div style="font-size: 14px; color: #8899a6;">@${escapeHtml(user.username || '')}</div>
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
                return String(userId) !== String(currentUserId);
            });
            displayUsers(users);
        }
    } catch (error) {
        console.error('Error searching users:', error);
    }
});

// back button handler — safe (your HTML uses chatView/emptyState)
function backToConversations() {
    // hide chat view, show empty state (if exists)
    const chatView = document.getElementById('chatView');
    const empty = document.getElementById('emptyState');
    if (chatView) chatView.style.display = 'none';
    if (empty) empty.style.display = 'block';
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
