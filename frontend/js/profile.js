const POST_URL = 'http://localhost:4001/api/posts';
const AUTH_URL = 'http://localhost:4000/api/auth';
function getToken(){ return localStorage.getItem('token'); }
async function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  if(!opts.body) opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  const res = await fetch(url, opts);
  if(res.status === 401){ window.location = '/login.html'; throw new Error('unauthorized'); }
  return res.json();
}

document.addEventListener('DOMContentLoaded', async () => {
  // by default show logged-in user profile
  try {
    // get token user info from auth service
    const token = getToken();
    if(!token) { window.location = '/login.html'; return; }
    // ask auth service for /me or decode if not available; simpler: call /api/auth/me if exists
    let me;
    try {
      const r = await fetch(`${AUTH_URL}/me`, { headers: { Authorization: 'Bearer ' + token } });
      if(r.ok){ me = await r.json(); me = me.user; }
    } catch(e){ /* skip */ }

    // fallback: decode token locally to obtain id and username (not secure but ok for dev)
    if(!me){
      const payload = JSON.parse(atob(token.split('.')[1]));
      me = { id: payload.id, username: payload.username, displayName: payload.displayName };
    }

    renderProfile(me);
    loadUserPosts(me.id);
    loadLikedPosts(me.id);
  } catch(e){ console.error(e); }
});

function renderProfile(user){
  const box = document.getElementById('profileBox');
  box.innerHTML = '';
  const avatar = user.avatarUrl ? `<img src="${escapeHtml(user.avatarUrl)}" class="w-24 h-24 rounded-full mx-auto" />` :
    `<div class="w-24 h-24 rounded-full mx-auto bg-gray-200 flex items-center justify-center text-xl text-gray-500">${escapeHtml((user.displayName||user.username||'U')[0])}</div>`;
  box.innerHTML = `${avatar}
    <h2 class="text-xl font-semibold mt-3">${escapeHtml(user.displayName||user.username)}</h2>
    <div class="text-sm text-gray-600">@${escapeHtml(user.username)}</div>
    <div class="mt-3"><button id="editProfile" class="px-4 py-2 border rounded">Edit profile</button></div>`;
  document.getElementById('editProfile').onclick = () => alert('Edit profile feature (not implemented in this step).');
}

async function loadUserPosts(userId){
  const el = document.getElementById('userPosts');
  el.innerHTML = 'Loading...';
  try {
    const r = await apiFetch(`${POST_URL}/author/${userId}`);
    el.innerHTML = '';
    (r.posts||[]).forEach(p => {
      const div = document.createElement('div');
      div.className = 'mb-3 p-3 border rounded';
      div.innerHTML = `<div class="text-sm text-gray-600">Posted • ${new Date(p.createdAt).toLocaleString()}</div><div class="mt-1">${escapeHtml(p.content)}</div>`;
      el.appendChild(div);
    });
  } catch(e){ console.error(e); el.innerHTML = 'Failed to load posts'; }
}

async function loadLikedPosts(userId){
  const el = document.getElementById('likedPosts');
  el.innerHTML = 'Loading...';
  try {
    const r = await apiFetch(`${POST_URL}/liked-by/${userId}`);
    el.innerHTML = '';
    (r.posts||[]).forEach(p => {
      const div = document.createElement('div');
      div.className = 'mb-3 p-3 border rounded';
      div.innerHTML = `<div class="text-sm text-gray-600">Posted • ${new Date(p.createdAt).toLocaleString()} by ${escapeHtml(p.author && p.author.username || p.authorId)}</div><div class="mt-1">${escapeHtml(p.content)}</div>`;
      el.appendChild(div);
    });
  } catch(e){ console.error(e); el.innerHTML = 'Failed to load liked posts'; }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
