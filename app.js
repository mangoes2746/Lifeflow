/* ==========================================================================
   LIFEFLOW — app.js
   Your Inner Workspace
   ==========================================================================

   TABLE OF CONTENTS
   -----------------
   1.  State & localStorage helpers
   2.  Constants  (colors, months, days)
   3.  Navigation
   4.  Toast notifications
   5.  Dashboard  (refreshDash)
   6.  Notes      (renderNotes, openNoteModal, saveNote, deleteNote …)
   7.  Calendar   (renderCalendar, openCalModal, saveCalEvent …)
   8.  Goals      (renderGoals, openGoalModal, saveGoal …)
   9.  Focus      (Pomodoro timer, sessions)
   10. Reminders  (renderReminders, saveReminder, toggleReminder …)
   11. Overlay close on backdrop click
   12. Init       (called on page load)
   13. Auth_Module  (Firebase Authentication)
   14. Sync_Module  (Firestore cloud persistence)
   ========================================================================== */

// ══════════════════════════════════════════════
//  STATE — localStorage backed
// ══════════════════════════════════════════════
const load = (k,d) => { try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch{return d;} };
const save = (k,v) => { try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} };

let notes     = load('lf_notes',[]);
let calEvents = load('lf_events',[]);
let goals     = load('lf_goals',[]);
let reminders = load('lf_reminders',[]);
let focusSessions = load('lf_sessions',[]);
let weeklyFocus   = load('lf_weekly',{});
let dailyPlan     = load('lf_daily_plan',{});
let moods         = load('lf_moods',{});
let dailyTasks    = load('lf_daily_tasks',{});
let habits        = load('lf_habits',{});
let todayFocus    = load('lf_today_focus',{});
let lifeflowLocalMode = load('lf_local_mode',false);
let _explicitSignOut = false;
let todayFocusTick = null;

const CAL_COLORS = ['#5a8a6a','#c2714f','#4a6fa5','#9b5de5','#b8860b','#c94040'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const _todayForCal = new Date();
let calYear=_todayForCal.getFullYear(), calMonth=_todayForCal.getMonth(), calSelColor=CAL_COLORS[0], calEditId=null;
let noteFilter='all', noteSearch='', editNoteId=null, editGoalId=null, editRemId=null;
let commandOpen=false, commandActiveIndex=0, commandResults=[];
let socialFriends = [];

// Exposed so gamification.js can remove a friend from the shared list immediately
window._removeSocialFriend = function(uid) {
  socialFriends = socialFriends.filter(f => f.uid !== uid);
  if(typeof renderPrivateChat === 'function') renderPrivateChat();
  if(typeof renderFriendsPanel === 'function') renderFriendsPanel();
};
let incomingFriendRequests = [];
let outgoingFriendRequests = [];
let activeChatFriendUid = '';
let activeChatMessages = [];
let conversationMap = {};
let blockedByMe = [];
let blockedMe = [];
let unreadChatCount = 0;
let _chatUnsub = {
  friends: null,
  incoming: null,
  outgoing: null,
  messages: null,
  conversations: null,
  blocksByMe: null,
  blocksMe: null,
};

const NOTE_TYPES = ['idea','recipe','schedule','list'];
const REM_PRIORITIES = ['low','medium','high'];
const MOOD_OPTIONS = [
  {key:'great', label:'Great', icon:'sun', score:5},
  {key:'good', label:'Good', icon:'smile', score:4},
  {key:'okay', label:'Okay', icon:'meh', score:3},
  {key:'low', label:'Low', icon:'cloud-rain', score:2},
  {key:'stressed', label:'Stressed', icon:'zap', score:1},
];
const HABIT_OPTIONS = [
  {key:'water', label:'Water', icon:'droplets'},
  {key:'workout', label:'Workout', icon:'dumbbell'},
  {key:'reading', label:'Reading', icon:'book-open'},
  {key:'study', label:'Study', icon:'graduation-cap'},
  {key:'sleep', label:'Sleep', icon:'moon'},
];
const QUOTES = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'Small steps every day lead to big results.', author: '' },
  { text: "You don't have to be great to start, but you have to start to be great.", author: 'Zig Ziglar' },
  { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
  { text: "It always seems impossible until it's done.", author: 'Nelson Mandela' },
];

function escapeHTML(value){
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);
}

function getDateKey(date=new Date()){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey){
  return new Date((dateKey||getDateKey())+'T00:00:00');
}

function addDays(dateKey, amount){
  const d=parseDateKey(dateKey);
  d.setDate(d.getDate()+amount);
  return getDateKey(d);
}

function daysBetween(a,b){
  return Math.round((parseDateKey(a)-parseDateKey(b))/86400000);
}

function formatDateLabel(dateKey, opts={month:'short',day:'numeric'}){
  return parseDateKey(dateKey).toLocaleDateString('en-US',opts);
}

function compareDateTime(a,b){
  return (a.date||'').localeCompare(b.date||'') || (a.time||'').localeCompare(b.time||'');
}

function clampPercent(value){
  const n=parseInt(value,10);
  if(!Number.isFinite(n)) return 0;
  return Math.max(0,Math.min(100,n));
}

function safeColor(value, fallback=CAL_COLORS[0]){
  return /^#[0-9a-f]{3,8}$/i.test(String(value||'')) ? value : fallback;
}

// ══════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════
function switchTo(id, el){
  const panel=document.getElementById('panel-'+id);
  if(!panel) return;
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  panel.classList.add('active');
  if(el) el.classList.add('active');
  document.getElementById('main-scroll').scrollTop=0;
  if(id==='calendar') renderCalendar();
  if(id==='dashboard') refreshDash();
  if(id==='chat') renderPrivateChat();
  if(id==='friends') renderFriendsPanel();
  refreshUnreadChatBadge();
}

function getCurrentUser(){
  return window._firebaseAuth && window._firebaseAuth.currentUser;
}

function makePairKey(a,b){
  return [String(a||''),String(b||'')].sort().join('__');
}

function unsubscribeChatListeners(){
  Object.keys(_chatUnsub).forEach(key=>{
    if(typeof _chatUnsub[key] === 'function'){
      _chatUnsub[key]();
    }
    _chatUnsub[key] = null;
  });
}

function privateChatAvailable(){
  return !lifeflowLocalMode && !window.firebaseUnavailable && !!window._firebaseDb && !!getCurrentUser();
}

function isBlockedEitherWay(friendUid){
  const me = getCurrentUser();
  if(!me || !friendUid) return false;
  return blockedByMe.some(b=>b.blockedUid===friendUid) || blockedMe.some(b=>b.blockerUid===friendUid);
}

function getConversationForFriend(friendUid){
  const me = getCurrentUser();
  if(!me || !friendUid) return null;
  return conversationMap[makePairKey(me.uid, friendUid)] || null;
}

function formatChatTimestamp(ms){
  if(!ms) return '';
  const d = new Date(ms);
  const today = getDateKey();
  const ds = getDateKey(d);
  if(ds === today) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  return d.toLocaleDateString([], {month:'short', day:'numeric'});
}

function refreshUnreadChatBadge(){
  const badge = document.getElementById('chat-badge');
  if(!badge) return;
  const navChat = document.getElementById('nav-chat');
  const isOpen = !!(navChat && navChat.classList.contains('active'));
  const value = isOpen ? 0 : unreadChatCount;
  badge.textContent = String(value);
  badge.style.display = value>0 ? '' : 'none';
}

// ══════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════
function showToast(msg){
  const t=document.getElementById('toast');
  if(!t) return;
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2400);
}

// ══════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════
function refreshDash(){
  const now=new Date();
  const greetings=['Good morning','Good afternoon','Good evening'];
  const hr=now.getHours();
  const g=hr<12?greetings[0]:hr<18?greetings[1]:greetings[2];
  const name=document.getElementById('user-name-display').textContent;
  document.getElementById('dash-greeting').textContent=`${g}, ${name}`;
  const opts={weekday:'long',month:'long',day:'numeric'};
  document.getElementById('dash-date-label').textContent=now.toLocaleDateString('en-US',opts).toUpperCase();

  // stats
  const todayStr=getDateKey(now);
  const upcomingEvts=calEvents.filter(e=>e.date>=todayStr);
  const focusByDate = {};
  for(const session of focusSessions){
    const key = session.date || '';
    if(!key) continue;
    if(!focusByDate[key]) focusByDate[key] = { mins:0, sessions:0 };
    focusByDate[key].mins += Number(session.duration || 0);
    focusByDate[key].sessions += 1;
  }
  document.getElementById('stat-notes').textContent=notes.length;
  document.getElementById('stat-goals').textContent=goals.length;
  document.getElementById('stat-events').textContent=upcomingEvts.length;
  document.getElementById('notes-badge').textContent=notes.length;

  // focus today
  const todayStats=focusByDate[todayStr]||{mins:0,sessions:0};
  const todayMins=todayStats.mins;
  document.getElementById('stat-focus').innerHTML=todayMins+'<span class="stat-unit">min</span>';
  document.getElementById('stat-focus-sessions').textContent=todayStats.sessions+' sessions';

  // mini chart (last 7 days)
  const chart=document.getElementById('mini-chart');
  const chartLabels=document.getElementById('mini-chart-labels');
  chart.innerHTML=''; chartLabels.innerHTML='';
  let totalWeek=0, totalSessions=0;
  const bars=[];
  for(let i=6;i>=0;i--){
    const d=new Date(now); d.setDate(d.getDate()-i);
    const ds=getDateKey(d);
    const dayStats=focusByDate[ds]||{mins:0,sessions:0};
    const mins=dayStats.mins;
    const sess=dayStats.sessions;
    totalWeek+=mins; totalSessions+=sess;
    bars.push({mins,ds,label:DAYS[d.getDay()].slice(0,3)});
  }
  document.getElementById('weekly-focus-total').textContent=totalWeek+' min';
  document.getElementById('sessions-count-label').textContent=totalSessions+' sessions';
  const max=Math.max(...bars.map(b=>b.mins),1);
  bars.forEach(b=>{
    const wrap=document.createElement('div'); wrap.className='chart-bar-wrap';
    const bar=document.createElement('div'); bar.className='chart-bar'+(b.mins>0?' filled':'');
    bar.style.height=Math.max((b.mins/max)*60,4)+'px';
    bar.title=b.mins+'min';
    const label=document.createElement('div'); label.className='chart-label'; label.textContent=b.label;
    wrap.appendChild(bar); wrap.appendChild(label);
    chart.appendChild(wrap);
  });

  // upcoming reminders on dash
  const upRem=reminders.filter(r=>!r.done).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  const dashUp=document.getElementById('dash-upcoming');
  if(!upRem.length){ dashUp.innerHTML='<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">No upcoming reminders.</div>'; }
  else{
    dashUp.innerHTML=upRem.map(r=>{
      const pColor={high:'#c94040',medium:'#b8860b',low:'#5a8a6a'}[r.priority]||'#5a8a6a';
      const label=formatDateLabel(r.date);
      return `<div class="upcoming-item">
        <div class="upcoming-dot" style="background:${pColor}"></div>
        <div><div class="upcoming-name">${escapeHTML(r.title)}</div><div class="upcoming-when">${escapeHTML(label)}${r.time?' &middot; '+escapeHTML(r.time):''}</div></div>
      </div>`;
    }).join('');
  }

  // goals preview
  const dashGoals=document.getElementById('dash-goals-preview');
  if(!goals.length){ dashGoals.innerHTML='<div style="font-size:13px;color:var(--text-muted);">No goals yet.</div>'; }
  else{
    dashGoals.innerHTML=goals.slice(0,3).map(g=>{
      const progress=clampPercent(g.progress);
      return `
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="flex:1;">
          <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <span style="font-size:13.5px;color:var(--text-primary);">${escapeHTML(g.title)}</span>
            <span style="font-size:12px;color:var(--accent);font-weight:600;">${progress}%</span>
          </div>
          <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${progress}%"></div></div>
        </div>
      </div>
    `}).join('');
  }

  // reminders badge
  const pending=reminders.filter(r=>!r.done).length;
  const badge=document.getElementById('rem-badge');
  badge.textContent=pending;
  badge.style.display=pending>0?'':'none';
  renderDailyFlow();
  renderMoodTracker();
  renderTodayFocus();
  renderHabitTracker();
  renderDailyChecklist();
  renderAchievements();
  renderProgressGraphs();
  renderGlobalSearch(document.getElementById('global-search')?.value||'');
}

function setQuote(index=Math.floor(Math.random()*QUOTES.length)){
  const q=QUOTES[index%QUOTES.length];
  const qText=document.getElementById('quote-text');
  const qAuthor=document.getElementById('quote-author');
  if(qText) qText.textContent=q.text;
  if(qAuthor) qAuthor.textContent=q.author?'— '+q.author:'';
}

function refreshQuote(){
  const current=document.getElementById('quote-text')?.textContent||'';
  const pool=QUOTES.filter(q=>q.text!==current);
  const q=pool[Math.floor(Math.random()*pool.length)]||QUOTES[0];
  setQuote(QUOTES.indexOf(q));
  showToast('Fresh quote loaded');
}

function ensureTodayFocus(){
  const today=getDateKey();
  if(!todayFocus||todayFocus.date!==today){
    todayFocus={
      date:today,
      goal:'',
      progress:0,
      seconds:0,
      running:false,
      startedAt:null,
    };
    saveCollection('lf_today_focus',todayFocus);
  }
  todayFocus.progress=clampPercent(todayFocus.progress);
  todayFocus.seconds=Math.max(0,Number(todayFocus.seconds)||0);
  return todayFocus;
}

function getTodayFocusSeconds(){
  const focus=ensureTodayFocus();
  let seconds=focus.seconds;
  if(focus.running&&focus.startedAt){
    seconds+=Math.max(0,Math.floor((Date.now()-focus.startedAt)/1000));
  }
  return seconds;
}

function formatFocusTime(seconds){
  const mins=Math.floor(seconds/60);
  if(mins<60) return mins+' min';
  const hours=Math.floor(mins/60);
  const rest=mins%60;
  return rest?`${hours}h ${rest}m`:`${hours}h`;
}

