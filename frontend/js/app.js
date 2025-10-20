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
  if(!opts.body) opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
  const res = await fetch(url, opts);
  if(res.status === 401){ clearToken(); window.location = '/login.html'; throw new Error('unauthorized'); }
  return res.json();
}

/* DOM ready */
document.addEventListener('DOMContentLoaded', () => {
  // logout (desktop)
  const logoutBtn = document.getElementById('btnLogout');
  if(logoutBtn) logoutBtn.onclick = () => { clearToken(); window.location = '/login.html'; };

  // Post
  const postBtn = document.getElementById('btnPost');
  if(postBtn){
    postBtn.onclick = async () => {
      const content = document.getElementById('postContent').value.trim();
      if(!content) return alert('Isi dulu');
      try {
        await apiFetch(POST_URL, { method: 'POST', body: JSON.stringify({ content }) });
        document.getElementById('postContent').value = '';
        loadFeed();
      } catch(e){ console.error(e); alert('error saat posting'); }
    };
  }

  // mobile compose focus
  const mobileCompose = document.getElementById('mobileCompose');
  if(mobileCompose){
    mobileCompose.onclick = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); const ta = document.getElementById('postContent'); if(ta) ta.focus(); };
  }

  loadFeed();
});

/* load feed */
async function loadFeed(){
  const container = document.getElementById('postsContainer');
  container.innerHTML = '<div class="text-center text-gray-500 py-8">Loading...</div>';
  try {
    const data = await apiFetch(POST_URL + '?limit=20&page=1');
    container.innerHTML = '';
    for(const p of data.posts){
      container.appendChild(renderPost(p));
    }
  } catch(e){
    console.error(e);
    container.innerHTML = '<div class="text-center text-red-500 py-8">Gagal memuat feed.</div>';
  }
}

/* render post */
function renderPost(p){
  const wrap = document.createElement('div');
  wrap.className = 'bg-white p-4 rounded-xl shadow-sm';

  const header = document.createElement('div');
  header.className = 'text-sm text-gray-600 mb-2';
  header.innerHTML = `Post by <strong>${escapeHtml((p.author && p.author.username) || p.authorId)}</strong> • ${new Date(p.createdAt).toLocaleString()}`;

  const content = document.createElement('div');
  content.className = 'mb-3 text-gray-900';
  content.textContent = p.content || '';

  // actions
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-4';

  // like
  const likeBtn = document.createElement('button');
  likeBtn.className = 'flex items-center gap-2 text-sm';
  likeBtn.innerHTML = `<svg class="w-5 h-5 ${p.liked ? 'text-red-500' : 'text-gray-500'}" viewBox="0 0 24 24" fill="${p.liked ? 'currentColor' : 'none'}" stroke="currentColor"><path d="M12 21s-6-4.35-9-7.36C-1 8.12 3 4 7 4c2.87 0 4.07 1.79 5 3 .93-1.21 2.13-3 5-3 4 0 8 4.12 4 9.64C18 16.65 12 21 12 21z"/></svg> <span class="likesCount">${p.likesCount||0}</span>`;
  actions.appendChild(likeBtn);

  // reply toggle (no nested shown yet)
  const replyToggle = document.createElement('button');
  replyToggle.className = 'text-sm text-gray-600';
  replyToggle.textContent = 'Reply';
  actions.appendChild(replyToggle);

  // comments area (top-level comments only)
  const commentsDiv = document.createElement('div');
  commentsDiv.className = 'mt-3';

  // comment input
  const commentBox = document.createElement('div');
  commentBox.innerHTML = `<input placeholder="Add a comment..." class="commentInput border p-2 w-full rounded" />
    <button class="btnComment mt-2 bg-gray-800 text-white px-3 py-1 rounded">Comment</button>`;

  wrap.appendChild(header);
  wrap.appendChild(content);
  wrap.appendChild(actions);
  wrap.appendChild(commentsDiv);
  wrap.appendChild(commentBox);

  // load top-level comments for this post
  renderCommentsForPost(p._id, commentsDiv);

  // like click
  likeBtn.onclick = async () => {
    try {
      likeBtn.disabled = true;
      const res = await apiFetch(`${POST_URL}/${p._id}/like`, { method: 'POST' });
      const svg = likeBtn.querySelector('svg');
      const countSpan = likeBtn.querySelector('.likesCount');
      if(res.liked){
        svg.classList.remove('text-gray-500'); svg.classList.add('text-red-500'); svg.setAttribute('fill','currentColor');
      } else {
        svg.classList.remove('text-red-500'); svg.classList.add('text-gray-500'); svg.setAttribute('fill','none');
      }
      countSpan.textContent = res.likesCount;
    } catch(err){ console.error(err); alert('Gagal like'); }
    finally { likeBtn.disabled = false; }
  };

  // comment create
  const commentBtn = commentBox.querySelector('.btnComment');
  commentBtn.onclick = async () => {
    const input = commentBox.querySelector('.commentInput');
    const txt = input.value.trim();
    if(!txt) return;
    try {
      await apiFetch(`${COMMENT_URL}/${p._id}`, { method: 'POST', body: JSON.stringify({ content: txt }) });
      input.value = '';
      // refresh top-level comments
      await renderCommentsForPost(p._id, commentsDiv);
    } catch(e){ console.error(e); alert('Gagal menambah komentar'); }
  };

  return wrap;
}

