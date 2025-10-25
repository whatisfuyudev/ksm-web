// frontend/js/nav.js  — REPLACE file content with this
(function () {
  // prevent double-injection
  if (document.querySelector('.tc-nav-left') || document.querySelector('.tc-bottom-nav')) {
    // already injected
    document.body.classList.add('has-tc-nav');
    return;
  }

  // --- styles (scoped by adding a single <style>) ---
  const css = `
  /* base */
  .tc-nav-left {
    position: fixed;
    left: 12px;
    top: 16px;
    width: 220px;
    display: none;
    z-index: 60;
    box-sizing: border-box;
    -webkit-font-smoothing:antialiased;
  }

  .tc-nav-left .navbox { background: transparent; }

  .tc-nav-left .nav-item {
    display:block;
    padding:10px 14px;
    border-radius:10px;
    color:#111;
    margin-bottom:6px;
    text-decoration:none;
    width:100%;
    box-sizing:border-box;
  }
  .tc-nav-left .nav-item:hover { background:#f3f4f6; }

  .tc-nav-logo {
    width:40px;height:40px;border-radius:9999px;background:#000;color:#fff;
    display:flex;align-items:center;justify-content:center;font-weight:700;
  }

  /* bottom nav for small screens */
  .tc-bottom-nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background: #fff;
    border-top: 1px solid #e5e7eb;
    display: flex;
    justify-content: center;
    padding: 6px 0;
    z-index: 60;
    box-shadow: 0 -1px 6px rgba(0,0,0,0.04);
  }
  .tc-bottom-nav a { display:flex; flex-direction:column; align-items:center; font-size:12px; color:#374151; text-decoration:none; padding:6px 10px; }

  /* responsive behaviour:
     - desktop: show left nav and shift page content via body.has-tc-nav padding-left
     - mobile: show bottom nav and ensure body has padding-bottom so content not covered
  */
  @media(min-width:768px){
    .tc-nav-left { display:block; }
    .tc-bottom-nav { display: none; }
    body.has-tc-nav { padding-left: 260px !important; /* leave horizontal gap for the left nav */ }
    /* on wider screens we don't need bottom padding */
    body.has-tc-nav { padding-bottom: 0 !important; }
  }

  /* small / default (mobile) */
  /* ensure page content not hidden by bottom nav */
  body.has-tc-nav { padding-bottom: 68px; /* adjust if you change bottom nav height */ }

  /* small visual niceties */
  .tc-nav-left .nav-section { margin-bottom: 12px; }
  .tc-nav-left .nav-item.post-btn {
    background:#111;color:#fff;border:none;cursor:pointer;text-align:center;
    padding:12px 14px;
  }
  `;

  const s = document.createElement('style');
  s.appendChild(document.createTextNode(css));
  document.head.appendChild(s);

  // --- left nav ---
  const left = document.createElement('nav');
  left.className = 'tc-nav-left';
  left.innerHTML = `
    <div class="navbox">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
        <div class="tc-nav-logo">T</div>
        <div style="font-weight:700;font-size:18px">ThreadsClone</div>
      </div>

      <div class="nav-section">
        <a class="nav-item" href="/feed.html">Home</a>
        <a class="nav-item" href="/search.html">Search</a>
        <a class="nav-item" href="/messages.html">Messages</a>
        <a class="nav-item" href="/notifications.html">Notifications</a>
        <a class="nav-item" href="/profile.html">Profile</a>
      </div>

      <button id="tcComposeDesktop" class="nav-item post-btn">Post</button>
    </div>
  `;
  document.body.appendChild(left);

  // --- bottom nav (mobile) ---
  const bottom = document.createElement('nav');
  bottom.className = 'tc-bottom-nav';
  bottom.innerHTML = `
    <a href="/feed.html" aria-label="Home">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M3 12h18" stroke-width="1.5"></path></svg>
      <span>Home</span>
    </a>
    <a href="/search.html" aria-label="Search">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" stroke-width="1.5"/></svg>
      <span>Search</span>
    </a>
    <a href="/messages.html" aria-label="Messages">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke-width="1.5"/></svg>
      <span>Messages</span>
    </a>
    <a href="/notifications.html" aria-label="Notifications">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M12 22c2.761 0 5-2.239 5-5V9a5 5 0 10-10 0v8c0 2.761 2.239 5 5 5z" stroke-width="1.5"/></svg>
      <span>Notif</span>
    </a>
    <a href="/profile.html" aria-label="Profile">
      <svg class="w-6 h-6 rounded-full" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="3"/><path d="M6 20a6 6 0 0112 0"/></svg>
      <span>Profile</span>
    </a>
  `;
  document.body.appendChild(bottom);

  // add class to body to enable spacing rules
  document.body.classList.add('has-tc-nav');

  // handlers for compose buttons: focus the first textarea found or go to feed
  function focusCompose() {
    const ta = document.querySelector('textarea#postContent') || document.querySelector('textarea');
    if (ta) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      ta.focus();
    } else {
      window.location = '/feed.html';
    }
  }
  document.getElementById('tcComposeDesktop')?.addEventListener('click', focusCompose);
  document.getElementById('tcComposeMobile')?.addEventListener('click', focusCompose);

  // if you want to remove/add nav dynamically you can toggle the has-tc-nav class elsewhere
})();
