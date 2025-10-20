const POST_URL = 'http://localhost:4001/api/posts';
const COMMENT_URL = 'http://localhost:4001/api/comments';
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
  // naive implementation: find posts by me, then find comments and likes by others
  try {
    const token = getToken();
    if(!token){ window.location = '/login.html'; return; }
    let me;
    try {
      const r = await fetch(`${AUTH_URL}/me`, { headers:{ Authorization: 'Bearer ' + token } });
      if(r.ok){ const json = await r.json(); me = json.user; }
    } catch(e){}
    if(!me){
      const payload = JSON.parse(atob(token.split('.')[1]));
      me = { id: payload.id, username: payload.username };
    }

    const out = document.getElementById('notificationsList');
    out.innerHTML = 'Loading...';

    // get my posts
    const postsRes = await apiFetch(`${POST_URL}/author/${me.id}`);
    const posts = postsRes.posts || [];

    const notifications = [];

    // find recent comments on my posts (top-level or replies)
    for(const p of posts){
      const cRes = await apiFetch(`${COMMENT_URL}/${p._id}`);
      const top = cRes.comments || [];
      // mark top-level comments as notifications
      for(const c of top){
        if(String(c.authorId) !== String(me.id)) { // note: author object exists too
          notifications.push({ type: 'comment', postId: p._id, postContent: p.content, comment: c });
        }
      }
      // Also check replies: we'll fetch replies for each top-level comment but only first-level
      for(const tl of top){
        const rRes = await apiFetch(`${COMMENT_URL}/replies/${tl._id}`);
        for(const rep of (rRes.replies||[])){
          if(String(rep.authorId) !== String(me.id)){
            notifications.push({ type: 'reply', postId: p._id, postContent: p.content, comment: rep });
          }
        }
      }
    }

    // likes: naive approach - check each post's likesCount > 0 and get latest (requires expanding)
    // For brevity, show comment notifications first
    out.innerHTML = '';
    if(notifications.length === 0) out.innerHTML = '<div class="text-gray-600">No notifications</div>';
    for(const n of notifications){
      const d = document.createElement('div');
      d.className = 'p-3 bg-white rounded shadow-sm';
      if(n.type === 'comment' || n.type === 'reply'){
        const author = n.comment.author ? n.comment.author.username : (n.comment.authorId || 'someone');
        d.innerHTML = `<div class="text-sm"><strong>${escapeHtml(author)}</strong> commented on your post: <div class="mt-1 text-gray-800">${escapeHtml(n.comment.content)}</div></div>
          <div class="mt-2 text-sm text-gray-500">${new Date(n.comment.createdAt).toLocaleString()}</div>`;
      }
      out.appendChild(d);
    }
  } catch(e){ console.error(e); document.getElementById('notificationsList').innerHTML = 'Failed to load'; }
});

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
