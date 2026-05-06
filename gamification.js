/* ==========================================================================
   LIFEFLOW — gamification.js
   XP, FlowCoins, levels, daily missions, achievements.
   Real multiplayer leaderboard via Firebase Firestore.
   ========================================================================== */
(function () {
  'use strict';

  /* ── Storage keys (localStorage fallback) ── */
  var GAME_KEY   = 'lf_game_profile';
  var CLAIM_KEY  = 'lf_game_claims';
  var ACH_KEY    = 'lf_game_achievements';
  var LOG_KEY    = 'lf_game_reward_log';
  var FRIEND_KEY = 'lf_game_friends';   /* stores [{uid, displayName}] */
  var BATTLE_KEY = 'lf_game_battle';

  /* ── Firestore collection / field names ── */
  var FS_PROFILES = 'gameProfiles';   /* public collection — readable by any signed-in user */
  var TAG_KEY = 'lf_game_tag';        /* localStorage cache for this user's tag */

  /* ── Helpers ── */
  function $(id) { return document.getElementById(id); }

  function read(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  /* ── Firebase helpers ── */
  function db() { return window._firebaseDb || null; }
  function auth() { return window._firebaseAuth || null; }
  function currentUser() { return auth() && auth().currentUser; }
  function isFirebaseReady() { return !window.firebaseUnavailable && !!db() && !!currentUser(); }

  /* ── Game Tag helpers ── */

  /* Generate a deterministic 4-digit suffix from a uid string */
  function tagSuffixFromUid(uid) {
    var hash = 0;
    for (var i = 0; i < uid.length; i++) {
      hash = ((hash << 5) - hash) + uid.charCodeAt(i);
      hash |= 0;
    }
    return String(Math.abs(hash) % 10000).padStart(4, '0');
  }

  /* Get or create this user's game tag (e.g. "Mango#4821") */
  function getMyTag() {
    var cached = read(TAG_KEY, null);
    if (cached) return cached;
    if (!isFirebaseReady()) return null;
    var user = currentUser();
    var name = (user.displayName || user.email || 'Player').split('@')[0].replace(/\s+/g, '');
    var tag = name + '#' + tagSuffixFromUid(user.uid);
    write(TAG_KEY, tag);
    return tag;
  }

  /* Expose tag globally so Settings / Arena header can use it */
  window.getMyGameTag = getMyTag;
  window._searchUserByTag = searchUserByTag;

  /* Copy tag to clipboard and show toast */
  window.copyGameTag = function () {
    var tag = getMyTag();
    if (!tag) { if (typeof window.showToast === 'function') window.showToast('Sign in to get your tag'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tag).then(function () {
        if (typeof window.showToast === 'function') window.showToast('Tag copied: ' + tag);
      }).catch(function () { fallbackCopy(tag); });
    } else {
      fallbackCopy(tag);
    }
  };

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); if (typeof window.showToast === 'function') window.showToast('Tag copied: ' + text); }
    catch (e) { if (typeof window.showToast === 'function') window.showToast('Could not copy tag'); }
    document.body.removeChild(ta);
  }

  /* Search users by game tag (e.g. "Mango#4821") */
  function searchUserByTag(tag, cb) {
    if (!db()) { cb([]); return; }
    var q = tag.trim();
    db().collection(FS_PROFILES).limit(100).get()
      .then(function (snap) {
        var results = [];
        snap.forEach(function (doc) {
          var gp = doc.data();
          var uid = doc.id;
          var name = (gp.displayName || gp.email || 'Player').split('@')[0].replace(/\s+/g, '');
          var docTag = name + '#' + tagSuffixFromUid(uid);
          if (docTag.toLowerCase() === q.toLowerCase()) {
            results.push({ uid: uid, displayName: gp.displayName || gp.email, email: gp.email || '', tag: docTag });
          }
        });
        cb(results);
      })
      .catch(function () { cb([]); });
  }

  /* Write the current user's game profile to Firestore (public gameProfiles collection) */
  function pushProfileToFirestore(profile) {
    if (!isFirebaseReady()) return;
    var user = currentUser();
    var tag = getMyTag();
    db().collection(FS_PROFILES).doc(user.uid).set({
      xp:          profile.xp,
      coins:       profile.coins,
      level:       profile.level,
      displayName: user.displayName || user.email || 'Player',
      email:       user.email || '',
      uid:         user.uid,
      tag:         tag || '',
      lastSeen:    Date.now()
    }, { merge: true })
      .catch(function (e) { console.warn('[game] pushProfile failed', e); });
  }

  /* Heartbeat — update lastSeen every 2 minutes so online dot stays accurate */
  function startHeartbeat() {
    setInterval(function () {
      if (!isFirebaseReady()) return;
      var user = currentUser();
      db().collection(FS_PROFILES).doc(user.uid).set(
        { lastSeen: Date.now() }, { merge: true }
      ).catch(function () {});
    }, 2 * 60 * 1000);
  }

  /* Fetch another user's game profile from Firestore by UID */
  function fetchProfileByUid(uid, cb) {
    if (!db()) { cb(null); return; }
    db().collection(FS_PROFILES).doc(uid).get()
      .then(function (snap) {
        cb(snap.exists ? snap.data() : null);
      })
      .catch(function () { cb(null); });
  }

  /* Search users by displayName or email */
  function searchUserByNameOrEmail(query, cb) {
    if (!db()) { cb([]); return; }
    var q = query.trim().toLowerCase();
    db().collection(FS_PROFILES).limit(50).get()
      .then(function (snap) {
        var results = [];
        snap.forEach(function (doc) {
          var gp = doc.data();
          var name  = (gp.displayName || '').toLowerCase();
          var email = (gp.email || '').toLowerCase();
          if (name.includes(q) || email.includes(q)) {
            results.push({ uid: doc.id, displayName: gp.displayName || gp.email, email: gp.email || '' });
          }
        });
        cb(results);
      })
      .catch(function () { cb([]); });
  }

  /* ══════════════════════════════════════════════
     PROFILE & XP
  ══════════════════════════════════════════════ */
  function getProfile() {
    var p = read(GAME_KEY, null);
    if (!p) {
      p = { xp: 0, coins: 0, level: 1, totalEarned: 0, createdAt: new Date().toISOString() };
    }
    p.xp          = Number(p.xp)          || 0;
    p.coins       = Number(p.coins)       || 0;
    p.level       = Math.max(1, Number(p.level) || 1);
    p.totalEarned = Number(p.totalEarned) || 0;
    return p;
  }

  function xpNeeded(level) {
    return 100 + (Math.max(1, level) - 1) * 75;
  }

  function currentLevelFromXp(xp) {
    var level = 1;
    var remaining = Math.max(0, Number(xp) || 0);
    while (remaining >= xpNeeded(level)) {
      remaining -= xpNeeded(level);
      level++;
    }
    return {
      level: level,
      into: remaining,
      need: xpNeeded(level),
      pct: Math.round((remaining / xpNeeded(level)) * 100)
    };
  }

  function saveProfile(p) {
    var lvl = currentLevelFromXp(p.xp);
    var old = p.level || 1;
    p.level = lvl.level;
    write(GAME_KEY, p);
    pushProfileToFirestore(p);   /* sync to Firestore so friends can see it */
    if (p.level > old) showLevelUp(p.level);
  }

  function logOnce(key) {
    var log = read(LOG_KEY, {});
    if (log[key]) return false;
    log[key] = new Date().toISOString();
    write(LOG_KEY, log);
    return true;
  }

  function reward(reason, xp, coins, onceKey) {
    if (onceKey && !logOnce(onceKey)) return false;
    var p = getProfile();
    p.xp          += Number(xp)    || 0;
    p.coins       += Number(coins) || 0;
    p.totalEarned += Number(coins) || 0;
    saveProfile(p);
    if (typeof window.showToast === 'function') {
      window.showToast('+' + xp + ' XP  +' + coins + ' FlowCoins — ' + reason);
    }
    /* Don't call renderGame() here — callers handle rendering to avoid loops */
    return true;
  }

  function showLevelUp(level) {
    var pop = document.createElement('div');
    pop.className = 'level-up-pop';
    pop.innerHTML =
      '<strong>Level ' + level + '</strong>' +
      '<span>New Lifeflow rank unlocked 🎉</span>';
    document.body.appendChild(pop);
    setTimeout(function () { if (pop.parentNode) pop.remove(); }, 2800);
  }

  /* ══════════════════════════════════════════════
     DATA SNAPSHOT
  ══════════════════════════════════════════════ */
  function getData() {
    return {
      notes:     read('lf_notes',       []),
      goals:     read('lf_goals',       []),
      sessions:  read('lf_sessions',    []),
      reminders: read('lf_reminders',   []),
      tasks:     read('lf_daily_tasks', {}),
      moods:     read('lf_moods',       {}),
      habits:    read('lf_habits',      {})
    };
  }

  function doneTasksToday(data) {
    return ((data || getData()).tasks[todayKey()] || [])
      .filter(function (t) { return !!t.done; }).length;
  }

  function habitCountToday(data) {
    var h = ((data || getData()).habits[todayKey()] || {});
    return Object.keys(h).filter(function (k) { return !!h[k]; }).length;
  }

  function focusToday(data) {
    return ((data || getData()).sessions || [])
      .filter(function (s) { return s.date === todayKey(); });
  }

  function focusMinutes(data) {
    return focusToday(data).reduce(function (sum, s) {
      return sum + (Number(s.duration) || 0);
    }, 0);
  }

  /* ══════════════════════════════════════════════
     DAILY MISSIONS
  ══════════════════════════════════════════════ */
  function missions() {
    var d        = getData();
    var tasks    = doneTasksToday(d);
    var sessions = focusToday(d).length;
    var habits   = habitCountToday(d);
    var mood     = !!(d.moods && d.moods[todayKey()]);
    var mins     = focusMinutes(d);

    return [
      {
        id: 'daily_tasks_3',
        icon: 'list-checks',
        name: 'Complete 3 daily tasks',
        meta: tasks + '/3 done',
        ok: tasks >= 3,
        xp: 35, coins: 18
      },
      {
        id: 'daily_focus_1',
        icon: 'zap',
        name: 'Finish 1 focus session',
        meta: sessions + '/1 sessions',
        ok: sessions >= 1,
        xp: 40, coins: 22
      },
      {
        id: 'daily_mood_1',
        icon: 'heart',
        name: 'Log your mood',
        meta: mood ? 'Mood saved ✓' : 'Not checked in',
        ok: mood,
        xp: 15, coins: 8
      },
      {
        id: 'daily_habits_3',
        icon: 'flame',
        name: 'Complete 3 mini habits',
        meta: habits + '/3 habits',
        ok: habits >= 3,
        xp: 30, coins: 15
      },
      {
        id: 'daily_focus_60',
        icon: 'brain',
        name: 'Reach 60 focus minutes',
        meta: mins + '/60 min',
        ok: mins >= 60,
        xp: 60, coins: 35
      },
      {
        id: 'daily_note_1',
        icon: 'file-text',
        name: 'Write or save a note',
        meta: (d.notes || []).length + ' notes total',
        ok: (d.notes || []).length > 0,
        xp: 20, coins: 10
      }
    ];
  }

  /* ══════════════════════════════════════════════
     ACHIEVEMENTS
  ══════════════════════════════════════════════ */
  var ACHIEVEMENTS = [
    {
      id: 'first_note',
      icon: 'file-text',
      name: 'First Scroll',
      meta: 'Create your first note',
      xp: 20, coins: 10,
      ok: function (d) { return d.notes.length >= 1; }
    },
    {
      id: 'first_goal',
      icon: 'target',
      name: 'Quest Accepted',
      meta: 'Create your first goal',
      xp: 25, coins: 12,
      ok: function (d) { return d.goals.length >= 1; }
    },
    {
      id: 'focus_5',
      icon: 'zap',
      name: 'Locked In',
      meta: 'Complete 5 focus sessions',
      xp: 60, coins: 35,
      ok: function (d) { return d.sessions.length >= 5; }
    },
    {
      id: 'focus_250',
      icon: 'brain',
      name: 'Deep Worker',
      meta: 'Log 250 focus minutes',
      xp: 100, coins: 55,
      ok: function (d) {
        return d.sessions.reduce(function (a, s) {
          return a + (Number(s.duration) || 0);
        }, 0) >= 250;
      }
    },
    {
      id: 'daily_trio',
      icon: 'trophy',
      name: 'Daily Trio',
      meta: 'Complete all 3 daily tasks',
      xp: 45, coins: 25,
      ok: function (d) { return doneTasksToday(d) >= 3; }
    },
    {
      id: 'habit_keeper',
      icon: 'flame',
      name: 'Habit Keeper',
      meta: 'Complete 5 mini habits today',
      xp: 50, coins: 30,
      ok: function (d) { return habitCountToday(d) >= 5; }
    },
    {
      id: 'goal_finisher',
      icon: 'crown',
      name: 'Boss Defeated',
      meta: 'Finish a goal at 100%',
      xp: 120, coins: 75,
      ok: function (d) {
        return d.goals.some(function (g) { return Number(g.progress) >= 100; });
      }
    },
    {
      id: 'social_start',
      icon: 'users',
      name: 'Party Created',
      meta: 'Add your first friend',
      xp: 15, coins: 8,
      ok: function () { return getFriends().length > 0; }
    }
  ];

  function checkAchievements() {
    var d        = getData();
    var unlocked = read(ACH_KEY, {});
    var changed  = false;

    ACHIEVEMENTS.forEach(function (a) {
      if (!unlocked[a.id] && a.ok(d)) {
        unlocked[a.id] = new Date().toISOString();
        changed = true;
        /* reward() no longer calls renderGame(), safe to call here */
        reward('Achievement: ' + a.name, a.xp, a.coins, 'ach:' + a.id);
      }
    });

    if (changed) write(ACH_KEY, unlocked);
  }

  /* ══════════════════════════════════════════════
     FRIENDS / LEADERBOARD  — Firebase-backed
     Friends are stored as [{uid, displayName}] in localStorage.
     Live XP/level/lastSeen is fetched from Firestore on demand.
  ══════════════════════════════════════════════ */
  function getFriends() {
    /* Returns [{uid, displayName}] */
    return read(FRIEND_KEY, []);
  }

  function saveFriends(list) {
    write(FRIEND_KEY, list);
  }

  /* ── Add friend via tag: sends a friend REQUEST (unified with chat) ── */
  window.addGameFriend = function () {
    var el = $('game-friend-input');
    var query = el ? el.value.trim() : '';
    if (!query) return;

    var btn = $('game-friend-add-btn');
    if (btn) btn.disabled = true;
    setLeaderboardStatus('Searching…');

    var me = currentUser();

    if (!isFirebaseReady()) {
      setLeaderboardStatus('Sign in to add friends');
      if (btn) btn.disabled = false;
      setTimeout(function () { setLeaderboardStatus(''); }, 3000);
      return;
    }

    if (query.indexOf('#') === -1) {
      setLeaderboardStatus('Use your friend\'s tag (e.g. Mango#1234)');
      if (btn) btn.disabled = false;
      setTimeout(function () { setLeaderboardStatus(''); }, 3000);
      return;
    }

    searchUserByTag(query, function (results) {
      if (btn) btn.disabled = false;

      /* Remove yourself */
      results = results.filter(function (r) { return r.uid !== me.uid; });

      if (!results.length) {
        setLeaderboardStatus('No player found with that tag');
        setTimeout(function () { setLeaderboardStatus(''); }, 4000);
        return;
      }

      var target = results[0];

      /* Check already friends in friendships collection */
      var localFriends = getFriends();
      if (localFriends.some(function (f) { return f.uid === target.uid; })) {
        setLeaderboardStatus('Already friends');
        setTimeout(function () { setLeaderboardStatus(''); }, 3000);
        return;
      }

      /* Send a unified friend request via Firestore friendRequests */
      var requestId = me.uid + '_' + target.uid;
      db().collection('friendRequests').doc(requestId).set({
        id: requestId,
        fromUid: me.uid,
        fromEmail: me.email || '',
        fromName: me.displayName || me.email || 'Player',
        toUid: target.uid,
        toEmail: target.email || '',
        toName: target.displayName || target.uid,
        status: 'pending',
        createdAtMs: Date.now()
      }, { merge: true })
        .then(function () {
          if (el) { el.value = ''; el.focus(); }
          setLeaderboardStatus('Request sent to ' + (target.displayName || target.uid));
          setTimeout(function () { setLeaderboardStatus(''); }, 3000);
          if (typeof window.showToast === 'function') {
            window.showToast('Friend request sent to ' + (target.displayName || target.uid));
          }
        })
        .catch(function (e) {
          console.warn('[game] sendFriendRequest failed', e);
          setLeaderboardStatus('Could not send request');
          setTimeout(function () { setLeaderboardStatus(''); }, 3000);
        });
    });
  };

  function doAddFriend(userObj) {
    var friends = getFriends();
    if (friends.some(function (f) { return f.uid === userObj.uid; })) return;
    friends.push({ uid: userObj.uid, displayName: userObj.displayName });
    saveFriends(friends);

    /* Write a mutual connection to Firestore so BOTH users see each other.
       We write to both users' gameProfiles under a 'friends' sub-map. */
    if (isFirebaseReady()) {
      var me = currentUser();
      var myProfile = getProfile();
      var myLvl = currentLevelFromXp(myProfile.xp);

      /* Add them to my friends map in Firestore */
      var myUpdate = {};
      myUpdate['friends.' + userObj.uid] = {
        uid: userObj.uid,
        displayName: userObj.displayName,
        addedAt: Date.now()
      };
      db().collection(FS_PROFILES).doc(me.uid).set(myUpdate, { merge: true })
        .catch(function (e) { console.warn('[game] add friend (self) failed', e); });

      /* Add me to their friends map in Firestore — mutual */
      var theirUpdate = {};
      theirUpdate['friends.' + me.uid] = {
        uid: me.uid,
        displayName: me.displayName || me.email || 'Player',
        addedAt: Date.now()
      };
      db().collection(FS_PROFILES).doc(userObj.uid).set(theirUpdate, { merge: true })
        .catch(function (e) { console.warn('[game] add friend (them) failed', e); });
    }

    checkAchievements();
    renderLeaderboard();
    if (typeof window.showToast === 'function') {
      window.showToast(userObj.displayName + ' added — they can now see you too');
    }
  }

  function setLeaderboardStatus(msg) {
    var el = $('game-leaderboard-status');
    if (el) el.textContent = msg;
  }

  /* Show a small inline picker when multiple users match the search */
  function showFriendPicker(results, onPick) {
    var container = $('game-friend-picker');
    if (!container) return;
    container.innerHTML = results.slice(0, 6).map(function (r, i) {
      return '<button class="friend-pick-btn" data-idx="' + i + '">' +
        '<span class="friend-pick-name">' + esc(r.displayName) + '</span>' +
        '<span class="friend-pick-email">' + esc(r.email) + '</span>' +
      '</button>';
    }).join('');
    container.style.display = '';
    container.querySelectorAll('.friend-pick-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.getAttribute('data-idx'), 10);
        container.innerHTML = '';
        container.style.display = 'none';
        onPick(results[idx]);
      });
    });
  }

  /* Remove friend — unified: removes from friendships + gameProfiles.friends */
  window.removeGameFriend = function (uid) {
    var friends = getFriends().filter(function (f) { return f.uid !== uid; });
    saveFriends(friends);

    if (isFirebaseReady()) {
      var me = currentUser();
      var pairKey = [me.uid, uid].sort().join('__');

      /* Remove from friendships (chat) */
      db().collection('friendships').doc(pairKey).delete()
        .catch(function () {});

      /* Remove from gameProfiles.friends (arena) */
      var myUpdate = {};
      myUpdate['friends.' + uid] = firebase.firestore.FieldValue.delete();
      db().collection(FS_PROFILES).doc(me.uid).update(myUpdate)
        .catch(function () {});
    }

    /* Update socialFriends immediately so chat/friends panel reflects change */
    if (typeof window._removeSocialFriend === 'function') {
      window._removeSocialFriend(uid);
    }

    renderLeaderboard();
  };

  /* ── Partial re-render: only the leaderboard list ── */
  window.renderLeaderboard = function() { renderLeaderboard(); };
  function renderLeaderboard() {
    var listEl  = $('game-leaderboard-list');
    var emptyEl = $('game-leaderboard-empty');
    /* If the panel hasn't been injected yet, do nothing — init will call renderGame() */
    if (!listEl) return;

    var p   = getProfile();
    var lvl = currentLevelFromXp(p.xp);
    var me  = currentUser();

    /* Build the "You" entry from local profile (always accurate) */
    var myEntry = {
      uid:         me ? me.uid : 'me',
      displayName: me ? (me.displayName || me.email || 'You') : 'You',
      xp:          p.xp,
      coins:       p.coins,
      level:       lvl.level,
      lastSeen:    Date.now(),
      isMe:        true
    };

    /* Merge localStorage friends with Firestore friends (mutual adds) */
    var localFriends = getFriends();

    if (!isFirebaseReady()) {
      /* Offline — just use local list */
      if (emptyEl) emptyEl.style.display = localFriends.length === 0 ? '' : 'none';
      renderLeaderboardRows([myEntry], listEl);
      return;
    }

    /* Fetch friends from the unified friendships collection */
    db().collection('friendships')
      .where('members', 'array-contains', me.uid)
      .get()
      .then(function (snap) {
        var merged = [];
        snap.forEach(function (doc) {
          var data = doc.data() || {};
          var profiles = data.memberProfiles || {};
          var friendUid = (Array.isArray(data.members) ? data.members : []).find(function (m) { return m !== me.uid; });
          if (!friendUid) return;
          var profile = profiles[friendUid] || {};
          merged.push({
            uid: friendUid,
            displayName: profile.displayName || profile.email || 'Friend'
          });
        });

        /* Also include any local-only friends (offline mode) */
        localFriends.filter(function (f) { return f.local; }).forEach(function (f) {
          if (!merged.some(function (m) { return m.uid === f.uid; })) {
            merged.push(f);
          }
        });

        /* Sync back to localStorage */
        saveFriends(merged.filter(function (f) { return !f.local; }));

        if (emptyEl) emptyEl.style.display = merged.length === 0 ? '' : 'none';

        if (!merged.length) {
          renderLeaderboardRows([myEntry], listEl);
          return;
        }

        renderLeaderboardRows([myEntry], listEl);

        var fetched = [];
        var pending = merged.length;

        merged.forEach(function (f) {
          if (f.local) {
            fetched.push({ uid: f.uid, displayName: f.displayName, xp: 0, coins: 0, level: 1, lastSeen: 0, isMe: false });
            pending--;
            if (pending === 0) finalize();
            return;
          }
          fetchProfileByUid(f.uid, function (gp) {
            fetched.push(gp ? {
              uid:         f.uid,
              displayName: gp.displayName || f.displayName,
              xp:          gp.xp    || 0,
              coins:       gp.coins || 0,
              level:       gp.level || 1,
              lastSeen:    gp.lastSeen || 0,
              isMe:        false
            } : {
              uid: f.uid, displayName: f.displayName, xp: 0, coins: 0, level: 1, lastSeen: 0, isMe: false
            });
            pending--;
            if (pending === 0) finalize();
          });
        });

        function finalize() {
          var board = [myEntry].concat(fetched).sort(function (a, b) {
            return (b.xp || 0) - (a.xp || 0);
          });
          renderLeaderboardRows(board, listEl);
        }
      })
      .catch(function () {
        if (emptyEl) emptyEl.style.display = localFriends.length === 0 ? '' : 'none';
        renderLeaderboardRows([myEntry], listEl);
      });
  }

  function renderLeaderboardRows(board, listEl) {
    var now = Date.now();
    listEl.innerHTML = board.slice(0, 8).map(function (f, i) {
      var rank      = i + 1;
      var rankClass = rank === 1 ? ' rank-1' : rank === 2 ? ' rank-2' : rank === 3 ? ' rank-3' : '';
      /* Online = active in last 5 minutes */
      var online    = f.isMe || (f.lastSeen && (now - f.lastSeen) < 5 * 60 * 1000);

      return (
        '<div class="friend-row' + rankClass + (f.isMe ? ' is-me' : '') + '">' +
          '<div class="friend-rank">' + rank + '</div>' +
          '<div class="friend-avatar-sm' + (online ? ' online' : '') + '">' +
            esc((f.displayName || '?').charAt(0).toUpperCase()) +
          '</div>' +
          '<div class="friend-copy">' +
            '<strong>' + esc(f.displayName) + (f.isMe ? ' <span class="you-tag">you</span>' : '') + '</strong>' +
            '<span>Level ' + esc(f.level || 1) + ' · ' + esc(f.coins || 0) + ' FC' +
              (online && !f.isMe ? ' · <span class="online-dot"></span> online' : '') +
            '</span>' +
          '</div>' +
          '<div class="friend-score">' + esc(f.xp || 0) + ' XP</div>' +
          (!f.isMe
            ? '<button class="friend-remove" data-uid="' + esc(f.uid) + '" title="Remove"><i data-lucide="x"></i></button>'
            : '<div class="friend-remove-placeholder"></div>') +
        '</div>'
      );
    }).join('');

    /* Attach remove listeners */
    listEl.querySelectorAll('.friend-remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.removeGameFriend(btn.getAttribute('data-uid'));
      });
    });

    if (window.lucide) {
      window.lucide.createIcons({ attrs: { 'stroke-width': '1.75', width: '14', height: '14' } });
    }
  }

  /* ══════════════════════════════════════════════
     FOCUS BATTLE
  ══════════════════════════════════════════════ */
  window.startFocusBattle = function () {
    var friends = getFriends();
    if (!friends.length) {
      if (typeof window.showToast === 'function') {
        window.showToast('Add a friend first to start a battle!');
      }
      return;
    }
    var enemy = friends[Math.floor(Math.random() * friends.length)] || { displayName: 'Rival' };
    var enemyName = enemy.displayName || enemy.name || 'Rival';
    write(BATTLE_KEY, {
      date: todayKey(),
      enemy: enemyName,
      active: true,
      startedAt: Date.now()
    });

    if (typeof window.switchTo === 'function') {
      window.switchTo('focus', $('nav-focus'));
    }

    var task = $('timer-task');
    if (task) task.value = 'Focus Battle vs ' + enemyName;

    if (typeof window.setDuration === 'function') window.setDuration(25);
    if (typeof window.showToast === 'function') {
      window.showToast('⚔️ Focus Battle started vs ' + enemyName);
    }
  };

  function finishBattleIfActive() {
    var b = read(BATTLE_KEY, null);
    if (!b || !b.active || b.date !== todayKey()) return;
    b.active = false;
    b.wonAt  = Date.now();
    write(BATTLE_KEY, b);
    reward(
      'Battle won vs ' + b.enemy,
      55, 35,
      'battle:' + todayKey() + ':' + b.enemy + ':' + b.startedAt
    );
  }

  /* ══════════════════════════════════════════════
     MISSION CLAIM
  ══════════════════════════════════════════════ */
  function getClaims()    { return read(CLAIM_KEY, {}); }
  function setClaims(c)   { write(CLAIM_KEY, c); }
  function missionClaimId(id) { return todayKey() + ':' + id; }

  window.claimMission = function (id) {
    var m = missions().find(function (x) { return x.id === id; });
    if (!m || !m.ok) return;
    var claims = getClaims();
    var key    = missionClaimId(id);
    if (claims[key]) return;
    claims[key] = true;
    setClaims(claims);
    if (reward('Mission complete', m.xp, m.coins, 'mission:' + key)) {
      /* Re-render immediately so the mission button becomes "Claimed" without reload */
      renderGame();
    }
  };

  /* ══════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════ */
  function renderGame() {
    var root = $('lifeflow-game-root');
    if (!root) return;

    checkAchievements();

    var p      = getProfile();
    var lvl    = currentLevelFromXp(p.xp);
    var claims = getClaims();
    var ach    = read(ACH_KEY, {});

    /* ── Missions ── */
    var missionHtml = missions().map(function (m) {
      var claimed = !!claims[missionClaimId(m.id)];
      var stateClass = (m.ok ? ' complete' : '') + (claimed ? ' claimed' : '');
      var btnLabel   = claimed ? 'Claimed' : (m.ok ? 'Claim' : 'Locked');
      var btnIcon    = claimed ? 'check' : (m.ok ? 'coins' : 'lock');
      var disabled   = (!m.ok || claimed) ? ' disabled' : '';

      return (
        '<div class="mission-card' + stateClass + '">' +
          '<div class="mission-top">' +
            '<span class="mission-icon"><i data-lucide="' + esc(m.icon) + '"></i></span>' +
            '<span class="mission-reward">+' + m.xp + ' XP / ' + m.coins + ' FC</span>' +
          '</div>' +
          '<div class="mission-name">' + esc(m.name) + '</div>' +
          '<div class="mission-meta">' + esc(m.meta) + '</div>' +
          '<button class="mission-action" onclick="claimMission(\'' + m.id + '\')"' + disabled + '>' +
            '<i data-lucide="' + btnIcon + '"></i> ' + btnLabel +
          '</button>' +
        '</div>'
      );
    }).join('');

    /* ── Achievements ── */
    var achHtml = ACHIEVEMENTS.map(function (a) {
      var on = !!ach[a.id];
      return (
        '<div class="achievement-row' + (on ? ' unlocked' : '') + '">' +
          '<div class="achievement-medal"><i data-lucide="' + esc(a.icon) + '"></i></div>' +
          '<div class="achievement-copy">' +
            '<strong>' + esc(a.name) + '</strong>' +
            '<span>' + esc(a.meta) + '</span>' +
          '</div>' +
          (on ? '<div class="achievement-check"><i data-lucide="check"></i></div>' : '') +
        '</div>'
      );
    }).join('');

    /* ── Leaderboard (initial placeholder — renderLeaderboard() fills it) ── */
    var friends = getFriends();
    var emptyLeaderboardStyle = friends.length === 0 ? '' : ' style="display:none"';

    /* ── Battle state ── */
    var battle = read(BATTLE_KEY, null);
    var battleActive = battle && battle.active && battle.date === todayKey();
    var battleHtml = battleActive
      ? '<div class="battle-active"><i data-lucide="swords"></i> Battle vs <strong>' + esc(battle.enemy) + '</strong> in progress</div>'
      : '';

    /* ── Assemble ── */
    root.innerHTML =
      /* Left: main game card */
      '<div class="game-card game-card-main">' +
        '<div class="game-card-header">' +
          '<div>' +
            '<div class="game-kicker"><i data-lucide="gamepad-2"></i> Life Game</div>' +
            '<div class="game-title" id="game-level-title">Level ' + lvl.level + '</div>' +
          '</div>' +
          '<div class="game-currency">' +
            '<div class="game-pill"><i data-lucide="zap"></i> <strong id="game-xp-value">' + p.xp + '</strong> XP</div>' +
            '<div class="game-pill"><i data-lucide="coins"></i> <strong id="game-fc-value">' + p.coins + '</strong> FC</div>' +
          '</div>' +
        '</div>' +

        '<div class="game-level-row">' +
          '<div class="game-level-badge" id="game-level-badge-val">' + lvl.level + '</div>' +
          '<div class="game-level-info">' +
            '<div class="game-xp-track"><div class="game-xp-fill" id="game-xp-fill-bar" style="width:' + lvl.pct + '%"></div></div>' +
            '<div class="game-xp-copy" id="game-xp-copy-text">' + lvl.into + ' / ' + lvl.need + ' XP to next level</div>' +
          '</div>' +
          '<div class="game-level-pct" id="game-level-pct-val">' + lvl.pct + '%</div>' +
        '</div>' +

        '<div class="game-section-label">Daily Missions</div>' +
        '<div class="mission-grid">' + missionHtml + '</div>' +
      '</div>' +

      /* Right: side cards */
      '<div class="game-side-grid">' +

        /* Achievements */
        '<div class="game-card">' +
          '<div class="game-card-header">' +
            '<div>' +
              '<div class="game-kicker"><i data-lucide="trophy"></i> Achievements</div>' +
              '<div class="game-title game-title-sm">Unlocks</div>' +
            '</div>' +
          '</div>' +
          '<div class="game-mini-list">' + achHtml + '</div>' +
        '</div>' +

        /* Leaderboard */
        '<div class="game-card">' +
          '<div class="game-card-header">' +
            '<div>' +
              '<div class="game-kicker"><i data-lucide="bar-chart-2"></i> Leaderboard</div>' +
              '<div class="game-title game-title-sm">Rankings</div>' +
            '</div>' +
            '<button class="game-friends-link" onclick="switchTo(\'friends\',document.getElementById(\'nav-friends\'))" title="Manage friends">' +
              '<i data-lucide="user-plus"></i>' +
            '</button>' +
          '</div>' +
          '<div id="game-leaderboard-status" class="leaderboard-status"></div>' +
          '<div id="game-friend-picker" class="friend-picker" style="display:none"></div>' +
          '<div id="game-leaderboard-empty" class="leaderboard-empty"' + emptyLeaderboardStyle + '>' +
            '<i data-lucide="users"></i>' +
            '<span>No friends yet.</span>' +
            '<button class="game-add-friends-btn" onclick="switchTo(\'friends\',document.getElementById(\'nav-friends\'))">Add Friends</button>' +
          '</div>' +
          '<div id="game-leaderboard-list" class="game-mini-list"></div>' +
          battleHtml +
          '<button class="game-battle-btn" onclick="startFocusBattle()">' +
            '<i data-lucide="swords"></i> Start Focus Battle' +
          '</button>' +
        '</div>' +

      '</div>';

    if (window.lucide) {
      window.lucide.createIcons({
        attrs: { 'stroke-width': '1.75', width: '16', height: '16' }
      });
    }

    /* Populate the leaderboard list */
    renderLeaderboard();
  }

  /* ══════════════════════════════════════════════
     INJECT PANEL
  ══════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════
     INJECT PANEL — no longer needed, panel is static HTML in index.html
     Kept as a no-op for safety in case anything calls it
  ══════════════════════════════════════════════ */
  function injectGamePanel() {
    return !!$('lifeflow-game-root');
  }

  /* ══════════════════════════════════════════════
     FUNCTION WRAPPERS
     Hook into existing app.js functions to award XP
  ══════════════════════════════════════════════ */
  function wrap(name, handler) {
    var original = window[name];
    if (typeof original !== 'function' || original.__gameWrapped) return false;

    window[name] = function () {
      var before = getData();
      var args = Array.prototype.slice.call(arguments);
      var result = original.apply(this, arguments);
      setTimeout(function () {
        handler(before, getData(), args);
        checkAchievements();
        /* Only do a lightweight refresh — update XP pills + leaderboard "You" row,
           don't rebuild the whole panel (that causes the glitch) */
        refreshGameStats();
      }, 150);
      return result;
    };

    window[name].__gameWrapped = true;
    return true;
  }

  /* Lightweight stat refresh — updates XP/coins display and leaderboard without
     rebuilding the entire panel (avoids input destruction and flicker) */
  function refreshGameStats() {
    var p   = getProfile();
    var lvl = currentLevelFromXp(p.xp);

    /* Update XP pills */
    var xpEl = $('game-xp-value');
    var fcEl = $('game-fc-value');
    if (xpEl) xpEl.textContent = p.xp;
    if (fcEl) fcEl.textContent = p.coins;

    /* Update level badge */
    var badgeEl = $('game-level-badge-val');
    var titleEl = $('game-level-title');
    if (badgeEl) badgeEl.textContent = lvl.level;
    if (titleEl) titleEl.textContent = 'Level ' + lvl.level;

    /* Update XP bar */
    var fillEl = $('game-xp-fill-bar');
    var copyEl = $('game-xp-copy-text');
    var pctEl  = $('game-level-pct-val');
    if (fillEl) fillEl.style.width = lvl.pct + '%';
    if (copyEl) copyEl.textContent = lvl.into + ' / ' + lvl.need + ' XP to next level';
    if (pctEl)  pctEl.textContent  = lvl.pct + '%';

    /* Refresh leaderboard "You" row with new XP */
    renderLeaderboard();
  }

  function installWrappers() {
    wrap('saveNote', function (before, after) {
      if (after.notes.length > before.notes.length) {
        reward('Note created', 12, 6);
      }
    });

    wrap('saveGoal', function (before, after) {
      if (after.goals.length > before.goals.length) {
        reward('Goal created', 18, 8);
      }
    });

    wrap('completeSession', function () {
      reward('Focus session complete', 35, 18);
      finishBattleIfActive();
    });

    wrap('toggleDailyTask', function (before, after) {
      if (doneTasksToday(after) > doneTasksToday(before)) {
        reward('Task completed', 10, 5);
      }
    });

    wrap('toggleHabit', function (before, after, args) {
      var habitKey = args && args[0] ? String(args[0]) : '';
      if (habitCountToday(after) > habitCountToday(before)) {
        /* Prevent XP farming by rewarding each specific habit at most once per day */
        reward('Habit completed', 8, 4, 'habit:' + todayKey() + ':' + habitKey);
      }
    });

    wrap('saveMood', function () {
      reward('Mood check-in', 8, 4, 'mood:' + todayKey());
    });

    wrap('toggleReminder', function (before, after) {
      var b = (before.reminders || []).filter(function (r) { return r.done; }).length;
      var a = (after.reminders  || []).filter(function (r) { return r.done; }).length;
      if (a > b) reward('Reminder completed', 10, 5);
    });
  }

  /* ══════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════ */
  function init() {
    /* Panel is static HTML — render immediately, no polling needed */
    installWrappers();
    renderGame();

    /* Patch switchTo so the game panel re-renders fresh when navigated to.
       switchTo is defined in app.js which loads before gamification.js,
       but patch after a tick to be safe. */
    setTimeout(function () {
      var origSwitchTo = window.switchTo;
      if (typeof origSwitchTo === 'function' && !origSwitchTo.__gamePanelPatched) {
        window.switchTo = function (id, el) {
          origSwitchTo(id, el);
          if (id === 'game') {
            renderGame();
            renderLeaderboard();
          }
        };
        window.switchTo.__gamePanelPatched = true;
      }
    }, 0);

    /* Push profile to Firestore once Firebase auth is ready */
    var pushTries = 0;
    var pushTimer = setInterval(function () {
      pushTries++;
      if (isFirebaseReady()) {
        clearInterval(pushTimer);
        pushProfileToFirestore(getProfile());
        startHeartbeat();
      }
      if (pushTries > 40) clearInterval(pushTimer);
    }, 500);
  }

  /* Public API */
  window.renderLifeflowGame = renderGame;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
