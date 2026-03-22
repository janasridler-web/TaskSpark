// ── State ──────────────────────────────────────────────────────────────────
let tasks        = [];
let currentView  = 'all';
let editingId    = null;
let modalTags    = [];
let modalDue     = '';
let calYear      = null;
let calMonth     = null;
let completionTaskId = null;
let selectedImpact   = 'medium';
let undoStack    = [];

// Auth state
let accessToken   = null;
let refreshToken  = null;
let tokenExpiry   = 0;
let spreadsheetId = null;
let redirectUri   = null;

// Timer state
let activeTimerId   = null;
let timerStart      = null;
let timerInterval   = null;
let breakSnoozed    = false;
let breakAfterTimer = null;
let breakInterval   = null;
let breakRemaining  = 0;

// -- Settings (defaults) --
const DEFAULT_SETTINGS = {
  breakEnabled:      true,
  breakIntervalMins: 30,
  breakDurationMins: 5,
  tagsEnabled:       true,
  streakEnabled:     true,
  estimatesEnabled:  true,
  quickAddEnabled:   true,
  whatNowEnabled:    true,
  completionDialog:  true,
  soundEnabled:      true,
  soundFile:         null,  // null = use bundled default
  moodEnabled:       true,
};
let settings = { ...DEFAULT_SETTINGS };

function getBreakIntervalMs() { return settings.breakIntervalMins * 60 * 1000; }
function getBreakDurationS()  { return settings.breakDurationMins * 60; }

function playBreakSound() {
  if (!settings.soundEnabled) return;
  try {
    // Use custom file if set, otherwise fall back to bundled chime
    const src = settings.soundFile
      ? `file:///${settings.soundFile.replace(/\\/g, '/')}`
      : '../assets/break-chime.wav';
    const audio = new Audio(src);
    audio.volume = 0.75;
    audio.play().catch(() => {
      // Silently fail if audio can't play
      const fallback = new Audio('../assets/break-chime.wav');
      fallback.volume = 0.75;
      fallback.play().catch(() => {});
    });
  } catch (e) {}
}


const TAG_PALETTE = ['#2d6a4f','#1a5c8a','#5a3a8a','#8a3a3a','#6b5a2d','#2d5a8a','#8a5a2d','#3a5a8a'];
const tagColorMap = {};

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }

