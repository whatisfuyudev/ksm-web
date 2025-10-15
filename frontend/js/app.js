const AUTH_URL = 'http://localhost:4000/api/auth';
const POST_URL = 'http://localhost:4001/api/posts';
const COMMENT_URL = 'http://localhost:4001/api/comments';

function setToken(t){ localStorage.setItem('token', t); }
function getToken(){ return localStorage.getItem('token'); }
function clearToken(){ localStorage.removeItem('token'); }

async function apiFetch(url, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  const res = await fetch(url, opts);
  if(res.status === 401){ clearToken(); window.location = '/'; throw new Error('unauthorized'); }
  return res.json();
}

/* LOGIN & REGISTER (index.html) */
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('btnLogin');
  if(loginBtn){
    document.getElementById('showRegister').onclick = e => {
      e.preventDefault(); document.getElementById('registerBox').classList.toggle('hidden');
    };

    loginBtn.onclick = async () => {
      const identifier = document.getElementById('loginIdentifier').value;
      const password = document.getElementById('loginPassword').value;
      const r = await fetch(AUTH_URL + '/login', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ usernameOrEmail: identifier, password })
      });
      const data = await r.json();
      if(r.ok){ setToken(data.token); window.location = '/feed.html'; }
      else alert(data.message || 'Login failed');
    };

    document.getElementById('btnRegister').onclick = async () => {
      const username = document.getElementById('regUsername').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const r = await fetch(AUTH_URL + '/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username, email, password })
      });
      const data = await r.json();
      if(r.ok){ setToken(data.token); window.location = '/feed.html'; }
      else alert(data.message || 'Register failed');
    };
  }

  /* FEED logic (feed.html) */
  const logoutBtn = document.getElementById('btnLogout');
  if(logoutBtn){
    logoutBtn.onclick = () => { clearToken(); window.location = '/'; };
    loadFeed();

    document.getElementById('btnPost').onclick = async () => {
      const content = document.getElementById('postContent').value;
      if(!content) return alert('isi dulu');
      try {
        const res = await apiFetch(POST_URL, { method: 'POST', body: JSON.stringify({ content }) });
        document.getElementById('postContent').value = '';
        loadFeed();
      } catch(e) { console.error(e); alert('error'); }
    };
  }
});

/* load posts and comments for each */
async function loadFeed(){
  const container = document.getElementById('postsContainer');
  container.innerHTML = 'Loading...';
  const data = await apiFetch(POST_URL + '?limit=20&page=1');
  container.innerHTML = '';
  for(const p of data.posts){
    const el = document.createElement('div');
    el.className = 'bg-white p-4 rounded shadow mb-3';
    el.innerHTML = `<div class="text-sm text-gray-600 mb-2">Post by <strong>${(p.author && p.author.username) || p.authorId}</strong> • ${new Date(p.createdAt).toLocaleString()}</div>
      <div class="mb-2">${escapeHtml(p.content)}</div>
      <div class="comments"></div>
      <div class="mt-2">
        <input placeholder="Add a comment..." class="commentInput border p-2 w-full" />
        <button class="btnComment mt-2 bg-gray-800 text-white px-3 py-1 rounded">Comment</button>
      </div>`;
    container.appendChild(el);

    // bind comment create
    const btn = el.querySelector('.btnComment');
    btn.onclick = async () => {
      const input = el.querySelector('.commentInput');
      const content = input.value;
      if(!content) return;
      try {
        await apiFetch(COMMENT_URL + '/' + p._id, { method: 'POST', body: JSON.stringify({ content }) });
        input.value = '';
        renderCommentsForPost(p._id, el.querySelector('.comments'));
      } catch(e){ console.error(e); alert('cannot comment'); }
    };

    // render comments
    renderCommentsForPost(p._id, el.querySelector('.comments'));
  }
}

/* fetch comments and build tree, then render recursively */
async function renderCommentsForPost(postId, targetEl){
  targetEl.innerHTML = 'Loading comments...';
  const res = await apiFetch(COMMENT_URL + '/' + postId);
  const comments = res.comments || [];
  const tree = buildCommentTree(comments);
  targetEl.innerHTML = '';
  for(const node of tree){
    targetEl.appendChild(renderCommentNode(node));
  }
}

/* build a parent->children tree as array of root nodes */
function buildCommentTree(comments){
  const map = {};
  comments.forEach(c => { c.children = []; map[c._id] = c; });
  const roots = [];
  comments.forEach(c => {
    if(c.parentCommentId){
      const parent = map[c.parentCommentId];
      if(parent) parent.children.push(c);
      else roots.push(c);
    } else roots.push(c);
  });
  return roots;
}

/* render node recursively */
function renderCommentNode(node){
  const template = document.getElementById('commentTemplate');
  const clone = template.content.cloneNode(true);
  clone.querySelector('.author').textContent = node.authorId;
  clone.querySelector('.meta').textContent = new Date(node.createdAt).toLocaleString();
  clone.querySelector('.content').textContent = node.content;
  const repliesContainer = clone.querySelector('.replies');

  // reply button: show inline input
  const replyBtn = clone.querySelector('.replyBtn');
  replyBtn.onclick = () => {
    if(clone.querySelector('.replyBox')) return;
    const box = document.createElement('div');
    box.className = 'replyBox mt-2';
    box.innerHTML = `<input placeholder="reply..." class="w-full p-2 border replyInput" />
      <button class="mt-1 replySend px-3 py-1 bg-blue-600 text-white rounded">Send</button>`;
    replyBtn.after(box);
    box.querySelector('.replySend').onclick = async () => {
      const content = box.querySelector('.replyInput').value;
      if(!content) return;
      try {
        await apiFetch(COMMENT_URL + '/' + node.postId, { method: 'POST', body: JSON.stringify({ content, parentCommentId: node._id }) });
        // rerender comments for post
        const top = findNearestAncestorWithClass(replyBtn, 'comments') || repliesContainer;
        const postContainer = top.closest('.bg-white');
        const commentsDiv = postContainer.querySelector('.comments');
        await renderCommentsForPost(node.postId, commentsDiv);
      } catch(e){ console.error(e); alert('reply failed'); }
    };
  };

  // render children
  if(node.children && node.children.length){
    node.children.forEach(child => repliesContainer.appendChild(renderCommentNode(child)));
  }
  return clone;
}

/* helper: escape */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* helper: find ancestor with class */
function findNearestAncestorWithClass(el, cls){
  let cur = el;
  while(cur && cur !== document.body){
    if(cur.classList && cur.classList.contains(cls)) return cur;
    cur = cur.parentElement;
  }
  return null;
}
