// frontend/js/notifications.js
const NOTIF_SERVICE = (typeof NOTIF_SERVICE_URL !== 'undefined') ? NOTIF_SERVICE_URL : 'http://localhost:4002';
const NOTIF_API = NOTIF_SERVICE + '/api/notifications';
const NOTIF_MARK_READ = NOTIF_SERVICE + '/api/notifications'; // PATCH /:id/read

function getToken(){ return localStorage.getItem('token'); }

async function apiFetch(url, opts = {}) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  const token = getToken();
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;

  // do not force content-type on GET
  if(opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, opts);
  if(res.status === 401){
    // not authenticated
    localStorage.removeItem('token');
    window.location = '/login.html';
    throw new Error('unauthorized');
  }
  const ct = res.headers.get('content-type') || '';
  if(ct.includes('application/json')) return res.json();
  return res.text();
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.addEventListener('DOMContentLoaded', async () => {
  const out = document.getElementById('notificationsList');
  out.innerHTML = '<div class="text-sm text-gray-500">Loading...</div>';
  try {
    const data = await apiFetch(NOTIF_API + '?limit=50');
    const list = data.notifications || [];
    out.innerHTML = '';
    if(list.length === 0){
      out.innerHTML = '<div class="text-sm text-gray-500">No notifications</div>';
      return;
    }

    for(const n of list){
      const card = document.createElement('div');
      card.className = 'p-3 bg-white rounded shadow-sm flex justify-between items-start';
      card.dataset.notifId = n._id;

      const left = document.createElement('div');
      const actor = n.actorUsername || n.actorId || 'Someone';
      let text = '';
      if(n.type === 'comment') text = `<strong>${escapeHtml(actor)}</strong> commented on your post`;
      else if(n.type === 'reply') text = `<strong>${escapeHtml(actor)}</strong> replied to your comment`;
      else if(n.type === 'like') text = `<strong>${escapeHtml(actor)}</strong> liked your post`;
      else text = `<strong>${escapeHtml(actor)}</strong> did something`;

      left.innerHTML = `${text}<div class="mt-1 text-gray-800">${escapeHtml((n.meta && n.meta.snippet) || '')}</div>
        <div class="mt-2 text-xs text-gray-500">${new Date(n.createdAt).toLocaleString()}</div>`;

      const right = document.createElement('div');
      right.style.minWidth = '8rem';
      right.className = 'flex flex-col items-end gap-2';

      // unread badge
      if(!n.read){
        const badge = document.createElement('div');
        badge.className = 'text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded';
        badge.textContent = 'New';
        right.appendChild(badge);
      } else {
        const spacer = document.createElement('div');
        spacer.style.height = '1rem';
        right.appendChild(spacer);
      }

      // "Open" button
      const openBtn = document.createElement('button');
      openBtn.className = 'text-sm text-blue-600';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        // mark read then navigate
        try {
          await apiFetch(`${NOTIF_MARK_READ}/${n._id}/read`, { method: 'PATCH' });
        } catch(e){ console.warn('mark read failed', e); }
        // navigate: if notification has postId navigate to post page and anchor to comment if present
        if(n.postId){
          const anchor = n.commentId ? `#c-${n.commentId}` : '';
          window.location = `/post.html?id=${encodeURIComponent(n.postId)}${anchor}`;
        } else {
          window.location = '/notifications.html';
        }
      });
      right.appendChild(openBtn);

      card.appendChild(left);
      card.appendChild(right);
      out.appendChild(card);
    }
  } catch(e){
    console.error(e);
    out.innerHTML = '<div class="text-sm text-red-500">Failed to load notifications</div>';
  }
});
