// frontend/js/search.js
const POST_URL = 'http://localhost:4001/api/posts';
const AUTH_BASE = 'http://localhost:4000';

function getToken(){ return localStorage.getItem('token'); }

/**
 * apiFetch: small robust wrapper
 */
async function apiFetch(url, opts = {}) {
  opts = opts || {};
  opts.headers = opts.headers || {};

  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  const isFormData = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);
  if (opts.body && !isFormData && typeof opts.body === 'object' && !(opts.body instanceof String)) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, opts);

  if (res.status === 401) {
    localStorage.removeItem('token');
    window.location = '/login.html';
    throw new Error('unauthorized');
  }

  const ct = res.headers.get('content-type') || '';
  let data;
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const err = new Error((data && data.message) ? data.message : String(data || 'Request failed'));
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnSearch').onclick = doSearch;
  document.getElementById('q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
});

/* author cache to avoid repeated network calls per user */
const authorCache = new Map();

/* ensure post object has .author { username, displayName, avatarUrl } if possible */
async function ensureAuthorForPost(p) {
  // already present
  if (p.author && (p.author.username || p.author.displayName)) return p;

  // already cached
  const aid = String(p.authorId || p.author?._id || '');
  if (!aid) {
    p.author = p.author || { username: 'unknown' };
    return p;
  }

  if (authorCache.has(aid)) {
    p.author = authorCache.get(aid);
    return p;
  }

  try {
    const r = await apiFetch(`${AUTH_BASE}/api/users/${encodeURIComponent(aid)}`, { method: 'GET' });
    const user = r.user || { username: aid };
    // normalize object keys we care about
    const normalized = {
      username: user.username || aid,
      displayName: user.displayName || user.username || aid,
      avatarUrl: user.avatarUrl || user.avatarUrl || null,
      id: user._id || user.id || aid
    };
    authorCache.set(aid, normalized);
    p.author = normalized;
  } catch (e) {
    // fallback: show id if server unreachable
    const fallback = { username: aid, displayName: aid, id: aid };
    authorCache.set(aid, fallback);
    p.author = fallback;
  }
  return p;
}

async function doSearch(){
  const q = document.getElementById('q').value.trim();
  const type = document.getElementById('type').value;
  const out = document.getElementById('results');
  out.innerHTML = '';

  if(!q) {
    out.innerHTML = '<div class="text-sm text-gray-500">Type something</div>';
    return;
  }

  out.innerHTML = '<div class="text-sm text-gray-500">Searching...</div>';

  if(type === 'posts'){
    try {
      const r = await apiFetch(`${POST_URL}/search?q=${encodeURIComponent(q)}`, { method: 'GET' });
      out.innerHTML = '';
      const posts = (r.posts || []);
      
      if(posts.length === 0){
        out.innerHTML = '<div class="text-sm text-gray-500">No posts found</div>';
        return;
      }

      // fetch author info in parallel with caching
      await Promise.all(posts.map(p => ensureAuthorForPost(p)));

      posts.forEach(p => {
        const author = p.author || {};
        const displayName = escapeHtml(author.displayName || author.username || p.authorId || 'unknown');
        const username = escapeHtml(author.username || author.id || p.authorId || 'unknown');

        const d = document.createElement('div');
        d.className = 'mb-3 p-3 border rounded bg-white';
        d.innerHTML = `<div class="text-sm text-gray-600">by <strong>${displayName}</strong> <span class="text-xs text-gray-500">@${username}</span> • ${new Date(p.createdAt).toLocaleString()}</div>
          <div class="mt-1 text-gray-900">${escapeHtml(p.content)}</div>
          <div class="mt-2"><a href="/post.html?id=${encodeURIComponent(p._id)}" class="text-blue-600">View post</a></div>`;
        out.appendChild(d);
      });
    } catch(e){
      console.error('Search posts error', e);
      out.innerHTML = `<div class="text-sm text-red-600">Search failed: ${escapeHtml(e.message || 'error')}</div>`;
    }
  } else {
    // search users via auth-service (assumes endpoint /api/users/search?q=)
    try {
      const r = await apiFetch(`${AUTH_BASE}/api/users/search?q=${encodeURIComponent(q)}`, { method: 'GET' });
      out.innerHTML = '';
      const users = (r.users || []);
      if(users.length === 0){
        out.innerHTML = '<div class="text-sm text-gray-500">No users found</div>';
        return;
      }
      users.forEach(u => {
        const d = document.createElement('div');
        d.className = 'mb-3 p-3 border rounded flex items-center justify-between bg-white';
        d.innerHTML = `<div><div class="font-medium">${escapeHtml(u.displayName || u.username)}</div><div class="text-sm text-gray-600">@${escapeHtml(u.username)}</div></div><div><a href="/profile.html?id=${encodeURIComponent(u.id)}" class="text-blue-600">View</a></div>`;
        out.appendChild(d);
      });
    } catch(e){
      console.error('Search users error', e);
      out.innerHTML = `<div class="text-sm text-red-600">Search failed (auth-service): ${escapeHtml(e.message || 'error')}</div>`;
    }
  }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