/* render top-level comments and each comment only shows immediate replies via button */
async function renderCommentsForPost(postId, targetEl){
  targetEl.innerHTML = 'Loading comments...';
  try {
    const res = await apiFetch(`${COMMENT_URL}/${postId}`);
    const comments = res.comments || [];
    targetEl.innerHTML = '';
    for(const c of comments){
      targetEl.appendChild(renderCommentNode(c));
    }
  } catch(e){
    console.error(e);
    targetEl.innerHTML = '<div class="text-sm text-red-500">Gagal memuat komentar.</div>';
  }
}

/* render a comment node (shows author.username and a "Show replies" button if it has children) */
function renderCommentNode(node){
  const container = document.createElement('div');
  container.className = 'pl-4 border-l mt-2';

  const meta = document.createElement('div');
  meta.className = 'text-sm';
  meta.innerHTML = `<strong>${escapeHtml(node.author && node.author.username || node.authorId)}</strong> <span class="text-gray-500 text-xs">${new Date(node.createdAt).toLocaleString()}</span>`;

  const content = document.createElement('div');
  content.className = 'content mt-1';
  content.textContent = node.content;

  container.appendChild(meta);
  container.appendChild(content);

  // replies placeholder
  const repliesContainer = document.createElement('div');
  repliesContainer.className = 'replies mt-2';

  // show replies button: we don't know if it has replies without hitting endpoint, so show button and fetch on click
  const showRepliesBtn = document.createElement('button');
  showRepliesBtn.className = 'text-sm text-blue-600 mt-1';
  showRepliesBtn.textContent = 'Show replies';
  showRepliesBtn.onclick = async () => {
    showRepliesBtn.disabled = true;
    showRepliesBtn.textContent = 'Loading...';
    try {
      const r = await apiFetch(`${COMMENT_URL}/replies/${node._id}`);
      const replies = r.replies || [];
      repliesContainer.innerHTML = '';
      if(replies.length === 0){
        repliesContainer.innerHTML = '<div class="text-sm text-gray-500">No replies</div>';
      } else {
        for(const rep of replies){
          const repNode = renderCommentNode(rep); // recursion for rendering reply (but replies of replies are not auto-fetched)
          repliesContainer.appendChild(repNode);
        }
      }
      showRepliesBtn.remove();
    } catch(err){
      console.error(err);
      showRepliesBtn.disabled = false;
      showRepliesBtn.textContent = 'Show replies';
      alert('Gagal memuat replies');
    }
  };

  // append showReplies button (always present for user to click)
  container.appendChild(showRepliesBtn);
  container.appendChild(repliesContainer);

  return container;
}

/* helper escape */
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