function fmtSecs(s) {
  s = Math.floor(s);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(sec).padStart(2,'0')}s`;
  return `${sec}s`;
}

function fmtDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
  } catch { return d; }
}

function dueStatus(due) {
  if (!due) return null;
  const t = todayStr();
  if (due < t) return 'overdue';
  if (due === t) return 'today';
  const diff = (new Date(due) - new Date(t)) / 86400000;
  return diff <= 3 ? 'soon' : 'future';
}

function getTagColor(tag) {
  if (!tagColorMap[tag]) tagColorMap[tag] = TAG_PALETTE[Object.keys(tagColorMap).length % TAG_PALETTE.length];
  return tagColorMap[tag];
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Collapsible sidebar sections ───────────────────────────────────────────
const sectionState = { priority: true, tags: true }; // true = expanded

function toggleSection(name) {
  sectionState[name] = !sectionState[name];
  const content = document.getElementById(`${name}-section`);
  const hdr     = document.getElementById(`${name}-hdr`);
  if (sectionState[name]) {
    content.classList.remove('collapsed');
    hdr.classList.remove('collapsed');
  } else {
    content.classList.add('collapsed');
    hdr.classList.add('collapsed');
  }
}

function setSyncStatus(state, msg = '') {
  const lbl = document.getElementById('sync-lbl');
  const map = { ok: ['● Synced', 'var(--accent)'], syncing: ['↻ Syncing…', 'var(--amber)'],
    error: [`⚠ ${msg}`, 'var(--red)'], offline: ['○ Offline', 'var(--text3)'] };
  const [text, color] = map[state] || map.offline;
  lbl.textContent = text; lbl.style.color = color;
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = mode === 'dark' ? '☀ Light mode' : '☽ Dark mode';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  api.saveConfig({ theme: next });
}

function onDarkModeToggle() {
  const checked = document.getElementById('set-darkmode').checked;
  applyTheme(checked ? 'dark' : 'light');
  api.saveConfig({ theme: checked ? 'dark' : 'light' });
}

// ── Auth ───────────────────────────────────────────────────────────────────
async function init() {
  const cfg = await api.loadConfig();
  if (cfg) {
    applyTheme(cfg.theme || 'light');
    if (cfg.sortMode) document.getElementById('sort-select').value = cfg.sortMode;
    if (cfg.settings) settings = { ...DEFAULT_SETTINGS, ...cfg.settings };
  }
  applySettings();

  // V2: Just need accessToken, refreshToken and spreadsheetId — no client credentials
  if (cfg && cfg.accessToken && cfg.refreshToken && cfg.spreadsheetId) {
    accessToken   = cfg.accessToken;
    refreshToken  = cfg.refreshToken;
    tokenExpiry   = cfg.tokenExpiry || 0;
    spreadsheetId = cfg.spreadsheetId;
    showApp();
    await connectToSheets();
  } else {
    showAuth();
  }

  // Wire up auto-updater notifications
  api.onUpdateAvailable((info) => {
    showToast(`✨ Update v${info.version} downloading…`);
  });
  api.onUpdateDownloaded((info) => {
    showUpdateBanner(info.version);
  });

  // Show app version in sidebar
  const ver = await api.getVersion();
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = `v${ver}`;
}

function showAuth() {
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app').style.display = 'none';
  document.getElementById('btn-google-signin').onclick = startOAuth;
}

function showApp() {
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app').style.display = 'flex';
}

// Listen for auth code pushed from main process after browser redirect
api.onOauthCode(async ({ code }) => {
  const errEl = document.getElementById('auth-error');
  try {
    const tokens = await api.oauthExchange({ code, redirectUri });
    if (tokens.access_token) {
      accessToken  = tokens.access_token;
      refreshToken = tokens.refresh_token;
      tokenExpiry  = Date.now() + (tokens.expires_in || 3600) * 1000;

      // Fetch the signed-in user's email to detect account switches
      document.getElementById('auth-status').textContent = 'Signing you in…';
      const userInfo = await fetchUserInfo(accessToken);
      const newEmail = userInfo ? userInfo.email : null;

      const existingCfg = await api.loadConfig();
      const previousEmail = existingCfg && existingCfg.userEmail;

      // Clear cache if a different user is signing in
      if (previousEmail && newEmail && previousEmail !== newEmail) {
        await api.saveCache([]);
      }

      // Search Google Drive for an existing TaskSpark spreadsheet
      document.getElementById('auth-status').textContent = 'Looking for your spreadsheet…';
      const existingSheet = await api.driveFindSheet({ accessToken });
      console.log('[oauth] driveFindSheet result:', JSON.stringify(existingSheet));

      if (existingSheet && existingSheet.id) {
        spreadsheetId = existingSheet.id;
        console.log('[oauth] found existing spreadsheet:', spreadsheetId);
        document.getElementById('auth-status').textContent = 'Reconnecting…';
      } else {
        document.getElementById('auth-status').textContent = 'Setting up your spreadsheet…';
        const sheet = await api.driveCreateSheet({ accessToken });
        if (!sheet.spreadsheetId) throw new Error('Could not create spreadsheet');
        spreadsheetId = sheet.spreadsheetId;
        console.log('[oauth] created new spreadsheet:', spreadsheetId);
      }

      await api.saveConfig({ spreadsheetId, accessToken, refreshToken, tokenExpiry, userEmail: newEmail });
      showApp();
      await connectToSheets();
    } else {
      throw new Error(tokens.error_description || 'No access token received');
    }
  } catch (e) {
    errEl.textContent = `Sign-in failed: ${e.message}`; errEl.style.display = 'block';
    document.getElementById('auth-waiting').style.display = 'none';
    document.getElementById('btn-google-signin').disabled = false;
  }
});

async function startOAuth() {
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-waiting').style.display = 'block';
  document.getElementById('auth-status').textContent = 'Waiting for Google sign-in…';
  document.getElementById('btn-google-signin').disabled = true;
  try {
    const result = await api.oauthStart();
    if (result.waiting) redirectUri = result.redirectUri;
  } catch (e) {
    document.getElementById('auth-error').textContent = `Error: ${e.message}`;
    document.getElementById('auth-error').style.display = 'block';
    document.getElementById('auth-waiting').style.display = 'none';
    document.getElementById('btn-google-signin').disabled = false;
  }
}

async function fetchUserInfo(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return await res.json();
  } catch { return null; }
}

async function ensureToken() {
  if (Date.now() < tokenExpiry - 60000) return;
  try {
    const tokens = await api.oauthRefresh({ refreshToken });
    if (tokens.access_token) {
      accessToken = tokens.access_token;
      tokenExpiry = Date.now() + (tokens.expires_in || 3600) * 1000;
      await api.saveConfig({ accessToken, tokenExpiry });
    }
  } catch (e) {}
}

async function signOut() {
  if (!confirm('Sign out of TaskSpark?\n\nYour tasks will remain in your Google Sheet.')) return;
  await api.saveConfig({ accessToken: null, refreshToken: null, tokenExpiry: 0, userEmail: null, spreadsheetId: null });
  location.reload();
}

// ── Sheets connection ──────────────────────────────────────────────────────
async function connectToSheets() {
  setSyncStatus('syncing');
  tasks = await api.loadCache();
  console.log('[connectToSheets] cache loaded, tasks:', tasks.length, 'spreadsheetId:', spreadsheetId);
  renderAll();

  try {
    await ensureToken();
    await api.sheetsEnsure({ accessToken, spreadsheetId });
    const loaded = await api.sheetsLoad({ accessToken, spreadsheetId });
    console.log('[connectToSheets] sheet loaded, tasks:', loaded.length);
    if (loaded.length) {
      tasks = loaded;
      console.log('[connectToSheets] using sheet tasks');
    } else if (!tasks.length) {
      tasks = sampleTasks();
      console.log('[connectToSheets] no tasks anywhere — using sample tasks');
      await api.sheetsSave({ accessToken, spreadsheetId, tasks });
    } else {
      console.log('[connectToSheets] sheet empty but cache has tasks — keeping cache');
    }
    await api.saveCache(tasks);
    setSyncStatus('ok');
    renderAll();
  } catch (e) {
    console.error('[connectToSheets] error:', e.message);
    setSyncStatus('error', e.message.slice(0, 50));
  }
}

async function refreshFromSheets() {
  setSyncStatus('syncing');
  try {
    await ensureToken();
    tasks = await api.sheetsLoad({ accessToken, spreadsheetId });
    await api.saveCache(tasks);
    setSyncStatus('ok');
    renderAll();
  } catch (e) { setSyncStatus('error', e.message.slice(0, 50)); }
}

async function saveTasks() {
  await api.saveCache(tasks);
  setSyncStatus('syncing');
  try {
    await ensureToken();
    await api.sheetsSave({ accessToken, spreadsheetId, tasks });
    setSyncStatus('ok');
  } catch (e) { setSyncStatus('error', e.message.slice(0, 50)); }
}

function sampleTasks() {
  const now = new Date().toISOString();
  return [
    { id:1, title:'Review quarterly report', desc:'Check Q3 figures', priority:'high',
      due:todayStr(), tags:['work'], completed:false, createdAt:now, completedAt:'',
      timeLogged:0, timeSessions:[], impact:'', outcome:'', deliverable:'', estimate:0 },
    { id:2, title:'Buy groceries', desc:'', priority:'medium', due:'',
      tags:['personal'], completed:false, createdAt:now, completedAt:'',
      timeLogged:0, timeSessions:[], impact:'', outcome:'', deliverable:'', estimate:0 },
    { id:3, title:'Schedule dentist', desc:'', priority:'low', due:'',
      tags:['health'], completed:false, createdAt:now, completedAt:'',
      timeLogged:0, timeSessions:[], impact:'', outcome:'', deliverable:'', estimate:0 },
  ];
}

// ── Undo ───────────────────────────────────────────────────────────────────
function pushUndo(desc) {
  undoStack.push({ desc, snapshot: JSON.parse(JSON.stringify(tasks)) });
  if (undoStack.length > 20) undoStack.shift();
}

function undo() {
  if (!undoStack.length) { showToast('Nothing to undo'); return; }
  const { desc, snapshot } = undoStack.pop();
  tasks = snapshot;
  saveTasks();
  renderAll();
  showToast(`↩ Undid: ${desc}`);
}

function showToast(msg) {
  const lbl = document.getElementById('sync-lbl');
  lbl.textContent = msg; lbl.style.color = 'var(--accent)';
  setTimeout(() => setSyncStatus('ok'), 2500);
}

function showUpdateBanner(version) {
  const banner = document.getElementById('update-banner');
  const verSpan = document.getElementById('update-version');
  if (banner) {
    if (verSpan) verSpan.textContent = version;
    banner.style.display = 'flex';
  }
}

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); if (settings.quickAddEnabled) openQuickAdd(); return; }
  if (e.key === 'Escape') {
    closeAllModals();
    document.getElementById('quick-add-overlay').classList.remove('open');
  }
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey &&
      document.activeElement.tagName !== 'INPUT' &&
      document.activeElement.tagName !== 'TEXTAREA') {
    openTaskModal();
  }
});

// ── Filter / sort ──────────────────────────────────────────────────────────
function filterTasks() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const t = todayStr();
  return tasks.filter(task => {
    if (q && !task.title.toLowerCase().includes(q) &&
        !(task.desc||'').toLowerCase().includes(q) &&
        !(task.tags||[]).some(tg => tg.toLowerCase().includes(q))) return false;
    const v = currentView;
    if (v === 'all')             return !task.completed;
    if (v === 'today')           return !task.completed && task.due === t;
    if (v === 'overdue')         return !task.completed && task.due && task.due < t;
    if (v === 'completed')       return task.completed;
    if (v === 'priority-high')   return !task.completed && task.priority === 'high';
    if (v === 'priority-medium') return !task.completed && task.priority === 'medium';
    if (v === 'priority-low')    return !task.completed && task.priority === 'low';
    if (v.startsWith('tag:'))    return (task.tags||[]).includes(v.slice(4));
    return false;
  });
}

function sortTasks(arr) {
  const s = document.getElementById('sort-select').value;
  const pmap = { high:0, medium:1, low:2 };
  const copy = [...arr];
  if (s === 'created')  copy.sort((a,b) => b.id - a.id);
  else if (s === 'due') copy.sort((a,b) => (a.due||'9999').localeCompare(b.due||'9999'));
  else if (s === 'priority') copy.sort((a,b) => (pmap[a.priority]||1)-(pmap[b.priority]||1));
  else if (s === 'alpha') copy.sort((a,b) => a.title.localeCompare(b.title));
  return copy;
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderAll() {
  renderTasks();
  updateCounts();
  updateTagSidebar();
  updateStreak();
}

function onSortChange() {
  const val = document.getElementById('sort-select').value;
  api.saveConfig({ sortMode: val });
  renderTasks();
}

function renderTasks() {
  const list = document.getElementById('task-list');
  const filtered = sortTasks(filterTasks());

  if (!filtered.length) {
    const msg = currentView === 'completed' ? 'No completed tasks yet' : 'All clear!';
    const sub = currentView === 'completed' ? 'Complete a task to see it here' : 'Add a new task to get started';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-text">${msg}</div><div class="empty-sub">${sub}</div></div>`;
    updateStats();
    return;
  }

  list.innerHTML = filtered.map(task => taskCardHTML(task)).join('');
  updateStats();
}

