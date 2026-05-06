/* Lifeflow local-first assistant */
(function () {
  'use strict';

  var STORE_KEY = 'lf_ai_messages';
  var MAX_MESSAGES = 24;
  var busy = false;
  var _previousResponseId = null;
  var messages = readStore(STORE_KEY, []);

  function $(id) { return document.getElementById(id); }

  function readStore(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function parseDate(value) {
    return new Date((value || todayKey()) + 'T00:00:00');
  }

  function daysBetween(a, b) {
    return Math.round((parseDate(a) - parseDate(b)) / 86400000);
  }

  function dateLabel(value) {
    try {
      return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch (_) {
      return value || 'Today';
    }
  }

  function clampPercent(value) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function minutesToday(sessions, key) {
    return sessions
      .filter(function (session) { return session.date === key; })
      .reduce(function (sum, session) { return sum + (Number(session.duration) || 0); }, 0);
  }

  function snapshot() {
    var key = todayKey();
    var notes = readStore('lf_notes', []);
    var events = readStore('lf_events', []);
    var goals = readStore('lf_goals', []);
    var reminders = readStore('lf_reminders', []);
    var sessions = readStore('lf_sessions', []);
    var dailyPlan = readStore('lf_daily_plan', {});
    var todayFocus = readStore('lf_today_focus', {});
    var moods = readStore('lf_moods', {});
    var habits = readStore('lf_habits', {});
    var activeGoals = goals.filter(function (goal) { return clampPercent(goal.progress) < 100; });
    var openReminders = reminders.filter(function (reminder) { return !reminder.done; });
    var upcomingEvents = events
      .filter(function (event) { return (event.date || '') >= key; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''); });
    var plan = Array.isArray(dailyPlan[key]) ? dailyPlan[key] : [];

    return {
      key: key,
      name: (($('user-name-display') || {}).textContent || 'there').trim(),
      notes: notes.slice(0, 20),
      events: events.slice(0, 20),
      goals: goals.slice(0, 20),
      reminders: reminders.slice(0, 20),
      sessions: sessions.slice(0, 20),
      activeGoals: activeGoals.slice(0, 20),
      openReminders: openReminders.slice(0, 20),
      upcomingEvents: upcomingEvents.slice(0, 20),
      plan: plan.slice(0, 20),
      todayFocus: todayFocus,
      moods: moods,
      habits: habits,
      focusMinutes: minutesToday(sessions, key)
    };
  }

  function choosePriority(ctx) {
    var goalText = (ctx.todayFocus && ctx.todayFocus.goal || '').trim();
    if (goalText) {
      return { icon: 'crosshair', title: goalText, meta: 'Today focus' };
    }

    var urgent = ctx.openReminders
      .map(function (reminder) {
        return { reminder: reminder, delta: daysBetween(reminder.date, ctx.key) };
      })
      .filter(function (item) { return item.delta <= 0; })
      .sort(function (a, b) {
        var priorityScore = { high: 0, medium: 1, low: 2 };
        return (priorityScore[a.reminder.priority] || 1) - (priorityScore[b.reminder.priority] || 1) || a.delta - b.delta;
      })[0];
    if (urgent) {
      return {
        icon: 'bell',
        title: urgent.reminder.title || 'Reminder',
        meta: urgent.delta < 0 ? Math.abs(urgent.delta) + 'd overdue' : 'Due today'
      };
    }

    var nextPlan = ctx.plan.find(function (item) { return !item.done; });
    if (nextPlan) {
      return { icon: 'sparkles', title: nextPlan.title, meta: (nextPlan.duration || 25) + ' min flow block' };
    }

    var goal = ctx.activeGoals
      .slice()
      .sort(function (a, b) { return clampPercent(a.progress) - clampPercent(b.progress); })[0];
    if (goal) {
      return { icon: 'target', title: goal.title || 'Active goal', meta: clampPercent(goal.progress) + '% complete' };
    }

    var event = ctx.upcomingEvents[0];
    if (event) {
      return { icon: 'calendar-days', title: event.name || 'Upcoming event', meta: dateLabel(event.date) + (event.time ? ' at ' + event.time : '') };
    }

    return { icon: 'timer', title: 'One clean focus session', meta: '25 min' };
  }

  function nextMoves(ctx) {
    var moves = [choosePriority(ctx)];

    var event = ctx.upcomingEvents[0];
    if (event && moves.every(function (move) { return move.title !== event.name; })) {
      moves.push({ icon: 'calendar-days', title: event.name || 'Upcoming event', meta: dateLabel(event.date) + (event.time ? ' at ' + event.time : '') });
    }

    var goal = ctx.activeGoals[0];
    if (goal && moves.length < 3) {
      moves.push({ icon: 'target', title: goal.title || 'Goal', meta: clampPercent(goal.progress) + '% complete' });
    }

    var reminder = ctx.openReminders[0];
    if (reminder && moves.length < 3) {
      moves.push({ icon: 'bell', title: reminder.title || 'Reminder', meta: reminder.date ? dateLabel(reminder.date) : 'No date' });
    }

    while (moves.length < 3) {
      moves.push({ icon: 'sparkles', title: 'Capture one small win', meta: 'Keep the day moving' });
    }

    return moves.slice(0, 3);
  }

  function workspaceSummary(ctx) {
    var openHigh = ctx.openReminders.filter(function (reminder) { return reminder.priority === 'high'; }).length;
    var next = choosePriority(ctx);
    return [
      'Workspace pulse:',
      '- ' + ctx.notes.length + ' notes, ' + ctx.activeGoals.length + ' active goals, ' + ctx.openReminders.length + ' open reminders.',
      '- ' + ctx.upcomingEvents.length + ' upcoming events and ' + ctx.focusMinutes + ' focus minutes today.',
      '- ' + (openHigh ? openHigh + ' high priority reminders need attention.' : 'No high priority reminder pressure right now.'),
      '',
      'Best next move: ' + next.title + ' (' + next.meta + ').'
    ].join('\n');
  }

  function planReply(ctx) {
    var moves = nextMoves(ctx);
    return [
      'Here is the cleanest plan for today:',
      '',
      '1. Start with ' + moves[0].title + ' - ' + moves[0].meta + '.',
      '2. Then handle ' + moves[1].title + ' - ' + moves[1].meta + '.',
      '3. Finish with ' + moves[2].title + ' - ' + moves[2].meta + '.',
      '',
      'Keep the first block small. A 25 minute focus session is enough to create momentum.'
    ].join('\n');
  }

  function focusReply(ctx) {
    var next = choosePriority(ctx);
    return [
      'Your best focus target is:',
      '',
      next.title,
      next.meta,
      '',
      'Set the timer, remove one distraction, and only define the next visible step before starting.'
    ].join('\n');
  }

  function goalsReply(ctx) {
    if (!ctx.activeGoals.length) {
      return 'You do not have an active goal pulling the workspace right now. Create one goal with a clear finish line, then ask me to break it down.';
    }

    return [
      'Goal breakdown:',
      '',
      ctx.activeGoals.slice(0, 4).map(function (goal, index) {
        return (index + 1) + '. ' + (goal.title || 'Untitled goal') + ' - ' + clampPercent(goal.progress) + '% complete. Next step: choose one action that can move it by 10%.';
      }).join('\n')
    ].join('\n');
  }

  function remindersReply(ctx) {
    if (!ctx.openReminders.length) {
      return 'No open reminders are pressing right now. This is a good moment to protect a focus block.';
    }

    var rows = ctx.openReminders.slice(0, 5).map(function (reminder) {
      var delta = daysBetween(reminder.date, ctx.key);
      var when = delta < 0 ? Math.abs(delta) + 'd overdue' : (delta === 0 ? 'today' : dateLabel(reminder.date));
      return '- ' + (reminder.title || 'Reminder') + ' - ' + when + ' - ' + (reminder.priority || 'medium');
    });
    return ['Reminder scan:', '', rows.join('\n'), '', 'Clear anything that takes under two minutes, then focus on the highest priority item.'].join('\n');
  }

  function defaultReply(prompt, ctx) {
    var q = prompt.toLowerCase();
    if (q.indexOf('plan') >= 0 || q.indexOf('today') >= 0 || q.indexOf('schedule') >= 0) return planReply(ctx);
    if (q.indexOf('focus') >= 0 || q.indexOf('work on') >= 0 || q.indexOf('priority') >= 0) return focusReply(ctx);
    if (q.indexOf('summary') >= 0 || q.indexOf('summarize') >= 0 || q.indexOf('overview') >= 0) return workspaceSummary(ctx);
    if (q.indexOf('goal') >= 0) return goalsReply(ctx);
    if (q.indexOf('remind') >= 0 || q.indexOf('due') >= 0) return remindersReply(ctx);

    return [
      'I would treat this through your current workspace:',
      '',
      workspaceSummary(ctx),
      '',
      'Ask for a plan, focus target, goal breakdown, or reminder scan and I will narrow it down.'
    ].join('\n');
  }

  async function remoteReply(prompt, ctx) {
    if (window.LIFEFLOW_AI_REMOTE === false) return null;
    var endpoint = window.LIFEFLOW_AI_ENDPOINT || '/api/assistant';
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 30000);
    var response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        message: prompt,
        context: ctx,
        history: messages.filter(function (msg) { return !msg.pending; }).slice(-10),
        previousResponseId: _previousResponseId
      })
    });
    clearTimeout(timeout);

    // Fall through to local for missing/unsupported endpoints
    if (response.status === 404 || response.status === 405) return null;

    var data = {};
    try { data = await response.json(); } catch (_) {}

    // Handle rate limiting — disable send for 60 s, do NOT fall through to local
    if (response.status === 429) {
      var rateLimitMsg = (data && data.error) ? data.error : 'Rate limit reached. Please wait a moment.';
      if (typeof showToast === 'function') showToast(rateLimitMsg);
      var sendBtn = document.querySelector('.assistant-composer button');
      if (sendBtn) {
        sendBtn.disabled = true;
        setTimeout(function () { sendBtn.disabled = false; }, 60000);
      }
      return 'Rate limit reached. Please wait a moment.';
    }

    // All other non-2xx — show toast and throw so assistantReply falls through to defaultReply()
    if (!response.ok) {
      if (typeof showToast === 'function') showToast('AI backend unavailable. Using local assist.');
      throw new Error('AI endpoint failed');
    }

    // ── Successful response ──────────────────────────────────────────────

    // Store responseId for multi-turn continuity
    if (data.responseId) {
      _previousResponseId = data.responseId;
    }

    // Backward compatibility: old server format with actions array
    if (data.actions) {
      executeAssistantActions(data.actions);
    }

    // Process new-format toolCalls array
    var toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls : [];
    toolCalls.forEach(function (call) {
      executeToolCall(call);
    });

    // Return reply text, or a summary when only tool calls were executed
    if (data.reply != null) {
      return data.reply;
    }
    if (toolCalls.length > 0) {
      return 'Done — ' + toolCalls.map(function (c) { return c.name; }).join(', ');
    }

    // Nothing from the new format — fall through to local
    return null;
  }

  async function assistantReply(prompt) {
    var ctx = snapshot();
    try {
      var remote = await remoteReply(prompt, ctx);
      if (remote) return remote;
    } catch (_) {
      // remoteReply already showed the "AI backend unavailable" toast before throwing
    }
    var localAction = tryLocalAction(prompt);
    if (localAction) return localAction;
    return defaultReply(prompt, ctx);
  }

  function uniqueId() {
    return Date.now() + Math.floor(Math.random() * 1000);
  }

  function safeChoice(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  function runRenderers() {
    if (typeof renderNotes === 'function') renderNotes();
    if (typeof renderGoals === 'function') renderGoals();
    if (typeof renderReminders === 'function') renderReminders();
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof refreshDash === 'function') refreshDash();
    if (typeof renderCommandResults === 'function') renderCommandResults();
    if (typeof renderAssistant === 'function') renderAssistant();
  }

  function createNoteFromAi(payload) {
    if (typeof notes === 'undefined') return false;
    var note = {
      id: uniqueId(),
      type: safeChoice(payload.type || 'idea', ['idea', 'recipe', 'schedule', 'list'], 'idea'),
      title: String(payload.title || 'AI note').slice(0, 90),
      body: String(payload.body || payload.text || '').slice(0, 6000),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };
    notes.unshift(note);
    if (typeof saveCollection === 'function') saveCollection('lf_notes', notes);
    else writeStore('lf_notes', notes);
    return 'Note created';
  }

  function createGoalFromAi(payload) {
    if (typeof goals === 'undefined') return false;
    var goal = {
      id: uniqueId(),
      title: String(payload.title || 'AI goal').slice(0, 100),
      desc: String(payload.description || payload.desc || '').slice(0, 2000),
      category: safeChoice(payload.category || 'personal', ['health', 'learning', 'career', 'personal', 'finance', 'creative'], 'personal'),
      deadline: String(payload.deadline || ''),
      progress: clampPercent(payload.progress || 0)
    };
    goals.push(goal);
    if (typeof saveCollection === 'function') saveCollection('lf_goals', goals);
    else writeStore('lf_goals', goals);
    return 'Goal created';
  }

  function createReminderFromAi(payload) {
    if (typeof reminders === 'undefined') return false;
    var reminder = {
      id: uniqueId(),
      title: String(payload.title || 'AI reminder').slice(0, 120),
      date: String(payload.date || todayKey()),
      time: String(payload.time || ''),
      priority: safeChoice(payload.priority || 'medium', ['low', 'medium', 'high'], 'medium'),
      done: false
    };
    reminders.push(reminder);
    if (typeof saveCollection === 'function') saveCollection('lf_reminders', reminders);
    else writeStore('lf_reminders', reminders);
    return 'Reminder created';
  }

  function createEventFromAi(payload) {
    if (typeof calEvents === 'undefined') return false;
    var event = {
      id: uniqueId(),
      name: String(payload.name || payload.title || 'AI event').slice(0, 120),
      date: String(payload.date || todayKey()),
      time: String(payload.time || ''),
      color: String(payload.color || '#5a8a6a')
    };
    calEvents.push(event);
    if (typeof saveCollection === 'function') saveCollection('lf_events', calEvents);
    else writeStore('lf_events', calEvents);
    return 'Event created';
  }

  function startFocusFromAi(payload) {
    var task = String(payload.task || payload.title || 'AI focus session').slice(0, 120);
    var minutes = Math.max(5, Math.min(90, Number(payload.minutes) || 25));
    if (typeof switchTo === 'function') switchTo('focus', $('nav-focus'));
    var input = $('timer-task');
    if (input) input.value = task;
    if (typeof setDuration === 'function') setDuration(minutes);
    return 'Focus prepared';
  }

  function setTodayFocusFromAi(payload) {
    var goal = String(payload.goal || payload.title || '').slice(0, 140);
    if (!goal) return false;
    if (typeof updateTodayFocusGoal === 'function') updateTodayFocusGoal(goal);
    else {
      var focus = readStore('lf_today_focus', {});
      focus.goal = goal;
      writeStore('lf_today_focus', focus);
    }
    return 'Today focus updated';
  }

  // ── Agent bridge functions ──────────────────────────────────────────────
  // These functions are called by executeToolCall() when the AI returns a
  // tool call. They write directly to the same global arrays and storage
  // keys used by app.js, then re-render the affected panels.

  function saveNoteFromAgent(title, body, type) {
    if (typeof notes === 'undefined') return;
    var note = {
      id: Date.now(),
      type: (['idea', 'recipe', 'schedule', 'list'].indexOf(type) >= 0 ? type : 'idea'),
      title: String(title || 'AI note').slice(0, 200),
      body: String(body || '').slice(0, 10000),
      date: todayKey()
    };
    notes.unshift(note);
    if (typeof saveCollection === 'function') saveCollection('lf_notes', notes);
    else writeStore('lf_notes', notes);
    if (typeof renderNotes === 'function') renderNotes();
    if (typeof refreshDash === 'function') refreshDash();
  }

  function saveGoalFromAgent(title, description, deadline) {
    if (typeof goals === 'undefined') return;
    var goal = {
      id: Date.now(),
      title: String(title || 'AI goal').slice(0, 100),
      desc: String(description || '').slice(0, 2000),
      category: 'personal',
      deadline: String(deadline || ''),
      progress: 0
    };
    goals.push(goal);
    if (typeof saveCollection === 'function') saveCollection('lf_goals', goals);
    else writeStore('lf_goals', goals);
    if (typeof renderGoals === 'function') renderGoals();
    if (typeof refreshDash === 'function') refreshDash();
  }

  function saveReminderFromAgent(title, date, priority) {
    if (typeof reminders === 'undefined') return;
    var reminder = {
      id: Date.now(),
      title: String(title || 'AI reminder').slice(0, 120),
      date: String(date || todayKey()),
      time: '',
      priority: (['low', 'medium', 'high'].indexOf(priority) >= 0 ? priority : 'medium'),
      done: false
    };
    reminders.push(reminder);
    if (typeof saveCollection === 'function') saveCollection('lf_reminders', reminders);
    else writeStore('lf_reminders', reminders);
    if (typeof renderReminders === 'function') renderReminders();
    if (typeof refreshDash === 'function') refreshDash();
  }

  function saveEventFromAgent(name, date, time) {
    if (typeof calEvents === 'undefined') return;
    var event = {
      id: Date.now(),
      name: String(name || 'AI event').slice(0, 120),
      date: String(date || todayKey()),
      time: String(time || ''),
      color: '#5a8a6a'
    };
    calEvents.push(event);
    if (typeof saveCollection === 'function') saveCollection('lf_events', calEvents);
    else writeStore('lf_events', calEvents);
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof refreshDash === 'function') refreshDash();
  }

  function startFocusFromAgent(task, minutes) {
    var taskStr = String(task || 'Focus session').slice(0, 120);
    var mins = Math.max(5, Math.min(90, Number(minutes) || 25));
    var nav = document.getElementById('nav-focus');
    if (typeof switchTo === 'function') switchTo('focus', nav);
    var taskInput = document.getElementById('timer-task');
    if (taskInput) taskInput.value = taskStr;
    var focusTab = document.getElementById('tab-focus');
    if (focusTab && typeof setMode === 'function') setMode('focus', focusTab);
    if (typeof setDuration === 'function') setDuration(mins);
  }

  function updateDailyPlanFromAgent(items) {
    if (!Array.isArray(items) || !items.length) return;
    var key = todayKey();
    // dailyPlan is a global variable in app.js; read from localStorage if not accessible
    var plan;
    if (typeof dailyPlan !== 'undefined') {
      plan = dailyPlan;
    } else {
      plan = readStore('lf_daily_plan', {});
    }
    plan[key] = items.slice(0, 6).map(function (item, index) {
      return {
        id: 'flow-agent-' + Date.now() + '-' + index,
        title: String(item.title || 'Plan item').slice(0, 120),
        duration: Math.max(5, Math.min(120, Number(item.duration) || 25)),
        done: false
      };
    });
    if (typeof dailyPlan !== 'undefined') {
      // update the global reference in app.js scope
      Object.keys(plan).forEach(function (k) { dailyPlan[k] = plan[k]; });
    }
    if (typeof saveCollection === 'function') saveCollection('lf_daily_plan', plan);
    else writeStore('lf_daily_plan', plan);
    if (typeof renderDailyFlow === 'function') renderDailyFlow();
  }

  // ── End agent bridge functions ──────────────────────────────────────────

  // ── Tool call dispatcher ────────────────────────────────────────────────

  /**
   * Renders a dismissible confirmation banner in the assistant sidebar.
   * The banner shows the tool name and a summary of what will be created.
   * "Apply" executes the call via onConfirm(); "Dismiss" removes the banner.
   *
   * @param {Object} call     - ToolCall { id, name, args, safe }
   * @param {Function} onConfirm - Called when the user clicks "Apply"
   */
  function renderConfirmBanner(call, onConfirm) {
    var container = document.getElementById('ai-priority-list') ||
                    document.querySelector('.assistant-panel') ||
                    document.querySelector('.assistant-sidebar');
    if (!container) return;

    // Build a human-readable summary of what will be created
    var args = call.args || {};
    var summaryMap = {
      create_note:         'Create note: "' + (args.title || '') + '"',
      create_goal:         'Create goal: "' + (args.title || '') + '"',
      create_reminder:     'Set reminder: "' + (args.title || '') + '" on ' + (args.date || ''),
      create_event:        'Add event: "' + (args.name || '') + '" on ' + (args.date || ''),
      start_focus_session: 'Start focus: "' + (args.task || '') + '" for ' + (args.minutes || 25) + ' min',
      update_daily_plan:   'Update daily plan (' + ((args.items || []).length) + ' items)'
    };
    var summary = summaryMap[call.name] || ('Run tool: ' + call.name);

    var banner = document.createElement('div');
    banner.className = 'ai-confirm-banner';
    banner.setAttribute('data-call-id', call.id || '');
    banner.style.cssText = [
      'background: var(--surface, #f5f5f5)',
      'border: 1px solid var(--border, #ddd)',
      'border-radius: 8px',
      'padding: 12px 14px',
      'margin: 8px 0',
      'display: flex',
      'flex-direction: column',
      'gap: 8px',
      'font-size: 0.875rem'
    ].join(';');

    var header = document.createElement('div');
    header.style.cssText = 'font-weight: 600; display: flex; align-items: center; gap: 6px;';
    header.textContent = '🤖 AI Action';

    var body = document.createElement('div');
    body.style.cssText = 'color: var(--text-secondary, #555);';
    body.textContent = summary;

    var actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 8px; margin-top: 4px;';

    var applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply';
    applyBtn.style.cssText = [
      'padding: 5px 14px',
      'border-radius: 6px',
      'border: none',
      'background: var(--accent, #5a8a6a)',
      'color: #fff',
      'cursor: pointer',
      'font-size: 0.8125rem'
    ].join(';');

    var dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.style.cssText = [
      'padding: 5px 14px',
      'border-radius: 6px',
      'border: 1px solid var(--border, #ddd)',
      'background: transparent',
      'cursor: pointer',
      'font-size: 0.8125rem'
    ].join(';');

    applyBtn.addEventListener('click', function () {
      onConfirm();
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });

    dismissBtn.addEventListener('click', function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    });

    actions.appendChild(applyBtn);
    actions.appendChild(dismissBtn);
    banner.appendChild(header);
    banner.appendChild(body);
    banner.appendChild(actions);

    // Prepend so the banner appears at the top of the priority list
    container.insertBefore(banner, container.firstChild);
  }

  /**
   * Dispatches a single ToolCall to the correct saveXFromAgent function.
   *
   * Behaviour:
   *   - call.safe === true              → execute immediately, show toast
   *   - call.safe === false + call.error → skip, show "data incomplete" toast
   *   - call.safe === false, no error   → render confirmation banner
   *
   * Never throws — all errors are caught and returned as { success: false }.
   *
   * @param  {Object} call  ToolCall { id, name, args, safe, error? }
   * @returns {{ success: boolean, message: string }}
   */
  function executeToolCall(call) {
    // Handle the "unsafe + error" case before the try/catch so we can return
    // early without attempting execution.
    if (call.safe === false && call.error) {
      if (typeof showToast === 'function') {
        showToast('AI suggested an action but the data was incomplete');
      }
      return { success: false, message: call.error };
    }

    // Handle the "unsafe, no error" case — show a confirmation banner and
    // defer execution until the user clicks "Apply".
    if (call.safe === false) {
      renderConfirmBanner(call, function () {
        executeToolCall(Object.assign({}, call, { safe: true }));
      });
      return { success: true, message: 'Awaiting confirmation' };
    }

    // safe === true: execute immediately
    try {
      var result;
      var args = call.args || {};

      switch (call.name) {
        case 'create_note':
          saveNoteFromAgent(args.title, args.body, args.type);
          result = { success: true, message: 'Note created: ' + (args.title || '') };
          break;

        case 'create_goal':
          saveGoalFromAgent(args.title, args.description, args.deadline);
          result = { success: true, message: 'Goal created: ' + (args.title || '') };
          break;

        case 'create_reminder':
          saveReminderFromAgent(args.title, args.date, args.priority);
          result = { success: true, message: 'Reminder set: ' + (args.title || '') };
          break;

        case 'create_event':
          saveEventFromAgent(args.name, args.date, args.time);
          result = { success: true, message: 'Event added: ' + (args.name || '') };
          break;

        case 'start_focus_session':
          startFocusFromAgent(args.task, args.minutes);
          result = { success: true, message: 'Focus started: ' + (args.task || '') };
          break;

        case 'update_daily_plan':
          updateDailyPlanFromAgent(args.items);
          result = { success: true, message: 'Daily plan updated' };
          break;

        default:
          return { success: false, message: 'Unknown tool: ' + call.name };
      }

      if (typeof showToast === 'function') showToast(result.message);
      return result;

    } catch (err) {
      return { success: false, message: 'Tool execution failed: ' + (err && err.message ? err.message : String(err)) };
    }
  }

  // ── End tool call dispatcher ────────────────────────────────────────────

  // ── Goal loop scheduler ─────────────────────────────────────────────────

  /**
   * Renders each Suggestion from a goal loop result as a dismissible card
   * in the assistant sidebar (#ai-priority-list). Cards are prepended so
   * they appear above the existing priority moves.
   *
   * @param {Object} result  LoopResult { suggestions: Suggestion[], safeDrafts: ToolCall[] }
   */
  function renderLoopBanner(result) {
    var suggestions = result && Array.isArray(result.suggestions) ? result.suggestions : [];
    if (!suggestions.length) return;

    var container = document.getElementById('ai-priority-list') ||
                    document.querySelector('.assistant-panel') ||
                    document.querySelector('.assistant-sidebar');
    if (!container) return;

    // Render in reverse so the first suggestion ends up at the top after prepending
    suggestions.slice().reverse().forEach(function (suggestion) {
      var card = document.createElement('div');
      card.className = 'ai-loop-banner';
      card.style.cssText = [
        'background: var(--surface, #f5f5f5)',
        'border: 1px solid var(--border, #ddd)',
        'border-radius: 8px',
        'padding: 10px 12px',
        'margin: 6px 0',
        'display: flex',
        'flex-direction: column',
        'gap: 4px',
        'font-size: 0.875rem',
        'position: relative'
      ].join(';');

      // Header row: icon + title + dismiss button
      var header = document.createElement('div');
      header.style.cssText = 'display: flex; align-items: center; gap: 6px; font-weight: 600;';

      if (suggestion.icon) {
        var iconEl = document.createElement('span');
        iconEl.style.cssText = 'font-size: 1rem; line-height: 1;';
        // Support both lucide icon names and emoji/text icons
        if (/^[a-z]/.test(suggestion.icon)) {
          iconEl.innerHTML = '<i data-lucide="' + escapeHtml(suggestion.icon) + '"></i>';
        } else {
          iconEl.textContent = suggestion.icon;
        }
        header.appendChild(iconEl);
      }

      var titleEl = document.createElement('span');
      titleEl.style.cssText = 'flex: 1;';
      titleEl.textContent = suggestion.title || '';
      header.appendChild(titleEl);

      var dismissBtn = document.createElement('button');
      dismissBtn.textContent = '×';
      dismissBtn.setAttribute('aria-label', 'Dismiss');
      dismissBtn.style.cssText = [
        'background: none',
        'border: none',
        'cursor: pointer',
        'font-size: 1.1rem',
        'line-height: 1',
        'padding: 0 2px',
        'color: var(--text-secondary, #888)',
        'margin-left: auto'
      ].join(';');
      dismissBtn.addEventListener('click', function () {
        if (card.parentNode) card.parentNode.removeChild(card);
      });
      header.appendChild(dismissBtn);

      card.appendChild(header);

      if (suggestion.body) {
        var bodyEl = document.createElement('div');
        bodyEl.style.cssText = 'color: var(--text-secondary, #555); font-size: 0.8125rem;';
        bodyEl.textContent = suggestion.body;
        card.appendChild(bodyEl);
      }

      container.insertBefore(card, container.firstChild);
    });

    // Re-run lucide icon rendering if available
    if (window.lucide) {
      window.lucide.createIcons({ attrs: { 'stroke-width': '1.75', width: '14', height: '14' } });
    }
  }

  /**
   * Calls POST /api/agent/loop with the current workspace snapshot.
   * Debounced: skips if a loop ran within the last 5 minutes.
   * Aborts after 10 seconds. Silently skips on abort or network error.
   */
  async function triggerGoalLoop() {
    // Debounce: skip if a loop ran within the last 5 minutes (300,000 ms)
    var lastLoopAt = readStore('lf_last_loop_at', 0);
    if (Date.now() - lastLoopAt < 300000) return;

    var ctx = snapshot();
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 10000);

    try {
      var response = await fetch('/api/agent/loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ context: ctx })
      });
      clearTimeout(timeout);

      if (!response.ok) return; // silently skip non-2xx

      var result = {};
      try { result = await response.json(); } catch (_) {}

      // Update debounce timestamp
      writeStore('lf_last_loop_at', Date.now());

      // Render suggestion cards
      renderLoopBanner(result);

      // Show confirmation banners for each safe draft
      var safeDrafts = Array.isArray(result.safeDrafts) ? result.safeDrafts : [];
      safeDrafts.forEach(function (call) {
        executeToolCall(call);
      });

    } catch (err) {
      clearTimeout(timeout);
      // AbortError: silently skip (no UI disruption)
      // Any other network error: also silently skip
    }
  }

  /**
   * Triggers the goal loop immediately on app open, then schedules it to
   * run every 30 minutes.
   */
  function scheduleGoalLoop() {
    triggerGoalLoop();
    setInterval(triggerGoalLoop, 30 * 60 * 1000);
  }

  // ── End goal loop scheduler ─────────────────────────────────────────────

  function executeAssistantActions(actions) {
    if (!Array.isArray(actions) || !actions.length) return [];
    var done = [];
    actions.forEach(function (action) {
      var type = action.type || action.name;
      var payload = action.payload || action.arguments || {};
      var result = false;
      if (type === 'create_note') result = createNoteFromAi(payload);
      if (type === 'create_goal') result = createGoalFromAi(payload);
      if (type === 'create_reminder') result = createReminderFromAi(payload);
      if (type === 'create_event') result = createEventFromAi(payload);
      if (type === 'start_focus_session') result = startFocusFromAi(payload);
      if (type === 'set_today_focus') result = setTodayFocusFromAi(payload);
      if (result) done.push(result);
    });
    if (done.length) {
      runRenderers();
      if (typeof showToast === 'function') showToast(done.join(' · '));
    }
    return done;
  }

  function tryLocalAction(prompt) {
    var lower = prompt.toLowerCase();
    var wantsCreate = /(create|add|make|write|set|scrie|fa |fă |pune|adauga|adaugă|seteaza|setează)/.test(lower);
    if (!wantsCreate) return null;

    if (/(note|noti|notă|notita|notiță|notite|notițe)/.test(lower)) {
      executeAssistantActions([{
        type: 'create_note',
        payload: {
          title: 'AI note',
          body: prompt.replace(/^(create|add|make|write|scrie|fa|fă|pune)\s+/i, ''),
          type: 'idea'
        }
      }]);
      return 'Am creat o notiță cu textul cerut. Pentru răspunsuri mai naturale și texte mai bune, pornește serverul AI cu cheia OpenAI.';
    }

    if (/(goal|obiectiv|scop|țel|tel)/.test(lower)) {
      executeAssistantActions([{
        type: 'create_goal',
        payload: { title: prompt.replace(/^(create|add|set|setează|seteaza|pune)\s+/i, '').slice(0, 100), category: 'personal' }
      }]);
      return 'Am creat goal-ul în Lifeflow. Cu backend-ul AI pornit, îl pot formula și împărți în pași automat.';
    }

    if (/(reminder|amintește|aminteste|remind)/.test(lower)) {
      executeAssistantActions([{
        type: 'create_reminder',
        payload: { title: prompt, date: todayKey(), priority: 'medium' }
      }]);
      return 'Am creat reminder-ul pentru azi. Dacă vrei date flexibile gen “mâine la 7”, pornește serverul AI.';
    }

    return null;
  }

  function saveMessages() {
    messages = messages.slice(-MAX_MESSAGES);
    writeStore(STORE_KEY, messages);
  }

  function starterMessage() {
    var ctx = snapshot();
    var next = choosePriority(ctx);
    return 'Hi ' + ctx.name + '. I checked your workspace. Your next clean move is ' + next.title + ' - ' + next.meta + '.';
  }

  function ensureStarter() {
    if (messages.length) return;
    messages = [{ role: 'assistant', text: starterMessage(), time: Date.now() }];
    saveMessages();
  }

  function renderMessage(msg) {
    var row = document.createElement('div');
    row.className = 'assistant-message ' + (msg.role === 'user' ? 'user' : 'assistant');
    var bubble = document.createElement('div');
    bubble.className = 'assistant-bubble';
    bubble.textContent = msg.text;
    row.appendChild(bubble);
    return row;
  }

  function renderContext(ctx) {
    var grid = $('ai-context-grid');
    var priority = $('ai-priority-list');
    if (grid) {
      var stats = [
        { icon: 'pencil-line', value: ctx.notes.length, label: 'Notes' },
        { icon: 'target', value: ctx.activeGoals.length, label: 'Goals' },
        { icon: 'bell', value: ctx.openReminders.length, label: 'Open' },
        { icon: 'timer', value: ctx.focusMinutes, label: 'Min today' }
      ];
      grid.innerHTML = stats.map(function (stat) {
        return '<div class="assistant-stat">' +
          '<div class="assistant-stat-icon"><i data-lucide="' + stat.icon + '"></i></div>' +
          '<div class="assistant-stat-value">' + stat.value + '</div>' +
          '<div class="assistant-stat-label">' + stat.label + '</div>' +
        '</div>';
      }).join('');
    }

    if (priority) {
      priority.innerHTML = nextMoves(ctx).map(function (move) {
        return '<div class="assistant-move">' +
          '<div class="assistant-move-icon"><i data-lucide="' + move.icon + '"></i></div>' +
          '<div><div class="assistant-move-title">' + escapeHtml(move.title) + '</div>' +
          '<div class="assistant-move-meta">' + escapeHtml(move.meta) + '</div></div>' +
        '</div>';
      }).join('');
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function renderAssistant() {
    var thread = $('ai-thread');
    if (!thread) return;
    ensureStarter();
    thread.innerHTML = '';
    messages.forEach(function (msg) { thread.appendChild(renderMessage(msg)); });
    renderContext(snapshot());
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': '1.75', width: '16', height: '16' } });
    requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });
  }

  function setBusy(on) {
    busy = on;
    var input = $('ai-input');
    var button = document.querySelector('.assistant-composer button');
    if (input) input.disabled = on;
    if (button) button.disabled = on;
  }

  window.openAssistant = function () {
    var nav = $('nav-assistant');
    if (typeof switchTo === 'function') switchTo('assistant', nav);
    renderAssistant();
    setTimeout(function () {
      var input = $('ai-input');
      if (input) input.focus();
    }, 80);
  };

  window.resizeAssistantInput = function (el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(140, el.scrollHeight) + 'px';
  };

  window.sendAssistantMessage = async function (event, presetText) {
    if (event && event.preventDefault) event.preventDefault();
    if (busy) return;
    var input = $('ai-input');
    var text = (presetText || (input ? input.value : '') || '').trim();
    if (!text) return;
    if (input) {
      input.value = '';
      window.resizeAssistantInput(input);
    }
    messages.push({ role: 'user', text: text, time: Date.now() });
    saveMessages();
    renderAssistant();
    setBusy(true);
    messages.push({ role: 'assistant', text: 'Thinking...', time: Date.now(), pending: true });
    renderAssistant();
    var reply = await assistantReply(text);
    messages = messages.filter(function (msg) { return !msg.pending; });
    messages.push({ role: 'assistant', text: reply, time: Date.now() });
    saveMessages();
    setBusy(false);
    renderAssistant();
  };

  window.askAssistantPreset = function (type) {
    var prompts = {
      plan: 'Plan my day from my current Lifeflow workspace.',
      focus: 'What should I focus on next?',
      summary: 'Summarize my workspace.',
      goals: 'Break down my active goals.',
      reminders: 'Scan my reminders.'
    };
    window.sendAssistantMessage(null, prompts[type] || prompts.plan);
  };

  window.clearAssistantChat = function () {
    messages = [];
    writeStore(STORE_KEY, messages);
    renderAssistant();
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderAssistant();
    if (window.LIFEFLOW_AI_REMOTE !== false) {
      scheduleGoalLoop();
    }
  });
})();
