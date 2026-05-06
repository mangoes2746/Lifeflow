/* ==========================================================================
   LIFEFLOW — mobile-init.js
   Injects mobile chrome (top bar + bottom nav) into index.html.
   Loaded at the end of <body>, after app.js.
   ========================================================================== */

(function () {
  'use strict';

  /* ── Helpers ── */
  function $(id) { return document.getElementById(id); }

  /* ── Nav items ── */
  var NAV_ITEMS = [
    { key: 'dashboard', icon: 'layout-dashboard', label: 'Home',      navId: 'nav-dashboard' },
    { key: 'assistant', icon: 'bot',              label: 'AI',        navId: 'nav-assistant' },
    { key: 'notes',     icon: 'file-text',        label: 'Notes',     navId: 'nav-notes',     badgeId: 'notes-badge' },
    { key: 'calendar',  icon: 'calendar',         label: 'Calendar',  navId: 'nav-calendar'  },
    { key: 'goals',     icon: 'target',           label: 'Goals',     navId: 'nav-goals'     },
    { key: 'focus',     icon: 'timer',            label: 'Focus',     navId: 'nav-focus'     },
    { key: 'reminders', icon: 'bell',             label: 'Reminders', navId: 'nav-reminders', badgeId: 'rem-badge' },
    { key: 'chat',      icon: 'message-circle', label: 'Chat',    navId: 'nav-chat',    badgeId: 'chat-badge' },
    { key: 'friends',   icon: 'users',          label: 'Friends', navId: 'nav-friends', badgeId: 'friends-req-badge' },
    { key: 'game',      icon: 'gamepad-2',        label: 'Arena',     navId: 'nav-game'      },
  ];


  /* ==========================================================================
     1. TOP BAR
     ========================================================================== */
  function buildTopbar() {
    var bar = document.createElement('div');
    bar.className = 'mobile-topbar';
    bar.id = 'mobile-topbar';
    bar.innerHTML =
      '<div class="mobile-topbar-logo" role="button" tabindex="0" aria-label="Go to home" style="cursor:pointer;">Lifeflow</div>' +
      '<div class="mobile-topbar-end">' +
        '<button type="button" class="mobile-topbar-icon-btn" id="mobile-btn-command" aria-label="Open command palette">' +
          '<i data-lucide="search"></i>' +
        '</button>' +
        '<button type="button" class="mobile-topbar-icon-btn" id="mobile-btn-settings" aria-label="Settings">' +
          '<i data-lucide="settings"></i>' +
        '</button>' +
        '<div class="mobile-topbar-avatar" id="mobile-avatar" role="button" tabindex="0" aria-label="Account menu">L</div>' +
      '</div>';

    /* User dropdown */
    var menu = document.createElement('div');
    menu.className = 'mobile-user-menu';
    menu.id = 'mobile-user-menu';
    menu.innerHTML =
      '<div class="mobile-user-menu-name" id="mobile-menu-name">User</div>' +
      '<div class="mobile-user-menu-sub">Free plan</div>' +
      '<button class="mobile-user-menu-signout" onclick="handleSignOut && handleSignOut(); closeMobileMenu();">Sign out</button>';

    /* Insert topbar as first child, append menu to body */
    document.body.insertBefore(bar, document.body.firstChild);
    document.body.appendChild(menu);

    /* Logo tap → go to dashboard */
    var logoEl = bar.querySelector('.mobile-topbar-logo');
    if (logoEl) {
      logoEl.addEventListener('click', function () {
        closeMobileMenu();
        var nav = $('nav-dashboard');
        if (nav && typeof window.switchTo === 'function') window.switchTo('dashboard', nav);
      });
      logoEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); logoEl.click(); }
      });
    }

    /* Avatar tap → toggle dropdown */
    var avatarEl = $('mobile-avatar');
    if (avatarEl) {
      avatarEl.addEventListener('click', toggleMobileMenu);
      avatarEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMobileMenu(); }
      });
    }

    /* Settings button → navigate to settings panel */
    var settingsBtn = $('mobile-btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', function () {
        closeMobileMenu();
        var nav = $('nav-settings');
        if (nav && typeof window.switchTo === 'function') window.switchTo('settings', nav);
      });
    }

    var commandBtn = $('mobile-btn-command');
    if (commandBtn) {
      commandBtn.addEventListener('click', function () {
        closeMobileMenu();
        if (typeof window.openCommandPalette === 'function') window.openCommandPalette();
      });
    }

    /* Close dropdown on outside tap */
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#mobile-avatar') && !e.target.closest('#mobile-user-menu')) {
        closeMobileMenu();
      }
    });
  }

  window.toggleMobileMenu = function () {
    var m = $('mobile-user-menu');
    if (m) m.classList.toggle('open');
  };

  window.closeMobileMenu = function () {
    var m = $('mobile-user-menu');
    if (m) m.classList.remove('open');
  };

  /* Sync avatar letter and name from app.js auth state */
  function syncUserDisplay() {
    var nameEl = $('user-name-display');
    if (!nameEl) return;

    function update() {
      var name   = nameEl.textContent.trim();
      var letter = name.charAt(0).toUpperCase() || 'U';
      var mAvatar = $('mobile-avatar');
      var mName   = $('mobile-menu-name');
      if (mAvatar) mAvatar.textContent = letter;
      if (mName)   mName.textContent   = name;
    }

    update();
    new MutationObserver(update).observe(nameEl, {
      childList: true, subtree: true, characterData: true,
    });
  }


  /* ==========================================================================
     2. BOTTOM NAVIGATION — Floating Orb
     ========================================================================== */
  var navOpen = false;

  function buildBottomNav() {
    /* Backdrop */
    var backdrop = document.createElement('div');
    backdrop.className = 'mobile-nav-backdrop';
    backdrop.id = 'mobile-nav-backdrop';
    backdrop.addEventListener('click', closeNav);
    document.body.appendChild(backdrop);

    /* Nav wrapper */
    var nav = document.createElement('nav');
    nav.className = 'mobile-nav';
    nav.id = 'mobile-nav';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    /* Grid menu */
    var menu = document.createElement('div');
    menu.className = 'mobile-nav-menu';
    menu.id = 'mobile-nav-menu';

    NAV_ITEMS.forEach(function (item) {
      var el = document.createElement('div');
      el.className = 'mobile-nav-item';
      el.id = 'mnav-' + item.key;
      el.setAttribute('data-section', item.key);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', item.label);

      var badgeHtml = item.badgeId
        ? '<span class="mobile-nav-badge" id="mnav-badge-' + item.key + '"></span>'
        : '';

      el.innerHTML =
        badgeHtml +
        '<span class="mobile-nav-icon"><i data-lucide="' + item.icon + '"></i></span>' +
        '<span class="mobile-nav-label">' + item.label + '</span>';

      el.addEventListener('click', function () {
        closeNav();
        var desktopNav = $(item.navId);
        if (desktopNav && typeof switchTo === 'function') switchTo(item.key, desktopNav);
        setActiveNavItem(item.key);
      });

      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); }
      });

      menu.appendChild(el);
    });

    /* Orb button */
    var orb = document.createElement('button');
    orb.className = 'mobile-nav-orb';
    orb.id = 'mobile-nav-orb';
    orb.setAttribute('aria-label', 'Open navigation');
    orb.setAttribute('aria-expanded', 'false');
    orb.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 3 L12 21 M3 12 L21 12" opacity="0.9"/>' +
        '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" opacity="0.7"/>' +
      '</svg>' +
      '<span class="mobile-nav-orb-badge" id="mobile-orb-badge"></span>';

    orb.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleNav();
    });

    nav.appendChild(menu);
    nav.appendChild(orb);
    document.body.appendChild(nav);

    mirrorBadges();
  }

  function toggleNav() {
    navOpen ? closeNav() : openNav();
  }

  function openNav() {
    navOpen = true;
    var orb = $('mobile-nav-orb');
    var menu = $('mobile-nav-menu');
    var backdrop = $('mobile-nav-backdrop');
    if (orb) { orb.classList.add('open'); orb.setAttribute('aria-expanded', 'true'); }
    if (menu) menu.classList.add('open');
    if (backdrop) backdrop.classList.add('open');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeNav() {
    navOpen = false;
    var orb = $('mobile-nav-orb');
    var menu = $('mobile-nav-menu');
    var backdrop = $('mobile-nav-backdrop');
    if (orb) { orb.classList.remove('open'); orb.setAttribute('aria-expanded', 'false'); }
    if (menu) menu.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }

  window.closeMobileNav = closeNav;

  function setActiveNavItem(key) {
    document.querySelectorAll('.mobile-nav-item').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-section') === key);
    });
  }

  /* Mirror badge counts from desktop sidebar to mobile nav + orb */
  function mirrorBadges() {
    var totalUnread = 0;

    NAV_ITEMS.forEach(function (item) {
      if (!item.badgeId) return;
      var src = $(item.badgeId);
      var dst = $('mnav-badge-' + item.key);
      if (!src || !dst) return;

      function sync() {
        var num = parseInt(src.textContent.trim(), 10) || 0;
        dst.textContent = num > 0 ? num : '';
        dst.style.display = (num > 0 && src.style.display !== 'none') ? 'flex' : 'none';
        /* Update orb badge */
        updateOrbBadge();
      }

      sync();
      new MutationObserver(sync).observe(src, {
        childList: true, subtree: true, characterData: true, attributes: true,
      });
    });
  }

  function updateOrbBadge() {
    var total = 0;
    NAV_ITEMS.forEach(function (item) {
      if (!item.badgeId) return;
      var src = $(item.badgeId);
      if (src && src.style.display !== 'none') {
        total += parseInt(src.textContent.trim(), 10) || 0;
      }
    });
    var orbBadge = $('mobile-orb-badge');
    if (orbBadge) {
      orbBadge.textContent = total > 0 ? (total > 9 ? '9+' : total) : '';
      orbBadge.classList.toggle('show', total > 0);
    }
  }


  /* ==========================================================================
     3. BACK TO DASHBOARD BUTTONS
     Injected into each panel's .page-header (except dashboard)
     ========================================================================== */
  function buildBackButtons() {
    ['assistant', 'notes', 'calendar', 'goals', 'focus', 'reminders', 'chat', 'settings', 'game'].forEach(function (key) {
      var panel = $('panel-' + key);
      if (!panel) return;

      var header = panel.querySelector('.page-header');
      if (!header) return;

      var btn = document.createElement('button');
      btn.className = 'mobile-back-btn';
      btn.setAttribute('aria-label', 'Back to Dashboard');
      btn.innerHTML = '<i data-lucide="chevron-left"></i> Dashboard';

      btn.addEventListener('click', function () {
        var nav = $('nav-dashboard');
        if (nav && typeof switchTo === 'function') switchTo('dashboard', nav);
        setActiveNavItem('dashboard');
      });

      header.insertBefore(btn, header.firstChild);
    });
  }


  /* ==========================================================================
     4. PATCH switchTo() — keep bottom nav in sync
     ========================================================================== */
  function patchSwitchTo() {
    var attempts = 0;
    var poll = setInterval(function () {
      attempts++;

      if (typeof window.switchTo === 'function') {
        clearInterval(poll);

        var original = window.switchTo;
        window.switchTo = function (key, el) {
          original(key, el);
          setActiveNavItem(key);
          closeNav();

          /* Highlight settings gear when on settings panel */
          var gear = $('mobile-btn-settings');
          if (gear) gear.classList.toggle('active', key === 'settings');
          var command = $('mobile-btn-command');
          if (command) command.classList.remove('active');

          /* Re-render Lucide icons in newly visible panel */
          if (window.lucide) window.lucide.createIcons();
        };

        setActiveNavItem('dashboard');
      }

      if (attempts > 50) clearInterval(poll);
    }, 100);
  }


  /* ==========================================================================
     5. TAPPABLE STAT CARDS
     Tap a dashboard stat card to navigate to that section
     ========================================================================== */
  function makeStatCardsTappable() {
    var map = {
      'stat-notes':  'notes',
      'stat-goals':  'goals',
      'stat-events': 'calendar',
      'stat-focus':  'focus',
    };

    Object.keys(map).forEach(function (statId) {
      var el = $(statId);
      if (!el) return;
      var card = el.closest('.stat-card');
      if (!card) return;

      var key = map[statId];
      card.style.cursor = 'pointer';
      card.addEventListener('click', function () {
        var nav = $('nav-' + key);
        if (nav && typeof switchTo === 'function') switchTo(key, nav);
        setActiveNavItem(key);
      });
    });
  }

  function watchOpenOverlays() {
    var overlays = Array.prototype.slice.call(document.querySelectorAll('.overlay'));
    if (!overlays.length) return;

    function sync() {
      var hasOpenOverlay = overlays.some(function (overlay) {
        return overlay.classList.contains('open');
      });
      document.body.classList.toggle('mobile-modal-open', hasOpenOverlay);
      if (hasOpenOverlay && typeof window.closeFab === 'function') window.closeFab();
    }

    overlays.forEach(function (overlay) {
      new MutationObserver(sync).observe(overlay, {
        attributes: true,
        attributeFilter: ['class'],
      });
    });
    sync();
  }


  /* ==========================================================================
     INIT
     ========================================================================== */
  function init() {
    buildTopbar();
    buildBottomNav();
    buildBackButtons();
    patchSwitchTo();
    makeStatCardsTappable();
    syncUserDisplay();
    watchOpenOverlays();

    /* Render Lucide icons injected by this script */
    if (window.lucide) window.lucide.createIcons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