function taskCardHTML(task) {
  const ds = dueStatus(task.due);
  const isRunning = activeTimerId === task.id;
  const pColors = { high:'var(--red)', medium:'var(--amber)', low:'var(--blue)' };

  // Due badge
  let dueBadge = '';
  if (task.due) {
    const cls = ds === 'overdue' ? 'overdue' : ds === 'today' ? 'today' : ds === 'soon' ? 'soon' : '';
    const icon = ds === 'overdue' ? '⚠' : '◷';
    const lbl  = ds === 'overdue' ? `${icon} ${fmtDate(task.due)}` : ds === 'today' ? `${icon} Today` : ds === 'soon' ? `→ ${fmtDate(task.due)}` : `○ ${fmtDate(task.due)}`;
    dueBadge = `<span class="badge badge-due ${cls}">${esc(lbl)}</span>`;
  }

  // Tag badges
  const tagBadges = settings.tagsEnabled ? (task.tags||[]).map(t =>
    `<span class="badge badge-tag" style="background:${getTagColor(t)}">${esc(t)}</span>`
  ).join('') : '';

  // Estimate / time badge
  let timeBadge = '';
  if (settings.estimatesEnabled && task.estimate && !task.completed) {
    const loggedMins = Math.floor((task.timeLogged||0) / 60);
    const over = loggedMins > task.estimate;
    const display = (isRunning || task.timeLogged) ? `⏱ ${loggedMins}/${task.estimate}m` : `⏱ ~${task.estimate}m`;
    timeBadge = `<span class="badge badge-estimate ${over?'over':''}">${display}</span>`;
  }

  // Live timer badge
  let liveTimeBadge = '';
  if (isRunning || task.timeLogged) {
    const base = task.timeLogged || 0;
    const disp = fmtSecs(isRunning ? base + Math.floor((Date.now()/1000) - timerStart) : base);
    liveTimeBadge = `<span class="badge badge-time ${isRunning?'running':''}" id="time-badge-${task.id}">◷ ${disp}</span>`;
  }

  // Completion detail
  let completionDetail = '';
  if (task.completed && (task.impact || task.outcome)) {
    const impBadge = task.impact ? `<span class="impact-badge impact-${task.impact}">${task.impact.charAt(0).toUpperCase()+task.impact.slice(1)} Impact</span>` : '';
    const outcomeText = task.outcome ? `<span>${esc(task.outcome)}</span>` : '';
    const delivLink = task.deliverable ? `<a class="deliverable-link" href="${esc(task.deliverable)}" target="_blank">🔗 ${esc(task.deliverable)}</a>` : '';
    completionDetail = `<div class="completion-detail">${impBadge}${outcomeText}${delivLink}</div>`;
  }

  // Timer button
  const timerBtn = !task.completed ? `
    <button class="action-btn timer ${isRunning?'running':''}" onclick="toggleTimer(${task.id})" title="${isRunning?'Stop':'Start'} timer">
      ${isRunning ? '■' : '▶'}
    </button>` : '';

  const cardClass = [
    'task-card',
    `priority-${task.priority}`,
    task.completed ? 'completed' : '',
  ].filter(Boolean).join(' ');

  return `
  <div class="${cardClass}" id="task-card-${task.id}">
    <div class="task-check-wrap">
      <div class="task-checkbox ${task.completed?'checked':''}" onclick="toggleComplete(${task.id})">${task.completed?'✓':''}</div>
    </div>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      ${task.desc ? `<div class="task-desc">${esc(task.desc)}</div>` : ''}
      <div class="task-meta">
        <span class="badge badge-priority-${task.priority}">${task.priority.charAt(0).toUpperCase()+task.priority.slice(1)}</span>
        ${dueBadge}${tagBadges}${timeBadge}${liveTimeBadge}
      </div>
      ${completionDetail}
    </div>
    <div class="task-actions">
      ${timerBtn}
      <button class="action-btn" onclick="openTaskModal(${task.id})" title="Edit">✎</button>
      <button class="action-btn delete" onclick="deleteTask(${task.id})" title="Delete">✕</button>
    </div>
  </div>`;
}

