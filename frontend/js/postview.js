// frontend/js/postview.js
const POST_URL = 'http://localhost:4001/api/posts';
const COMMENT_URL = 'http://localhost:4001/api/comments';
// auth service base (used to fetch user info when backend didn't include author)
const AUTH_BASE = 'http://localhost:4000';

function getToken(){ return localStorage.getItem('token'); }

// robust apiFetch: auto-stringify objects, support FormData, throw on non-ok
async function apiFetch(url, opts = {}) {
  opts = opts || {};
  opts.headers = opts.headers || {};

  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  const isFormData = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);
  if (!isFormData && opts.body && typeof opts.body === 'object' && !(opts.body instanceof String)) {
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
  const data = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = (data && data.message) ? data.message : (typeof data === 'string' ? data : 'Request failed');
    const err = new Error(msg);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/* DOM ready */
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if(!id) { document.getElementById('postContainer').innerText = 'No post id'; return; }

  await loadPost(id);
  setupNewCommentHandler(id);
});

/* load single post and initial UI */
async function loadPost(id){
  const container = document.getElementById('postContainer');
  container.innerHTML = '<div class="py-6 text-center text-gray-500">Loading post...</div>';
  try {
    const r = await apiFetch(`${POST_URL}/${id}`);
    const p = r.post;

    // author display (prefer author.username if available)
    const authorName = (p.author && p.author.username) ? p.author.username : (p.authorId||'unknown');

    const liked = !!p.liked;
    const likesCount = p.likesCount || 0;

    // render post box (like button structure: icon + count + label)
    container.innerHTML = `
      <div class="bg-white p-4 rounded-xl shadow-sm">
        <div class="text-sm text-gray-600 mb-2">Post by <strong>${escapeHtml(authorName)}</strong> • ${new Date(p.createdAt).toLocaleString()}</div>
        <div class="text-gray-900 mb-4">${escapeHtml(p.content)}</div>
        <div class="mt-3 flex items-center gap-3">
          <button id="likeBtn" class="inline-flex items-center gap-3 px-3 py-1 rounded transition" aria-pressed="${liked ? 'true' : 'false'}" title="${liked ? 'You liked this post' : 'Like this post'}">
            <svg class="likeIcon w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
              <path d="M12 21s-6-4.35-9-7.36C-1 8.12 3 4 7 4c2.87 0 4.07 1.79 5 3 .93-1.21 2.13-3 5-3 4 0 8 4.12 4 9.64C18 16.65 12 21 12 21z"/>
            </svg>
            <span class="likesCount text-sm font-medium">${likesCount}</span>
            <span class="likeLabel text-sm">${liked ? 'Liked' : 'Like'}</span>
          </button>
          <span id="likeMsg" class="ml-2 text-sm text-red-600"></span>
        </div>
      </div>
    `;

    // apply visual style
    const likeBtn = document.getElementById('likeBtn');
    applyLikeStyle(likeBtn, liked);

    // attach like handler
    likeBtn.addEventListener('click', async () => {
      try {
        likeBtn.disabled = true;
        const res = await apiFetch(`${POST_URL}/${id}/like`, { method: 'POST' });
        const newLiked = !!res.liked;
        const newCount = res.likesCount || 0;
        const countEl = likeBtn.querySelector('.likesCount');
        const labelEl = likeBtn.querySelector('.likeLabel');
        const icon = likeBtn.querySelector('.likeIcon');

        if(countEl) countEl.textContent = newCount;
        if(labelEl) labelEl.textContent = newLiked ? 'Liked' : 'Like';
        if(icon) icon.setAttribute('fill', newLiked ? 'currentColor' : 'none');

        applyLikeStyle(likeBtn, newLiked);
      } catch(err) {
        console.error('like error', err);
        document.getElementById('likeMsg').textContent = err.message || 'Failed to like';
        setTimeout(()=> document.getElementById('likeMsg').textContent = '', 3000);
      } finally {
        likeBtn.disabled = false;
      }
    });

    // load comments
    await renderComments(id);
  } catch(e){
    console.error(e);
    container.innerHTML = '<div class="text-red-600">Failed to load post</div>';
  }
}

/* helper to apply/remove classes when liked toggles
   - liked=true  => bg-black text-white, filled heart
   - liked=false => border, bg-white, outline heart
*/
function applyLikeStyle(btnEl, liked){
  if(!btnEl) return;
  btnEl.setAttribute('aria-pressed', liked ? 'true' : 'false');

  const icon = btnEl.querySelector('.likeIcon');
  const label = btnEl.querySelector('.likeLabel');
  const count = btnEl.querySelector('.likesCount');

  // remove both sets
  btnEl.classList.remove('bg-black','text-white','border','bg-white','text-black');
  if(icon) icon.classList.remove('text-red-400');

  if(liked){
    btnEl.classList.add('bg-black','text-white');
    if(icon){
      icon.setAttribute('fill','currentColor'); // filled heart
      icon.classList.add('text-red-400');
    }
    if(label) label.textContent = 'Liked';
  } else {
    btnEl.classList.add('border','bg-white','text-black');
    if(icon){
      icon.setAttribute('fill','none'); // outline
      icon.classList.remove('text-red-400');
    }
    if(label) label.textContent = 'Like';
  }

  if(count){
    count.classList.add('text-sm','font-medium');
  }
}