function renderTodayFocus(){
  const focus=ensureTodayFocus();
  const input=document.getElementById('today-focus-goal');
  const fill=document.getElementById('today-focus-progress-fill');
  const label=document.getElementById('today-focus-progress-label');
  const time=document.getElementById('today-focus-time');
  const start=document.getElementById('today-focus-start');
  if(!input||!fill||!label||!time||!start) return;

  if(document.activeElement!==input) input.value=focus.goal||'';
  fill.style.width=focus.progress+'%';
  label.textContent=focus.progress+'%';
  time.textContent=formatFocusTime(getTodayFocusSeconds());
  start.classList.toggle('running',!!focus.running);
  start.innerHTML=focus.running?'<i data-lucide="pause"></i> Pause Focus':'<i data-lucide="play"></i> Start Focus';
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function updateTodayFocusGoal(value){
  const focus=ensureTodayFocus();
  focus.goal=value.trimStart();
  saveCollection('lf_today_focus',focus);
}

function persistTodayFocusTimer(){
  const focus=ensureTodayFocus();
  if(focus.running&&focus.startedAt){
    focus.seconds=getTodayFocusSeconds();
    focus.startedAt=Date.now();
    saveCollection('lf_today_focus',focus);
  }
}

function startTodayFocusInterval(){
  if(todayFocusTick) clearInterval(todayFocusTick);
  todayFocusTick=setInterval(()=>{
    renderTodayFocus();
    const focus=ensureTodayFocus();
    if(focus.running) save('lf_today_focus',focus);
  },1000);
}

function toggleTodayFocusTimer(){
  const focus=ensureTodayFocus();
  if(focus.running){
    focus.seconds=getTodayFocusSeconds();
    focus.running=false;
    focus.startedAt=null;
    saveCollection('lf_today_focus',focus);
    showToast('Focus paused');
  } else {
    focus.running=true;
    focus.startedAt=Date.now();
    saveCollection('lf_today_focus',focus);
    showToast('Focus started');
  }
  renderTodayFocus();
}

function increaseTodayFocusProgress(amount=10){
  const focus=ensureTodayFocus();
  focus.progress=clampPercent((Number(focus.progress)||0)+amount);
  saveCollection('lf_today_focus',focus);
  renderTodayFocus();
}

function resetTodayFocus(){
  todayFocus={
    date:getDateKey(),
    goal:'',
    progress:0,
    seconds:0,
    running:false,
    startedAt:null,
  };
  saveCollection('lf_today_focus',todayFocus);
  renderTodayFocus();
  showToast("Today's focus reset");
}

function renderMoodTracker(){
  const options=document.getElementById('mood-options');
  const history=document.getElementById('mood-history');
  const label=document.getElementById('mood-today-label');
  if(!options||!history) return;
  const today=getDateKey();
  const selected=moods[today]?.key;
  if(label) label.textContent=selected?(MOOD_OPTIONS.find(m=>m.key===selected)?.label||'Today'):'Today';
  options.innerHTML=MOOD_OPTIONS.map(m=>`
    <button class="mood-option${selected===m.key?' active':''}" onclick="saveMood('${m.key}')">
      <i data-lucide="${m.icon}"></i>
      <span>${m.label}</span>
    </button>
  `).join('');
  const bars=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=getDateKey(d);
    const score=moods[key]?.score||0;
    bars.push({label:DAYS[d.getDay()].slice(0,1),score});
  }
  history.innerHTML=bars.map(b=>`
    <div class="mood-bar-wrap">
      <div class="mood-bar" style="height:${Math.max(6,b.score*12)}px;opacity:${b.score?1:.28}"></div>
      <span>${b.label}</span>
    </div>
  `).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function saveMood(key){
  const mood=MOOD_OPTIONS.find(m=>m.key===key);
  if(!mood) return;
  moods[getDateKey()]={key:mood.key,label:mood.label,score:mood.score,date:getDateKey()};
  saveCollection('lf_moods',moods);
  renderMoodTracker();
  showToast('Mood saved: '+mood.label);
}

function renderHabitTracker(){
  const grid=document.getElementById('habit-grid');
  const label=document.getElementById('habit-progress-label');
  if(!grid) return;
  const today=getDateKey();
  const day=habits[today]||{};
  const done=HABIT_OPTIONS.filter(h=>day[h.key]).length;
  if(label) label.textContent=`${done}/${HABIT_OPTIONS.length}`;
  grid.innerHTML=HABIT_OPTIONS.map(h=>`
    <button class="habit-pill${day[h.key]?' done':''}" onclick="toggleHabit('${h.key}')">
      <i data-lucide="${h.icon}"></i>
      <span>${h.label}</span>
    </button>
  `).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function toggleHabit(key){
  if(!HABIT_OPTIONS.some(h=>h.key===key)) return;
  const today=getDateKey();
  habits[today]=habits[today]||{};
  habits[today][key]=!habits[today][key];
  saveCollection('lf_habits',habits);
  renderHabitTracker();
}

function getDefaultDailyTasks(){
  const plan=getDailyPlan(false);
  return (plan.length?plan.slice(0,3):[
    {title:'Pick one priority'},
    {title:'Do one focus session'},
    {title:'Capture one useful note'},
  ]).slice(0,3).map((item,index)=>({
    id:'task-'+Date.now()+'-'+index,
    text:item.title||'Daily task',
    done:false,
  }));
}

function ensureDailyChecklist(){
  const today=getDateKey();
  if(!Array.isArray(dailyTasks[today])||!dailyTasks[today].length){
    dailyTasks[today]=getDefaultDailyTasks();
    saveCollection('lf_daily_tasks',dailyTasks);
  }
  while(dailyTasks[today].length<3){
    dailyTasks[today].push({id:'task-'+Date.now()+'-'+dailyTasks[today].length,text:'Add a small win',done:false});
  }
  dailyTasks[today]=dailyTasks[today].slice(0,3);
  return dailyTasks[today];
}

function renderDailyChecklist(){
  const out=document.getElementById('daily-checklist');
  const label=document.getElementById('checklist-progress-label');
  if(!out) return;
  const tasks=ensureDailyChecklist();
  const done=tasks.filter(t=>t.done).length;
  if(label) label.textContent=`${done}/3 done`;
  out.innerHTML=tasks.map(task=>`
    <div class="checklist-item${task.done?' done':''}">
      <button class="checklist-check" onclick="toggleDailyTask('${task.id}')" aria-label="Toggle task"><i data-lucide="check"></i></button>
      <input value="${escapeHTML(task.text)}" onchange="updateDailyTask('${task.id}',this.value)" maxlength="72"/>
    </div>
  `).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function toggleDailyTask(id){
  const tasks=ensureDailyChecklist();
  const task=tasks.find(t=>t.id===id);
  if(!task) return;
  task.done=!task.done;
  saveCollection('lf_daily_tasks',dailyTasks);
  renderDailyChecklist();
  renderAchievements();
}

function updateDailyTask(id,text){
  const task=ensureDailyChecklist().find(t=>t.id===id);
  if(!task) return;
  task.text=text.trim()||'Daily task';
  saveCollection('lf_daily_tasks',dailyTasks);
  renderDailyChecklist();
}

function resetDailyChecklistFromPlan(){
  dailyTasks[getDateKey()]=getDefaultDailyTasks();
  saveCollection('lf_daily_tasks',dailyTasks);
  renderDailyChecklist();
  showToast('Checklist rebuilt from your plan');
}

function getFocusStreak(){
  const activeDays=new Set(focusSessions.map(s=>s.date));
  let streak=0;
  for(let i=0;i<30;i++){
    const d=new Date(); d.setDate(d.getDate()-i);
    if(activeDays.has(getDateKey(d))) streak++;
    else if(i>0) break;
  }
  return streak;
}

function getAchievementData(){
  const totalFocus=focusSessions.reduce((sum,s)=>sum+(Number(s.duration)||0),0);
  const completedGoals=goals.filter(g=>clampPercent(g.progress)>=100).length;
  const checklistDone=(dailyTasks[getDateKey()]||[]).filter(t=>t.done).length;
  const streak=getFocusStreak();
  return [
    {key:'first-note',title:'First note',meta:'Create one note',icon:'file-text',unlocked:notes.length>0},
    {key:'first-goal',title:'First goal',meta:'Create one goal',icon:'target',unlocked:goals.length>0},
    {key:'goal-complete',title:'Goal finisher',meta:'Complete a goal',icon:'trophy',unlocked:completedGoals>0},
    {key:'focus-100',title:'100 focus minutes',meta:`${Math.min(totalFocus,100)}/100 min`,icon:'timer',unlocked:totalFocus>=100},
    {key:'streak-3',title:'3-day streak',meta:`${Math.min(streak,3)}/3 days`,icon:'flame',unlocked:streak>=3},
    {key:'streak-7',title:'7-day streak',meta:`${Math.min(streak,7)}/7 days`,icon:'medal',unlocked:streak>=7},
    {key:'checklist',title:'Daily trio',meta:`${checklistDone}/3 done today`,icon:'list-checks',unlocked:checklistDone>=3},
    {key:'mood',title:'Self-aware',meta:'Log a mood',icon:'heart',unlocked:!!moods[getDateKey()]},
  ];
}

function renderAchievements(){
  const grid=document.getElementById('achievement-grid');
  const label=document.getElementById('achievement-count-label');
  if(!grid) return;
  const data=getAchievementData();
  const unlocked=data.filter(a=>a.unlocked).length;
  if(label) label.textContent=`${unlocked} unlocked`;
  grid.innerHTML=data.map(a=>`
    <div class="achievement-badge${a.unlocked?' unlocked':''}">
      <span><i data-lucide="${a.icon}"></i></span>
      <div>
        <div class="achievement-title">${escapeHTML(a.title)}</div>
        <div class="achievement-meta">${escapeHTML(a.meta)}</div>
      </div>
    </div>
  `).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function getLast7Metrics(){
  const days=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const key=getDateKey(d);
    days.push({
      key,
      label:DAYS[d.getDay()].slice(0,1),
      focus:focusSessions.filter(s=>s.date===key).reduce((a,s)=>a+(Number(s.duration)||0),0),
      notes:notes.filter(n=>n.date===d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})).length,
      habits:HABIT_OPTIONS.filter(h=>habits[key]?.[h.key]).length,
    });
  }
  return days;
}

function renderSparkline(values,max){
  return values.map(v=>`<span style="height:${Math.max(7,(v/Math.max(max,1))*48)}px"></span>`).join('');
}

function renderProgressGraphs(){
  const out=document.getElementById('progress-graphs');
  if(!out) return;
  const metrics=getLast7Metrics();
  const focus=metrics.map(m=>m.focus);
  const noteVals=metrics.map(m=>m.notes);
  const habitVals=metrics.map(m=>m.habits);
  const completedGoals=goals.filter(g=>clampPercent(g.progress)>=100).length;
  out.innerHTML=`
    <div class="progress-graph">
      <div><strong>${focus.reduce((a,b)=>a+b,0)} min</strong><span>Focus minutes</span></div>
      <div class="sparkline">${renderSparkline(focus,Math.max(...focus,1))}</div>
    </div>
    <div class="progress-graph">
      <div><strong>${completedGoals}/${goals.length}</strong><span>Goals completed</span></div>
      <div class="sparkline">${renderSparkline(habitVals,5)}</div>
    </div>
    <div class="progress-graph">
      <div><strong>${noteVals.reduce((a,b)=>a+b,0)}</strong><span>Notes written</span></div>
      <div class="sparkline">${renderSparkline(noteVals,Math.max(...noteVals,1))}</div>
    </div>
  `;
}

function getGlobalSearchItems(){
  const items=[];
  notes.forEach(n=>items.push({type:'Note',icon:'file-text',title:n.title||'Untitled note',meta:n.body||n.date||'',action:()=>openNoteEdit(Number(n.id))}));
  goals.forEach(g=>items.push({type:'Goal',icon:'target',title:g.title||'Untitled goal',meta:g.desc||`${clampPercent(g.progress)}% complete`,action:()=>openGoalEdit(Number(g.id))}));
  reminders.forEach(r=>items.push({type:'Reminder',icon:'bell',title:r.title||'Untitled reminder',meta:formatDateLabel(r.date||getDateKey())+(r.time?' at '+r.time:''),action:()=>openReminderEdit(Number(r.id))}));
  calEvents.forEach(ev=>items.push({type:'Event',icon:'calendar-days',title:ev.name||'Calendar event',meta:formatDateLabel(ev.date||getDateKey())+(ev.time?' at '+ev.time:''),action:()=>openCalModal(ev.date,Number(ev.id))}));
  return items;
}

function runGlobalSearch(index){
  const item=window._globalSearchResults?.[index];
  if(item) item.action();
}

function renderGlobalSearch(query=''){
  const out=document.getElementById('global-search-results');
  if(!out) return;
  const q=query.trim().toLowerCase();
  if(!q){ out.innerHTML=''; window._globalSearchResults=[]; return; }
  const results=getGlobalSearchItems().filter(item=>[item.type,item.title,item.meta].join(' ').toLowerCase().includes(q)).slice(0,6);
  window._globalSearchResults=results;
  if(!results.length){
    out.innerHTML='<div class="global-search-empty">No matches yet.</div>';
    return;
  }
  out.innerHTML=results.map((item,index)=>`
    <button class="global-search-result" onclick="runGlobalSearch(${index})">
      <span><i data-lucide="${item.icon}"></i></span>
      <div>
        <strong>${escapeHTML(item.title)}</strong>
        <small>${escapeHTML(item.type)} - ${escapeHTML(item.meta)}</small>
      </div>
    </button>
  `).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

// ══════════════════════════════════════════════
//  TODAY'S FLOW
// ══════════════════════════════════════════════
function hashString(value){
  let hash=0;
  const str=String(value);
  for(let i=0;i<str.length;i++){
    hash=((hash<<5)-hash)+str.charCodeAt(i);
    hash|=0;
  }
  return Math.abs(hash);
}

function planSignature(item){
  return `${item.sourceType}:${item.sourceId}:${item.title}`;
}

function buildDailyPlanItems(previous=[]){
  const today=getDateKey();
  const previousBySig=new Map(previous.map(item=>[item.signature||planSignature(item),item]));
  const candidates=[];
  const pushCandidate=item=>{
    const signature=planSignature(item);
    const existing=previousBySig.get(signature);
    candidates.push({
      id:'flow-'+hashString(signature),
      signature,
      sourceType:item.sourceType,
      sourceId:item.sourceId,
      title:item.title,
      meta:item.meta,
      duration:item.duration,
      tone:item.tone,
      score:item.score,
      done:existing?!!existing.done:false,
    });
  };

  reminders.filter(r=>!r.done).forEach(r=>{
    const date=r.date||today;
    const delta=daysBetween(date,today);
    if(delta>7) return;
    const priority=REM_PRIORITIES.includes(r.priority)?r.priority:'medium';
    const priorityScore={high:36,medium:20,low:8}[priority];
    const dueScore=delta<0?70:delta===0?48:Math.max(4,34-delta*5);
    const dueText=delta<0?`${Math.abs(delta)}d overdue`:delta===0?'Due today':delta===1?'Due tomorrow':`Due ${formatDateLabel(date)}`;
    pushCandidate({
      sourceType:'reminder',
      sourceId:r.id,
      title:r.title||'Untitled reminder',
      meta:dueText+(r.time?' at '+r.time:''),
      duration:priority==='high'?35:25,
      tone:priority,
      score:120+priorityScore+dueScore,
    });
  });

  calEvents.forEach(ev=>{
    const delta=daysBetween(ev.date,today);
    if(delta<0||delta>3) return;
    const when=delta===0?'Today':delta===1?'Tomorrow':formatDateLabel(ev.date,{weekday:'short',month:'short',day:'numeric'});
    pushCandidate({
      sourceType:'event',
      sourceId:ev.id,
      title:ev.name||'Calendar event',
      meta:when+(ev.time?' at '+ev.time:''),
      duration:25,
      tone:'event',
      score:delta===0?150:120-delta*15,
    });
  });

  goals.filter(g=>clampPercent(g.progress)<100).forEach(g=>{
    const progress=clampPercent(g.progress);
    const hasDeadline=!!g.deadline;
    const delta=hasDeadline?daysBetween(g.deadline,today):30;
    if(hasDeadline&&delta>30) return;
    const deadlineScore=hasDeadline?(delta<0?55:delta<=3?46:Math.max(8,38-delta)):12;
    const progressScore=Math.round((100-progress)/5);
    const category=GOAL_CATS[g.category]?g.category:'personal';
    pushCandidate({
      sourceType:'goal',
      sourceId:g.id,
      title:g.title||'Move a goal forward',
      meta:(category.charAt(0).toUpperCase()+category.slice(1))+(hasDeadline?' by '+formatDateLabel(g.deadline):' goal'),
      duration:progress<35?45:25,
      tone:'goal',
      score:90+deadlineScore+progressScore,
    });
  });

  if(!candidates.length){
    [
      {title:"Clarify today's top priority",meta:'Set the direction before the day fills up',duration:15,score:80},
      {title:'Capture one useful note',meta:'Turn a loose thought into something reusable',duration:10,score:70},
      {title:'Protect a focus block',meta:'A short session keeps the streak alive',duration:25,score:60},
    ].forEach((item,i)=>pushCandidate({
      sourceType:'ritual',
      sourceId:'seed-'+i,
      tone:'ritual',
      ...item,
    }));
  }

  return candidates
    .sort((a,b)=>b.score-a.score)
    .slice(0,4)
    .map((item,index)=>({...item,rank:index+1}));
}

function getDailyPlan(force=false){
  const today=getDateKey();
  const existing=Array.isArray(dailyPlan[today])?dailyPlan[today]:[];
  const authOverlay=document.getElementById('overlay-auth');
  if(authOverlay&&authOverlay.classList.contains('open')&&!window.firebaseUnavailable){
    return buildDailyPlanItems(existing);
  }
  if(force||!existing.length){
    dailyPlan[today]=buildDailyPlanItems(existing);
    saveCollection('lf_daily_plan',dailyPlan);
  }
  return dailyPlan[today];
}

function rebuildDailyPlan(){
  getDailyPlan(true);
  dailyTasks[getDateKey()]=getDefaultDailyTasks();
  saveCollection('lf_daily_tasks',dailyTasks);
  renderDailyFlow();
  renderDailyChecklist();
  showToast("Today's flow refreshed");
}

function renderDailyFlow(){
  const list=document.getElementById('flow-plan-list');
  if(!list) return;
  const titleEl=document.getElementById('flow-focus-title');
  const metaEl=document.getElementById('flow-focus-meta');
  const scoreEl=document.getElementById('flow-score-label');
  const plan=getDailyPlan(false);
  const open=plan.filter(item=>!item.done);
  const primary=open[0]||plan[0];
  const doneCount=plan.length-open.length;

  if(scoreEl) scoreEl.textContent=`${doneCount}/${plan.length} done`;
  if(titleEl) titleEl.textContent=primary?primary.title:'Your flow is clear';
  if(metaEl) metaEl.textContent=primary?`${primary.meta} - ${primary.duration} min`:'Nothing is pressing right now.';

  const icons={reminder:'bell',event:'calendar-days',goal:'target',ritual:'sparkles'};
  list.innerHTML=plan.map(item=>{
    const icon=icons[item.sourceType]||'circle';
    return `<div class="flow-item${item.done?' done':''}">
      <button class="flow-check" onclick="toggleDailyPlanItem('${item.id}')" aria-label="Toggle flow item"><i data-lucide="check"></i></button>
      <button class="flow-item-main" onclick="startPlanItem('${item.id}')">
        <span class="flow-item-icon"><i data-lucide="${icon}"></i></span>
        <span class="flow-item-copy">
          <span class="flow-item-title">${escapeHTML(item.title)}</span>
          <span class="flow-item-meta">${escapeHTML(item.meta)}</span>
        </span>
      </button>
      <span class="flow-duration">${escapeHTML(item.duration)}m</span>
    </div>`;
  }).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function findDailyPlanItem(id){
  return getDailyPlan(false).find(item=>item.id===id);
}

function toggleDailyPlanItem(id){
  const item=findDailyPlanItem(id);
  if(!item) return;
  item.done=!item.done;
  saveCollection('lf_daily_plan',dailyPlan);
  renderDailyFlow();
}

function startPlanItem(id){
  const item=findDailyPlanItem(id);
  if(!item) return;
  const nav=document.getElementById('nav-focus');
  switchTo('focus',nav);
  if(timerRunning){
    showToast('Focus timer is already running');
    return;
  }
  const task=document.getElementById('timer-task');
  if(task) task.value=item.title;
  const focusTab=document.getElementById('tab-focus');
  if(focusTab) setMode('focus',focusTab);
  const duration=Math.max(5,Math.min(90,Math.round((item.duration||25)/5)*5));
  setDuration(duration);
  showToast('Focus loaded: '+duration+' min');
}

function startFlowFocus(){
  const plan=getDailyPlan(false);
  const item=plan.find(x=>!x.done)||plan[0];
  if(!item){
    rebuildDailyPlan();
    return;
  }
  startPlanItem(item.id);
}

// ══════════════════════════════════════════════
//  COMMAND PALETTE
// ══════════════════════════════════════════════
function navCommand(key,label,icon){
  return {
    label,
    meta:'Go to '+label,
    type:'Navigate',
    icon,
    action:()=>switchTo(key,document.getElementById('nav-'+key)),
  };
}

function getCommandItems(){
  const items=[
    navCommand('dashboard','Dashboard','layout-dashboard'),
    navCommand('assistant','Assistant','bot'),
    navCommand('notes','Notes','pencil-line'),
    navCommand('calendar','Calendar','calendar-days'),
    navCommand('goals','Goals','target'),
    navCommand('focus','Focus','timer'),
    navCommand('reminders','Reminders','bell'),
    navCommand('settings','Settings','settings'),
    {label:'New note',meta:'Capture a thought',type:'Create',icon:'pencil-line',action:openNoteModal},
    {label:'New goal',meta:'Start a goal',type:'Create',icon:'target',action:openGoalModal},
    {label:'Add event',meta:'Put time on the calendar',type:'Create',icon:'calendar-plus',action:()=>openCalModal(null)},
    {label:'New reminder',meta:'Track something due',type:'Create',icon:'bell-plus',action:openReminderModal},
    {label:'Ask AI assistant',meta:'Plan, summarize, or choose the next focus',type:'Assist',icon:'bot',action:()=>openAssistant()},
    {label:'Start today flow',meta:'Load the next planned focus block',type:'Focus',icon:'play',action:startFlowFocus},
  ];

  getDailyPlan(false).forEach(item=>{
    items.push({
      label:item.title,
      meta:item.meta,
      type:'Today',
      icon:item.sourceType==='goal'?'target':item.sourceType==='event'?'calendar-days':item.sourceType==='reminder'?'bell':'sparkles',
      action:()=>startPlanItem(item.id),
    });
  });

  notes.forEach(n=>{
    const id=Number(n.id);
    if(!Number.isFinite(id)) return;
    items.push({
      label:n.title||'Untitled note',
      meta:(n.type||'note')+' note',
      type:'Note',
      icon:'file-text',
      action:()=>openNoteEdit(id),
    });
  });

  goals.forEach(g=>{
    const id=Number(g.id);
    if(!Number.isFinite(id)) return;
    items.push({
      label:g.title||'Untitled goal',
      meta:clampPercent(g.progress)+'% complete',
      type:'Goal',
      icon:'target',
      action:()=>openGoalEdit(id),
    });
  });

  reminders.forEach(r=>{
    const id=Number(r.id);
    if(!Number.isFinite(id)) return;
    items.push({
      label:r.title||'Untitled reminder',
      meta:(r.done?'Done':'Pending')+' - '+formatDateLabel(r.date||getDateKey()),
      type:'Reminder',
      icon:'bell',
      action:()=>openReminderEdit(id),
    });
  });

  calEvents.forEach(ev=>{
    const id=Number(ev.id);
    if(!Number.isFinite(id)) return;
    items.push({
      label:ev.name||'Calendar event',
      meta:formatDateLabel(ev.date||getDateKey())+(ev.time?' at '+ev.time:''),
      type:'Event',
      icon:'calendar-days',
      action:()=>openCalModal(ev.date,id),
    });
  });

  return items;
}

function openCommandPalette(seed=''){
  const palette=document.getElementById('command-palette');
  const input=document.getElementById('command-input');
  if(!palette||!input) return;
  const authOverlay=document.getElementById('overlay-auth');
  if(authOverlay&&authOverlay.classList.contains('open')) return;
  commandOpen=true;
  commandActiveIndex=0;
  palette.classList.add('open');
  palette.setAttribute('aria-hidden','false');
  input.value=seed;
  renderCommandResults();
  setTimeout(()=>input.focus(),20);
}

function closeCommandPalette(){
  const palette=document.getElementById('command-palette');
  if(!palette) return;
  commandOpen=false;
  palette.classList.remove('open');
  palette.setAttribute('aria-hidden','true');
}

function renderCommandResults(){
  if(!commandOpen) return;
  const input=document.getElementById('command-input');
  const out=document.getElementById('command-results');
  if(!input||!out) return;
  const query=input.value.trim().toLowerCase();
  const items=getCommandItems();
  commandResults=items
    .filter(item=>{
      if(!query) return true;
      const hay=[item.label,item.meta,item.type].join(' ').toLowerCase();
      return hay.includes(query);
    })
    .slice(0,18);
  if(commandActiveIndex>=commandResults.length) commandActiveIndex=Math.max(0,commandResults.length-1);
  out.innerHTML='';
  if(!commandResults.length){
    const empty=document.createElement('div');
    empty.className='command-empty';
    empty.textContent='No matches';
    out.appendChild(empty);
    return;
  }
  commandResults.forEach((item,index)=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='command-result'+(index===commandActiveIndex?' active':'');
    btn.addEventListener('mouseenter',()=>{commandActiveIndex=index; renderCommandResults();});
    btn.addEventListener('click',()=>runCommand(index));

    const icon=document.createElement('span');
    icon.className='command-result-icon';
    icon.innerHTML=`<i data-lucide="${item.icon}"></i>`;

    const copy=document.createElement('span');
    copy.className='command-result-copy';
    const label=document.createElement('span');
    label.className='command-result-label';
    label.textContent=item.label;
    const meta=document.createElement('span');
    meta.className='command-result-meta';
    meta.textContent=item.meta;
    copy.appendChild(label);
    copy.appendChild(meta);

    const type=document.createElement('span');
    type.className='command-result-type';
    type.textContent=item.type;

    btn.appendChild(icon);
    btn.appendChild(copy);
    btn.appendChild(type);
    out.appendChild(btn);
  });
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function runCommand(index=commandActiveIndex){
  const item=commandResults[index];
  if(!item) return;
  closeCommandPalette();
  item.action();
}

function closeTopLayer(){
  const openOverlay=[...document.querySelectorAll('.overlay.open')]
    .reverse()
    .find(o=>o.id!=='overlay-auth');
  if(openOverlay){
    openOverlay.classList.remove('open');
    return true;
  }
  if(fabOpen){
    closeFab();
    return true;
  }
  return false;
}

document.addEventListener('keydown',e=>{
  const isCommand=(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k';
  if(isCommand){
    e.preventDefault();
    commandOpen?closeCommandPalette():openCommandPalette();
    return;
  }
  if(e.key==='Escape'&&!commandOpen){
    if(closeTopLayer()) e.preventDefault();
    return;
  }
  if(!commandOpen) return;
  if(e.key==='Escape'){
    e.preventDefault();
    closeCommandPalette();
  } else if(e.key==='ArrowDown'){
    e.preventDefault();
    if(!commandResults.length) return;
    commandActiveIndex=Math.min(commandActiveIndex+1,commandResults.length-1);
    renderCommandResults();
  } else if(e.key==='ArrowUp'){
    e.preventDefault();
    if(!commandResults.length) return;
    commandActiveIndex=Math.max(commandActiveIndex-1,0);
    renderCommandResults();
  } else if(e.key==='Enter'){
    e.preventDefault();
    runCommand();
  }
});

document.addEventListener('input',e=>{
  if(e.target&&e.target.id==='command-input'){
    commandActiveIndex=0;
    renderCommandResults();
  }
});

document.addEventListener('click',e=>{
  if(commandOpen&&e.target&&e.target.id==='command-palette'){
    closeCommandPalette();
  }
});

// ══════════════════════════════════════════════
//  NOTES
// ══════════════════════════════════════════════
function filterNotes(f,btn){
  noteFilter=NOTE_TYPES.includes(f)||f==='all'?f:'all'; document.getElementById('note-search').value=''; noteSearch='';
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  renderNotes();
}

function searchNotes(val){ noteSearch=val; renderNotes(); }

function renderNotes(){
  const grid=document.getElementById('notes-grid');
  const empty=document.getElementById('empty-notes');
  let filtered=noteFilter==='all'?notes:notes.filter(n=>n.type===noteFilter);
  if(noteSearch) filtered=filtered.filter(n=>(n.title||'').toLowerCase().includes(noteSearch.toLowerCase())||(n.body||'').toLowerCase().includes(noteSearch.toLowerCase()));
  grid.innerHTML='';
  if(!filtered.length){
    empty.innerHTML=notes.length
      ? '<div class="empty-action-card"><div class="empty-icon"><i data-lucide="search"></i></div><div class="empty-text">No notes match that search.</div></div>'
      : '<button class="empty-action-card" onclick="openNoteModal()"><div class="empty-icon"><i data-lucide="pencil-line"></i></div><div class="empty-title">Create your first note</div><div class="empty-text">Capture a thought, recipe, schedule, or list.</div></button>';
    empty.style.display='';
    if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
    return;
  }
  empty.style.display='none';
  const labels={idea:'Idea',recipe:'Recipe',schedule:'Schedule',list:'List'};
  filtered.forEach(n=>{
    const id=Number(n.id);
    if(!Number.isFinite(id)) return;
    const type=NOTE_TYPES.includes(n.type)?n.type:'idea';
    const c=document.createElement('div'); c.className='note-card';
    c.innerHTML=`<button class="note-del" onclick="deleteNote(${id},event)" aria-label="Delete note"><i data-lucide="trash-2"></i></button>
      <div class="note-tag tag-${type}">${labels[type]}</div>
      <div class="note-title">${escapeHTML(n.title||'Untitled')}</div>
      <div class="note-preview">${escapeHTML(n.body||'')}</div>
      <div class="note-date">${escapeHTML(n.date||'')}</div>`;
    c.addEventListener('click',()=>openNoteEdit(id));
    grid.appendChild(c);
  });
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  document.getElementById('notes-badge').textContent=notes.length;
}

function openNoteModal(){
  editNoteId=null;
  document.getElementById('note-modal-title').textContent='New note';
  document.getElementById('note-title').value='';
  document.getElementById('note-body').value='';
  document.getElementById('note-type').value='idea';
  document.getElementById('overlay-note').classList.add('open');
  setTimeout(()=>document.getElementById('note-title').focus(),150);
}

function openNoteEdit(id){
  const n=notes.find(x=>x.id===id); if(!n) return;
  editNoteId=id;
  document.getElementById('note-modal-title').textContent='Edit note';
  document.getElementById('note-type').value=n.type;
  document.getElementById('note-title').value=n.title;
  document.getElementById('note-body').value=n.body;
  document.getElementById('overlay-note').classList.add('open');
}

function closeNoteModal(){ document.getElementById('overlay-note').classList.remove('open'); }

function saveNote(){
  const title=document.getElementById('note-title').value.trim()||'Untitled';
  const body=document.getElementById('note-body').value.trim();
  const pickedType=document.getElementById('note-type').value;
  const type=NOTE_TYPES.includes(pickedType)?pickedType:'idea';
  const date=new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  if(editNoteId){ const n=notes.find(x=>x.id===editNoteId); n.title=title;n.body=body;n.type=type;n.date=date; }
  else { notes.unshift({id:Date.now(),type,title,body,date}); }
  saveCollection('lf_notes',notes);
  closeNoteModal(); renderNotes(); refreshDash(); renderCommandResults();
  showToast(editNoteId?'Note updated ✓':'Note saved ✓');
}

function deleteNote(id,e){
  e.stopPropagation();
  notes=notes.filter(n=>n.id!==id);
  saveCollection('lf_notes',notes); renderNotes(); refreshDash(); renderCommandResults();
  showToast('Note deleted');
}

// ══════════════════════════════════════════════
//  CALENDAR
// ══════════════════════════════════════════════
function changeMonth(d){ calMonth+=d; if(calMonth>11){calMonth=0;calYear++;}else if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); }
function goToday(){ const t=new Date(); calYear=t.getFullYear(); calMonth=t.getMonth(); renderCalendar(); }

function renderCalendar(){
  document.getElementById('cal-month-label').textContent=MONTHS[calMonth]+' '+calYear;
  const head=document.getElementById('cal-head');
  head.innerHTML=DAYS.map(d=>`<div class="cal-head-cell">${d}</div>`).join('');
  const body=document.getElementById('cal-body');
  body.innerHTML='';
  const first=new Date(calYear,calMonth,1).getDay();
  const total=new Date(calYear,calMonth+1,0).getDate();
  const prevTotal=new Date(calYear,calMonth,0).getDate();
  const today=new Date();
  const rows=Math.ceil((first+total)/7);
  let count=0;
  for(let r=0;r<rows;r++){
    for(let d=0;d<7;d++){
      count++;
      const cell=document.createElement('div'); cell.className='cal-day';
      let dayNum,om=false,y=calYear,m=calMonth;
      if(count<=first){dayNum=prevTotal-first+count;om=true;m=calMonth-1;if(m<0){m=11;y--;}}
      else if(count-first>total){dayNum=count-first-total;om=true;m=calMonth+1;if(m>11){m=0;y++;}}
      else{dayNum=count-first;}
      if(om) cell.classList.add('other-month');
      const isToday=!om&&dayNum===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
      if(isToday) cell.classList.add('today');
      const numEl=document.createElement('div'); numEl.className='day-num'; numEl.textContent=dayNum;
      cell.appendChild(numEl);
      const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
      calEvents.filter(e=>e.date===dateStr).slice(0,2).forEach(ev=>{
        const color=safeColor(ev.color);
        const pill=document.createElement('div'); pill.className='cal-event-pill';
        pill.style.background=color+'22'; pill.style.color=color;
        pill.textContent=(ev.time?ev.time+' ':'')+ev.name;
        pill.addEventListener('click',e=>{e.stopPropagation();openCalModal(dateStr,ev.id);});
        cell.appendChild(pill);
      });
      cell.addEventListener('click',()=>openCalModal(dateStr));
      body.appendChild(cell);
    }
  }
  renderEventList();
}

function renderEventList(){
  const list=document.getElementById('event-list');
  const now=getDateKey();
  const up=calEvents.filter(e=>e.date>=now).sort(compareDateTime).slice(0,8);
  if(!up.length){list.innerHTML='<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">No upcoming events.</div>';return;}
  list.innerHTML=up.map(ev=>{
    const id=Number(ev.id);
    if(!Number.isFinite(id)) return '';
    const color=safeColor(ev.color);
    const label=formatDateLabel(ev.date,{weekday:'short',month:'short',day:'numeric'});
    return `<div class="event-item">
      <div class="event-color-bar" style="background:${color}"></div>
      <div class="event-info"><div class="event-name">${escapeHTML(ev.name)}</div><div class="event-time-label">${escapeHTML(label)}${ev.time?' &middot; '+escapeHTML(ev.time):''}</div></div>
      <button class="event-del-btn" onclick="deleteCalEvent(${id})" aria-label="Delete event"><i data-lucide="trash-2"></i></button>
    </div>`;
  }).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function openCalModal(dateStr,editId){
  calEditId=editId||null;
  document.getElementById('cal-modal-title').textContent=editId?'Edit event':'Add event';
  const ev=editId?calEvents.find(e=>e.id===editId):null;
  document.getElementById('cal-name').value=ev?ev.name:'';
  document.getElementById('cal-date').value=ev?ev.date:(dateStr||getDateKey());
  document.getElementById('cal-time').value=ev?ev.time||'':'';
  calSelColor=ev?ev.color:CAL_COLORS[0];
  renderColorRow('cal-colors',CAL_COLORS);
  document.getElementById('overlay-cal').classList.add('open');
}

function renderColorRow(id,colors){
  document.getElementById(id).innerHTML=colors.map(c=>`<div class="color-dot${c===calSelColor?' sel':''}" style="background:${c}" onclick="pickCalColor('${c}','${id}')"></div>`).join('');
}

function pickCalColor(c,rowId){ calSelColor=c; renderColorRow(rowId,CAL_COLORS); }
function closeCalModal(){ document.getElementById('overlay-cal').classList.remove('open'); }

function saveCalEvent(){
  const name=document.getElementById('cal-name').value.trim();
  const date=document.getElementById('cal-date').value;
  const time=document.getElementById('cal-time').value;
  if(!name||!date) return;
  const color=safeColor(calSelColor);
  if(calEditId){ const ev=calEvents.find(e=>e.id===calEditId); ev.name=name;ev.date=date;ev.time=time;ev.color=color; }
  else{ calEvents.push({id:Date.now(),name,date,time,color}); }
  saveCollection('lf_events',calEvents);
  closeCalModal(); renderCalendar(); refreshDash(); renderCommandResults();
  showToast(calEditId?'Event updated ✓':'Event added ✓');
}

function deleteCalEvent(id){
  calEvents=calEvents.filter(e=>e.id!==id);
  saveCollection('lf_events',calEvents); renderCalendar(); refreshDash(); renderCommandResults();
  showToast('Event deleted');
}

// ══════════════════════════════════════════════
//  GOALS
// ══════════════════════════════════════════════
const GOAL_CATS={
  health:  {emoji:'🏃', color:'#5a8a6a', bg:'#e8f2ec',  darkBg:'rgba(90,138,106,0.15)'},
  learning:{emoji:'📚', color:'#4a6fa5', bg:'#e8eef8',  darkBg:'rgba(74,111,165,0.15)'},
  career:  {emoji:'💼', color:'#b8860b', bg:'#fdf6e3',  darkBg:'rgba(184,134,11,0.15)'},
  personal:{emoji:'✨', color:'#9b5de5', bg:'#f0e8fc',  darkBg:'rgba(155,93,229,0.15)'},
  finance: {emoji:'💰', color:'#5a8a6a', bg:'#e8f2ec',  darkBg:'rgba(90,138,106,0.15)'},
  creative:{emoji:'🎨', color:'#c2714f', bg:'#f0e0d6',  darkBg:'rgba(194,113,79,0.15)'},
};

function renderGoals(){
  const grid=document.getElementById('goals-grid');
  const empty=document.getElementById('empty-goals');
  if(!goals.length){
    grid.innerHTML='';
    empty.innerHTML='<button class="empty-action-card" onclick="openGoalModal()"><div class="empty-icon"><i data-lucide="target"></i></div><div class="empty-title">Set your first goal</div><div class="empty-text">Give your next ambition a shape and a deadline.</div></button>';
    empty.style.display='';
    if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
    return;
  }
  empty.style.display='none';
  const isDark = ['dark','neon','forest','ocean','rose'].includes(document.body.getAttribute('data-theme'));
  grid.innerHTML=goals.map(g=>{
    const id=Number(g.id);
    if(!Number.isFinite(id)) return '';
    const category=GOAL_CATS[g.category]?g.category:'personal';
    const cat=GOAL_CATS[category];
    const catBg = isDark ? cat.darkBg : cat.bg;
    const progress=clampPercent(g.progress);
    const dl=g.deadline?formatDateLabel(g.deadline,{month:'short',day:'numeric',year:'numeric'}):'No deadline';
    return `<div class="goal-card" onclick="openGoalEdit(${id})">
      <div class="goal-header">
        <span class="goal-icon">${cat.emoji}</span>
        <button class="goal-menu" onclick="deleteGoal(${id},event)" aria-label="Delete goal"><i data-lucide="trash-2"></i></button>
      </div>
      <div class="goal-category" style="background:${catBg};color:${cat.color};">${category.charAt(0).toUpperCase()+category.slice(1)}</div>
      <div class="goal-title">${escapeHTML(g.title)}</div>
      <div class="goal-desc">${escapeHTML(g.desc||'')}</div>
      <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${progress}%;background:${cat.color};"></div></div>
      <div class="goal-progress-row">
        <span class="goal-pct" style="color:${cat.color};">${progress}%</span>
        <span class="goal-deadline">${escapeHTML(dl)}</span>
      </div>
    </div>`;
  }).join('');
  if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function openGoalModal(){
  editGoalId=null;
  document.getElementById('goal-modal-title').textContent='New goal';
  document.getElementById('goal-title').value='';
  document.getElementById('goal-desc').value='';
  document.getElementById('goal-category').value='health';
  document.getElementById('goal-deadline').value='';
  document.getElementById('goal-progress').value=0;
  document.getElementById('goal-pct-label').textContent='0%';
  document.getElementById('overlay-goal').classList.add('open');
}

function openGoalEdit(id){
  const g=goals.find(x=>x.id===id); if(!g) return;
  editGoalId=id;
  document.getElementById('goal-modal-title').textContent='Edit goal';
  document.getElementById('goal-title').value=g.title;
  document.getElementById('goal-desc').value=g.desc;
  document.getElementById('goal-category').value=g.category;
  document.getElementById('goal-deadline').value=g.deadline||'';
  document.getElementById('goal-progress').value=g.progress;
  document.getElementById('goal-pct-label').textContent=g.progress+'%';
  document.getElementById('overlay-goal').classList.add('open');
}

function closeGoalModal(){ document.getElementById('overlay-goal').classList.remove('open'); }

function saveGoal(){
  const title=document.getElementById('goal-title').value.trim(); if(!title) return;
  const desc=document.getElementById('goal-desc').value.trim();
  const pickedCategory=document.getElementById('goal-category').value;
  const category=GOAL_CATS[pickedCategory]?pickedCategory:'personal';
  const deadline=document.getElementById('goal-deadline').value;
  const progress=clampPercent(document.getElementById('goal-progress').value);
  if(editGoalId){ const g=goals.find(x=>x.id===editGoalId); g.title=title;g.desc=desc;g.category=category;g.deadline=deadline;g.progress=progress; }
  else{ goals.push({id:Date.now(),title,desc,category,deadline,progress}); }
  saveCollection('lf_goals',goals);
  closeGoalModal(); renderGoals(); refreshDash(); renderCommandResults();
  showToast(editGoalId?'Goal updated ✓':'Goal saved ✓');
}

function deleteGoal(id,e){
  e.stopPropagation();
  goals=goals.filter(g=>g.id!==id);
  saveCollection('lf_goals',goals); renderGoals(); refreshDash(); renderCommandResults();
  showToast('Goal removed');
}

// ══════════════════════════════════════════════
//  FOCUS / POMODORO
// ══════════════════════════════════════════════
const MODES={focus:25,short:5,long:15};
let focusMode='focus', timerDuration=25, timerLeft=25*60, timerRunning=false, timerInterval=null;
const circumference=2*Math.PI*126; // r=126

function setMode(m,btn){
  if(timerRunning) return;
  focusMode=m;
  document.querySelectorAll('.focus-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  timerDuration=MODES[m];
  timerLeft=timerDuration*60;
  document.getElementById('duration-slider').value=timerDuration;
  document.getElementById('duration-label').textContent=timerDuration+' minutes';
  updateTimerDisplay(); updateRing(0);
}

function setDuration(v){
  if(timerRunning) return;
  timerDuration=parseInt(v); timerLeft=timerDuration*60;
  document.getElementById('duration-label').textContent=v+' minutes';
  updateTimerDisplay(); updateRing(0);
}

function updateTimerDisplay(){
  const m=Math.floor(timerLeft/60), s=timerLeft%60;
  document.getElementById('timer-display').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

function updateRing(elapsed){
  const total=timerDuration*60;
  const pct=total>0?elapsed/total:0;
  const offset=circumference*(1-pct);
  document.getElementById('ring-fill').style.strokeDasharray=circumference;
  document.getElementById('ring-fill').style.strokeDashoffset=offset;
}

function toggleTimer(){
  if(timerRunning){ pauseTimer(); }
  else{ startTimer(); }
}

function startTimer(){
  timerRunning=true;
  if(typeof Notification!=='undefined'&&Notification.permission==='default'){
    Notification.requestPermission().catch(()=>{});
  }
  const btn=document.getElementById('btn-start');
  btn.innerHTML='<i data-lucide="pause"></i> Pause'; btn.classList.add('running');
  lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  document.getElementById('duration-slider').disabled=true;
  timerInterval=setInterval(()=>{
    timerLeft--;
    const elapsed=timerDuration*60-timerLeft;
    updateTimerDisplay(); updateRing(elapsed);
    if(timerLeft<=0){ completeSession(); }
  },1000);
}

function pauseTimer(){
  timerRunning=false;
  clearInterval(timerInterval);
  const btn=document.getElementById('btn-start');
  btn.innerHTML='<i data-lucide="play"></i> Resume'; btn.classList.remove('running');
  lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
}

function resetTimer(){
  clearInterval(timerInterval); timerRunning=false;
  timerLeft=timerDuration*60;
  const btn=document.getElementById('btn-start');
  btn.innerHTML='<i data-lucide="play"></i> Start'; btn.classList.remove('running');
  lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  document.getElementById('duration-slider').disabled=false;
  updateTimerDisplay(); updateRing(0);
}

function completeSession(){
  clearInterval(timerInterval); timerRunning=false;
  const btn=document.getElementById('btn-start');
  btn.innerHTML='<i data-lucide="play"></i> Start'; btn.classList.remove('running');
  lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  document.getElementById('duration-slider').disabled=false;

  const task=document.getElementById('timer-task').value.trim()||'Focus session';
  const todayStr=getDateKey();
  const session={
    id:Date.now(),
    task,
    duration:timerDuration,
    date:todayStr,
    time:new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})
  };
  focusSessions.unshift(session);
  if(focusSessions.length>50) focusSessions.length=50;
  saveCollection('lf_sessions',focusSessions);

  timerLeft=timerDuration*60; updateTimerDisplay(); updateRing(0);
  renderSessions(); refreshDash(); renderCommandResults();
  showToast('🎉 Session complete! '+timerDuration+' min logged.');
  playFocusChime();

  if(typeof Notification!=='undefined'&&Notification.permission==='granted'){
    new Notification('Lifeflow — Session complete!',{body:timerDuration+'min of "'+task+'" done. Take a break!'});
  }
}

function playFocusChime(){
  if(window._timerSoundEnabled===false) return;
  try{
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext) return;
    const ctx=new AudioContext();
    [660,880,990].forEach((freq,i)=>{
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.type='sine';
      osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001,ctx.currentTime+i*0.12);
      gain.gain.exponentialRampToValueAtTime(0.11,ctx.currentTime+i*0.12+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+i*0.12+0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime+i*0.12);
      osc.stop(ctx.currentTime+i*0.12+0.24);
    });
    setTimeout(()=>ctx.close(),900);
  }catch{}
}

function renderSessions(){
  const list=document.getElementById('sessions-list');
  const empty=document.getElementById('empty-sessions');
  const today=getDateKey();
  const todaySess=focusSessions.filter(s=>s.date===today);
  if(!todaySess.length){list.innerHTML='';empty.style.display='';return;}
  empty.style.display='none';
  list.innerHTML=todaySess.map(s=>`
    <div class="session-item">
      <span style="font-size:18px;">⏱</span>
      <span class="session-task">${escapeHTML(s.task)}</span>
      <span class="session-duration">${escapeHTML(s.duration)}min</span>
      <span class="session-time">${escapeHTML(s.time)}</span>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════
//  REMINDERS
// ══════════════════════════════════════════════
function renderReminders(){
  const list=document.getElementById('reminders-list');
  const empty=document.getElementById('empty-reminders');
  const sorted=[...reminders].sort(compareDateTime);
  const pColors={high:'#c94040',medium:'#b8860b',low:'#5a8a6a'};

  // sidebar stats
  const total=reminders.length;
  const done=reminders.filter(r=>r.done).length;
  document.getElementById('rem-total').textContent=total;
  document.getElementById('rem-done-count').textContent=done;
  document.getElementById('rem-pending').textContent=total-done;

  if(!sorted.length){
    list.innerHTML='';
    empty.innerHTML='<button class="empty-action-card" onclick="openReminderModal()"><div class="empty-icon"><i data-lucide="bell-plus"></i></div><div class="empty-title">Set your first reminder</div><div class="empty-text">Put one small promise where Lifeflow can keep it visible.</div></button>';
    empty.style.display='';
    if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  } else {
    empty.style.display='none';
    const today=getDateKey();
    list.innerHTML=sorted.map(r=>{
      const id=Number(r.id);
      if(!Number.isFinite(id)) return '';
      const priority=REM_PRIORITIES.includes(r.priority)?r.priority:'medium';
      const label=formatDateLabel(r.date,{weekday:'short',month:'short',day:'numeric'});
      const delta=daysBetween(r.date,today);
      const urgency=delta<0?' overdue':delta===0?' today':'';
      const dueText=delta<0?`${Math.abs(delta)}d overdue`:delta===0?'Today':label;
      return `<div class="reminder-item${urgency}" onclick="openReminderEdit(${id})">
      <div class="reminder-check${r.done?' done':''}" onclick="toggleReminder(${id},event)" aria-label="Toggle reminder"><i data-lucide="check"></i></div>
      <div class="reminder-info">
        <div class="reminder-title${r.done?' done':''}">${escapeHTML(r.title)}</div>
        <div class="reminder-when">
          <div class="reminder-priority" style="background:${pColors[priority]}"></div>
          ${escapeHTML(dueText)}${r.time?' &middot; '+escapeHTML(r.time):''}
        </div>
      </div>
      <button class="reminder-del" onclick="deleteReminder(${id},event)" aria-label="Delete reminder"><i data-lucide="trash-2"></i></button>
    </div>`;
    }).join('');
    if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  }

  // today
  const today=getDateKey();
  const todayRem=reminders.filter(r=>r.date===today&&!r.done);
  const todayList=document.getElementById('rem-today-list');
  if(!todayRem.length){ todayList.innerHTML='<div style="font-size:12px;color:var(--text-muted);">Nothing due today.</div>'; }
  else{
    todayList.innerHTML=todayRem.map(r=>`<div style="font-size:13px;color:var(--text-primary);padding:6px 0;border-bottom:1px solid var(--border);">${escapeHTML(r.title)}</div>`).join('');
  }

  // badge
  const pending=reminders.filter(r=>!r.done).length;
  const badge=document.getElementById('rem-badge');
  badge.textContent=pending;
  badge.style.display=pending>0?'':'none';
  renderDailyFlow();
  renderCommandResults();
}

function toggleReminder(id,e){
  if(e) e.stopPropagation();
  const r=reminders.find(x=>x.id===id); if(!r) return;
  r.done=!r.done;
  saveCollection('lf_reminders',reminders); renderReminders(); refreshDash();
}

function openReminderModal(){
  editRemId=null;
  document.getElementById('rem-modal-title').textContent='New reminder';
  document.getElementById('rem-title').value='';
  document.getElementById('rem-date').value=getDateKey();
  document.getElementById('rem-time').value='';
  document.getElementById('rem-priority').value='medium';
  document.getElementById('overlay-reminder').classList.add('open');
}

function openReminderEdit(id){
  const r=reminders.find(x=>x.id===id); if(!r) return;
  editRemId=id;
  document.getElementById('rem-modal-title').textContent='Edit reminder';
  document.getElementById('rem-title').value=r.title;
  document.getElementById('rem-date').value=r.date||getDateKey();
  document.getElementById('rem-time').value=r.time||'';
  document.getElementById('rem-priority').value=REM_PRIORITIES.includes(r.priority)?r.priority:'medium';
  document.getElementById('overlay-reminder').classList.add('open');
}

function closeRemModal(){ document.getElementById('overlay-reminder').classList.remove('open'); }

function saveReminder(){
  const title=document.getElementById('rem-title').value.trim(); if(!title) return;
  const date=document.getElementById('rem-date').value;
  const time=document.getElementById('rem-time').value;
  const pickedPriority=document.getElementById('rem-priority').value;
  const priority=REM_PRIORITIES.includes(pickedPriority)?pickedPriority:'medium';
  if(editRemId){ const r=reminders.find(x=>x.id===editRemId); r.title=title;r.date=date;r.time=time;r.priority=priority; }
  else{ reminders.push({id:Date.now(),title,date,time,priority,done:false}); }
  saveCollection('lf_reminders',reminders);
  closeRemModal(); renderReminders(); refreshDash(); renderCommandResults();
  showToast(editRemId?'Reminder updated ✓':'Reminder saved ✓');
}

function deleteReminder(id,e){
  if(e) e.stopPropagation();
  reminders=reminders.filter(r=>r.id!==id);
  saveCollection('lf_reminders',reminders); renderReminders(); refreshDash(); renderCommandResults();
  showToast('Reminder deleted');
}

// ══════════════════════════════════════════════
//  PRIVATE_CHAT_MODULE — Friends + direct messages
// ══════════════════════════════════════════════
function renderPrivateChat(){
  const friendsList = document.getElementById('friends-list');
  const incomingList = document.getElementById('incoming-requests-list');
  const outgoingList = document.getElementById('outgoing-requests-list');
  const thread = document.getElementById('chat-thread');
  const threadHead = document.getElementById('chat-thread-head');
  const addStatus = document.getElementById('chat-add-status');

  if(!friendsList || !incomingList || !outgoingList || !thread || !threadHead) return;

  /* Show the user's game tag in the chat panel */
  const chatTagRow = document.getElementById('chat-tag-row');
  const chatTagValue = document.getElementById('chat-tag-value');
  if(chatTagRow && chatTagValue && typeof window.getMyGameTag === 'function'){
    const tag = window.getMyGameTag();
    if(tag){
      chatTagValue.textContent = tag;
      chatTagRow.style.display = '';
    }
  }

  /* Always merge Arena friends into the visible list — localStorage is always current */
  const me = getCurrentUser();
  if(me){
    const arenaFriends = (JSON.parse(localStorage.getItem('lf_game_friends') || '[]') || [])
      .filter(f => f.uid && !f.local)
      .map(f => ({ uid: f.uid, displayName: f.displayName || 'Friend', email: f.email || '' }));
    arenaFriends.forEach(af => {
      if(!socialFriends.some(cf => cf.uid === af.uid)){
        socialFriends.push(af);
      }
    });
  }

  if(!privateChatAvailable()){
    if(addStatus) addStatus.textContent = 'Private chat is available only when signed in with cloud sync.';
    incomingList.innerHTML = '<div class="chat-empty">Sign in to receive friend requests.</div>';
    outgoingList.innerHTML = '<div class="chat-empty">Sign in to send requests.</div>';
    friendsList.innerHTML = '<div class="chat-empty">No friends available in local mode.</div>';
    threadHead.textContent = 'Private chat unavailable';
    thread.innerHTML = '<div class="chat-empty-thread">Sign in to enable friend-to-friend private messages.</div>';
    unreadChatCount = 0;
    refreshUnreadChatBadge();
    return;
  }

  if(addStatus){
    addStatus.textContent = outgoingFriendRequests.length
      ? `${outgoingFriendRequests.length} request${outgoingFriendRequests.length > 1 ? 's' : ''} pending`
      : 'Add friends by tag (e.g. Mango#1234).';
  }

  if(!incomingFriendRequests.length){
    incomingList.innerHTML = '<div class="chat-empty">No incoming requests.</div>';
  } else {
    incomingList.innerHTML = incomingFriendRequests.map(r=>{
      const name = escapeHTML(r.fromName || r.fromEmail || 'Unknown user');
      const rid = escapeHTML(r.id);
      return `<div class="chat-request-item">
        <div class="chat-request-main">
          <div class="chat-request-name">${name}</div>
          <div class="chat-request-sub">${escapeHTML(r.fromEmail || '')}</div>
        </div>
        <div class="chat-request-actions">
          <button class="chat-mini-btn chat-accept" onclick="respondToFriendRequest('${rid}',true)">Accept</button>
          <button class="chat-mini-btn" onclick="respondToFriendRequest('${rid}',false)">Decline</button>
        </div>
      </div>`;
    }).join('');
  }

  if(!outgoingFriendRequests.length){
    outgoingList.innerHTML = '<div class="chat-empty">No sent requests.</div>';
  } else {
    outgoingList.innerHTML = outgoingFriendRequests.map(r=>{
      const rid = escapeHTML(r.id);
      const toLabel = escapeHTML(r.toEmail || 'Pending user');
      return `<div class="chat-request-item">
        <div class="chat-request-main">
          <div class="chat-request-name">${toLabel}</div>
          <div class="chat-request-sub">Pending</div>
        </div>
        <div class="chat-request-actions">
          <button class="chat-mini-btn" onclick="cancelOutgoingRequest('${rid}')">Cancel</button>
        </div>
      </div>`;
    }).join('');
  }

  if(!socialFriends.length){
    friendsList.innerHTML = '<div class="chat-empty">No friends yet. Send your first request.</div>';
  } else {
    friendsList.innerHTML = socialFriends.map(friend=>{
      const uid = escapeHTML(friend.uid);
      const activeClass = friend.uid === activeChatFriendUid ? ' active' : '';
      const convo = getConversationForFriend(friend.uid);
      const blocked = isBlockedEitherWay(friend.uid);
      const preview = blocked
        ? (blockedByMe.some(b=>b.blockedUid===friend.uid) ? 'You blocked this user' : 'This user blocked you')
        : escapeHTML(convo?.lastMessage || friend.email || '');
      const stamp = blocked ? '' : escapeHTML(formatChatTimestamp(convo?.lastMessageAtMs || 0));
      const unread = (!blocked && convo && convo.lastSenderUid !== getCurrentUser()?.uid && convo.readBy && convo.readBy[getCurrentUser()?.uid] !== true) ? 1 : 0;
      return `<div class="chat-friend-item${activeClass}">
        <button class="chat-friend-main" onclick="openPrivateChat('${uid}')">
        <span class="chat-friend-avatar">${escapeHTML((friend.displayName || friend.email || 'F')[0].toUpperCase())}</span>
        <span class="chat-friend-meta">
          <span class="chat-friend-name">${escapeHTML(friend.displayName || 'Friend')}</span>
          <span class="chat-friend-sub">${preview}</span>
        </span>
        <span class="chat-friend-right">
          <span class="chat-friend-time">${stamp}</span>
          <span class="chat-friend-unread${unread?' show':''}">${unread?1:''}</span>
        </span>
        </button>
        <div class="chat-friend-actions">
          <button class="chat-mini-btn" onclick="removeFriend('${uid}')">Remove</button>
          <button class="chat-mini-btn" onclick="blockFriend('${uid}')">Block</button>
        </div>
      </div>`;
    }).join('');
  }

  const active = socialFriends.find(f=>f.uid===activeChatFriendUid);
  if(!active){
    threadHead.textContent = 'Select a friend to start chatting';
    thread.innerHTML = '<div class="chat-empty-thread">Your private conversation will appear here.</div>';
    return;
  }

  if(isBlockedEitherWay(active.uid)){
    const mine = blockedByMe.some(b=>b.blockedUid===active.uid);
    threadHead.textContent = mine ? 'User blocked' : 'Chat unavailable';
    thread.innerHTML = `<div class="chat-empty-thread">${mine ? 'You blocked this user. Unblock from Firestore to chat again.' : 'This user blocked you. Messaging is disabled.'}</div>`;
    refreshUnreadChatBadge();
    return;
  }

  threadHead.textContent = `Chat with ${active.displayName || active.email || 'Friend'}`;

  if(!activeChatMessages.length){
    thread.innerHTML = '<div class="chat-empty-thread">No messages yet. Say hello 👋</div>';
    return;
  }

  thread.innerHTML = activeChatMessages.map(msg=>{
    const mine = msg.senderUid === getCurrentUser()?.uid;
    const cls = mine ? 'mine' : 'theirs';
    const sentAt = msg.createdAtMs ? new Date(msg.createdAtMs).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    return `<div class="chat-bubble-row ${cls}">
      <div class="chat-bubble ${cls}">
        <div>${escapeHTML(msg.text || '')}</div>
        <div class="chat-time">${escapeHTML(sentAt)}</div>
      </div>
    </div>`;
  }).join('');
  thread.scrollTop = thread.scrollHeight;
  refreshUnreadChatBadge();
}

// ══════════════════════════════════════════════
//  FRIENDS_PANEL — dedicated friends management
// ══════════════════════════════════════════════

function renderFriendsPanel() {
  // Show tag
  const tagCard = document.getElementById('friends-tag-card');
  const tagVal  = document.getElementById('friends-tag-value');
  if(tagCard && tagVal && typeof window.getMyGameTag === 'function'){
    const tag = window.getMyGameTag();
    if(tag){ tagVal.textContent = tag; tagCard.style.display = ''; }
  }

  const incomingList = document.getElementById('friends-incoming-list');
  const outgoingList = document.getElementById('friends-outgoing-list');
  const mainList     = document.getElementById('friends-main-list');
  const emptyEl      = document.getElementById('friends-empty');
  const countEl      = document.getElementById('friends-count');
  const inBadge      = document.getElementById('friends-incoming-badge');
  const reqBadge     = document.getElementById('friends-req-badge');

  if(!incomingList || !outgoingList || !mainList) return;

  if(!privateChatAvailable()){
    mainList.innerHTML = '<div class="friends-empty-msg">Sign in to manage friends.</div>';
    if(emptyEl) emptyEl.style.display = 'none';
    return;
  }

  // ── Incoming requests ──
  if(!incomingFriendRequests.length){
    incomingList.innerHTML = '<div class="friends-empty-msg">No incoming requests.</div>';
    if(inBadge) inBadge.style.display = 'none';
    if(reqBadge) reqBadge.style.display = 'none';
  } else {
    const count = incomingFriendRequests.length;
    if(inBadge){ inBadge.textContent = count; inBadge.style.display = ''; }
    if(reqBadge){ reqBadge.textContent = count; reqBadge.style.display = ''; }
    incomingList.innerHTML = incomingFriendRequests.map(r => {
      const rid  = escapeHTML(r.id);
      const name = escapeHTML(r.fromName || r.fromEmail || 'Unknown');
      return `<div class="friends-request-item">
        <div class="friends-request-avatar">${escapeHTML((r.fromName||'?')[0].toUpperCase())}</div>
        <div class="friends-request-info">
          <div class="friends-request-name">${name}</div>
          <div class="friends-request-sub">wants to be your friend</div>
        </div>
        <div class="friends-request-actions">
          <button class="friends-accept-btn" onclick="respondToFriendRequest('${rid}',true)">Accept</button>
          <button class="friends-decline-btn" onclick="respondToFriendRequest('${rid}',false)">Decline</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Outgoing requests ──
  if(!outgoingFriendRequests.length){
    outgoingList.innerHTML = '<div class="friends-empty-msg">No sent requests.</div>';
  } else {
    outgoingList.innerHTML = outgoingFriendRequests.map(r => {
      const rid     = escapeHTML(r.id);
      const toLabel = escapeHTML(r.toName || r.toEmail || 'Pending');
      return `<div class="friends-request-item">
        <div class="friends-request-avatar">${escapeHTML((toLabel||'?')[0].toUpperCase())}</div>
        <div class="friends-request-info">
          <div class="friends-request-name">${toLabel}</div>
          <div class="friends-request-sub">Pending…</div>
        </div>
        <div class="friends-request-actions">
          <button class="friends-decline-btn" onclick="cancelOutgoingRequest('${rid}')">Cancel</button>
        </div>
      </div>`;
    }).join('');
  }

  // ── Friends list ──
  if(countEl) countEl.textContent = socialFriends.length;
  if(!socialFriends.length){
    mainList.innerHTML = '';
    if(emptyEl) emptyEl.style.display = '';
  } else {
    if(emptyEl) emptyEl.style.display = 'none';
    mainList.innerHTML = socialFriends.map(f => {
      const uid  = escapeHTML(f.uid);
      const name = escapeHTML(f.displayName || 'Friend');
      const convo = getConversationForFriend(f.uid);
      const lastMsg = convo ? escapeHTML(convo.lastMessage || '') : '';
      return `<div class="friends-card-item">
        <div class="friends-card-avatar">${escapeHTML((f.displayName||'F')[0].toUpperCase())}</div>
        <div class="friends-card-info">
          <div class="friends-card-name">${name}</div>
          ${lastMsg ? `<div class="friends-card-last">${lastMsg}</div>` : ''}
        </div>
        <div class="friends-card-actions">
          <button class="friends-chat-btn" onclick="switchTo('chat',document.getElementById('nav-chat'));openPrivateChat('${uid}')" title="Chat">
            <i data-lucide="message-circle"></i>
          </button>
          <button class="friends-remove-btn" onclick="removeFriend('${uid}')" title="Remove">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>`;
    }).join('');
    if(window.lucide) lucide.createIcons({attrs:{'stroke-width':'1.75','width':'16','height':'16'}});
  }
}

// Send friend request from the Friends panel
async function sendFriendRequestFromFriendsPanel(){
  const input = document.getElementById('friends-tag-input');
  const status = document.getElementById('friends-add-status');
  if(!input) return;
  const tag = String(input.value || '').trim();
  if(!tag){ if(status) status.textContent = 'Enter a tag (e.g. Mango#1234)'; return; }
  if(tag.indexOf('#') === -1){ if(status) status.textContent = 'Use format: Name#1234'; return; }
  if(!privateChatAvailable()){ if(status) status.textContent = 'Sign in to add friends'; return; }

  const user = getCurrentUser();
  if(!user) return;
  if(status) status.textContent = 'Searching…';

  try{
    const snap = await window._firebaseDb.collection('gameProfiles').limit(500).get();
    let targetUid = null, targetEmail = '', targetName = tag;

    snap.forEach(doc => {
      const gp  = doc.data() || {};
      const uid = doc.id;
      if(uid === user.uid) return;
      // Check stored tag field first
      if(gp.tag && gp.tag.toLowerCase() === tag.toLowerCase()){
        targetUid = uid; targetEmail = gp.email||''; targetName = gp.displayName||tag; return;
      }
      // Reconstruct tag
      const name = (gp.displayName||gp.email||'Player').split('@')[0].replace(/\s+/g,'');
      let hash = 0;
      for(let i=0;i<uid.length;i++){ hash=((hash<<5)-hash)+uid.charCodeAt(i); hash|=0; }
      const suffix = String(Math.abs(hash)%10000).padStart(4,'0');
      if((name+'#'+suffix).toLowerCase() === tag.toLowerCase()){
        targetUid = uid; targetEmail = gp.email||''; targetName = gp.displayName||tag;
      }
    });

    if(!targetUid){ if(status) status.textContent = 'No player found with that tag'; return; }
    if(socialFriends.some(f=>f.uid===targetUid)){ if(status) status.textContent = 'Already friends'; return; }
    if(isBlockedEitherWay(targetUid)){ if(status) status.textContent = 'Cannot add this user'; return; }

    const requestId = `${user.uid}_${targetUid}`;
    await window._firebaseDb.collection('friendRequests').doc(requestId).set({
      id: requestId,
      fromUid: user.uid,
      fromEmail: user.email||'',
      fromName: user.displayName||user.email||'User',
      toUid: targetUid,
      toEmail: targetEmail,
      toName: targetName,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    }, { merge:true });

    input.value = '';
    if(status) status.textContent = 'Request sent to ' + targetName;
    setTimeout(()=>{ if(status) status.textContent=''; }, 4000);
  } catch(err){
    console.error('[friends] sendFriendRequestFromFriendsPanel failed:', err);
    if(status) status.textContent = 'Could not send request';
  }
}

async function sendFriendRequestByTag(){
  const input = document.getElementById('friend-tag-input');
  if(!input) return;
  const tag = String(input.value || '').trim();
  if(!tag){ showToast('Enter a friend tag (e.g. Mango#1234)'); return; }
  if(tag.indexOf('#') === -1){ showToast('Use the tag format: Name#1234'); return; }
  if(!privateChatAvailable()){ showToast('Sign in to use private chat'); return; }

  const user = getCurrentUser();
  if(!user) return;

  try{
    const snap = await window._firebaseDb.collection('gameProfiles').limit(500).get();
    let targetUid = null, targetEmail = '', targetName = tag;

    snap.forEach(doc => {
      const gp = doc.data() || {};
      const uid = doc.id;

      // Skip self immediately
      if(uid === user.uid) return;

      // Method 1: check stored tag field (most reliable)
      if(gp.tag && gp.tag.toLowerCase() === tag.toLowerCase()){
        targetUid = uid;
        targetEmail = gp.email || '';
        targetName = gp.displayName || tag;
        return;
      }

      // Method 2: reconstruct tag from displayName + uid hash
      const name = (gp.displayName || gp.email || 'Player').split('@')[0].replace(/\s+/g, '');
      let hash = 0;
      for(let i = 0; i < uid.length; i++){ hash = ((hash << 5) - hash) + uid.charCodeAt(i); hash |= 0; }
      const suffix = String(Math.abs(hash) % 10000).padStart(4, '0');
      const docTag = name + '#' + suffix;
      if(docTag.toLowerCase() === tag.toLowerCase()){
        targetUid = uid;
        targetEmail = gp.email || '';
        targetName = gp.displayName || tag;
      }
    });

    if(!targetUid){ showToast('No player found with that tag'); return; }

    const friendAlready = socialFriends.some(f=>f.uid===targetUid);
    if(friendAlready){ showToast('Already friends'); return; }
    if(isBlockedEitherWay(targetUid)){ showToast('Cannot send request due to block status'); return; }

    const requestId = `${user.uid}_${targetUid}`;
    await window._firebaseDb.collection('friendRequests').doc(requestId).set({
      id: requestId,
      fromUid: user.uid,
      fromEmail: user.email || '',
      fromName: user.displayName || user.email || 'User',
      toUid: targetUid,
      toEmail: targetEmail,
      toName: targetName,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    }, { merge:true });

    input.value = '';
    showToast('Friend request sent to ' + targetName);
  } catch(err){
    console.error('[chat] sendFriendRequestByTag failed:', err);
    showToast('Could not send friend request');
  }
}

async function _doSendFriendRequest(user, targetUid, targetEmail, targetName){
  const friendAlready = socialFriends.some(f=>f.uid===targetUid);
  if(friendAlready){ showToast('Already friends'); return; }
  if(isBlockedEitherWay(targetUid)){ showToast('Cannot send request due to block status'); return; }

  const requestId = `${user.uid}_${targetUid}`;
  await window._firebaseDb.collection('friendRequests').doc(requestId).set({
    id: requestId,
    fromUid: user.uid,
    fromEmail: user.email || '',
    fromName: user.displayName || user.email || 'User',
    toUid: targetUid,
    toEmail: targetEmail,
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  }, { merge:true });
  showToast('Friend request sent to ' + targetName);
}

async function sendFriendRequest(){
  sendFriendRequestByTag();
}

async function respondToFriendRequest(requestId, accept){
  if(!privateChatAvailable()) return;
  const user = getCurrentUser();
  if(!user) return;

  try{
    const ref = window._firebaseDb.collection('friendRequests').doc(requestId);
    const snap = await ref.get();
    if(!snap.exists) return;
    const req = snap.data() || {};
    if(req.toUid !== user.uid){
      showToast('Not allowed');
      return;
    }

    if(!accept){
      await ref.set({ status: 'declined', decidedAtMs: Date.now() }, { merge:true });
      showToast('Request declined');
      return;
    }

    const pairKey = makePairKey(req.fromUid, req.toUid);

    // Write to friendships (chat system)
    await window._firebaseDb.collection('friendships').doc(pairKey).set({
      pairKey,
      members: [req.fromUid, req.toUid],
      memberProfiles: {
        [req.fromUid]: { uid:req.fromUid, displayName:req.fromName || req.fromEmail || 'Friend', email:req.fromEmail || '' },
        [req.toUid]: { uid:req.toUid, displayName:user.displayName || user.email || 'You', email:user.email || '' }
      },
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    }, { merge:true });

    // Also write to gameProfiles.friends (arena system) for BOTH users
    // so the friend appears in the leaderboard too
    const myArenaUpdate = {};
    myArenaUpdate['friends.' + req.fromUid] = {
      uid: req.fromUid,
      displayName: req.fromName || req.fromEmail || 'Friend',
      addedAt: Date.now()
    };
    const theirArenaUpdate = {};
    theirArenaUpdate['friends.' + req.toUid] = {
      uid: req.toUid,
      displayName: user.displayName || user.email || 'Player',
      addedAt: Date.now()
    };
    await Promise.all([
      window._firebaseDb.collection('gameProfiles').doc(req.toUid).set(myArenaUpdate, { merge:true }),
      window._firebaseDb.collection('gameProfiles').doc(req.fromUid).set(theirArenaUpdate, { merge:true })
    ]).catch(e => console.warn('[chat] arena friend sync failed', e));

    // Also update localStorage for arena so it's immediately visible
    try {
      const lsKey = 'lf_game_friends';
      const existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
      if (!existing.some(f => f.uid === req.fromUid)) {
        existing.push({ uid: req.fromUid, displayName: req.fromName || req.fromEmail || 'Friend' });
        localStorage.setItem(lsKey, JSON.stringify(existing));
      }
    } catch(e) {}

    await ref.set({ status: 'accepted', decidedAtMs: Date.now() }, { merge:true });
    showToast('Friend added');
  } catch(err){
    console.error('[chat] respondToFriendRequest failed:', err);
    showToast('Could not process request');
  }
}

async function cancelOutgoingRequest(requestId){
  if(!privateChatAvailable()) return;
  try{
    const ref = window._firebaseDb.collection('friendRequests').doc(requestId);
    const snap = await ref.get();
    const req = snap.data() || {};
    if(req.fromUid !== getCurrentUser()?.uid){
      showToast('Not allowed');
      return;
    }
    await ref.delete();
    showToast('Request canceled');
  } catch(err){
    console.error('[chat] cancelOutgoingRequest failed:', err);
    showToast('Could not cancel request');
  }
}

async function removeFriend(friendUid){
  if(!privateChatAvailable()) return;
  const me = getCurrentUser();
  if(!me) return;
  try{
    // Update local state immediately so UI reflects the change right away
    socialFriends = socialFriends.filter(f => f.uid !== friendUid);
    if(activeChatFriendUid === friendUid){
      activeChatFriendUid = '';
      activeChatMessages = [];
    }
    // Also remove from localStorage arena friends
    try {
      const lsKey = 'lf_game_friends';
      const existing = JSON.parse(localStorage.getItem(lsKey) || '[]');
      localStorage.setItem(lsKey, JSON.stringify(existing.filter(f => f.uid !== friendUid)));
    } catch(e) {}

    // Re-render all affected panels immediately
    renderPrivateChat();
    renderFriendsPanel();
    if(typeof window.renderLeaderboard === 'function') window.renderLeaderboard();

    // Then delete from Firestore (listener will confirm the change)
    await window._firebaseDb.collection('friendships').doc(makePairKey(me.uid, friendUid)).delete();
    showToast('Friend removed');
  } catch(err){
    console.error('[chat] removeFriend failed:', err);
    showToast('Could not remove friend');
  }
}

async function blockFriend(friendUid){
  if(!privateChatAvailable()) return;
  const me = getCurrentUser();
  if(!me) return;
  try{
    await window._firebaseDb.collection('blocks').doc(`${me.uid}_${friendUid}`).set({
      blockerUid: me.uid,
      blockedUid: friendUid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
    }, { merge:true });
    await window._firebaseDb.collection('friendships').doc(makePairKey(me.uid, friendUid)).delete().catch(()=>{});
    showToast('User blocked');
  } catch(err){
    console.error('[chat] blockFriend failed:', err);
    showToast('Could not block user');
  }
}

async function markConversationRead(friendUid){
  if(!privateChatAvailable()) return;
  const me = getCurrentUser();
  if(!me || !friendUid) return;
  const pairKey = makePairKey(me.uid, friendUid);
  try{
    await window._firebaseDb.collection('conversations').doc(pairKey).set({
      readBy: { [me.uid]: true }
    }, { merge:true });
  } catch(err){
    console.error('[chat] markConversationRead failed:', err);
  }
}

function openPrivateChat(friendUid){
  if(!privateChatAvailable()) return;
  const me = getCurrentUser();
  if(!me) return;
  if(isBlockedEitherWay(friendUid)){
    activeChatFriendUid = friendUid;
    activeChatMessages = [];
    renderPrivateChat();
    return;
  }
  activeChatFriendUid = friendUid;
  activeChatMessages = [];

  if(typeof _chatUnsub.messages === 'function'){
    _chatUnsub.messages();
    _chatUnsub.messages = null;
  }

  const friend = socialFriends.find(f=>f.uid===friendUid);
  const pairKey = makePairKey(me.uid, friendUid);
  const convoRef = window._firebaseDb.collection('conversations').doc(pairKey);

  // Ensure the conversation doc exists with members before attaching the listener
  // so the Firestore rule can verify membership when reading messages
  convoRef.set({
    pairKey,
    members: [me.uid, friendUid],
    memberProfiles: {
      [me.uid]: { uid:me.uid, displayName:me.displayName || me.email || 'You', email:me.email || '' },
      [friendUid]: { uid:friendUid, displayName:(friend && (friend.displayName || friend.email)) || 'Friend', email:(friend && friend.email) || '' }
    },
  }, { merge:true }).then(()=>{
    // Attach listener only after conversation doc is guaranteed to exist
    _chatUnsub.messages = convoRef
      .collection('messages')
      .orderBy('createdAtMs', 'asc')
      .limit(300)
      .onSnapshot(snap=>{
        activeChatMessages = snap.docs.map(d=>{
          const data = d.data() || {};
          return { id:d.id, ...data };
        });
        renderPrivateChat();
      }, err=>{
        console.error('[chat] message listener failed:', err);
      });
    markConversationRead(friendUid);
    renderPrivateChat();
  }).catch(err=>{
    console.error('[chat] openPrivateChat convo init failed:', err);
    // Attach listener anyway — conversation may already exist
    _chatUnsub.messages = convoRef
      .collection('messages')
      .orderBy('createdAtMs', 'asc')
      .limit(300)
      .onSnapshot(snap=>{
        activeChatMessages = snap.docs.map(d=>{
          const data = d.data() || {};
          return { id:d.id, ...data };
        });
        renderPrivateChat();
      }, err2=>{
        console.error('[chat] message listener failed:', err2);
      });
    markConversationRead(friendUid);
  });

  renderPrivateChat();
}

async function sendPrivateMessage(e){
  if(e) e.preventDefault();
  if(!privateChatAvailable()) return;
  const me = getCurrentUser();
  const input = document.getElementById('chat-message-input');
  if(!me || !input || !activeChatFriendUid) return;

  const text = String(input.value || '').trim();
  if(!text) return;
  const friend = socialFriends.find(f=>f.uid===activeChatFriendUid);
  if(!friend){
    showToast('Select a friend first');
    return;
  }
  if(isBlockedEitherWay(activeChatFriendUid)){
    showToast('Messaging unavailable for blocked users');
    return;
  }

  const pairKey = makePairKey(me.uid, activeChatFriendUid);

  // Ensure the conversation document exists BEFORE writing the message
  // (Firestore rule checks members on the parent doc)
  const convoRef = window._firebaseDb.collection('conversations').doc(pairKey);
  const convoPayload = {
    pairKey,
    members: [me.uid, activeChatFriendUid],
    memberProfiles: {
      [me.uid]: { uid:me.uid, displayName:me.displayName || me.email || 'You', email:me.email || '' },
      [activeChatFriendUid]: { uid:activeChatFriendUid, displayName:friend.displayName || friend.email || 'Friend', email:friend.email || '' }
    },
  };

  const msgPayload = {
    senderUid: me.uid,
    text,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  };

  try{
    // Step 1: create/update conversation doc so the member list exists
    await convoRef.set(convoPayload, { merge:true });

    // Step 2: write the message (rule can now verify membership)
    await convoRef.collection('messages').add(msgPayload);

    // Step 3: update conversation metadata
    await convoRef.set({
      lastMessage: text,
      lastSenderUid: me.uid,
      lastMessageAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastMessageAtMs: Date.now(),
      readBy: { [me.uid]: true, [activeChatFriendUid]: false }
    }, { merge:true });

    input.value = '';
    resizeAssistantInput(input);
  } catch(err){
    console.error('[chat] sendPrivateMessage failed:', err);
    showToast('Message failed to send');
  }
}

function initPrivateChatListeners(uid){
  if(!window._firebaseDb || !uid) return;
  unsubscribeChatListeners();
  activeChatFriendUid = '';
  activeChatMessages = [];
  socialFriends = [];
  incomingFriendRequests = [];
  outgoingFriendRequests = [];
  conversationMap = {};
  blockedByMe = [];
  blockedMe = [];
  unreadChatCount = 0;

  _chatUnsub.friends = window._firebaseDb.collection('friendships')
    .where('members','array-contains',uid)
    .onSnapshot(snap=>{
      const chatFriends = snap.docs.map(doc=>{
        const data = doc.data() || {};
        const profiles = data.memberProfiles || {};
        const friendUid = (Array.isArray(data.members) ? data.members : []).find(m=>m!==uid) || '';
        const profile = profiles[friendUid] || {};
        return {
          uid: friendUid,
          displayName: profile.displayName || profile.email || 'Friend',
          email: profile.email || '',
        };
      }).filter(f=>f.uid);

      socialFriends = chatFriends;
      if(activeChatFriendUid && !socialFriends.some(f=>f.uid===activeChatFriendUid)){
        activeChatFriendUid = '';
        activeChatMessages = [];
      }
      renderPrivateChat();
      renderFriendsPanel();
      // Refresh arena leaderboard in real-time
      if(typeof window.renderLeaderboard === 'function') window.renderLeaderboard();
    }, err=>console.error('[chat] friendships listener failed:', err));

  _chatUnsub.incoming = window._firebaseDb.collection('friendRequests')
    .where('toUid','==',uid)
    .where('status','==','pending')
    .onSnapshot(snap=>{
      incomingFriendRequests = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
      renderPrivateChat();
      renderFriendsPanel();
    }, err=>console.error('[chat] incoming requests listener failed:', err));

  _chatUnsub.outgoing = window._firebaseDb.collection('friendRequests')
    .where('fromUid','==',uid)
    .where('status','==','pending')
    .onSnapshot(snap=>{
      outgoingFriendRequests = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
      renderPrivateChat();
      renderFriendsPanel();
    }, err=>console.error('[chat] outgoing requests listener failed:', err));

  _chatUnsub.conversations = window._firebaseDb.collection('conversations')
    .where('members','array-contains',uid)
    .onSnapshot(snap=>{
      const next = {};
      let unread = 0;
      snap.docs.forEach(d=>{
        const data = d.data() || {};
        next[d.id] = data;
        const hasUnread = data.lastSenderUid && data.lastSenderUid !== uid && (!data.readBy || data.readBy[uid] !== true);
        if(hasUnread) unread += 1;
      });
      conversationMap = next;
      unreadChatCount = unread;
      refreshUnreadChatBadge();
      renderPrivateChat();
      if(activeChatFriendUid){
        const convo = getConversationForFriend(activeChatFriendUid);
        if(convo && convo.lastSenderUid !== uid && (!convo.readBy || convo.readBy[uid] !== true)){
          markConversationRead(activeChatFriendUid);
        }
      }
    }, err=>console.error('[chat] conversations listener failed:', err));

  _chatUnsub.blocksByMe = window._firebaseDb.collection('blocks')
    .where('blockerUid','==',uid)
    .onSnapshot(snap=>{
      blockedByMe = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
      renderPrivateChat();
    }, err=>console.error('[chat] blocksByMe listener failed:', err));

  _chatUnsub.blocksMe = window._firebaseDb.collection('blocks')
    .where('blockedUid','==',uid)
    .onSnapshot(snap=>{
      blockedMe = snap.docs.map(d=>({ id:d.id, ...(d.data()||{}) }));
      renderPrivateChat();
    }, err=>console.error('[chat] blocksMe listener failed:', err));
}

// ══════════════════════════════════════════════
//  AUTH_MODULE — Firebase Authentication
// ══════════════════════════════════════════════

// Firebase error code → user-facing message
const AUTH_ERRORS = {
  'auth/email-already-in-use':  'An account with this email already exists.',
  'auth/weak-password':         'Password must be at least 6 characters.',
  'auth/invalid-email':         'Please enter a valid email address.',
  'auth/user-not-found':        'Incorrect email or password.',
  'auth/wrong-password':        'Incorrect email or password.',
  'auth/invalid-credential':    'Incorrect email or password.',
};

function showAuthError(msg){
  const el=document.getElementById('auth-error');
  el.textContent=msg; el.style.display='';
}
function clearAuthError(){
  const el=document.getElementById('auth-error');
  el.textContent=''; el.style.display='none';
}

// Toggle between sign-in and sign-up forms
let _authFormMode='signin';
function toggleAuthForm(){
  clearAuthError();
  _authFormMode=_authFormMode==='signin'?'signup':'signin';
  document.getElementById('form-signin').style.display=_authFormMode==='signin'?'':'none';
  document.getElementById('form-signup').style.display=_authFormMode==='signup'?'':'none';
  const link=document.getElementById('auth-toggle-link');
  link.innerHTML=_authFormMode==='signin'
    ? 'Don\'t have an account? <span class="auth-toggle-action">Sign up</span>'
    : 'Already have an account? <span class="auth-toggle-action">Sign in</span>';
}

// Called when sign-in form is submitted
function handleSignIn(e){
  e.preventDefault();
  clearAuthError();
  const email=document.getElementById('signin-email').value.trim();
  const pass=document.getElementById('signin-password').value;
  if(!email||!pass.trim()){ showAuthError('Please fill in all fields.'); return; }
  if(window.firebaseUnavailable){ showAuthError('Cloud features are unavailable. Please try again later.'); return; }
  lifeflowLocalMode=false;
  save('lf_local_mode',false);
  window._firebaseAuth.signInWithEmailAndPassword(email,pass)
    .catch(err=>{ showAuthError(AUTH_ERRORS[err.code]||'Sign-in failed. Please try again.'); });
}

// Called when Google sign-in button is clicked
function handleGoogleSignIn(){
  clearAuthError();
  if(window.firebaseUnavailable){ showAuthError('Cloud features are unavailable. Please try again later.'); return; }

  // Clear local mode before redirecting so initAuth doesn't short-circuit on return
  lifeflowLocalMode=false;
  save('lf_local_mode',false);
  // Flag that we're mid-redirect so initAuth waits for getRedirectResult
  sessionStorage.setItem('lf_google_redirect', '1');

  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  window._firebaseAuth.signInWithRedirect(provider)
    .catch(err=>{
      console.error('[auth] Google sign-in error:', err.code, err.message);
      sessionStorage.removeItem('lf_google_redirect');
      showAuthError(AUTH_ERRORS[err.code] || 'Google sign-in failed: ' + (err.code || err.message));
    });
}
function handleSignUp(e){
  e.preventDefault();
  clearAuthError();
  const name=document.getElementById('signup-name').value.trim();
  const email=document.getElementById('signup-email').value.trim();
  const pass=document.getElementById('signup-password').value;
  if(!name||!email||!pass.trim()){ showAuthError('Please fill in all fields.'); return; }
  if(window.firebaseUnavailable){ showAuthError('Cloud features are unavailable. Please try again later.'); return; }
  lifeflowLocalMode=false;
  save('lf_local_mode',false);
  window._firebaseAuth.createUserWithEmailAndPassword(email,pass)
    .then(cred=>{
      return cred.user.updateProfile({displayName:name}).then(()=>initUserDoc(cred.user.uid));
    })
    .catch(err=>{ showAuthError(AUTH_ERRORS[err.code]||'Registration failed. Please try again.'); });
}

// Called when sign-out button is clicked
function handleSignOut(){
  if(lifeflowLocalMode||window.firebaseUnavailable){
    lifeflowLocalMode=false;
    save('lf_local_mode',false);
    hideWorkspace();
    showToast('Local workspace locked');
    return;
  }
  _explicitSignOut=true;
  window._firebaseAuth.signOut().catch(err=>console.error('Sign-out error:',err));
}

function useLocalMode(showMessage=true){
  clearAuthError();
  lifeflowLocalMode=true;
  save('lf_local_mode',true);
  unsubscribeChatListeners();
  socialFriends = [];
  incomingFriendRequests = [];
  outgoingFriendRequests = [];
  activeChatFriendUid = '';
  activeChatMessages = [];
  conversationMap = {};
  blockedByMe = [];
  blockedMe = [];
  unreadChatCount = 0;
  refreshUnreadChatBadge();
  document.getElementById('user-avatar').textContent='L';
  document.getElementById('user-name-display').textContent='Local workspace';
  showWorkspace();
  renderNotes(); renderGoals(); renderSessions(); renderReminders(); renderCalendar(); refreshDash(); renderPrivateChat();
  if(showMessage) showToast('Local mode enabled. Your data stays in this browser.');
}

// Update sidebar + dashboard with authenticated user's identity
function updateIdentity(user){
  const name=user.displayName||user.email||'User';
  document.getElementById('user-avatar').textContent=name[0].toUpperCase();
  document.getElementById('user-name-display').textContent=name;
  const hr=new Date().getHours();
  const g=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  document.getElementById('dash-greeting').textContent=g+', '+name;
}

// Clear identity elements on sign-out
function clearIdentity(){
  document.getElementById('user-avatar').textContent='';
  document.getElementById('user-name-display').textContent='';
  document.getElementById('dash-greeting').textContent='';
}

// Show/hide workspace vs auth overlay
function showWorkspace(){ document.getElementById('overlay-auth').classList.remove('open'); }
function hideWorkspace(){ document.getElementById('overlay-auth').classList.add('open'); }

// Register onAuthStateChanged listener — called once during init
function initAuth(){
  if(lifeflowLocalMode){
    useLocalMode(false);
    return;
  }
  if(window.firebaseUnavailable){
    showToast('Cloud features are unavailable. Data will be saved locally.');
    showWorkspace();
    return;
  }

  // Handle redirect result from Google sign-in
  // Must be called before onAuthStateChanged to process the redirect
  const pendingRedirect = sessionStorage.getItem('lf_google_redirect');
  if(pendingRedirect){
    sessionStorage.removeItem('lf_google_redirect');
    window._firebaseAuth.getRedirectResult()
      .then(result=>{
        if(result && result.user){
          const isNew = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
          if(isNew) return initUserDoc(result.user.uid);
        }
        // onAuthStateChanged will handle the rest
      })
      .catch(err=>{
        console.error('[auth] getRedirectResult error:', err.code, err.message);
        const overlay = document.getElementById('overlay-auth');
        if(overlay && overlay.classList.contains('open')){
          showAuthError(AUTH_ERRORS[err.code] || 'Google sign-in failed: ' + err.code);
        }
      });
  }

  window._firebaseAuth.onAuthStateChanged(user=>{
    if(user){
      _explicitSignOut=false;
      lifeflowLocalMode=false;
      save('lf_local_mode',false);
      updateIdentity(user);
      showWorkspace();
      loadUserData(user.uid);
      initPrivateChatListeners(user.uid);
    } else {
      unsubscribeChatListeners();
      socialFriends = [];
      incomingFriendRequests = [];
      outgoingFriendRequests = [];
      activeChatFriendUid = '';
      activeChatMessages = [];
      conversationMap = {};
      blockedByMe = [];
      blockedMe = [];
      unreadChatCount = 0;
      refreshUnreadChatBadge();
      clearIdentity();
      if(_explicitSignOut) clearLocalState();
      _explicitSignOut=false;
      hideWorkspace();
      // Re-render to show empty state
      renderNotes(); renderGoals(); renderSessions(); renderReminders(); refreshDash(); renderPrivateChat();
    }
  });
}

// ══════════════════════════════════════════════
//  SYNC_MODULE — Firestore cloud persistence
// ══════════════════════════════════════════════

// Maps localStorage keys to Firestore document field names
const LS_TO_FS = {
  'lf_notes':    'notes',
  'lf_events':   'events',
  'lf_goals':    'goals',
  'lf_reminders':'reminders',
  'lf_sessions': 'sessions',
  'lf_weekly':   'weekly',
  'lf_daily_plan':'dailyPlan',
  'lf_moods':    'moods',
  'lf_daily_tasks':'dailyTasks',
  'lf_habits':   'habits',
  'lf_today_focus':'todayFocus',
};

// Per-collection debounce timer handles
const _debounceTimers = {};

// Create initial empty user document on first registration
function initUserDoc(uid){
  if(window.firebaseUnavailable||!window._firebaseDb) return Promise.resolve();
  const user = window._firebaseAuth && window._firebaseAuth.currentUser;
  const displayName = user ? (user.displayName || user.email || 'Player') : 'Player';
  const email = user ? (user.email || '') : '';
  return window._firebaseDb.collection('users').doc(uid).set(
    {
      notes:[],events:[],goals:[],reminders:[],sessions:[],weekly:{},dailyPlan:{},moods:{},dailyTasks:{},habits:{},todayFocus:{},
      // Game profile — readable by other users for leaderboard
      gameProfile: { xp:0, coins:0, level:1, displayName, email, uid, lastSeen: Date.now() }
    },
    {merge:true}
  ).catch(err=>console.error('[sync] initUserDoc failed:',err));
}

// Load all user data from Firestore and populate Local_State
async function loadUserData(uid){
  if(window.firebaseUnavailable||!window._firebaseDb) return;
  try {
    const snap=await window._firebaseDb.collection('users').doc(uid).get();
    if(snap.exists){
      const d=snap.data();
      notes         = Array.isArray(d.notes)     ? d.notes     : [];
      calEvents     = Array.isArray(d.events)    ? d.events    : [];
      goals         = Array.isArray(d.goals)     ? d.goals     : [];
      reminders     = Array.isArray(d.reminders) ? d.reminders : [];
      focusSessions = Array.isArray(d.sessions)  ? d.sessions  : [];
      weeklyFocus   = (d.weekly&&typeof d.weekly==='object') ? d.weekly : {};
      dailyPlan     = (d.dailyPlan&&typeof d.dailyPlan==='object') ? d.dailyPlan : {};
      moods          = (d.moods&&typeof d.moods==='object') ? d.moods : {};
      dailyTasks     = (d.dailyTasks&&typeof d.dailyTasks==='object') ? d.dailyTasks : {};
      habits         = (d.habits&&typeof d.habits==='object') ? d.habits : {};
      todayFocus     = (d.todayFocus&&typeof d.todayFocus==='object') ? d.todayFocus : {};
    } else {
      // First sign-in — no document yet; start with empty state
      notes=[]; calEvents=[]; goals=[]; reminders=[]; focusSessions=[]; weeklyFocus={}; dailyPlan={}; moods={}; dailyTasks={}; habits={}; todayFocus={};
    }
    // Mirror to localStorage
    save('lf_notes',notes); save('lf_events',calEvents); save('lf_goals',goals);
    save('lf_reminders',reminders); save('lf_sessions',focusSessions); save('lf_weekly',weeklyFocus); save('lf_daily_plan',dailyPlan);
    save('lf_moods',moods); save('lf_daily_tasks',dailyTasks); save('lf_habits',habits);
    save('lf_today_focus',todayFocus);
  } catch(err){
    console.error('[sync] loadUserData failed:',err);
    showToast('Could not load your data. Please refresh.');
    notes=[]; calEvents=[]; goals=[]; reminders=[]; focusSessions=[]; weeklyFocus={}; dailyPlan={}; moods={}; dailyTasks={}; habits={}; todayFocus={};
  }
  // Re-render all panels with loaded data
  renderNotes(); renderGoals(); renderSessions(); renderReminders(); renderCalendar(); refreshDash(); renderPrivateChat();
}

// Debounced save to Firestore — also always writes to localStorage immediately
function saveCollection(lsKey, data){
  // Always persist to localStorage immediately
  save(lsKey, data);
  // If not authenticated or Firebase unavailable, stop here
  const user=window._firebaseAuth&&window._firebaseAuth.currentUser;
  if(!user||window.firebaseUnavailable||!window._firebaseDb) return;
  // Debounce the Firestore write (500 ms per collection)
  if(_debounceTimers[lsKey]) clearTimeout(_debounceTimers[lsKey]);
  _debounceTimers[lsKey]=setTimeout(()=>{
    const fsField=LS_TO_FS[lsKey];
    if(!fsField) return;
    window._firebaseDb.collection('users').doc(user.uid).set(
      {[fsField]:data},
      {merge:true}
    ).catch(err=>{
      console.error('[sync] saveCollection failed:',err);
      showToast('Sync failed. Your changes are saved locally.');
    });
  },500);
}

// Clear all Local_State and localStorage on sign-out
function clearLocalState(){
  notes=[]; calEvents=[]; goals=[]; reminders=[]; focusSessions=[]; weeklyFocus={}; dailyPlan={}; moods={}; dailyTasks={}; habits={}; todayFocus={};
  socialFriends=[]; incomingFriendRequests=[]; outgoingFriendRequests=[]; activeChatFriendUid=''; activeChatMessages=[];
  conversationMap={}; blockedByMe=[]; blockedMe=[]; unreadChatCount=0; refreshUnreadChatBadge();
  ['lf_notes','lf_events','lf_goals','lf_reminders','lf_sessions','lf_weekly','lf_daily_plan','lf_moods','lf_daily_tasks','lf_habits','lf_today_focus','lf_ai_messages']
    .forEach(k=>localStorage.removeItem(k));
}

// ══════════════════════════════════════════════
//  OVERLAY CLOSE ON BACKDROP CLICK
// ══════════════════════════════════════════════
document.querySelectorAll('.overlay').forEach(o=>{
  if(o.id==='overlay-auth') return; // auth overlay must not be dismissible by backdrop click
  o.addEventListener('click',e=>{if(e.target===o){o.classList.remove('open');}});
});

// ══════════════════════════════════════════════
//  GREETING BY TIME
// ══════════════════════════════════════════════
function initGreeting(){
  const now=new Date();
  const opts={weekday:'long',month:'long',day:'numeric'};
  document.getElementById('dash-date-label').textContent=now.toLocaleDateString('en-US',opts).toUpperCase();
  const hr=now.getHours();
  const g=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  const name=document.getElementById('user-name-display').textContent;
  document.getElementById('dash-greeting').textContent=`${g}, ${name}`;
}

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════
initGreeting();
renderNotes();
renderGoals();
renderSessions();
renderReminders();
refreshDash();
renderPrivateChat();
renderFriendsPanel();
updateTimerDisplay();
updateRing(0);
renderTodayFocus();
startTodayFocusInterval();
initAuth();
window.addEventListener('beforeunload', persistTodayFocusTimer);

// ══════════════════════════════════════════════
//  UI ENHANCEMENTS
// ══════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {

  // 3D tilt on cards
  document.querySelectorAll('.stat-card,.dash-card,.note-card,.goal-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rotateY = ((x / rect.width) - 0.5) * 10;
      const rotateX = ((y / rect.height) - 0.5) * -10;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // Nav slide effect
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('mouseenter', () => { item.style.transform = 'translateX(4px)'; });
    item.addEventListener('mouseleave', () => { item.style.transform = ''; });
  });

  // Button pulse
  document.querySelectorAll('.btn-primary,.quick-btn,.btn-start').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }],
        { duration: 350, easing: 'ease-out' }
      );
    });
  });

  // Staggered card entrance
  document.querySelectorAll('.stat-card,.dash-card,.note-card,.goal-card').forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    setTimeout(() => {
      el.style.transition = 'opacity .4s ease, transform .4s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, i * 60);
  });

  // Sticky header shadow on scroll
  const mainScroll = document.getElementById('main-scroll');
  if(mainScroll){
    mainScroll.addEventListener('scroll', () => {
      const headers = document.querySelectorAll('.page-header');
      headers.forEach(h => {
        h.classList.toggle('scrolled', mainScroll.scrollTop > 10);
      });
    });
  }

  // Rotating quotes
  const quotes = [
    { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
    { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
    { text: 'Small steps every day lead to big results.', author: '' },
    { text: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
    { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
    { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
    { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  ];
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  const qText = document.getElementById('quote-text');
  const qAuthor = document.getElementById('quote-author');
  if(qText) qText.textContent = q.text;
  if(qAuthor) qAuthor.textContent = q.author ? '— ' + q.author : '';

  // Streak dots — light up based on days used this week
  const today = new Date().toISOString().slice(0,10);
  const streakDots = document.querySelectorAll('.streak-dot');
  const sessions = JSON.parse(localStorage.getItem('lf_sessions') || '[]');
  const activeDays = new Set(sessions.map(s => s.date));
  let streak = 0;
  for(let i = 0; i < 7; i++){
    const d = new Date(); d.setDate(d.getDate() - i);
    if(activeDays.has(d.toISOString().slice(0,10))) streak++;
    else if(i > 0) break;
  }
  streakDots.forEach((dot, i) => dot.classList.toggle('active', i < streak));
  const sc = document.getElementById('streak-count');
  if(sc) sc.textContent = streak + (streak === 1 ? ' day' : ' days');

});

// ── FAB ──
let fabOpen = false;
function toggleFab(){
  fabOpen = !fabOpen;
  document.getElementById('fab-menu').classList.toggle('open', fabOpen);
  document.getElementById('fab-btn').style.transform = fabOpen ? 'scale(1.1) rotate(45deg)' : '';
  document.getElementById('fab-btn').style.background = fabOpen ? 'var(--accent)' : '';
}
function closeFab(){
  fabOpen = false;
  document.getElementById('fab-menu').classList.remove('open');
  document.getElementById('fab-btn').style.transform = '';
  document.getElementById('fab-btn').style.background = '';
}
// Close FAB when clicking outside
document.addEventListener('click', e => {
  if(fabOpen && !e.target.closest('.fab') && !e.target.closest('.fab-menu')){
    closeFab();
  }
});