function updateStats() {
  const total = tasks.length;
  const done  = tasks.filter(t => t.completed).length;
  const pct   = total ? Math.round(done/total*100) : 0;
  document.getElementById('stat-total').textContent  = total;
  document.getElementById('stat-active').textContent = total - done;
  document.getElementById('stat-done').textContent   = done;
  document.getElementById('progress-bar-inner').style.width = pct + '%';
  document.getElementById('progress-pct').textContent = pct + '%';
}

function updateCounts() {
  const t = todayStr();
  const active = tasks.filter(x => !x.completed);
  document.getElementById('cnt-all').textContent       = active.length;
  document.getElementById('cnt-today').textContent     = active.filter(x => x.due === t).length;
  document.getElementById('cnt-overdue').textContent   = active.filter(x => x.due && x.due < t).length;
  document.getElementById('cnt-completed').textContent = tasks.filter(x => x.completed).length;
  document.getElementById('cnt-high').textContent      = active.filter(x => x.priority === 'high').length;
  document.getElementById('cnt-medium').textContent    = active.filter(x => x.priority === 'medium').length;
  document.getElementById('cnt-low').textContent       = active.filter(x => x.priority === 'low').length;
}

function updateTagSidebar() {
  const tagSet = {};
  tasks.forEach(t => (t.tags||[]).forEach(tag => { tagSet[tag] = (tagSet[tag]||0)+1; }));
  document.getElementById('tag-list').innerHTML = Object.keys(tagSet).sort().map(tag => `
    <div class="sidebar-item" onclick="setView('tag:${esc(tag)}',this)">
      <span class="tag-dot" style="background:${getTagColor(tag)}"></span>
      <span>${esc(tag)}</span>
      <span class="si-count">${tagSet[tag]}</span>
    </div>`).join('');
}

function updateStreak() {
  const streak  = calcStreak();
  const longest = calcLongestStreak();
  const icon = document.getElementById('streak-icon');
  const text = document.getElementById('streak-text');
  const best = document.getElementById('streak-best');
  if (streak > 0) {
    icon.textContent = '🔥'; text.textContent = `${streak} day streak`;
    text.style.color = 'var(--amber)'; icon.style.color = '';
  } else {
    icon.textContent = '○'; text.textContent = 'No streak yet';
    text.style.color = 'var(--text2)';
  }
  best.textContent = longest > 0 ? `🏆 Best: ${longest} days` : '';
}

function calcStreak() {
  const dates = new Set(tasks
    .filter(t => t.completed && t.completedAt)
    .map(t => t.completedAt.slice(0,10)));
  let streak = 0;
  let check  = new Date();
  while (true) {
    const day = check.getDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) { check.setDate(check.getDate()-1); continue; }
    if (dates.has(check.toISOString().split('T')[0])) {
      streak++; check.setDate(check.getDate()-1);
    } else break;
  }
  return streak;
}

function calcLongestStreak() {
  const dates = new Set(tasks
    .filter(t => t.completed && t.completedAt)
    .map(t => t.completedAt.slice(0,10)));
  if (!dates.size) return 0;
  const sorted = [...dates].sort();
  const earliest = new Date(sorted[0] + 'T00:00:00');
  const today    = new Date();
  let best = 0, current = 0, check = new Date(earliest);
  while (check <= today) {
    const day = check.getDay();
    if (day === 0 || day === 6) { check.setDate(check.getDate()+1); continue; }
    if (dates.has(check.toISOString().split('T')[0])) {
      current++; best = Math.max(best, current);
    } else { current = 0; }
    check.setDate(check.getDate()+1);
  }
  return best;
}

// ── View ───────────────────────────────────────────────────────────────────
function setView(view, el) {
  currentView = view;
  const titles = { all:'All Tasks', today:'Due Today', overdue:'Overdue', completed:'Completed',
    'priority-high':'High Priority', 'priority-medium':'Medium Priority', 'priority-low':'Low Priority' };
  document.getElementById('view-title').textContent =
    view.startsWith('tag:') ? '#' + view.slice(4) : (titles[view] || view);
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const match = document.querySelector(`[data-view="${view}"]`);
    if (match) match.classList.add('active');
  }
  renderTasks();
}

