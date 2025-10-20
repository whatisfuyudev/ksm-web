const POST_URL = 'http://localhost:4001/api/posts';
const AUTH_BASE = 'http://localhost:4000';
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

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnSearch').onclick = doSearch;
});

async function doSearch(){
  const q = document.getElementById('q').value.trim();
  const type = document.getElementById('type').value;
  const out = document.getElementById('results');
  out.innerHTML = 'Searching...';
  if(!q) { out.innerHTML = 'Type something'; return; }

  if(type === 'posts'){
    try {
      const r = await apiFetch(`${POST_URL}/search?q=${encodeURIComponent(q)}`);
      out.innerHTML = '';
      (r.posts||[]).forEach(p => {
        const d = document.createElement('div');
        d.className = 'mb-3 p-3 border rounded';
        d.innerHTML = `<div class="text-sm text-gray-600">by ${escapeHtml(p.author && p.author.username || p.authorId)} • ${new Date(p.createdAt).toLocaleString()}</div>
          <div class="mt-1">${escapeHtml(p.content)}</div>
          <div class="mt-2"><a href="/post.html?id=${encodeURIComponent(p._id)}" class="text-blue-600">View post</a></div>`;
        out.appendChild(d);
      });
    } catch(e){ console.error(e); out.innerHTML = 'Search failed'; }
  } else {
    // search users via auth-service (assumes endpoint /api/users/search?q=)
    try {
      const r = await apiFetch(`${AUTH_BASE}/api/users/search?q=${encodeURIComponent(q)}`);
      out.innerHTML = '';
      (r.users||[]).forEach(u => {
        const d = document.createElement('div');
        d.className = 'mb-3 p-3 border rounded flex items-center justify-between';
        d.innerHTML = `<div><div class="font-medium">${escapeHtml(u.displayName || u.username)}</div><div class="text-sm text-gray-600">@${escapeHtml(u.username)}</div></div><div><a href="/profile.html?id=${encodeURIComponent(u.id)}" class="text-blue-600">View</a></div>`;
        out.appendChild(d);
      });
    } catch(e){ console.error(e); out.innerHTML = 'Search failed or auth service lacks search endpoint'; }
  }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