/* Helper: remove "No replies" placeholder if present */
function removeNoRepliesPlaceholder(repliesContainer){
  if(!repliesContainer) return;
  const ph = repliesContainer.querySelector('.no-replies-placeholder');
  if(ph) ph.remove();
}

/* comment UI + handlers */
function setupNewCommentHandler(postId){
  const input = document.getElementById('newCommentInput');
  const btn = document.getElementById('btnAddComment');
  const msg = document.getElementById('newCommentMsg');

  if(!input || !btn) return;

  btn.addEventListener('click', async () => {
    const text = (input.value || '').trim();
    if(!text) {
      input.classList.add('border-red-400');
      setTimeout(()=> input.classList.remove('border-red-400'), 800);
      return;
    }
    btn.disabled = true;
    try {
      await apiFetch(`${COMMENT_URL}/${postId}`, { method: 'POST', body: { content: text } });
      input.value = '';
      msg.textContent = '';
      await renderComments(postId);
      setTimeout(()=> {
        const last = document.querySelector('#comments > *:last-child');
        if(last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    } catch(err){
      console.error('add comment err', err);
      msg.textContent = err.message || 'Failed to add comment';
      setTimeout(()=> msg.textContent = '', 3000);
    } finally {
      btn.disabled = false;
    }
  });

  input.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btn.click(); } });
}

/* render top-level comments only (calls replies endpoint per comment to decide Show replies visibility) */
async function renderComments(postId){
  const el = document.getElementById('comments');
  el.innerHTML = '<div class="text-sm text-gray-500 py-4">Loading comments...</div>';
  try {
    const r = await apiFetch(`${COMMENT_URL}/${postId}`);
    const comments = r.comments || [];
    el.innerHTML = '';

    if(comments.length === 0){
      el.innerHTML = '<div class="text-sm text-gray-500">No comments</div>';
      return;
    }

    for(const c of comments){
      const node = await buildComment(c, postId);
      el.appendChild(node);
    }

  } catch(e){
    console.error(e);
    el.innerHTML = '<div class="text-sm text-red-500">Failed to load comments</div>';
  }
}

