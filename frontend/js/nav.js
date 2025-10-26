// frontend/js/nav.js  — REPLACE file content with this
(function(){
  // prevent double-injection
  if (document.querySelector('.tc-nav-left') || document.querySelector('.tc-bottom-nav')) {
    document.body.classList.add('has-tc-nav');
    return;
  }

  const NAV_WIDTH = 220; // default nav width (keaktifan script menyesuaikan)
  const GAP = 20; // jarak antara konten dan nav

  const css = `
  .tc-nav-left {
    position: fixed;
    left: 12px; /* default fallback */
    top: 16px;
    width: ${NAV_WIDTH}px;
    display: none;
    z-index: 60;
    box-sizing: border-box;
    -webkit-font-smoothing:antialiased;
    transition: left 0.16s ease, transform 0.16s ease;
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
  .tc-nav-logo { width:40px;height:40px;border-radius:9999px;background:#000;color:#fff; display:flex;align-items:center;justify-content:center;font-weight:700; }

  .tc-bottom-nav {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    background: #fff; border-top: 1px solid #e5e7eb;
    display: flex; justify-content: center; padding: 6px 0; z-index: 60;
    box-shadow: 0 -1px 6px rgba(0,0,0,0.04);
  }
  .tc-bottom-nav a { display:flex; flex-direction:column; align-items:center; font-size:12px; color:#374151; text-decoration:none; padding:6px 10px; }

  @media(min-width:768px){ .tc-nav-left { display:block; } .tc-bottom-nav { display: none; } }
  body.has-tc-nav { padding-bottom: 68px; } /* avoid mobile bottom nav cover */

  /* when we must push content to avoid overlap (fallback), we add this class */
  body.tc-nav-inline { padding-left: calc(${NAV_WIDTH}px + ${GAP}px + 12px) !important; }

  .tc-nav-left .nav-section { margin-bottom: 12px; }
  .tc-nav-left .nav-item.post-btn { background:#111;color:#fff;border:none;cursor:pointer;text-align:center; padding:12px 14px; }
  `;

  const s = document.createElement('style');
  s.appendChild(document.createTextNode(css));
  document.head.appendChild(s);

  // build nav elements
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
        <a class="nav-item" href="/profile.html">Profile</a>
        <a class="nav-item" href="/notifications.html">Notifications</a>
      </div>
      <button id="tcComposeDesktop" class="nav-item post-btn">Post</button>
    </div>
  `;
  document.body.appendChild(left);

  const bottom = document.createElement('nav');
  bottom.className = 'tc-bottom-nav';
  bottom.innerHTML = `
    <a href="/feed.html" aria-label="Home">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M3 12h18" stroke-width="1.5"></path></svg><span>Home</span>
    </a>
    <a href="/search.html" aria-label="Search">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7" stroke-width="1.5"/></svg><span>Search</span>
    </a>

    <!-- center: messages (replaces previous compose + button) -->
    <a href="/messages.html" id="tcMessagesMobile" aria-label="Messages" style="transform:translateY(-12px);">
      <div style="background:#000;color:#fff;padding:10px;border-radius:9999px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.12);">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:#fff">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
    </a>

    <a href="/notifications.html" aria-label="Notifications">
      <svg class="w-6 h-6" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><path d="M12 22c2.761 0 5-2.239 5-5V9a5 5 0 10-10 0v8c0 2.761 2.239 5 5 5z" stroke-width="1.5"/></svg><span>Notif</span>
    </a>
    <a href="/profile.html" aria-label="Profile">
      <svg class="w-6 h-6 rounded-full" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"><circle cx="12" cy="8" r="3"/><path d="M6 20a6 6 0 0112 0"/></svg><span>Profile</span>
    </a>
  `;
  document.body.appendChild(bottom);

  document.body.classList.add('has-tc-nav'); // enable bottom padding on mobile

  // compose handlers (desktop-only)
  function focusCompose(){
    const ta = document.querySelector('textarea#postContent') || document.querySelector('textarea');
    if(ta){ window.scrollTo({ top: 0, behavior: 'smooth' }); ta.focus(); }
    else window.location = '/feed.html';
  }
  document.getElementById('tcComposeDesktop')?.addEventListener('click', focusCompose);
  // mobile center now navigates to /messages.html via anchor href — no JS handler required

  // helpers to find the centered container
  function findCenteredContainer(){
    // common wrappers used in your pages
    const tries = ['.max-w-6xl', '.max-w-4xl', '.max-w-3xl', '.mx-auto', 'main', '.container'];
    for(const sel of tries){
      const el = document.querySelector(sel);
      if(!el) continue;
      const r = el.getBoundingClientRect();
      if(r.width > 0) return el;
    }
    // last resort: first element with mx-auto and a non-zero width
    const autos = Array.from(document.querySelectorAll('.mx-auto'));
    for(const c of autos){
      if(c.getBoundingClientRect().width > 0) return c;
    }
    return null;
  }

  function updateNavPosition(){
    // reset inline fallback class first
    document.body.classList.remove('tc-nav-inline');

    if(window.innerWidth < 768){
      // mobile: default left and no transform (bottom nav will show)
      left.style.left = '12px';
      left.style.transform = 'none';
      return;
    }

    const container = findCenteredContainer();
    if(!container){
      left.style.left = '12px';
      left.style.transform = 'none';
      return;
    }
    const rect = container.getBoundingClientRect();

    // compute ideal position: place nav to the left of container, separated by GAP
    // prefer transform approach which uses nav's width automatically
    const idealLeftIfOutside = rect.left - (NAV_WIDTH + GAP);
    if(idealLeftIfOutside >= 12){
      // enough space: anchor to container left and translate out by 100% + GAP
      left.style.left = Math.round(rect.left) + 'px';
      left.style.transform = `translateX(calc(-100% - ${GAP}px))`;
      // ensure body not forced to inline fallback
      document.body.classList.remove('tc-nav-inline');
    } else {
      // not enough room on left — fallback:
      // place nav at fixed left 12px and add small body padding so it doesn't overlay content
      left.style.left = '12px';
      left.style.transform = 'none';
      document.body.classList.add('tc-nav-inline');
    }
  }

  // initial + resize + load + DOM changes
  window.addEventListener('resize', updateNavPosition);
  window.addEventListener('load', () => setTimeout(updateNavPosition, 60));
  setTimeout(updateNavPosition, 30);

  const mo = new MutationObserver(() => {
    // throttle quickly: we'll just run the update; it's cheap
    updateNavPosition();
  });
  mo.observe(document.documentElement, { childList:true, subtree:true, attributes:false });

  // expose API for debugging
  window.tcNav = { updatePosition: updateNavPosition, navElement: left };

})();
