// frontend/js/app.js (updated)
// Fetch/post URLs
const AUTH_URL = 'http://localhost:4000/api/auth';
const POST_URL = 'http://localhost:4001/api/posts';

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

/* STATE: paging */
const PAGE_SIZE = 10;
let currentPage = 1;
let isLoadingPage = false;

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
        // reload first page
        currentPage = 1;
        await loadFeed(1, false);
      } catch(e){ console.error('post error', e); }
    };
  }

  loadFeed(1, false);
});

/* load feed (paged). page starts from 1.
   append=false -> replace; append=true -> append to existing list
*/
async function loadFeed(page = 1, append = false){
  const container = document.getElementById('postsContainer');
  if(!container) return;
  if(!append){
    container.innerHTML = '<div class="text-center text-gray-500 py-8">Loading...</div>';
    currentPage = page;
  }

  // prevent double load
  if(isLoadingPage) return;
  isLoadingPage = true;

  try {
    const data = await apiFetch(`${POST_URL}?limit=${PAGE_SIZE}&page=${page}`);
    const posts = data.posts || [];

    if(!append) container.innerHTML = '';

    for(const p of posts){
      const el = renderPost(p);
      el.dataset.postid = p._id;
      container.appendChild(el);
    }

    // handle load more control
    manageLoadMore(posts.length === PAGE_SIZE, page);
    // update currentPage only on success
    currentPage = page;
  } catch(e){
    console.error(e);
    if(!append) container.innerHTML = '<div class="text-center text-red-500 py-8">Gagal memuat feed.</div>';
  } finally {
    isLoadingPage = false;
  }
}

/* add/remove Load more button under postsContainer */
function manageLoadMore(hasMore, page){
  let wrap = document.getElementById('tc-loadmore-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'tc-loadmore-wrap';
    wrap.className = 'text-center my-4';
    const parent = document.getElementById('postsContainer')?.parentNode;
    if(parent){
      parent.appendChild(wrap);
    } else {
      document.body.appendChild(wrap);
    }
  }
  wrap.innerHTML = '';

  if(hasMore){
    const btn = document.createElement('button');
    btn.className = 'bg-white border px-4 py-2 rounded';
    btn.textContent = 'Load more';
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Loading...';
      await loadFeed(page + 1, true);
      btn.disabled = false;
      btn.textContent = 'Load more';
    };
    wrap.appendChild(btn);
  } else {
    // no more -> remove wrap content
    wrap.innerHTML = '';
  }
}

/* render post (no comments/replies in feed). clicking post navigates to post page.
   like button preserved.
*/
function renderPost(p){
  const wrap = document.createElement('div');
  wrap.className = 'bg-white p-4 rounded-xl shadow-sm mb-4 cursor-pointer';
  // clicking anywhere on the post navigates to post page
  wrap.addEventListener('click', () => {
    window.location = `/post.html?id=${encodeURIComponent(p._id)}`;
  });

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
  // stop propagation so clicking like doesn't navigate to post page
  likeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
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
  });

  actions.appendChild(likeBtn);

  wrap.appendChild(header);
  wrap.appendChild(content);
  wrap.appendChild(actions);

  return wrap;
}

/* helper escape */
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
