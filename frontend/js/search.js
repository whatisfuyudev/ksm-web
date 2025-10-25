// frontend/js/search.js
// Complete replacement for search.js implementing paging + "Load more"

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
  document.getElementById('btnSearch').onclick = () => startSearch();
  document.getElementById('q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startSearch();
  });
});

/* author cache to avoid repeated network calls per user */
const authorCache = new Map();

/* ensure post object has .author { username, displayName, avatarUrl } if possible */
async function ensureAuthorForPost(p) {
  if (p.author && (p.author.username || p.author.displayName)) return p;

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
    const normalized = {
      username: user.username || aid,
      displayName: user.displayName || user.username || aid,
      avatarUrl: user.avatarUrl || null,
      id: user._id || user.id || aid
    };
    authorCache.set(aid, normalized);
    p.author = normalized;
  } catch (e) {
    const fallback = { username: aid, displayName: aid, id: aid };
    authorCache.set(aid, fallback);
    p.author = fallback;
  }
  return p;
}

/* --- Search state and helpers --- */
const STATE = {
  q: '',
  type: 'posts', // 'posts' or 'users'
  page: 1,
  limit: 10,
  loading: false,
  total: 0,
  accumulated: 0
};

function resetState(q, type) {
  STATE.q = q;
  STATE.type = type;
  STATE.page = 1;
  STATE.loading = false;
  STATE.total = 0;
  STATE.accumulated = 0;
  removeLoadMoreBtn();
}

/* renderers */
function createPostResultNode(p) {
  const author = p.author || {};
  const displayName = escapeHtml(author.displayName || author.username || p.authorId || 'unknown');
  const username = escapeHtml(author.username || author.id || p.authorId || 'unknown');

  const d = document.createElement('div');
  d.className = 'mb-3 p-3 border rounded bg-white';
  d.innerHTML = `<div class="text-sm text-gray-600">by <strong>${displayName}</strong> <span class="text-xs text-gray-500">@${username}</span> • ${new Date(p.createdAt).toLocaleString()}</div>
    <div class="mt-1 text-gray-900">${escapeHtml(p.content)}</div>
    <div class="mt-2"><a href="/post.html?id=${encodeURIComponent(p._id)}" class="text-blue-600">View post</a></div>`;
  return d;
}

function createUserResultNode(u) {
  const d = document.createElement('div');
  d.className = 'mb-3 p-3 border rounded flex items-center justify-between bg-white';
  // use u.id (normalized on server) or fallback
  const id = u.id || u._id || u._id || u.id;
  d.innerHTML = `<div><div class="font-medium">${escapeHtml(u.displayName || u.username)}</div><div class="text-sm text-gray-600">@${escapeHtml(u.username)}</div></div><div><a href="/profile.html?id=${encodeURIComponent(id)}" class="text-blue-600">View</a></div>`;
  return d;
}

function showLoadingMessage(msg = 'Searching...') {
  const out = document.getElementById('results');
  out.innerHTML = `<div class="text-sm text-gray-500">${escapeHtml(msg)}</div>`;
}

function appendLoadMoreBtn() {
  removeLoadMoreBtn();
  const out = document.getElementById('results');
  const btnWrap = document.createElement('div');
  btnWrap.className = 'text-center py-3';
  const btn = document.createElement('button');
  btn.id = 'searchLoadMore';
  btn.className = 'px-4 py-2 border rounded';
  btn.textContent = 'Load more';
  btnWrap.appendChild(btn);
  out.appendChild(btnWrap);
  btn.addEventListener('click', () => loadMore());
}

function removeLoadMoreBtn() {
  const existing = document.getElementById('searchLoadMore');
  if (existing) {
    existing.closest('div')?.remove();
  }
}

/* main entry for new searches */
async function startSearch() {
  const q = document.getElementById('q').value.trim();
  const type = document.getElementById('type').value;
  const out = document.getElementById('results');
  out.innerHTML = '';

  if(!q) {
    out.innerHTML = '<div class="text-sm text-gray-500">Type something</div>';
    return;
  }

  resetState(q, type);
  showLoadingMessage('Searching...');
  await fetchAndAppend(); // page 1
}

/* load more handler */
async function loadMore() {
  if (STATE.loading) return;
  STATE.page += 1;
  await fetchAndAppend();
}

/* fetch & append results for current STATE.page */
async function fetchAndAppend() {
  const out = document.getElementById('results');
  const q = STATE.q;
  const type = STATE.type;
  const page = STATE.page;
  const limit = STATE.limit;

  STATE.loading = true;

  try {
    if (page === 1) out.innerHTML = '';

    if (type === 'posts') {
      const res = await apiFetch(`${POST_URL}/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, { method: 'GET' });
      const posts = res.posts || [];
      const total = (typeof res.total === 'number') ? res.total : (posts.length < limit ? (posts.length + ((page - 1) * limit)) : NaN);

      // fetch authors in parallel (cached)
      await Promise.all(posts.map(p => ensureAuthorForPost(p)));

      posts.forEach(p => out.appendChild(createPostResultNode(p)));

      STATE.accumulated += posts.length;
      STATE.total = (typeof total === 'number') ? total : STATE.total;

      // show load more only if we can detect more items (prefer server-provided total)
      const moreByTotal = typeof STATE.total === 'number' ? (STATE.accumulated < STATE.total) : (posts.length === limit);
      if (moreByTotal) appendLoadMoreBtn(); else removeLoadMoreBtn();

      if (STATE.accumulated === 0) out.innerHTML = '<div class="text-sm text-gray-500">No posts found</div>';
    } else {
      // users
      const res = await apiFetch(`${AUTH_BASE}/api/users/search?q=${encodeURIComponent(q)}&page=${page}&limit=${limit}`, { method: 'GET' });
      const users = res.users || [];
      const total = (typeof res.total === 'number') ? res.total : (users.length < limit ? (users.length + ((page - 1) * limit)) : NaN);

      users.forEach(u => out.appendChild(createUserResultNode(u)));

      STATE.accumulated += users.length;
      STATE.total = (typeof total === 'number') ? total : STATE.total;
      const moreByTotal = typeof STATE.total === 'number' ? (STATE.accumulated < STATE.total) : (users.length === limit);
      if (moreByTotal) appendLoadMoreBtn(); else removeLoadMoreBtn();

      if (STATE.accumulated === 0) out.innerHTML = '<div class="text-sm text-gray-500">No users found</div>';
    }
  } catch (e) {
    console.error('Search error', e);
    const out = document.getElementById('results');
    out.innerHTML = `<div class="text-sm text-red-600">Search failed: ${escapeHtml(e.message || 'error')}</div>`;
    removeLoadMoreBtn();
  } finally {
    STATE.loading = false;
  }
}

/* helper escape */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
