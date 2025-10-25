// frontend/js/profile.js
const POST_URL = 'http://localhost:4001/api/posts';
const AUTH_BASE = 'http://localhost:4000'; // auth service base
const AUTH_AUTH = `${AUTH_BASE}/api/auth`;
const AUTH_USERS = `${AUTH_BASE}/api/users`;
const PAGE_SIZE = 10;

function getToken(){ return localStorage.getItem('token'); }

/* small wrapper for GET requests that only sets Authorization when token exists */
async function apiGet(url){
  const headers = {};
  const token = getToken();
  if(token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { method: 'GET', headers });
  if(res.status === 401) throw new Error('unauthorized');
  return res.json();
}

async function apiPatch(url, body){
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if(token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body) });
  if(res.status === 401) throw new Error('unauthorized');
  return res.json();
}

/* helper to safely extract id from user object */
function getUserId(u){
  return String(u && (u.id || u._id || u._id || u.id) || '');
}

/* in-memory state for pagination */
const state = {
  userPosts: { data: [], offset: 0 },
  likedPosts: { data: [], offset: 0 }
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const viewId = params.get('id');

    const token = getToken();
    let currentUser = null;

    // try to fetch /api/auth/me if logged in
    if (token) {
      try {
        const r = await fetch(`${AUTH_AUTH}/me`, { headers: { Authorization: 'Bearer ' + token } });
        if (r.ok) {
          const data = await r.json();
          currentUser = data.user;
        }
      } catch (e) { /* ignore */ }
    }

    let viewedUser = null;
    if (viewId && viewId !== 'undefined') {
      // viewing other user's profile (or possibly own if id matches)
      try {
        const r = await fetch(`${AUTH_USERS}/${encodeURIComponent(viewId)}`);
        if (r.ok) {
          const data = await r.json();
          viewedUser = data.user;
        } else {
          document.getElementById('profileBox').innerText = 'User not found';
          return;
        }
      } catch (e) {
        console.error('fetch user error', e);
        document.getElementById('profileBox').innerText = 'Failed to load user';
        return;
      }
    } else {
      // no viewId -> show current user profile
      if (!token) { window.location = '/login.html'; return; }
      if (currentUser) {
        viewedUser = currentUser;
      } else {
        // try decode token as fallback
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          viewedUser = { id: payload.id, username: payload.username, displayName: payload.displayName };
        } catch (e) {
          console.error('failed to obtain current user', e);
          window.location = '/login.html';
          return;
        }
      }
    }

    // compute ownership: if a logged-in user exists and ids match -> owner
    const viewedId = getUserId(viewedUser);
    const currentId = currentUser ? getUserId(currentUser) : null;
    const isOwn = currentId && (String(currentId) === String(viewedId));

    renderProfile(viewedUser, isOwn);

    const userId = getUserId(viewedUser);
    // initial load both sections (fetch full arrays once, we paginate client-side)
    await Promise.all([ fetchAndPrepareUserPosts(userId), fetchAndPrepareLikedPosts(userId) ]);
    // render initial slices
    renderPostsSlice('userPosts', 'userPosts', 'Posts');
    renderPostsSlice('likedPosts', 'likedPosts', 'Liked posts');
  } catch (e) {
    console.error(e);
  }
});

function renderProfile(user, isOwn = false){
  const box = document.getElementById('profileBox');
  box.innerHTML = '';
  box.setAttribute('data-user-id', getUserId(user));
  const displayFirst = (user.displayName || user.username || '').charAt(0) || 'U';
  const avatar = user.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" class="w-24 h-24 rounded-full mx-auto" />` :
    `<div class="w-24 h-24 rounded-full mx-auto bg-gray-200 flex items-center justify-center text-xl text-gray-500">${escapeHtml(displayFirst)}</div>`;
  const displayName = escapeHtml(user.displayName || user.username || '');
  const username = escapeHtml(user.username || user.id || '');

  // buttons area: edit (only when owner) + logout (always shown if user is logged)
  box.innerHTML = `${avatar}
    <h2 class="text-xl font-semibold mt-3">${displayName}</h2>
    <div class="text-sm text-gray-600">@${username}</div>
    <div class="mt-3">
      <div class="flex items-center justify-center gap-3">
        ${isOwn ? `<button id="editProfile" class="px-4 py-2 border rounded">Edit profile</button>` : ''}
        <button id="logoutProfile" class="px-4 py-2 border rounded">Logout</button>
      </div>
    </div>`;

  if(isOwn){
    document.getElementById('editProfile').onclick = () => openEditProfile(user);
  }

  const logoutBtn = document.getElementById('logoutProfile');
  if(logoutBtn){
    logoutBtn.onclick = () => {
      localStorage.removeItem('token');
      window.location = '/login.html';
    };
  }
}

