const POST_URL = 'http://localhost:4001/api/posts';
const COMMENT_URL = 'http://localhost:4001/api/comments';
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
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if(!id) { document.getElementById('postContainer').innerText = 'No post id'; return; }
  try {
    const r = await apiFetch(`${POST_URL}/${id}`);
    const p = r.post;
    const container = document.getElementById('postContainer');
    container.innerHTML = `<div class="bg-white p-4 rounded-xl shadow-sm">
      <div class="text-sm text-gray-600 mb-2">Post by <strong>${escapeHtml(p.author && p.author.username)}</strong> • ${new Date(p.createdAt).toLocaleString()}</div>
      <div class="text-gray-900">${escapeHtml(p.content)}</div>
      <div class="mt-3"><button id="likeBtn" class="bg-black text-white px-3 py-1 rounded">Like (${p.likesCount||0})</button></div>
    </div>`;
    document.getElementById('likeBtn').onclick = async () => {
      const res = await apiFetch(`${POST_URL}/${id}/like`, { method: 'POST' });
      document.getElementById('likeBtn').textContent = `Like (${res.likesCount})`;
    };
    // load top-level comments
    renderComments(id);
  } catch(e){ console.error(e); document.getElementById('postContainer').innerText = 'Failed to load post'; }
});

async function renderComments(postId){
  const el = document.getElementById('comments');
  el.innerHTML = '<div class="mt-4">Loading comments...</div>';
  try {
    const r = await apiFetch(`${COMMENT_URL}/${postId}`);
    el.innerHTML = '';
    (r.comments||[]).forEach(c => {
      el.appendChild(buildComment(c));
    });
  } catch(e){ console.error(e); el.innerHTML = 'Failed to load comments'; }
}

function buildComment(c){
  const container = document.createElement('div');
  container.className = 'pl-4 border-l mt-2 bg-white p-3 rounded';
  container.innerHTML = `<div class="text-sm"><strong>${escapeHtml(c.author && c.author.username)}</strong> <span class="text-gray-500 text-xs">${new Date(c.createdAt).toLocaleString()}</span></div>
    <div class="mt-1">${escapeHtml(c.content)}</div>
    <div class="mt-2"><button class="showReplies text-sm text-blue-600">Show replies</button><div class="replies mt-2"></div></div>`;
  container.querySelector('.showReplies').onclick = async function(){
    this.disabled = true; this.textContent = 'Loading...';
    const r = await apiFetch(`${COMMENT_URL}/replies/${c._id}`);
    const repCont = container.querySelector('.replies');
    repCont.innerHTML = '';
    (r.replies||[]).forEach(rep => repCont.appendChild(buildComment(rep)));
    this.remove();
  };
  return container;
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