// ── Task CRUD ──────────────────────────────────────────────────────────────
function openTaskModal(id = null) {
  editingId = id;
  modalTags = [];
  modalDue  = '';
  document.getElementById('task-modal-title').textContent = id ? 'Edit Task' : 'New Task';

  if (id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    document.getElementById('tm-title').value    = task.title;
    document.getElementById('tm-desc').value     = task.desc || '';
    document.getElementById('tm-priority').value = task.priority;
    document.getElementById('tm-estimate').value = task.estimate || '';
    modalTags = [...(task.tags || [])];
    modalDue  = task.due || '';
  } else {
    document.getElementById('tm-title').value    = '';
    document.getElementById('tm-desc').value     = '';
    document.getElementById('tm-priority').value = 'medium';
    document.getElementById('tm-estimate').value = '';
  }

  renderModalTags();
  refreshDueBtn();
  document.getElementById('task-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('tm-title').focus(), 100);
}

function saveTask() {
  const title = document.getElementById('tm-title').value.trim();
  if (!title) { document.getElementById('tm-title').focus(); return; }

  const data = {
    title,
    desc:     document.getElementById('tm-desc').value.trim(),
    priority: document.getElementById('tm-priority').value,
    due:      modalDue,
    tags:     [...modalTags],
    estimate: parseInt(document.getElementById('tm-estimate').value) || 0,
  };

  pushUndo(editingId ? 'Edit task' : 'Add task');

  if (editingId) {
    const task = tasks.find(t => t.id === editingId);
    if (task) Object.assign(task, data);
  } else {
    tasks.push({
      id: Date.now(), completed: false,
      createdAt: new Date().toISOString(), completedAt: '',
      timeLogged: 0, timeSessions: [],
      impact: '', outcome: '', deliverable: '',
      ...data
    });
  }

  closeModal('task-modal-overlay');
  saveTasks();
  renderAll();
}

function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  if (activeTimerId === id) cancelTimer();
  pushUndo('Delete task');
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  renderAll();
}

function toggleComplete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const completing = !task.completed;
  pushUndo(completing ? 'Complete task' : 'Uncomplete task');

  if (completing) {
    if (activeTimerId === id) stopTimerSave();
    task.completed  = true;
    task.completedAt = new Date().toISOString();
    if (!settings.completionDialog) { saveTasks(); renderAll(); return; }
    // Show completion dialog
    completionTaskId = id;
    selectedImpact   = 'medium';
    document.getElementById('cm-task-name').textContent = task.title.length > 50 ? task.title.slice(0,48)+'…' : task.title;
    document.getElementById('cm-outcome').value    = '';
    document.getElementById('cm-deliverable').value = '';
    selectImpact('medium');
    document.getElementById('completion-modal-overlay').classList.add('open');
  } else {
    task.completed   = false;
    task.completedAt = '';
    task.impact = task.outcome = task.deliverable = '';
    saveTasks(); renderAll();
  }
}

function saveCompletion(skip) {
  const task = tasks.find(t => t.id === completionTaskId);
  if (task && !skip) {
    task.impact      = selectedImpact;
    task.outcome     = document.getElementById('cm-outcome').value.trim();
    task.deliverable = document.getElementById('cm-deliverable').value.trim();
  }
  closeModal('completion-modal-overlay');

  // If break was snoozed, show break now
  if (breakSnoozed) {
    breakSnoozed = false;
    clearBreakTimer();
    setTimeout(showBreakPanel, 200);
  }

  saveTasks(); renderAll();
}

function selectImpact(level) {
  selectedImpact = level;
  ['low','medium','high'].forEach(l => {
    const el = document.getElementById(`imp-${l}`);
    el.className = `impact-opt ${l === level ? 'selected-'+l : ''}`;
  });
}

// ── Tags ───────────────────────────────────────────────────────────────────
function handleTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,/g,'');
    if (val && !modalTags.includes(val)) { modalTags.push(val); getTagColor(val); renderModalTags(); }
    e.target.value = '';
  } else if (e.key === 'Backspace' && !e.target.value && modalTags.length) {
    modalTags.pop(); renderModalTags();
  }
}

function removeModalTag(tag) { modalTags = modalTags.filter(t => t !== tag); renderModalTags(); }

function renderModalTags() {
  document.getElementById('tm-tag-pills').innerHTML = modalTags.map(tag =>
    `<span class="tag-pill" style="background:${getTagColor(tag)}">${esc(tag)}<button class="tag-pill-x" onclick="removeModalTag('${esc(tag)}')">&times;</button></span>`
  ).join('');
}

// ── Calendar ───────────────────────────────────────────────────────────────
function toggleCalendar() {
  const popup = document.getElementById('calendar-popup');
  if (popup.style.display === 'none') {
    const d = modalDue ? new Date(modalDue + 'T00:00:00') : new Date();
    calYear = d.getFullYear(); calMonth = d.getMonth();
    renderCalendar();
    // Position using fixed coords relative to the button
    const btn  = document.getElementById('tm-due-btn');
    const rect = btn.getBoundingClientRect();
    const popupH = 320; // approximate calendar height
    const spaceBelow = window.innerHeight - rect.bottom;
    popup.style.display = 'block';
    popup.style.left    = rect.left + 'px';
    popup.style.width   = rect.width + 'px';
    // Open upward if not enough space below
    if (spaceBelow < popupH && rect.top > popupH) {
      popup.style.top    = (rect.top - popup.offsetHeight - 4) + 'px';
      popup.style.bottom = 'auto';
    } else {
      popup.style.top    = (rect.bottom + 4) + 'px';
      popup.style.bottom = 'auto';
    }
    setTimeout(() => document.addEventListener('click', closeCalendarOutside), 0);
  } else {
    popup.style.display = 'none';
  }
}

function closeCalendarOutside(e) {
  const popup = document.getElementById('calendar-popup');
  const btn   = document.getElementById('tm-due-btn');
  if (!popup.contains(e.target) && !btn.contains(e.target)) {
    popup.style.display = 'none';
    document.removeEventListener('click', closeCalendarOutside);
  }
}

