// frontend/js/app.js (replace your file with this)
const AUTH_URL = 'http://localhost:4000/api/auth';
const POST_URL = 'http://localhost:4001/api/posts';
const COMMENT_URL = 'http://localhost:4001/api/comments';

function setToken(t){ localStorage.setItem('token', t); }
function getToken(){ return localStorage.getItem('token'); }
function clearToken(){ localStorage.removeItem('token'); }

// improved apiFetch: auto-stringify objects, support FormData, throw on non-ok
async function apiFetch(url, opts = {}) {
  opts = opts || {};
  opts.headers = opts.headers || {};

  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  const isFormData = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);

  if (!isFormData) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof String)) {
      opts.body = JSON.stringify(opts.body);
    }
  }

  const res = await fetch(url, opts);

  if (res.status === 401) {
    clearToken();
    window.location = '/login.html';
    throw new Error('unauthorized');
  }

  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message = (data && data.message) ? data.message : (typeof data === 'string' ? data : 'Request failed');
    const err = new Error(message);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

/* DOM ready */
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('btnLogout');
  if(logoutBtn) logoutBtn.onclick = () => { clearToken(); window.location = '/login.html'; };

  const postBtn = document.getElementById('btnPost');
  if(postBtn){
    postBtn.onclick = async () => {
      const ta = document.getElementById('postContent');
      const content = ta.value.trim();
      if(!content) return;
      try {
        await apiFetch(POST_URL, { method: 'POST', body: { content } });
        ta.value = '';
        await loadFeed();
      } catch(e){ console.error('post error', e); }
    };
  }

  const mobileCompose = document.getElementById('mobileCompose');
  if(mobileCompose){
    mobileCompose.onclick = () => { window.scrollTo({ top: 0, behavior: 'smooth' }); const ta = document.getElementById('postContent'); if(ta) ta.focus(); };
  }

  loadFeed();
});

/* load feed */
async function loadFeed(){
  const container = document.getElementById('postsContainer');
  if(!container) return;
  container.innerHTML = '<div class="text-center text-gray-500 py-8">Loading...</div>';
  try {
    const data = await apiFetch(POST_URL + '?limit=20&page=1');
    container.innerHTML = '';
    for(const p of data.posts){
      const el = renderPost(p);
      // make it easy to find the post container later
      el.dataset.postid = p._id;
      container.appendChild(el);
    }
  } catch(e){
    console.error(e);
    container.innerHTML = '<div class="text-center text-red-500 py-8">Gagal memuat feed.</div>';
  }
}

/* render post */
function renderPost(p){
  const wrap = document.createElement('div');
  wrap.className = 'bg-white p-4 rounded-xl shadow-sm mb-4';

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

  // reply toggle: focus top-level comment input
  const replyToggle = document.createElement('button');
  replyToggle.className = 'text-sm text-gray-600';
  replyToggle.textContent = 'Reply';
  actions.appendChild(replyToggle);

  // comments area
  const commentsDiv = document.createElement('div');
  commentsDiv.className = 'mt-3';
  commentsDiv.dataset.postid = p._id;

  // comment input
  const commentBox = document.createElement('div');
  commentBox.className = 'mt-3';
  commentBox.innerHTML = `<input placeholder="Add a comment..." class="commentInput border p-2 w-full rounded" />
    <div class="mt-2"><button class="btnComment bg-gray-800 text-white px-3 py-1 rounded">Comment</button></div>`;

  wrap.appendChild(header);
  wrap.appendChild(content);
  wrap.appendChild(actions);
  wrap.appendChild(commentsDiv);
  wrap.appendChild(commentBox);

  // load top-level comments for this post (roots only),
  // and for each root we pre-fetch its immediate replies (level-1) so feed shows roots + their immediate replies only
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
    } catch(err){ console.error(err); }
    finally { likeBtn.disabled = false; }
  };

  // top-level comment create
  const commentBtn = commentBox.querySelector('.btnComment');
  commentBtn.onclick = async () => {
    const input = commentBox.querySelector('.commentInput');
    const txt = input.value.trim();
    if(!txt) {
      input.classList.add('border-red-400');
      setTimeout(()=> input.classList.remove('border-red-400'), 900);
      return;
    }
    try {
      await apiFetch(`${COMMENT_URL}/${p._id}`, { method: 'POST', body: { content: txt } });
      input.value = '';
      await renderCommentsForPost(p._id, commentsDiv);
    } catch(err) {
      console.error('Gagal menambah komentar', err);
      const errEl = document.createElement('div');
      errEl.className = 'text-sm text-red-600 mt-2';
      errEl.textContent = err.message || 'Gagal menambah komentar';
      commentBox.appendChild(errEl);
      setTimeout(()=> { try{ errEl.remove(); } catch(e){} }, 4000);
    }
  };

  // replyToggle focuses top-level comment input
  replyToggle.onclick = () => {
    const input = commentBox.querySelector('.commentInput');
    if(input) { input.focus(); window.scrollTo({ top: input.getBoundingClientRect().top + window.scrollY - 120, behavior:'smooth' }); }
  };

  return wrap;
}