function openEditProfile(user){
  // render inline edit form inside profileBox
  const box = document.getElementById('profileBox');
  const avatarHtml = user.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" class="w-24 h-24 rounded-full mx-auto" />` :
    `<div class="w-24 h-24 rounded-full mx-auto bg-gray-200 flex items-center justify-center text-xl text-gray-500">${escapeHtml((user.displayName||user.username||'U')[0])}</div>`;

  box.innerHTML = `
    ${avatarHtml}
    <div class="mt-3 text-center">
      <div class="text-sm text-gray-600 mb-2">Edit your profile</div>
      <div class="space-y-2">
        <input id="edit_displayName" class="w-64 mx-auto block border p-2 rounded" placeholder="Display name" value="${escapeHtml(user.displayName||'')}" />
        <input id="edit_avatarUrl" class="w-64 mx-auto block border p-2 rounded" placeholder="Avatar URL (optional)" value="${escapeHtml(user.avatarUrl||'')}" />
      </div>
      <div id="edit_msg" class="text-sm text-red-600 mt-2"></div>
      <div class="mt-3 flex items-center justify-center gap-3">
        <button id="editSave" class="px-4 py-2 bg-black text-white rounded">Save</button>
        <button id="editCancel" class="px-4 py-2 border rounded">Cancel</button>
        <button id="logoutInline" class="px-4 py-2 border rounded">Logout</button>
      </div>
    </div>
  `;

  const save = document.getElementById('editSave');
  const cancel = document.getElementById('editCancel');
  const msg = document.getElementById('edit_msg');
  const logoutInline = document.getElementById('logoutInline');

  cancel.addEventListener('click', () => {
    // re-render original profile (owner)
    renderProfile(user, true);
  });

  if (logoutInline) logoutInline.addEventListener('click', () => { localStorage.removeItem('token'); window.location = '/login.html'; });

  save.addEventListener('click', async () => {
    const newDisplay = document.getElementById('edit_displayName').value.trim();
    const newAvatar = document.getElementById('edit_avatarUrl').value.trim();

    if (!newDisplay) {
      msg.textContent = 'Display name cannot be empty';
      setTimeout(()=> msg.textContent = '', 2500);
      return;
    }

    save.disabled = true;
    try {
      const token = getToken();
      if (!token) { window.location = '/login.html'; return; }

      const payload = { displayName: newDisplay, avatarUrl: newAvatar || null };
      // attempt PATCH to auth service users endpoint
      const targetId = user.id || user._id || user.id;
      const r = await apiPatch(`${AUTH_USERS}/${encodeURIComponent(targetId)}`, payload);

      if (r && r.user) {
        // update user object and re-render profile
        user.displayName = r.user.displayName;
        user.avatarUrl = r.user.avatarUrl;
        renderProfile(user, true);
      } else {
        msg.textContent = 'Unexpected server response';
        save.disabled = false;
      }
    } catch (err) {
      console.error('update profile error', err);
      msg.textContent = (err && err.message) ? err.message : 'Failed to update';
      save.disabled = false;
      setTimeout(()=> msg.textContent = '', 3000);
    }
  });
}

async function fetchAndPrepareUserPosts(userId){
  const el = document.getElementById('userPosts');
  el.innerHTML = '<div class="text-sm text-gray-500">Loading...</div>';
  try {
    const r = await apiGet(`${POST_URL}/author/${encodeURIComponent(userId)}`);
    state.userPosts.data = (r.posts || []).slice(); // clone
    state.userPosts.offset = 0;
  } catch (e) {
    console.error('loadUserPosts error', e);
    state.userPosts.data = [];
    state.userPosts.offset = 0;
  }
}

async function fetchAndPrepareLikedPosts(userId){
  const el = document.getElementById('likedPosts');
  el.innerHTML = '<div class="text-sm text-gray-500">Loading...</div>';
  try {
    const r = await apiGet(`${POST_URL}/liked-by/${encodeURIComponent(userId)}`);
    state.likedPosts.data = (r.posts || []).slice();
    state.likedPosts.offset = 0;
  } catch (e) {
    console.error('loadLikedPosts error', e);
    state.likedPosts.data = [];
    state.likedPosts.offset = 0;
  }
}

/* render a slice for a section */
function renderPostsSlice(containerId, stateKey, emptyLabel){
  const section = state[stateKey];
  const el = document.getElementById(containerId);
  if(!el) return;

  const start = section.offset || 0;
  const end = Math.min(section.data.length, start + PAGE_SIZE);
  const slice = section.data.slice(start, end);

  // if first page (offset 0) clear; otherwise append
  if(start === 0) el.innerHTML = '';

  if(slice.length === 0 && start === 0){
    el.innerHTML = `<div class="text-sm text-gray-500">No ${emptyLabel.toLowerCase()}</div>`;
  } else {
    // append posts
    slice.forEach((p, idx) => {
      const d = document.createElement('div');
      d.className = 'mb-3 p-3 border rounded bg-white';
      d.setAttribute('data-post-idx', String(start + idx));
      d.innerHTML = `
        <a href="/post.html?id=${encodeURIComponent(p._id)}" class="block no-underline text-current">
          <div class="text-sm text-gray-600">Posted • ${new Date(p.createdAt).toLocaleString()}</div>
          <div class="mt-1 text-gray-900">${escapeHtml(p.content)}</div>
        </a>
      `;
      el.appendChild(d);
    });
  }

  section.offset = end;

  // manage Load more button
  const loadMoreId = `${containerId}-loadmore`;
  // remove existing load more if present
  const existing = document.getElementById(loadMoreId);
  if(existing) existing.remove();

  if(section.offset < section.data.length){
    const wrapper = document.createElement('div');
    wrapper.className = 'text-center mt-2';
    const btn = document.createElement('button');
    btn.id = loadMoreId;
    btn.className = 'px-4 py-2 border rounded bg-white';
    btn.textContent = 'Load more';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      // render next slice
      renderPostsSlice(containerId, stateKey, emptyLabel);
      // after render, scroll to newly appended last item
      setTimeout(() => {
        const items = el.querySelectorAll('.mb-3');
        if(items && items.length){
          items[items.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
    });
    wrapper.appendChild(btn);
    el.appendChild(wrapper);
  }
}

/* escape helper */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