function renderCalendar() {
  const popup = document.getElementById('calendar-popup');
  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const today = todayStr();

  // Get first day and days in month
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Monday start

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = [
      'cal-cell',
      dateStr === today ? 'today' : '',
      dateStr === modalDue ? 'selected' : '',
    ].filter(Boolean).join(' ');
    cells += `<div class="${cls}" onclick="pickDate('${dateStr}')">${d}</div>`;
  }

  popup.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" onclick="calNav(-1)">‹</button>
      <span class="cal-month">${monthNames[calMonth]} ${calYear}</span>
      <button class="cal-nav" onclick="calNav(1)">›</button>
    </div>
    <div class="cal-days-hdr">
      ${['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => `<div class="cal-day-hdr">${d}</div>`).join('')}
    </div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-clear"><button class="cal-clear-btn" onclick="pickDate('')">Clear date</button></div>`;
}

function calNav(dir) {
  calMonth += dir;
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0;  calYear++; }
  renderCalendar();
}

function pickDate(dateStr) {
  modalDue = dateStr;
  refreshDueBtn();
  document.getElementById('calendar-popup').style.display = 'none';
  document.removeEventListener('click', closeCalendarOutside);
}

function refreshDueBtn() {
  const btn = document.getElementById('tm-due-btn');
  const lbl = document.getElementById('tm-due-label');
  if (modalDue) {
    lbl.textContent = fmtDate(modalDue);
    btn.classList.add('has-date');
  } else {
    lbl.textContent = 'Pick a date';
    btn.classList.remove('has-date');
  }
}

// ── Timer ──────────────────────────────────────────────────────────────────
function toggleTimer(id) {
  if (activeTimerId === id) { stopTimer(); return; }
  if (activeTimerId !== null) stopTimerSave();

  const task = tasks.find(t => t.id === id);
  if (!task) return;

  activeTimerId = id;
  timerStart    = Date.now() / 1000;
  breakSnoozed  = false;

  // Open the separate always-on-top timer window
  api.timerShow({
    taskName:   task.title,
    baseLogged: task.timeLogged || 0,
  });

  // Start local tick for task card badge updates
  timerInterval = setInterval(tickTimer, 1000);

  // Schedule break check
  scheduleBreak();
  renderTasks();

  // Minimize main window — timer window stays visible
  api.minimize();
}

function tickTimer() {
  if (!activeTimerId || !timerStart) return;
  const task    = tasks.find(t => t.id === activeTimerId);
  const base    = task ? (task.timeLogged || 0) : 0;
  const elapsed = Math.floor(Date.now()/1000 - timerStart);
  const total   = base + elapsed;
  // Update live badge in task card
  const badge = document.getElementById(`time-badge-${activeTimerId}`);
  if (badge) badge.textContent = `◷ ${fmtSecs(total)}`;
}

function stopTimer() {
  // Close the separate timer window — the 'timer-stopped' IPC event
  // will fire back and handle saving + restoring the main window
  api.timerHide();
  // Also clear local state immediately so UI updates
  clearInterval(timerInterval); timerInterval = null;
  clearBreakTimer();
}

function stopTimerSave() {
  if (!activeTimerId || !timerStart) return;
  const elapsed = Math.floor(Date.now()/1000 - timerStart);
  const task    = tasks.find(t => t.id === activeTimerId);
  if (task) {
    task.timeLogged = (task.timeLogged || 0) + elapsed;
    task.timeSessions = task.timeSessions || [];
    task.timeSessions.push({ start: new Date(timerStart*1000).toISOString(), elapsed });
  }
  clearInterval(timerInterval);
  timerInterval = null;
  activeTimerId = null;
  timerStart    = null;
}

function cancelTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  activeTimerId = null;
  timerStart    = null;
  clearBreakTimer();
  document.getElementById('timer-overlay').classList.remove('active');
}

// ── Break ──────────────────────────────────────────────────────────────────
function scheduleBreak() {
  clearBreakTimer();
  if (!settings.breakEnabled) return;
  breakAfterTimer = setTimeout(onBreakDue, getBreakIntervalMs());
}

function clearBreakTimer() {
  if (breakAfterTimer) { clearTimeout(breakAfterTimer); breakAfterTimer = null; }
  if (breakInterval)   { clearInterval(breakInterval);  breakInterval = null; }
}

function onBreakDue() {
  if (breakSnoozed || !activeTimerId) return;
  // Play sound before showing the prompt
  playBreakSound();
  // Show as a separate always-on-top window near the timer
  api.breakPromptShow({ intervalMins: settings.breakIntervalMins });
}

function takeBreak() {
  // Save and fully stop the timer
  if (activeTimerId && timerStart) {
    const elapsed = Math.floor(Date.now()/1000 - timerStart);
    const task = tasks.find(t => t.id === activeTimerId);
    if (task) {
      task.timeLogged = (task.timeLogged||0) + elapsed;
      task.timeSessions = task.timeSessions || [];
      task.timeSessions.push({ start: new Date(timerStart*1000).toISOString(), elapsed });
    }
    saveTasks();
  }
  // Close the timer window and clear state
  api.timerHide();
  clearInterval(timerInterval);
  timerInterval = null;
  timerStart    = null;
  activeTimerId = null;
  clearBreakTimer();
  // Restore window then show break panel
  api.restore();
  setTimeout(showBreakPanel, 150);
}

function snoozeBreak() {
  breakSnoozed = true;
}

function showBreakPanel() {
  breakRemaining = getBreakDurationS();
  document.getElementById('break-panel').classList.add('active');
  tickBreak();
  breakInterval = setInterval(tickBreak, 1000);
}

function tickBreak() {
  const m = Math.floor(breakRemaining/60), s = breakRemaining%60;
  document.getElementById('break-countdown').textContent = `${m}:${String(s).padStart(2,'0')}`;
  if (breakRemaining <= 0) { endBreak(); return; }
  breakRemaining--;
}

function finishBreak() { endBreak(); }

function endBreak() {
  clearInterval(breakInterval); breakInterval = null;
  document.getElementById('break-panel').classList.remove('active');
  api.restore();
  // Resume timer if task still active
  if (activeTimerId) {
    timerStart    = Date.now() / 1000;
    timerInterval = setInterval(tickTimer, 1000);
    document.getElementById('timer-overlay').classList.add('active');
    scheduleBreak();
  }
  renderAll();
}

// ── What Now ───────────────────────────────────────────────────────────────
let whatNowTaskId = null;

