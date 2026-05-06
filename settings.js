/* ==========================================================================
   LIFEFLOW — settings.js
   Theme engine + Settings panel logic
   
   Add in index.html JUST BEFORE </body>, after mobile-init.js:
   <script src="settings.js"></script>
   ========================================================================== */

(function () {
  'use strict';

  /* ── storage helpers ── */
  function getSetting(key, def) {
    try { var v = localStorage.getItem('lf_setting_' + key); return v !== null ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function setSetting(key, val) {
    try { localStorage.setItem('lf_setting_' + key, JSON.stringify(val)); } catch (e) {}
  }

  /* ══════════════════════════════════════
     1.  INJECT SETTINGS NAV ITEM (desktop)
         Phone: ⚙ in mobile top bar (mobile-init.js)
  ══════════════════════════════════════ */
  function injectNavItem() {
    /* Desktop sidebar */
    var nav = document.querySelector('.sidebar-nav');
    if (nav && !document.getElementById('nav-settings')) {
      var item = document.createElement('div');
      item.className = 'nav-item';
      item.id = 'nav-settings';
      item.setAttribute('title', 'Settings');
      item.setAttribute('aria-label', 'Settings');
      item.innerHTML = '<span class="nav-icon">⚙</span> Settings';
      item.innerHTML = '<span class="nav-icon">⚙</span><span class="nav-label">Settings</span>';
      item.onclick = function () {
        if (typeof switchTo === 'function') switchTo('settings', item);
      };
      nav.appendChild(item);
    }
    /* Settings on phones: top bar ⚙ (mobile-init.js) */
  }

  /* ══════════════════════════════════════
     2.  THEME ENGINE
  ══════════════════════════════════════ */

  /** Apply a theme by name, persist to localStorage, update UI */
  window.applyTheme = function (theme, btnEl) {
    /* Apply to <body> */
    document.body.setAttribute('data-theme', theme === 'default' ? '' : theme);
    if (theme === 'default') document.body.removeAttribute('data-theme');

    /* Persist */
    setSetting('theme', theme);

    /* Update theme card active state */
    document.querySelectorAll('.theme-card').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-theme') === theme);
    });

    /* Neon: inject SVG gradient for ring */
    if (theme === 'neon') injectNeonRingGradient();

    /* Re-render goals so category bg adapts to theme */
    if (typeof renderGoals === 'function') renderGoals();

    /* Toast feedback — use app.js's showToast if available */
    var names = { default:'Warm Light', dark:'Midnight', neon:'Neon Pulse', forest:'Forest', ocean:'Ocean', rose:'Rose', mono:'Monochrome', meadow:'Meadow' };
    if (typeof showToast === 'function') showToast('Theme: ' + (names[theme] || theme) + ' ✓');
  };

  /** Inject a <defs> gradient into the SVG focus ring for neon theme */
  function injectNeonRingGradient() {
    var svg = document.querySelector('.progress-ring');
    if (!svg) return;
    if (document.getElementById('neonGradient')) return;
    var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML =
      '<linearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="100%">' +
        '<stop offset="0%" style="stop-color:#00f5d4;stop-opacity:1"/>' +
        '<stop offset="100%" style="stop-color:#0088ff;stop-opacity:1"/>' +
      '</linearGradient>';
    svg.insertBefore(defs, svg.firstChild);
  }

  /* ══════════════════════════════════════
     4.  FONT SIZE
  ══════════════════════════════════════ */
  window.applyFontSize = function (size, btnEl) {
    document.body.setAttribute('data-fontsize', size);
    document.documentElement.setAttribute('data-fontsize', size);
    setSetting('fontsize', size);
    document.querySelectorAll('.fsize-btn').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-size') === size);
    });
    if (typeof showToast === 'function') showToast('Text size: ' + size + ' ✓');
  };

  /* ══════════════════════════════════════
     5.  COMPACT SIDEBAR
  ══════════════════════════════════════ */
  window.toggleCompactSidebar = function (on) {
    document.body.setAttribute('data-compact', on ? 'true' : 'false');
    document.documentElement.setAttribute('data-compact', on ? 'true' : 'false');
    setSetting('compact', on);
  };

  /* ══════════════════════════════════════
     6.  TOAST TOGGLE
  ══════════════════════════════════════ */
  var _toastsEnabled = true;
  window.toggleToasts = function (on) {
    _toastsEnabled = on;
    setSetting('toasts', on);
  };

  /* Patch showToast to respect the toggle */
  function patchToast() {
    var attempts = 0;
    var t = setInterval(function () {
      attempts++;
      if (typeof window.showToast === 'function') {
        clearInterval(t);
        var orig = window.showToast;
        window.showToast = function (msg) {
          if (_toastsEnabled) orig(msg);
        };
      }
      if (attempts > 60) clearInterval(t);
    }, 100);
  }

  /* ══════════════════════════════════════
     7.  TIMER SOUND TOGGLE
  ══════════════════════════════════════ */
  window.toggleTimerSound = function (on) {
    setSetting('sound', on);
    /* Expose for app.js / focus timer to read */
    window._timerSoundEnabled = on;
  };

  /* ══════════════════════════════════════
     8.  EXPORT DATA
  ══════════════════════════════════════ */
  window.exportData = function () {
    try {
      var data = {
        exported: new Date().toISOString(),
        notes:     JSON.parse(localStorage.getItem('lf_notes')     || '[]'),
        events:    JSON.parse(localStorage.getItem('lf_events')    || '[]'),
        goals:     JSON.parse(localStorage.getItem('lf_goals')     || '[]'),
        reminders: JSON.parse(localStorage.getItem('lf_reminders') || '[]'),
        sessions:  JSON.parse(localStorage.getItem('lf_sessions')  || '[]'),
        weekly:    JSON.parse(localStorage.getItem('lf_weekly')    || '{}'),
        dailyPlan: JSON.parse(localStorage.getItem('lf_daily_plan') || '{}'),
        moods:     JSON.parse(localStorage.getItem('lf_moods') || '{}'),
        dailyTasks:JSON.parse(localStorage.getItem('lf_daily_tasks') || '{}'),
        habits:    JSON.parse(localStorage.getItem('lf_habits') || '{}'),
        todayFocus:JSON.parse(localStorage.getItem('lf_today_focus') || '{}'),
        aiMessages:JSON.parse(localStorage.getItem('lf_ai_messages') || '[]'),
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url;
      a.download = 'lifeflow-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (typeof showToast === 'function') showToast('Data exported ✓');
    } catch (e) {
      alert('Export failed: ' + e.message);
    }
  };

  /* ══════════════════════════════════════
     9.  CLEAR DATA
  ══════════════════════════════════════ */
  window.importData = function (event) {
    var input = event && event.target;
    var file = input && input.files && input.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result || '{}'));
        notes = Array.isArray(data.notes) ? data.notes : [];
        calEvents = Array.isArray(data.events) ? data.events : [];
        goals = Array.isArray(data.goals) ? data.goals : [];
        reminders = Array.isArray(data.reminders) ? data.reminders : [];
        focusSessions = Array.isArray(data.sessions) ? data.sessions : [];
        weeklyFocus = data.weekly && typeof data.weekly === 'object' ? data.weekly : {};
        dailyPlan = data.dailyPlan && typeof data.dailyPlan === 'object' ? data.dailyPlan : {};
        moods = data.moods && typeof data.moods === 'object' ? data.moods : {};
        dailyTasks = data.dailyTasks && typeof data.dailyTasks === 'object' ? data.dailyTasks : {};
        habits = data.habits && typeof data.habits === 'object' ? data.habits : {};
        todayFocus = data.todayFocus && typeof data.todayFocus === 'object' ? data.todayFocus : {};
        if (Array.isArray(data.aiMessages)) localStorage.setItem('lf_ai_messages', JSON.stringify(data.aiMessages));

        saveCollection('lf_notes', notes);
        saveCollection('lf_events', calEvents);
        saveCollection('lf_goals', goals);
        saveCollection('lf_reminders', reminders);
        saveCollection('lf_sessions', focusSessions);
        saveCollection('lf_weekly', weeklyFocus);
        saveCollection('lf_daily_plan', dailyPlan);
        saveCollection('lf_moods', moods);
        saveCollection('lf_daily_tasks', dailyTasks);
        saveCollection('lf_habits', habits);
        saveCollection('lf_today_focus', todayFocus);

        renderNotes();
        renderGoals();
        renderSessions();
        renderReminders();
        renderCalendar();
        refreshDash();
        if (typeof renderCommandResults === 'function') renderCommandResults();
        if (typeof showToast === 'function') showToast('Backup imported');
      } catch (e) {
        alert('Import failed: ' + e.message);
      } finally {
        if (input) input.value = '';
      }
    };
    reader.readAsText(file);
  };

  window.confirmClearData = function () {
    /* Use a nicer inline confirm in the settings panel */
    if (!document.getElementById('clear-confirm-row')) {
      var row = document.createElement('div');
      row.id = 'clear-confirm-row';
      row.style.cssText =
        'margin-top:14px;padding:14px;background:rgba(201,64,64,0.08);' +
        'border:1px solid rgba(201,64,64,0.25);border-radius:12px;' +
        'font-size:13px;color:#c94040;display:flex;align-items:center;' +
        'justify-content:space-between;gap:12px;flex-wrap:wrap;';
      row.innerHTML =
        '<span style="display:inline-flex;align-items:center;gap:8px;"><i data-lucide="alert-triangle"></i> This will permanently delete all your local data. Are you sure?</span>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="document.getElementById(\'clear-confirm-row\').remove()" ' +
            'style="padding:8px 16px;border:1px solid rgba(201,64,64,0.3);border-radius:99px;' +
            'background:transparent;color:#c94040;font-family:\'DM Sans\',sans-serif;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i data-lucide="x"></i> Cancel</button>' +
          '<button onclick="doClearData()" ' +
            'style="padding:8px 16px;background:#c94040;color:#fff;border:none;border-radius:99px;' +
            'font-family:\'DM Sans\',sans-serif;font-size:12px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;"><i data-lucide="trash-2"></i> Yes, delete</button>' +
        '</div>';
      var dataSection = document.querySelector('.settings-row-danger');
      if (dataSection) dataSection.closest('.settings-section').appendChild(row);
      if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': '1.75', width: '16', height: '16' } });
    }
  };

  window.doClearData = function () {
    ['lf_notes','lf_events','lf_goals','lf_reminders','lf_sessions','lf_weekly','lf_daily_plan','lf_moods','lf_daily_tasks','lf_habits','lf_today_focus','lf_ai_messages','lf_local_mode']
      .forEach(function (k) { localStorage.removeItem(k); });
    var row = document.getElementById('clear-confirm-row');
    if (row) row.remove();
    if (typeof showToast === 'function') showToast('All data cleared');
    /* Re-render everything */
    setTimeout(function () { location.reload(); }, 1000);
  };

  /* ══════════════════════════════════════
     10. RESTORE SETTINGS ON LOAD
  ══════════════════════════════════════ */
  function restoreSettings() {
    /* Theme */
    var theme = getSetting('theme', 'meadow');
    if (theme && theme !== 'default') {
      document.body.setAttribute('data-theme', theme);
      if (theme === 'neon') injectNeonRingGradient();
    }
    /* Font size */
    var fs = getSetting('fontsize', 'medium');
    document.body.setAttribute('data-fontsize', fs);
    document.documentElement.setAttribute('data-fontsize', fs);
    /* Compact */
    var compact = getSetting('compact', false);
    document.body.setAttribute('data-compact', compact ? 'true' : 'false');
    document.documentElement.setAttribute('data-compact', compact ? 'true' : 'false');
    /* Toasts */
    _toastsEnabled = getSetting('toasts', true);
    /* Timer sound */
    window._timerSoundEnabled = getSetting('sound', true);

    /* Sync UI controls once panel is visible */
    function syncControls() {
      /* Theme cards */
      document.querySelectorAll('.theme-card').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-theme') === theme);
      });
      /* Font size */
      document.querySelectorAll('.fsize-btn').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-size') === fs);
      });
      /* Compact toggle */
      var compEl = document.getElementById('toggle-compact');
      if (compEl) compEl.checked = compact;
      /* Toast toggle */
      var toastEl = document.getElementById('toggle-toasts');
      if (toastEl) toastEl.checked = _toastsEnabled;
      /* Sound toggle */
      var soundEl = document.getElementById('toggle-sound');
      if (soundEl) soundEl.checked = window._timerSoundEnabled;
    }

    /* Try immediately, then on DOMContentLoaded */
    syncControls();
    document.addEventListener('DOMContentLoaded', syncControls);
  }

  /* ══════════════════════════════════════
     INIT
  ══════════════════════════════════════ */
  function init() {
    restoreSettings();
    injectNavItem();
    patchToast();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