/* -----------------------
   COMMENTS: only roots + immediate children shown automatically.
   Show replies button appears only if those replies are not yet rendered.
   ----------------------- */

// render comments for a post: show roots and their immediate children (level-1)
// This endpoint (GET /api/comments/:postId) is expected to return top-level comments only (parentCommentId == null)
async function renderCommentsForPost(postId, targetEl){
  targetEl.innerHTML = '<div class="text-sm text-gray-500 py-2">Loading comments...</div>';
  try {
    const res = await apiFetch(`${COMMENT_URL}/${postId}`);
    const roots = res.comments || [];
    targetEl.innerHTML = '';

    if(roots.length === 0){
      targetEl.innerHTML = '<div class="text-sm text-gray-500">No comments</div>';
      return;
    }

    // For each root: render the root comment node WITHOUT a "Show replies" button (we will pre-fetch immediate replies),
    // then create childrenWrap and pre-fetch immediate replies into it.
    for(const root of roots){
      // render root but suppress the show-replies button because we will fetch its immediate children now
      const rootNode = renderCommentNode(root, postId, { isRoot:true, suppressShowReplies: true });
      targetEl.appendChild(rootNode);

      const childrenWrap = document.createElement('div');
      childrenWrap.className = 'ml-4 mt-2';
      // fetch immediate replies (level-1) and render them inside childrenWrap
      await fetchAndRenderReplies(root._id, childrenWrap, { parentId: root._id, parentNode: rootNode, autoPrefetch:true });
      targetEl.appendChild(childrenWrap);
    }

  } catch(e){
    console.error(e);
    targetEl.innerHTML = '<div class="text-sm text-red-500">Gagal memuat komentar.</div>';
  }
}

/* render a single comment node
   options:
     - isChild/isRoot: for styling (not required)
     - suppressShowReplies: if true, don't render "Show replies" button (useful when replies already prefetched)
*/
function renderCommentNode(node, postId, options = {}) {
  const { isChild=false, isRoot=false, suppressShowReplies=false } = options;

  const container = document.createElement('div');
  container.className = (isChild ? 'pl-2 border-l' : '') + ' mt-2';
  container.dataset.commentId = node._id || '';

  const meta = document.createElement('div');
  meta.className = 'text-sm';
  meta.innerHTML = `<strong>${escapeHtml(node.author && node.author.username || node.authorId || 'unknown')}</strong> <span class="text-gray-500 text-xs ml-2">${new Date(node.createdAt).toLocaleString()}</span>`;

  const content = document.createElement('div');
  content.className = 'content mt-1';
  content.textContent = node.content || '';

  container.appendChild(meta);
  container.appendChild(content);

  // actions
  const actions = document.createElement('div');
  actions.className = 'mt-2 flex items-center gap-3';

  const replyBtn = document.createElement('button');
  replyBtn.type = 'button';
  replyBtn.className = 'text-sm text-gray-700 reply-button';
  replyBtn.textContent = 'Reply';
  actions.appendChild(replyBtn);

  // Show replies button: only create it if not suppressed.
  let showRepliesBtn = null;
  if(!suppressShowReplies) {
    showRepliesBtn = document.createElement('button');
    showRepliesBtn.type = 'button';
    showRepliesBtn.className = 'text-sm text-blue-600 show-replies-button';
    showRepliesBtn.textContent = 'Show replies';
    actions.appendChild(showRepliesBtn);
  }

  container.appendChild(actions);

  // replies placeholder (lazy)
  const repliesContainer = document.createElement('div');
  repliesContainer.className = 'replies mt-2';
  container.appendChild(repliesContainer);

  // Reply inline flow (create a reply to this comment)
  replyBtn.addEventListener('click', () => {
    if(container.querySelector('.replyBox')) {
      const ri = container.querySelector('.replyInput');
      if(ri) ri.focus();
      return;
    }
    const box = document.createElement('div');
    box.className = 'replyBox mt-2';
    box.innerHTML = `
      <input placeholder="Write a reply..." class="replyInput border p-2 w-full rounded" />
      <div class="mt-2">
        <button class="replySend bg-black text-white px-3 py-1 rounded">Send</button>
        <button class="replyCancel ml-2 px-3 py-1 rounded border">Cancel</button>
      </div>
    `;
    actions.insertAdjacentElement('afterend', box);

    const send = box.querySelector('.replySend');
    const cancel = box.querySelector('.replyCancel');
    const input = box.querySelector('.replyInput');
    input.focus();

    send.addEventListener('click', async () => {
      const text = input.value && input.value.trim();
      if(!text) { input.classList.add('border-red-400'); setTimeout(()=> input.classList.remove('border-red-400'), 900); return; }
      send.disabled = true;
      try {
        await apiFetch(`${COMMENT_URL}/${postId}`, { method: 'POST', body: { content: text, parentCommentId: node._id } });
        if(box && box.remove) box.remove();
        // refresh comments for the post (keeps consistent tree)
        const postsContainer = document.getElementById('postsContainer');
        if(postsContainer){
          const postNode = postsContainer.querySelector(`[data-postid="${postId}"]`);
          if(postNode){
            const commentsArea = postNode.querySelector(`div[data-postid="${postId}"]`);
            // fallback find
            const anyCommentsArea = postNode.querySelector('div.mt-3');
            const target = commentsArea || anyCommentsArea;
            if(target) await renderCommentsForPost(postId, target);
          }
        }
      } catch(err){
        console.error('Failed to send reply', err);
        send.disabled = false;
      }
    });

    cancel.addEventListener('click', () => {
      if(box && box.remove) box.remove();
    });
  });

  // Show replies click: lazy-load immediate replies for this comment only (next nested level)
  if(showRepliesBtn){
    showRepliesBtn.addEventListener('click', async () => {
      // prevent double-load
      if(repliesContainer.dataset.loaded === 'true') return;
      showRepliesBtn.disabled = true;
      showRepliesBtn.textContent = 'Loading...';
      try {
        await fetchAndRenderReplies(node._id, repliesContainer, { parentId: node._id, parentNode: container, autoPrefetch:false });
        // after successful load, remove this show button (no duplication)
        if(showRepliesBtn && showRepliesBtn.remove) showRepliesBtn.remove();
      } catch(err){
        console.error('Failed to load replies', err);
        showRepliesBtn.disabled = false;
        showRepliesBtn.textContent = 'Show replies';
      }
    });
  }

  return container;
}