function whatNow() {
  const active = tasks.filter(t => !t.completed);
  if (!active.length) { showToast('No active tasks — add one to get started!'); return; }
  const t = todayStr();
  const pmap = { high:0, medium:1, low:2 };
  const best = active.reduce((a, b) => {
    const sa = [pmap[a.priority]||1, a.due&&a.due<t?0:a.due===t?1:a.due?2:3, -(a.id)];
    const sb = [pmap[b.priority]||1, b.due&&b.due<t?0:b.due===t?1:b.due?2:3, -(b.id)];
    return sa[0]!==sb[0]?sa[0]<sb[0]?a:b:sa[1]!==sb[1]?sa[1]<sb[1]?a:b:sa[2]<sb[2]?a:b;
  });
  whatNowTaskId = best.id;
  document.getElementById('wn-title').textContent = best.title;
  const meta = document.getElementById('wn-meta');
  meta.innerHTML = `
    <span class="badge badge-priority-${best.priority}">${best.priority.charAt(0).toUpperCase()+best.priority.slice(1)}</span>
    ${best.due ? `<span class="badge badge-due ${dueStatus(best.due)||''}">◷ ${fmtDate(best.due)}</span>` : ''}
    ${(best.tags||[]).map(tg=>`<span class="badge badge-tag" style="background:${getTagColor(tg)}">${esc(tg)}</span>`).join('')}
  `;
  document.getElementById('wn-start-btn').onclick = () => {
    closeModal('whatnow-modal-overlay');
    toggleTimer(whatNowTaskId);
  };
  document.getElementById('whatnow-modal-overlay').classList.add('open');
}

// ── Quick add ──────────────────────────────────────────────────────────────
function openQuickAdd() {
  document.getElementById('quick-add-overlay').classList.add('open');
  document.getElementById('quick-add-input').value = '';
  setTimeout(() => document.getElementById('quick-add-input').focus(), 50);
}

function closeQuickAdd(e) {
  if (e.target === document.getElementById('quick-add-overlay')) {
    document.getElementById('quick-add-overlay').classList.remove('open');
  }
}

function quickAddKey(e) {
  if (e.key === 'Enter') {
    const title = e.target.value.trim();
    if (title) {
      pushUndo('Add task');
      tasks.push({ id: Date.now(), title, desc:'', priority:'medium', due:'', tags:[],
        completed:false, createdAt:new Date().toISOString(), completedAt:'',
        timeLogged:0, timeSessions:[], impact:'', outcome:'', deliverable:'', estimate:0 });
      saveTasks(); renderAll();
    }
    document.getElementById('quick-add-overlay').classList.remove('open');
  }
}

// ── Modals ─────────────────────────────────────────────────────────────────
function closeModal(overlayId) {
  document.getElementById(overlayId).classList.remove('open');
}
function closeModalOutside(e, overlayId) {
  if (e.target.id === overlayId) closeModal(overlayId);
}
function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
}


// -- Settings --
function applySettings() {
  const s = settings;
  // Tags sidebar + form
  const tagsHdr = document.getElementById('tags-hdr');
  const tagsSection = document.getElementById('tags-section');
  if (tagsHdr) tagsHdr.style.display = s.tagsEnabled ? '' : 'none';
  if (tagsSection) tagsSection.style.display = s.tagsEnabled ? '' : 'none';
  const tagFormGroup = document.getElementById('tag-form-group');
  if (tagFormGroup) tagFormGroup.style.display = s.tagsEnabled ? '' : 'none';
  // Streak widget
  const sw = document.querySelector('.streak-widget');
  if (sw) sw.style.display = s.streakEnabled ? '' : 'none';
  // What Now button
  const wnb = document.querySelector('.btn-what-now');
  if (wnb) wnb.style.display = s.whatNowEnabled ? '' : 'none';
  // Estimate form row
  const estRow = document.getElementById('estimate-form-group');
  if (estRow) estRow.style.display = s.estimatesEnabled ? '' : 'none';
  // Mood check-in button
  const moodBtn = document.getElementById('mood-sidebar-btn');
  if (moodBtn) moodBtn.style.display = s.moodEnabled ? '' : 'none';
  if (!s.moodEnabled) closeModal('mood-modal-overlay');
}

function openSettings() {
  const s = settings;
  // Sync dark mode toggle to current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('set-darkmode').checked = isDark;
  document.getElementById('set-break-enabled').checked      = s.breakEnabled;
  document.getElementById('set-break-interval').value       = s.breakIntervalMins;
  document.getElementById('set-break-duration').value       = s.breakDurationMins;
  document.getElementById('set-tags').checked               = s.tagsEnabled;
  document.getElementById('set-streak').checked             = s.streakEnabled;
  document.getElementById('set-estimates').checked          = s.estimatesEnabled;
  document.getElementById('set-quickadd').checked           = s.quickAddEnabled;
  document.getElementById('set-whatnow').checked            = s.whatNowEnabled;
  document.getElementById('set-completion').checked         = s.completionDialog;
  document.getElementById('set-sound-enabled').checked      = s.soundEnabled;
  document.getElementById('set-mood-enabled').checked        = s.moodEnabled;
  const soundPath = document.getElementById('sound-file-path');
  soundPath.textContent = s.soundFile ? s.soundFile.split(/[\\/]/).pop() : 'Default (gentle ambient tone)';
  soundPath.style.color = s.soundFile ? 'var(--text)' : 'var(--text3)';
  toggleBreakInputs();
  document.getElementById('settings-modal-overlay').classList.add('open');
}

async function pickSoundFile() {
  const filePath = await api.pickSoundFile();
  if (!filePath) return;
  settings.soundFile = filePath;
  const soundPath = document.getElementById('sound-file-path');
  soundPath.textContent = filePath.split(/[\\/]/).pop();
  soundPath.style.color = 'var(--text)';
}

function clearSoundFile() {
  settings.soundFile = null;
  const soundPath = document.getElementById('sound-file-path');
  soundPath.textContent = 'Default (gentle ambient tone)';
  soundPath.style.color = 'var(--text3)';
}