/* buildComment: returns element for a single comment (supports inline reply)
   - c: comment object
   - postId: id of post
*/
async function buildComment(c, postId){
  // treat as root/top-level when parentCommentId is falsy (null/undefined/empty)
  const isRoot = !c.parentCommentId;

  const container = document.createElement('div');
  // add pr-3 only for top-level comments, otherwise keep pr-0
  container.className = `pl-4 border-l mt-2 bg-white p-3 ${isRoot ? 'pr-3 overflow-x-auto' : 'pr-0'} rounded`;
  container.dataset.commentId = c._id || '';
  container.style.minWidth = '240px';

  const authorName = (c.author && c.author.username) ? c.author.username : (c.authorId || 'unknown');

  container.innerHTML = `
    <div class="text-sm"><strong>${escapeHtml(authorName)}</strong> <span class="text-gray-500 text-xs ml-2">${new Date(c.createdAt).toLocaleString()}</span></div>
    <div class="mt-1 text-gray-900">${escapeHtml(c.content)}</div>
    <div class="mt-2 comment-actions"></div>
    <div class="replies mt-2"></div>
  `;

  const actions = container.querySelector('.comment-actions');
  const repliesContainer = container.querySelector('.replies');

  // create reply button (always shown)
  const replyBtn = document.createElement('button');
  replyBtn.className = 'text-sm text-gray-700 mr-3 reply-button';
  replyBtn.textContent = 'Reply';
  actions.appendChild(replyBtn);

  // helper: open inline reply box for this comment
  function openReplyBox(prefill='') {
    // if already open, focus
    if(container.querySelector('.replyBox')) {
      container.querySelector('.replyInput')?.focus();
      return;
    }

    const box = document.createElement('div');
    box.className = 'replyBox mt-2';
    box.innerHTML = `
      <textarea class="replyInput w-full border rounded p-2 resize-none" rows="2" placeholder="Write a reply...">${escapeHtml(prefill)}</textarea>
      <div class="mt-2 flex items-center justify-between">
        <div class="text-sm text-red-600 replyMsg"></div>
        <div>
          <button class="replySend bg-black text-white px-3 py-1 rounded mr-2">Send</button>
          <button class="replyCancel px-3 py-1 rounded border">Cancel</button>
        </div>
      </div>
    `;
    actions.insertAdjacentElement('afterend', box);

    const send = box.querySelector('.replySend');
    const cancel = box.querySelector('.replyCancel');
    const input = box.querySelector('.replyInput');
    const msg = box.querySelector('.replyMsg');

    // Enter to send (Shift+Enter for newline)
    input.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send.click(); }
    });

    send.addEventListener('click', async () => {
      const text = (input.value || '').trim();
      if(!text) {
        input.classList.add('border-red-400');
        setTimeout(()=> input.classList.remove('border-red-400'), 700);
        return;
      }
      send.disabled = true;
      try {
        // create reply with parentCommentId
        const res = await apiFetch(`${COMMENT_URL}/${postId}`, { method: 'POST', body: { content: text, parentCommentId: c._id } });
        // server returns { comment }
        let newComment = res.comment || null;
        if(newComment) {
          /* --- fetch author info if backend didn't include it --- */
          if(!newComment.author || !newComment.author.username) {
            try {
              const userResp = await apiFetch(`${AUTH_BASE}/api/users/${encodeURIComponent(newComment.authorId)}`);
              // expect { user: { username, displayName, ... } } or similar
              newComment.author = userResp.user || { username: newComment.authorId };
            } catch(authErr) {
              // fallback to id as username if auth service unreachable
              newComment.author = { username: newComment.authorId };
            }
          }
          /* --- end fetch author --- */

          // remove "No replies" placeholder if exists
          removeNoRepliesPlaceholder(repliesContainer);

          // if replies list already rendered (user clicked Show replies earlier), append new reply
          if(repliesContainer.dataset.loaded === 'true' && repliesContainer.children.length > 0) {
            const repNode = await buildComment(newComment, postId);
            repNode.classList.add('ml-4');
            repliesContainer.appendChild(repNode);
          } else {
            // if not rendered yet - render this new reply directly and mark loaded
            repliesContainer.innerHTML = '';
            const repNode = await buildComment(newComment, postId);
            repNode.classList.add('ml-4');
            repliesContainer.appendChild(repNode);
            repliesContainer.dataset.loaded = 'true';
            // if there exists a "Show replies" button, remove it (we now rendered replies)
            const showBtn = container.querySelector('.show-replies-button');
            if(showBtn && showBtn.remove) showBtn.remove();
          }
          // cleanup reply box
          if(box && box.remove) box.remove();
        } else {
          msg.textContent = 'Unexpected server response';
        }
      } catch(err) {
        console.error('reply send error', err);
        msg.textContent = err.message || 'Failed to send reply';
        send.disabled = false;
        setTimeout(()=> msg.textContent = '', 3000);
      }
    });

    cancel.addEventListener('click', () => {
      if(box && box.remove) box.remove();
    });

    input.focus();
  }

  replyBtn.addEventListener('click', () => openReplyBox());

  // Check if this comment has immediate replies (one-level)
  try {
    // fetch immediate replies once (we can reuse cached replies when button clicked)
    const r = await apiFetch(`${COMMENT_URL}/replies/${c._id}`);
    const replies = r.replies || [];

    if(replies.length > 0){
      // create a Show replies button but only show it when there are replies and they haven't been rendered yet
      const btn = document.createElement('button');
      btn.className = 'text-sm text-blue-600 show-replies-button';
      btn.textContent = 'Show replies';
      actions.appendChild(btn);

      // cache replies on container to avoid refetch
      container._cachedReplies = replies;

      btn.addEventListener('click', async () => {
        if(btn.disabled) return;
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = 'Loading...';
        try {
          // use cached replies if available; otherwise fetch fresh
          const repList = container._cachedReplies || (await apiFetch(`${COMMENT_URL}/replies/${c._id}`)).replies || [];

          repliesContainer.innerHTML = '';
          for(const rep of repList){
            const repNode = await buildComment(rep, postId);
            repNode.classList.add('ml-4');
            repliesContainer.appendChild(repNode);
          }
          repliesContainer.dataset.loaded = 'true';
          // replies have been rendered — remove the button to avoid duplicates
          btn.remove();
        } catch(err){
          console.error('load replies error', err);
          btn.disabled = false;
          btn.textContent = originalText;
        }
      });
    } else {
      // no replies -> show placeholder and mark loaded (so reply action can append later)
      repliesContainer.innerHTML = '<div class="text-sm text-gray-500 no-replies-placeholder">No replies</div>';
      repliesContainer.dataset.loaded = 'true';
    }
  } catch(e){
    console.warn('failed to check replies for', c._id, e);
    // failure: predictably show "No replies" so UI consistent (user can still reply)
    repliesContainer.innerHTML = '<div class="text-sm text-gray-500 no-replies-placeholder">No replies</div>';
    repliesContainer.dataset.loaded = 'true';
  }

  return container;
}


/* escape helper */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