/* fetch immediate replies for a commentId and render them inside containerEl
   options:
     - parentId: comment id (for reference)
     - parentNode: DOM element of the parent comment (so we can remove its show button if necessary)
     - autoPrefetch: if true, we expect prefetch (used when renderCommentsForPost automatically loads level-1 replies)
*/
async function fetchAndRenderReplies(commentId, containerEl, options = {}) {
  const { parentId=null, parentNode=null, autoPrefetch=false } = options;

  // If already loaded, do nothing (prevents duplicates)
  if(containerEl.dataset.loaded === 'true') {
    return;
  }

  // show loading indicator only while fetching
  const prevContent = containerEl.innerHTML;
  containerEl.innerHTML = '<div class="text-sm text-gray-500">Loading replies...</div>';

  try {
    const r = await apiFetch(`${COMMENT_URL}/replies/${commentId}`);
    const replies = r.replies || [];
    containerEl.innerHTML = '';
    if(replies.length === 0) {
      // if prefetch, leave empty (no replies); if user explicitly clicked, show "No replies"
      if(!autoPrefetch) containerEl.innerHTML = '<div class="text-sm text-gray-500">No replies</div>';
      containerEl.dataset.loaded = 'true';
      // also remove parent's show button if present (because no replies)
      if(parentNode) {
        const btn = parentNode.querySelector('.show-replies-button');
        if(btn && btn.remove) btn.remove();
      }
      return;
    }

    // render each reply node (each reply can itself have its own "Show replies" button for its immediate children)
    for(const rep of replies) {
      const repNode = renderCommentNode(rep, rep.postId || '', { isChild:true, suppressShowReplies:false });
      containerEl.appendChild(repNode);
    }

    containerEl.dataset.loaded = 'true';

    // since we've now rendered replies for the parent, remove its "Show replies" button if exists
    if(parentNode){
      const btn = parentNode.querySelector('.show-replies-button');
      if(btn && btn.remove) btn.remove();
    }

  } catch(e) {
    console.error('fetchAndRenderReplies error', e);
    // restore previous content if needed
    containerEl.innerHTML = prevContent || '<div class="text-sm text-red-500">Gagal memuat replies.</div>';
    throw e;
  }
}

/* helper escape */
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