function previewSound() {
  const wasEnabled = settings.soundEnabled;
  settings.soundEnabled = true;
  // Temporarily use whatever file is currently selected in the UI
  const soundPath = document.getElementById('sound-file-path').textContent;
  playBreakSound();
  settings.soundEnabled = wasEnabled;
}

function toggleBreakInputs() {
  const enabled = document.getElementById('set-break-enabled').checked;
  const row = document.getElementById('break-timing-row');
  if (row) row.style.opacity = enabled ? '1' : '0.4';
  document.getElementById('set-break-interval').disabled = !enabled;
  document.getElementById('set-break-duration').disabled = !enabled;
}

function saveSettingsFromModal() {
  settings.breakEnabled      = document.getElementById('set-break-enabled').checked;
  settings.breakIntervalMins = parseInt(document.getElementById('set-break-interval').value) || 30;
  settings.breakDurationMins = parseInt(document.getElementById('set-break-duration').value) || 5;
  settings.tagsEnabled       = document.getElementById('set-tags').checked;
  settings.streakEnabled     = document.getElementById('set-streak').checked;
  settings.estimatesEnabled  = document.getElementById('set-estimates').checked;
  settings.quickAddEnabled   = document.getElementById('set-quickadd').checked;
  settings.whatNowEnabled    = document.getElementById('set-whatnow').checked;
  settings.completionDialog  = document.getElementById('set-completion').checked;
  settings.soundEnabled      = document.getElementById('set-sound-enabled').checked;
  settings.moodEnabled       = document.getElementById('set-mood-enabled').checked;
  api.saveConfig({ settings });
  applySettings();
  renderAll();
  closeModal('settings-modal-overlay');
  showToast('Settings saved');
}

// ── Export ─────────────────────────────────────────────────────────────────
// ── Export ─────────────────────────────────────────────────────────────────
let exportOption = 'all';

function openExportModal() {
  selectExportOption('all');
  document.getElementById('export-modal-overlay').classList.add('open');
}

function selectExportOption(opt) {
  exportOption = opt;
  document.getElementById('export-opt-all').classList.toggle('selected', opt === 'all');
  document.getElementById('export-opt-completed').classList.toggle('selected', opt === 'completed');
}

function runExport() {
  const toExport = exportOption === 'completed'
    ? tasks.filter(t => t.completed)
    : [...tasks];

  if (!toExport.length) {
    showToast(exportOption === 'completed' ? 'No completed tasks to export yet.' : 'No tasks to export yet.');
    return;
  }

  const headers = ['Title','Description','Priority','Status','Tags','Due Date',
    'Time Logged','Impact','Outcome','Deliverable','Completed At','Created At'];

  const rows = toExport.map(t => [
    t.title, t.desc||'',
    t.priority.charAt(0).toUpperCase()+t.priority.slice(1),
    t.completed ? 'Completed' : 'Active',
    (t.tags||[]).join(';'),
    t.due ? fmtDate(t.due) : '',
    t.timeLogged ? fmtSecs(t.timeLogged) : '',
    t.impact||'', t.outcome||'', t.deliverable||'',
    t.completedAt ? new Date(t.completedAt).toLocaleString() : '',
    t.createdAt   ? new Date(t.createdAt).toLocaleString()   : '',
  ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));

  const csv      = [headers.join(','), ...rows].join('\n');
  const blob     = new Blob([csv], { type:'text/csv' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const filename = exportOption === 'completed'
    ? `completed-tasks-${todayStr()}.csv`
    : `all-tasks-${todayStr()}.csv`;
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  closeModal('export-modal-overlay');
}


// ── Mood check-in ───────────────────────────────────────────────────────────
const MOOD_LABELS = { sad: 'Not great 😔', neutral: 'Okay 😐', happy: 'Good 😊' };

function openMoodModal() {
  const saved = getTodayMood();
  highlightMoodBtn(saved);
  const savedText = document.getElementById('mood-saved-text');
  if (savedText) savedText.textContent = saved ? 'Today: ' + MOOD_LABELS[saved] : '';
  document.getElementById('mood-modal-overlay').classList.add('open');
}

function closeMoodBanner() {}

function selectMood(mood) {
  highlightMoodBtn(mood);
  saveTodayMood(mood);
  const savedText = document.getElementById('mood-saved-text');
  if (savedText) savedText.textContent = 'Today: ' + MOOD_LABELS[mood];
  setTimeout(() => closeModal('mood-modal-overlay'), 700);
}

function highlightMoodBtn(mood) {
  ['sad','neutral','happy'].forEach(m => {
    const btn = document.getElementById('mood-'+m);
    if (btn) btn.classList.toggle('selected', m === mood);
  });
}

function getTodayMood() {
  try {
    const stored = JSON.parse(localStorage.getItem('taskspark_mood') || '{}');
    return stored.date === todayStr() ? stored.mood : null;
  } catch { return null; }
}

function saveTodayMood(mood) {
  try {
    localStorage.setItem('taskspark_mood', JSON.stringify({ date: todayStr(), mood }));
  } catch {}
}

// ── Boot ───────────────────────────────────────────────────────────────────
// Listen for break choice from the separate break prompt window
api.onBreakChoice((choice) => {
  if (choice === 'break') takeBreak();
  else snoozeBreak();
});

// Listen for stop signal from the separate timer window
api.onTimerStopped((elapsed) => {
  const wasSnoozed = breakSnoozed;
  // Save elapsed time to task
  const task = tasks.find(t => t.id === activeTimerId);
  if (task && elapsed > 0) {
    task.timeLogged = (task.timeLogged || 0) + elapsed;
    task.timeSessions = task.timeSessions || [];
    task.timeSessions.push({ start: new Date((Date.now() - elapsed*1000)).toISOString(), elapsed });
  }
  // Clear timer state
  clearInterval(timerInterval); timerInterval = null;
  timerStart    = null;
  activeTimerId = null;
  clearBreakTimer();
  breakSnoozed  = false;
  saveTasks();
  renderAll();
  // Restore main window
  if (wasSnoozed) {
    setTimeout(showBreakPanel, 200);
  } else {
    api.restore();
  }
});

init();
