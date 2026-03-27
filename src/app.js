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

// View mode
let kanbanMode = false;

// Auth state
let offlineMode   = false;
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
  energyEnabled:     true,
  statusEnabled:     true,
  subtasksEnabled:   true,
  recurrenceEnabled: true,
  kanbanEnabled:     true,
  kanbanGroupByTags: true,
  streakWeekends:    false,  // include weekends in streak count
  graceDayEnabled:   true,   // allow one missed day per streak
  vacationMode:      false,  // pause streak while away
  vacationReturn:    null,   // return date YYYY-MM-DD
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
      : '../assets/break-chime.mp3';
    const audio = new Audio(src);
    audio.volume = 0.75;
    audio.play().catch(() => {
      // Silently fail if audio can't play
      const fallback = new Audio('../assets/break-chime.mp3');
      fallback.volume = 0.75;
      fallback.play().catch(() => {});
    });
  } catch (e) {}
}


const TAG_PALETTE = ['#2d6a4f','#1a5c8a','#5a3a8a','#8a3a3a','#6b5a2d','#2d5a8a','#8a5a2d','#3a5a8a'];
const tagColorMap = {};

// ── Helpers ────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
const sectionState = { priority: true, status: true, tags: true }; // true = expanded

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
    if (!cfg.tutorialComplete) setTimeout(startTutorial, 1000);
  } else if (cfg && cfg.offlineMode) {
    offlineMode = true;
    showApp();
    loadOfflineTasks();
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
  // Check if we should show the what's new modal
  await checkWhatsNew(ver);
  // Update mood sidebar button on load
  updateMoodSidebarBtn();
  // Check if grace day prompt needed
  checkGraceDayPrompt();
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
      if (existingSheet && existingSheet.id) {
        spreadsheetId = existingSheet.id;
        document.getElementById('auth-status').textContent = 'Reconnecting…';
      } else {
        document.getElementById('auth-status').textContent = 'Setting up your spreadsheet…';
        const sheet = await api.driveCreateSheet({ accessToken });
        if (!sheet.spreadsheetId) throw new Error('Could not create spreadsheet');
        spreadsheetId = sheet.spreadsheetId;
      }

      offlineMode = false;
      await api.saveConfig({ spreadsheetId, accessToken, refreshToken, tokenExpiry, userEmail: newEmail, offlineMode: false });
      const connectBtn = document.getElementById('connect-google-btn');
      if (connectBtn) connectBtn.style.display = 'none';
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
  if (offlineMode) {
    if (!confirm('Leave offline mode?\n\nYour local tasks will remain on this computer.')) return;
    await api.saveConfig({ offlineMode: false });
    location.reload();
    return;
  }
  if (!confirm('Sign out of TaskSpark?\n\nYour tasks will remain in your Google Sheet.')) return;
  await api.saveConfig({ accessToken: null, refreshToken: null, tokenExpiry: 0, userEmail: null, spreadsheetId: null });
  location.reload();
}

// ── Sheets connection ──────────────────────────────────────────────────────
async function connectToSheets() {
  setSyncStatus('syncing');
  tasks = await api.loadCache();
  renderAll();

  try {
    await ensureToken();
    await api.sheetsEnsure({ accessToken, spreadsheetId });
    const loaded = await api.sheetsLoad({ accessToken, spreadsheetId });
    if (loaded.length) {
      // Sheet has tasks — use as source of truth
      tasks = loaded;
    } else if (tasks.length) {
      // Sheet empty but local tasks exist — migrate them up (e.g. from offline mode)
      await api.sheetsSave({ accessToken, spreadsheetId, tasks });
    } else {
      // Both empty — brand new user
      tasks = sampleTasks();
      await api.sheetsSave({ accessToken, spreadsheetId, tasks });
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
  if (offlineMode) { setSyncStatus('offline'); return; }
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
  if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); if (settings.quickAddEnabled && !document.getElementById('quick-add-overlay').classList.contains('open')) openQuickAdd(); return; }
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
    if (v === 'all')             return !task.completed && !task.archived;
    if (v === 'today')           return !task.completed && !task.archived && task.due === t;
    if (v === 'overdue')         return !task.completed && !task.archived && task.due && task.due < t;
    if (v === 'completed')       return task.completed && !task.archived;
    if (v === 'priority-high')        return !task.completed && !task.archived && task.priority === 'high';
    if (v === 'priority-medium')      return !task.completed && !task.archived && task.priority === 'medium';
    if (v === 'priority-low')         return !task.completed && !task.archived && task.priority === 'low';
    if (v === 'status-not-started')   return !task.completed && !task.archived && (task.status || 'not-started') === 'not-started';
    if (v === 'status-in-progress')   return !task.completed && !task.archived && task.status === 'in-progress';
    if (v === 'status-blocked')       return !task.completed && !task.archived && task.status === 'blocked';
    if (v === 'status-on-hold')       return !task.completed && !task.archived && task.status === 'on-hold';
    if (v === 'archived')             return task.archived === true;
    if (v.startsWith('tag:'))         return !task.completed && !task.archived && (task.tags||[]).includes(v.slice(4));
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
  else if (s === 'status-asc')  { const smap = {'not-started':0,'in-progress':1,'blocked':2,'on-hold':3,'done':4}; copy.sort((a,b) => (smap[a.status||'not-started']||0)-(smap[b.status||'not-started']||0)); }
  else if (s === 'status-desc') { const smap = {'not-started':0,'in-progress':1,'blocked':2,'on-hold':3,'done':4}; copy.sort((a,b) => (smap[b.status||'not-started']||0)-(smap[a.status||'not-started']||0)); }
  return copy;
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderAll() {
  if (kanbanMode) renderKanban();
  else renderTasks();
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
  // Show/hide bulk restore toolbar
  const bulkBar = document.getElementById('archive-bulk-bar');
  if (bulkBar) bulkBar.style.display = currentView === 'archived' ? '' : 'none';
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
      <div class="task-title" id="task-title-${task.id}" ondblclick="startInlineEdit(${task.id})">${esc(task.title)}</div>
      ${task.desc ? `<div class="task-desc">${esc(task.desc)}</div>` : ''}
      <div class="task-meta">
        <span class="badge badge-priority-${task.priority}">${task.priority.charAt(0).toUpperCase()+task.priority.slice(1)}</span>
        ${settings.statusEnabled !== false ? (task.status ? `<span class="badge badge-status status-${task.status || 'not-started'}">${(task.status || 'not-started').replace(/-/g,' ')}</span>` : '<span class="badge badge-status status-not-started">not started</span>') : ''}
        ${settings.energyEnabled !== false ? `<span class="badge badge-energy energy-${task.energy || 'medium'}">${task.energy==='high'?'⚡ high':task.energy==='low'?'🌿 low':'◆ medium'}</span>` : ''}
        ${task.recur && task.recur !== 'none' ? `<span class="badge badge-recur">↺ ${task.recur === 'custom' ? 'every ' + (task.recurInterval||1) + 'd' : task.recur}</span>` : ''}
        ${dueBadge}${tagBadges}${timeBadge}${liveTimeBadge}
      </div>
      ${completionDetail}
      ${renderSubtasksHTML(task)}
    </div>
    <div class="task-actions">
      ${timerBtn}
      ${task.archived ? `<button class="action-btn" onclick="unarchiveTask(${task.id})" title="Restore" style="color:var(--accent)">↩</button>` : `<button class="action-btn" onclick="openTaskModal(${task.id})" title="Edit">✎</button>`}
      <button class="action-btn delete" onclick="deleteTask(${task.id})" title="Delete">✕</button>
      ${currentView === 'archived' ? `<input type="checkbox" class="archive-select-cb" data-id="${task.id}" style="margin-left:4px;accent-color:var(--accent);cursor:pointer">` : ''}
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
  document.getElementById('cnt-completed').textContent = tasks.filter(x => x.completed && !x.archived).length;
  const cntArchived = document.getElementById('cnt-archived');
  if (cntArchived) cntArchived.textContent = tasks.filter(x => x.archived).length;
  document.getElementById('cnt-high').textContent      = active.filter(x => x.priority === 'high').length;
  document.getElementById('cnt-medium').textContent    = active.filter(x => x.priority === 'medium').length;
  document.getElementById('cnt-low').textContent       = active.filter(x => x.priority === 'low').length;
  const _s = (id) => document.getElementById(id);
  if (_s('cnt-status-not-started')) _s('cnt-status-not-started').textContent = active.filter(x => (x.status||'not-started') === 'not-started').length;
  if (_s('cnt-status-in-progress')) _s('cnt-status-in-progress').textContent = active.filter(x => x.status === 'in-progress').length;
  if (_s('cnt-status-blocked'))     _s('cnt-status-blocked').textContent     = active.filter(x => x.status === 'blocked').length;
  if (_s('cnt-status-on-hold'))     _s('cnt-status-on-hold').textContent     = active.filter(x => x.status === 'on-hold').length;
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

function checkGraceDayPrompt() {
  if (!settings.graceDayEnabled) return;
  const cfg_key = 'taskspark_grace_prompt';
  try {
    const stored = JSON.parse(localStorage.getItem(cfg_key) || 'null');
    if (stored && stored.date === todayStr()) return; // already prompted today
  } catch {}
  // Check if yesterday was missed
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  // Skip weekend check
  if (!settings.streakWeekends && (yesterday.getDay() === 0 || yesterday.getDay() === 6)) return;
  const yesterdayStr = dateToLocalStr(yesterday);
  const completedYesterday = tasks.some(t => t.completed && t.completedAt &&
    dateToLocalStr(new Date(t.completedAt)) === yesterdayStr);
  if (completedYesterday) return; // no missed day
  // Check if there was an active streak before yesterday
  const streakBeforeYesterday = calcStreakBeforeDate(yesterday);
  if (streakBeforeYesterday === 0) return; // no streak to protect
  // Mark as prompted today
  try { localStorage.setItem(cfg_key, JSON.stringify({ date: todayStr() })); } catch {}
  // Show prompt
  setTimeout(() => {
    const use = confirm(
      '⚡ Streak at risk!\n\n' +
      'You missed yesterday and your ' + streakBeforeYesterday + ' day streak is at risk.\n\n' +
      'Would you like to use your grace day to protect it?\n\n' +
      'You get one grace day per streak.'
    );
    if (use) {
      showToast('Grace day used — streak protected! 🛡');
    }
  }, 2000);
}

function calcStreakBeforeDate(date) {
  const dates = new Set(tasks
    .filter(t => t.completed && t.completedAt)
    .map(t => dateToLocalStr(new Date(t.completedAt))));
  let streak = 0;
  const check = new Date(date);
  check.setDate(check.getDate() - 1); // start from day before the missed day
  while (true) {
    const day = check.getDay();
    if (!settings.streakWeekends && (day === 0 || day === 6)) {
      check.setDate(check.getDate()-1); continue;
    }
    if (dates.has(dateToLocalStr(check))) {
      streak++; check.setDate(check.getDate()-1);
    } else break;
  }
  return streak;
}

function updateStreak() {
  const icon    = document.getElementById('streak-icon');
  const text    = document.getElementById('streak-text');
  const best    = document.getElementById('streak-best');
  const daily   = document.getElementById('streak-daily');

  // Line 1 — did user complete a task today?
  const completedToday = tasks.some(t => t.completed && t.completedAt && dateToLocalStr(new Date(t.completedAt)) === todayStr());
  if (daily) {
    daily.textContent  = completedToday ? '✓ Task completed today' : 'Complete a task today';
    daily.className    = 'streak-daily' + (completedToday ? ' complete' : '');
  }

  // Check if vacation mode is active
  if (settings.vacationMode && settings.vacationReturn) {
    const today = todayStr();
    if (today < settings.vacationReturn) {
      const streak = calcStreak();
      icon.textContent = '⏸';
      text.textContent = `Current: ${streak} day${streak !== 1 ? 's' : ''} (paused)`;
      text.style.color = 'var(--text3)'; icon.style.color = 'var(--text3)';
      best.textContent = '';
      return;
    } else {
      promptVacationReturn();
    }
  }

  const streak  = calcStreak();
  const longest = calcLongestStreak();

  // Line 2 — current streak
  if (streak > 0) {
    icon.textContent = '🔥';
    text.textContent = `Current: ${streak} day${streak !== 1 ? 's' : ''}`;
    text.style.color = 'var(--amber)'; icon.style.color = '';
  } else {
    icon.textContent = '○';
    text.textContent = 'No streak yet';
    text.style.color = 'var(--text2)';
  }

  // Line 3 — best streak
  best.textContent = longest > 0 ? `Best: ${longest} day${longest !== 1 ? 's' : ''}` : '';
}

function promptVacationReturn() {
  if (settings._vacationPromptShown) return;
  settings._vacationPromptShown = true;
  setTimeout(() => {
    const confirmed = confirm(
      'Welcome back! 👋\n\n' +
      'Your streak has been paused while you were away.\n\n' +
      'Are you ready to resume your streak?'
    );
    if (confirmed) {
      settings.vacationMode   = false;
      settings.vacationReturn = null;
      settings._vacationPromptShown = false;
      api.saveConfig({ settings });
      updateStreak();
      showToast('Streak resumed! Welcome back 🔥');
    }
  }, 1000);
}

function calcStreak() {
  const dates = new Set(tasks
    .filter(t => t.completed && t.completedAt)
    .map(t => dateToLocalStr(new Date(t.completedAt))));
  let streak = 0;
  let check  = new Date();
  const today = todayStr();
  let isFirstDay = true;
  let graceUsed = false;
  while (true) {
    const day = check.getDay(); // 0=Sun, 6=Sat
    // Skip weekends unless streakWeekends is enabled
    if (!settings.streakWeekends && (day === 0 || day === 6)) {
      check.setDate(check.getDate()-1);
      isFirstDay = false;
      continue;
    }
    const ds = dateToLocalStr(check);
    // Skip vacation days
    if (settings.vacationMode && settings.vacationReturn && ds >= today) {
      check.setDate(check.getDate()-1);
      isFirstDay = false;
      continue;
    }
    if (dates.has(ds)) {
      streak++; check.setDate(check.getDate()-1);
      isFirstDay = false;
    } else if (isFirstDay && ds === today) {
      // Haven't completed a task today yet — skip today, don't break streak
      check.setDate(check.getDate()-1);
      isFirstDay = false;
    } else if (settings.graceDayEnabled && !graceUsed) {
      // Use grace day for this missed day
      graceUsed = true;
      check.setDate(check.getDate()-1);
      isFirstDay = false;
    } else {
      break;
    }
  }
  return streak;
}

function dateToLocalStr(d) {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function calcLongestStreak() {
  const dates = new Set(tasks
    .filter(t => t.completed && t.completedAt)
    .map(t => dateToLocalStr(new Date(t.completedAt))));
  if (!dates.size) return 0;
  const sorted = [...dates].sort();
  const earliest = new Date(sorted[0] + 'T00:00:00');
  const today    = new Date();
  let best = 0, current = 0, check = new Date(earliest);
  while (check <= today) {
    const day = check.getDay();
    if (!settings.streakWeekends && (day === 0 || day === 6)) {
      check.setDate(check.getDate()+1); continue;
    }
    if (dates.has(dateToLocalStr(check))) {
      current++; best = Math.max(best, current);
    } else { current = 0; }
    check.setDate(check.getDate()+1);
  }
  return best;
}

// ── View ───────────────────────────────────────────────────────────────────
function setView(view, el) {
  currentView = view;
  const titles = { all:'All Tasks', kanban:'Kanban', today:'Due Today', overdue:'Overdue', completed:'Completed', archived:'Archived',
    'priority-high':'High Priority', 'priority-medium':'Medium Priority', 'priority-low':'Low Priority',
    'status-not-started':'Not Started', 'status-in-progress':'In Progress',
    'status-blocked':'Blocked', 'status-on-hold':'On Hold' };
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

function setView(view, el) {
  currentView = view;
  const titles = { all:'All Tasks', kanban:'Kanban', today:'Due Today', overdue:'Overdue', completed:'Completed', archived:'Archived',
    'priority-high':'High Priority', 'priority-medium':'Medium Priority', 'priority-low':'Low Priority',
    'status-not-started':'Not Started', 'status-in-progress':'In Progress',
    'status-blocked':'Blocked', 'status-on-hold':'On Hold' };
  document.getElementById('view-title').textContent =
    view.startsWith('tag:') ? '#' + view.slice(4) : (titles[view] || view);
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const match = document.querySelector(`[data-view="${view}"]`);
    if (match) match.classList.add('active');
  }
  if (view === 'kanban') {
    switchViewMode('kanban');
  } else {
    switchViewMode('list');
    renderTasks();
  }
}

function switchViewMode(mode) {
  kanbanMode = mode === 'kanban';
  const listContainer   = document.getElementById('task-list-container');
  const kanbanContainer = document.getElementById('kanban-container');
  const listBtn   = document.getElementById('btn-list-view');
  const kanbanBtn = document.getElementById('btn-kanban-view');
  if (kanbanMode) {
    if (listContainer)   listContainer.style.display = 'none';
    if (kanbanContainer) kanbanContainer.classList.add('active');
    if (listBtn)   listBtn.classList.remove('active');
    if (kanbanBtn) kanbanBtn.classList.add('active');
    renderKanban();
  } else {
    if (listContainer)   listContainer.style.display = '';
    if (kanbanContainer) kanbanContainer.classList.remove('active');
    if (listBtn)   listBtn.classList.add('active');
    if (kanbanBtn) kanbanBtn.classList.remove('active');
  }
}

// ── Kanban ─────────────────────────────────────────────────────────────────
const KANBAN_COLS = [
  { key: 'not-started', label: 'Not Started', color: 'var(--text3)' },
  { key: 'in-progress', label: 'In Progress', color: 'var(--blue)' },
  { key: 'blocked',     label: 'Blocked',     color: 'var(--red)' },
  { key: 'on-hold',     label: 'On Hold',     color: 'var(--amber)' },
  { key: 'done',        label: 'Done',        color: 'var(--accent)' },
];

let kanbanGroupState = {}; // persisted collapse state per tag group
let dragTaskId = null;

function getKanbanGroupState() {
  try { return JSON.parse(localStorage.getItem('taskspark_kanban_groups') || '{}'); } catch { return {}; }
}
function saveKanbanGroupState(tag, open) {
  const state = getKanbanGroupState();
  state[tag] = open;
  try { localStorage.setItem('taskspark_kanban_groups', JSON.stringify(state)); } catch {}
}

function renderKanban() {
  const container = document.getElementById('kanban-container');
  if (!container) return;
  const activeTasks = tasks.filter(t => !t.completed && !t.archived);
  const state = getKanbanGroupState();

  // If groupByTags is off, render a single group with all tasks
  if (settings.kanbanGroupByTags === false) {
    const cols = KANBAN_COLS.map(col => {
      const colTasks = activeTasks.filter(t => (t.status||'not-started') === col.key);
      const cards = colTasks.map(t => `
        <div class="kanban-card priority-${t.priority}" draggable="true"
          data-task-id="${t.id}"
          ondragstart="onKanbanDragStart(event,${t.id})"
          ondragend="onKanbanDragEnd(event)">
          <div class="kanban-card-title" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
          <div class="kanban-card-meta">
            <span class="badge badge-priority-${t.priority}">${t.priority.charAt(0).toUpperCase()+t.priority.slice(1)}</span>
            ${t.due ? `<span class="badge badge-due ${dueStatus(t.due)||''}">◷ ${fmtDate(t.due)}</span>` : ''}
          </div>
        </div>`).join('');
      return `
        <div class="kanban-col"
          data-status="${col.key}"
          ondragover="onKanbanDragOver(event)"
          ondragleave="onKanbanDragLeave(event)"
          ondrop="onKanbanDrop(event,'${col.key}')">
          <div class="kanban-col-header" style="color:${col.color}">
            ${col.label}
            <span class="kanban-col-count">${colTasks.length}</span>
          </div>
          <div class="kanban-col-body">${cards}</div>
        </div>`;
    }).join('');
    container.innerHTML = `<div class="kanban-columns" style="padding-bottom:16px">${cols}</div>`;
    return;
  }

  // Get all unique tags + untagged
  const allTags = [...new Set(activeTasks.flatMap(t => (t.tags||[]).length ? t.tags : ['Untagged']))];
  allTags.sort((a,b) => a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b));

  container.innerHTML = allTags.map(tag => {
    const tagTasks = tag === 'Untagged'
      ? activeTasks.filter(t => !t.tags || !t.tags.length)
      : activeTasks.filter(t => (t.tags||[]).includes(tag));
    const isOpen = tag in state ? state[tag] : true;
    const tagColor = tag === 'Untagged' ? 'var(--text3)' : getTagColor(tag);

    const cols = KANBAN_COLS.map(col => {
      const colTasks = tagTasks.filter(t => (t.status||'not-started') === col.key);
      const cards = colTasks.map(t => `
        <div class="kanban-card priority-${t.priority}" draggable="true"
          data-task-id="${t.id}"
          ondragstart="onKanbanDragStart(event,${t.id})"
          ondragend="onKanbanDragEnd(event)">
          <div class="kanban-card-title" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
          <div class="kanban-card-meta">
            <span class="badge badge-priority-${t.priority}">${t.priority.charAt(0).toUpperCase()+t.priority.slice(1)}</span>
            ${t.due ? `<span class="badge badge-due ${dueStatus(t.due)||''}">◷ ${fmtDate(t.due)}</span>` : ''}
          </div>
        </div>`).join('');
      return `
        <div class="kanban-col"
          data-status="${col.key}"
          ondragover="onKanbanDragOver(event)"
          ondragleave="onKanbanDragLeave(event)"
          ondrop="onKanbanDrop(event,'${col.key}')">
          <div class="kanban-col-header" style="color:${col.color}">
            ${col.label}
            <span class="kanban-col-count">${colTasks.length}</span>
          </div>
          <div class="kanban-col-body">${cards}</div>
        </div>`;
    }).join('');

    return `
      <div class="kanban-tag-group">
        <div class="kanban-tag-header" onclick="toggleKanbanGroup('${esc(tag)}')">
          <span class="kanban-tag-arrow ${isOpen?'':'collapsed'}">▾</span>
          <span class="kanban-tag-label" style="color:${tagColor}">${esc(tag)}</span>
          <span class="kanban-col-count">${tagTasks.length}</span>
        </div>
        <div class="kanban-columns" id="kanban-group-${esc(tag)}" style="display:${isOpen?'flex':'none'}">${cols}</div>
      </div>`;
  }).join('');
}

function toggleKanbanGroup(tag) {
  const el = document.getElementById('kanban-group-' + tag);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'flex';
  const arrow = el.previousElementSibling.querySelector('.kanban-tag-arrow');
  if (arrow) arrow.classList.toggle('collapsed', isOpen);
  saveKanbanGroupState(tag, !isOpen);
}

function onKanbanDragStart(e, taskId) {
  dragTaskId = taskId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => {
    const card = e.target.closest('.kanban-card');
    if (card) card.classList.add('dragging');
  }, 0);
}

function onKanbanDragEnd(e) {
  document.querySelectorAll('.kanban-card.dragging').forEach(c => c.classList.remove('dragging'));
  document.querySelectorAll('.kanban-col.drag-over').forEach(c => c.classList.remove('drag-over'));
  dragTaskId = null;
}

function onKanbanDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const col = e.currentTarget;
  col.classList.add('drag-over');
}

function onKanbanDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onKanbanDrop(e, status) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragTaskId) return;
  const task = tasks.find(t => t.id === dragTaskId);
  if (!task) return;
  task.status = status;
  if (status === 'done' && !task.completed) {
    toggleComplete(task.id);
    return;
  }
  saveTasks();
  renderKanban();
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
    document.getElementById('tm-status').value   = task.status || 'not-started';
    document.getElementById('tm-energy').value   = task.energy || 'medium';
    loadRecurrenceUI(task.recurrence || { type: 'none' });
    modalTags = [...(task.tags || [])];
    modalDue  = task.due || '';
  } else {
    document.getElementById('tm-title').value    = '';
    document.getElementById('tm-desc').value     = '';
    document.getElementById('tm-priority').value = 'medium';
    document.getElementById('tm-estimate').value = '';
    document.getElementById('tm-status').value   = 'not-started';
    document.getElementById('tm-energy').value   = 'medium';
    loadRecurrenceUI({ type: 'none' });
  }

  renderModalTags();
  refreshDueBtn();
  const dupBtn = document.getElementById('tm-duplicate-btn');
  if (dupBtn) dupBtn.style.display = id ? '' : 'none';
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
    status:     document.getElementById('tm-status').value,
    energy:     document.getElementById('tm-energy').value,
    recurrence: getRecurrenceFromUI(),
  };

  pushUndo(editingId ? 'Edit task' : 'Add task');

  if (editingId) {
    const task = tasks.find(t => t.id === editingId);
    if (task) { const subs = task.subtasks; Object.assign(task, data); task.subtasks = subs; }
  } else {
    tasks.push({
      id: Date.now(), completed: false,
      createdAt: new Date().toISOString(), completedAt: '',
      timeLogged: 0, timeSessions: [],
      impact: '', outcome: '', deliverable: '',
      status: 'not-started', energy: 'medium',
      ...data
    });
  }

  closeModal('task-modal-overlay');
  saveTasks();
  renderAll();
}

// ── Subtasks ─────────────────────────────────────────────────────────────────
function renderSubtasksHTML(task) {
  if (task.completed) return '';
  if (settings.subtasksEnabled === false) return '';
  const subs = task.subtasks || [];
  const doneCount = subs.filter(s => s.done).length;
  const savedState = getSubtaskState();
  const isOpenH = task.id in savedState ? savedState[task.id] : subs.length > 0;
  const arrowStyle = isOpenH ? '' : 'style="transform:rotate(-90deg)"';
  const header = subs.length
    ? `<div class="subtask-header" onclick="toggleSubtasks(${task.id})">
        <span id="subtask-arrow-${task.id}" class="subtask-arrow" ${arrowStyle}>▾</span>
        <span class="subtask-count">${doneCount}/${subs.length} subtasks</span>
       </div>`
    : `<div class="subtask-header" onclick="toggleSubtasks(${task.id})">
        <span id="subtask-arrow-${task.id}" class="subtask-arrow" ${arrowStyle}>▾</span>
        <span class="subtask-count">Add subtasks</span>
       </div>`;
  const list = subs.map((s, idx) =>
    `<div class="subtask-item" draggable="true"
      data-task-id="${task.id}" data-subtask-id="${s.id}"
      ondragstart="onSubtaskDragStart(event,${task.id},${s.id})"
      ondragend="onSubtaskDragEnd(event)"
      ondragover="onSubtaskDragOver(event)"
      ondragleave="onSubtaskDragLeave(event)"
      ondrop="onSubtaskDrop(event,${task.id},${s.id})">
      <span class="subtask-drag-handle">⠿</span>
      <div class="subtask-check ${s.done?'checked':''}" onclick="toggleSubtask(${task.id},${s.id})">${s.done?'✓':''}</div>
      <span class="subtask-title ${s.done?'done':''}" ondblclick="startSubtaskEdit(${task.id},${s.id},this)">${esc(s.title)}</span>
      <button class="subtask-delete" onclick="deleteSubtask(${task.id},${s.id})">✕</button>
    </div>`
  ).join('');
  const addRow = `<div class="subtask-add-row">
    <input class="subtask-input" id="subtask-input-${task.id}" placeholder="Add subtask…" onkeydown="handleSubtaskKey(event,${task.id})">
    <button class="subtask-add-btn" onclick="addSubtask(${task.id})">+</button>
  </div>`;
  return `<div class="subtask-section">
    ${header}
    <div id="subtask-list-${task.id}" style="display:${isOpenH?'block':'none'}">
      ${list}${addRow}
    </div>
  </div>`;
}

function getSubtaskState() {
  try { return JSON.parse(localStorage.getItem('taskspark_subtask_state') || '{}'); } catch { return {}; }
}

function saveSubtaskState(id, isOpen) {
  const state = getSubtaskState();
  state[id] = isOpen;
  try { localStorage.setItem('taskspark_subtask_state', JSON.stringify(state)); } catch {}
}

function toggleSubtasks(id) {
  const el = document.getElementById('subtask-list-' + id);
  const arrow = document.getElementById('subtask-arrow-' + id);
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0deg)';
  saveSubtaskState(id, !isOpen);
}

function addSubtask(taskId) {
  const input = document.getElementById('subtask-input-' + taskId);
  if (!input) return;
  const title = input.value.trim();
  if (!title) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  if (!task.subtasks) task.subtasks = [];
  task.subtasks.push({ id: Date.now(), title, done: false });
  input.value = '';
  saveTasks();
  renderAll();
}

function toggleSubtask(taskId, subtaskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.subtasks) return;
  const sub = task.subtasks.find(s => s.id === subtaskId);
  if (!sub) return;
  sub.done = !sub.done;
  // Auto-complete parent if all subtasks done
  if (task.subtasks.length && task.subtasks.every(s => s.done) && !task.completed) {
    toggleComplete(taskId);
    return;
  }
  // Set status to in-progress when any subtask is checked
  if (sub.done && task.status === 'not-started') {
    task.status = 'in-progress';
  }
  saveTasks();
  renderAll();
}

function deleteSubtask(taskId, subtaskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.subtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);
  saveTasks();
  renderAll();
}

function startSubtaskEdit(taskId, subtaskId, el) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const sub = task.subtasks.find(s => s.id === subtaskId);
  if (!sub) return;
  const original = sub.title;
  el.contentEditable = 'true';
  el.classList.add('editing');
  el.focus();
  // Place cursor at end
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  function save() {
    const newTitle = el.textContent.trim();
    el.contentEditable = 'false';
    el.classList.remove('editing');
    if (newTitle && newTitle !== original) {
      sub.title = newTitle;
      saveTasks();
      renderAll();
    } else {
      el.textContent = original;
    }
  }
  el.addEventListener('blur', save, { once: true });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = original; el.blur(); }
  }, { once: true });
}

function handleSubtaskKey(e, taskId) {
  if (e.key === 'Enter') addSubtask(taskId);
}

let dragSubtaskId = null;
let dragSubtaskTaskId = null;

function onSubtaskDragStart(e, taskId, subtaskId) {
  dragSubtaskId = subtaskId;
  dragSubtaskTaskId = taskId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => { const el = e.target.closest('.subtask-item'); if (el) el.classList.add('dragging'); }, 0);
}

function onSubtaskDragEnd(e) {
  document.querySelectorAll('.subtask-item.dragging').forEach(el => el.classList.remove('dragging'));
  document.querySelectorAll('.subtask-item.drag-over').forEach(el => el.classList.remove('drag-over'));
  dragSubtaskId = null; dragSubtaskTaskId = null;
}

function onSubtaskDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const el = e.currentTarget;
  if (parseInt(el.dataset.subtaskId) !== dragSubtaskId) el.classList.add('drag-over');
}

function onSubtaskDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

function onSubtaskDrop(e, taskId, targetSubtaskId) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!dragSubtaskId || dragSubtaskId === targetSubtaskId || dragSubtaskTaskId !== taskId) return;
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.subtasks) return;
  const fromIdx = task.subtasks.findIndex(s => s.id === dragSubtaskId);
  const toIdx   = task.subtasks.findIndex(s => s.id === targetSubtaskId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [moved] = task.subtasks.splice(fromIdx, 1);
  task.subtasks.splice(toIdx, 0, moved);
  saveTasks();
  renderAll();
}

function startInlineEdit(id) {
  const titleEl = document.getElementById('task-title-' + id);
  if (!titleEl) return;
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const original = task.title;
  titleEl.contentEditable = 'true';
  titleEl.classList.add('editing');
  titleEl.focus();
  // Place cursor at end
  const range = document.createRange();
  range.selectNodeContents(titleEl);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  function save() {
    const newTitle = titleEl.textContent.trim();
    titleEl.contentEditable = 'false';
    titleEl.classList.remove('editing');
    if (newTitle && newTitle !== original) {
      task.title = newTitle;
      saveTasks();
      renderAll();
    } else {
      titleEl.textContent = original;
    }
  }
  titleEl.addEventListener('blur', save, { once: true });
  titleEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); }
    if (e.key === 'Escape') { titleEl.textContent = original; titleEl.blur(); }
  }, { once: true });
}

function duplicateTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  // Create new task with only title, desc and priority copied
  const newTask = {
    id: Date.now(),
    title: task.title,
    desc: task.desc || '',
    priority: task.priority,
    due: '',
    tags: [],
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: '',
    timeLogged: 0,
    timeSessions: [],
    impact: '', outcome: '', deliverable: '',
    estimate: 0,
    status: 'not-started',
    energy: task.energy || 'medium',
  };
  pushUndo('Duplicate task');
  tasks.push(newTask);
  saveTasks();
  renderAll();
  // Close current modal and open the new task for editing
  closeModal('task-modal-overlay');
  setTimeout(() => openTaskModal(newTask.id), 50);
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
    if (!settings.completionDialog) {
      saveTasks(); renderAll();
      if (task.recurrence && task.recurrence.type !== 'none') setTimeout(() => promptRecurringTask(task), 300);
      return;
    }
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
  // Prompt recurring after completion dialog
  const completedTask = tasks.find(t => t.id === completionTaskId);
  if (completedTask && completedTask.recurrence && completedTask.recurrence.type !== 'none') {
    setTimeout(() => promptRecurringTask(completedTask), 300);
  }
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
      <button class="cal-nav" onclick="calNav(-1, event)">‹</button>
      <span class="cal-month">${monthNames[calMonth]} ${calYear}</span>
      <button class="cal-nav" onclick="calNav(1, event)">›</button>
    </div>
    <div class="cal-days-hdr">
      ${['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => `<div class="cal-day-hdr">${d}</div>`).join('')}
    </div>
    <div class="cal-grid">${cells}</div>
    <div class="cal-clear"><button class="cal-clear-btn" onclick="pickDate('')">Clear date</button></div>`;
}

function calNav(dir, e) {
  if (e) e.stopPropagation();
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
  // Auto-set status to in-progress when timer starts
  if (task.status !== 'done') {
    task.status = 'in-progress';
    saveTasks();
  }

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

function pauseTimer() {
  if (!activeTimerId || timerPaused) return;
  timerPaused = true;
  // Accumulate elapsed task time so far — preserved on resume
  timerPausedElapsed += Math.floor(Date.now()/1000 - timerStart);
  timerPausedAt = Date.now() / 1000;
  clearInterval(timerInterval);
  // Only reset the break countdown — task time is preserved
  clearBreakTimer();
}

function resumeTimer() {
  if (!activeTimerId || !timerPaused) return;
  timerPaused = false;
  // Resume task timer from where it left off (timerPausedElapsed holds accumulated time)
  timerStart = Date.now() / 1000;
  timerPausedAt = null;
  timerInterval = setInterval(tickTimer, 1000);
  // Restart break countdown from zero (fresh work session after pause)
  scheduleBreak();
}

function tickTimer() {
  if (!activeTimerId || !timerStart || timerPaused) return;
  const task    = tasks.find(t => t.id === activeTimerId);
  const base    = task ? (task.timeLogged || 0) : 0;
  const elapsed = Math.floor(Date.now()/1000 - timerStart) + timerPausedElapsed;
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
  if (breakSnoozed || !activeTimerId || timerPaused) return;
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
  const active = tasks.filter(t => !t.completed && t.status !== 'blocked' && t.status !== 'on-hold');
  if (!active.length) { showToast('No active tasks — add one to get started!'); return; }
  const t = todayStr();
  const pmap = { high:0, medium:1, low:2 };
  // Factor in mood: match energy level to today's mood
  const todayMood = getTodayMood();
  const moodEnergyMap = { good: 'high', okay: 'medium', sad: 'low' };
  const preferredEnergy = moodEnergyMap[todayMood] || null;
  const emap = { high:0, medium:1, low:2 };
  const best = active.reduce((a, b) => {
    // Energy match bonus — tasks matching mood energy get a boost
    const aEnergyScore = preferredEnergy ? (a.energy === preferredEnergy ? 0 : 1) : 0;
    const bEnergyScore = preferredEnergy ? (b.energy === preferredEnergy ? 0 : 1) : 0;
    const sa = [pmap[a.priority]||1, aEnergyScore, a.due&&a.due<t?0:a.due===t?1:a.due?2:3, -(a.id)];
    const sb = [pmap[b.priority]||1, bEnergyScore, b.due&&b.due<t?0:b.due===t?1:b.due?2:3, -(b.id)];
    for (let i = 0; i < sa.length; i++) {
      if (sa[i] !== sb[i]) return sa[i] < sb[i] ? a : b;
    }
    return a;
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
let quickAddFromBackground = false;

function openQuickAdd(fromBackground = false) {
  quickAddFromBackground = fromBackground;
  document.getElementById('quick-add-overlay').classList.add('open');
  document.getElementById('quick-add-input').value = '';
  setTimeout(() => document.getElementById('quick-add-input').focus(), 50);
}

function closeQuickAdd(e) {
  if (e.target === document.getElementById('quick-add-overlay')) {
    document.getElementById('quick-add-overlay').classList.remove('open');
    if (quickAddFromBackground) { quickAddFromBackground = false; api.quickaddDone(); }
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
    if (quickAddFromBackground) { quickAddFromBackground = false; api.quickaddDone(); }
  }
  if (e.key === 'Escape') {
    document.getElementById('quick-add-overlay').classList.remove('open');
    if (quickAddFromBackground) { quickAddFromBackground = false; api.quickaddDone(); }
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
  // Status sidebar group (includes divider), form field
  const statusGroup = document.getElementById('status-sidebar-group');
  if (statusGroup) statusGroup.style.display = s.statusEnabled !== false ? '' : 'none';
  const statusFormGroup = document.getElementById('status-form-group');
  if (statusFormGroup) statusFormGroup.style.display = s.statusEnabled !== false ? '' : 'none';
  // Energy form field
  const energyFormGroup = document.getElementById('energy-form-group');
  if (energyFormGroup) energyFormGroup.style.display = s.energyEnabled !== false ? '' : 'none';
  // Recurrence form section
  const recurrenceSection = document.getElementById('recurrence-form-group');
  if (recurrenceSection) recurrenceSection.style.display = s.recurrenceEnabled !== false ? '' : 'none';
  // Kanban sidebar item + feature settings sub-btn
  const kanbanItem = document.querySelector('[data-view="kanban"]');
  if (kanbanItem) kanbanItem.style.display = s.kanbanEnabled !== false ? '' : 'none';
  const kanbanSubBtn = document.querySelector('.feature-sub-btn[onclick*="kanban"]');
  if (kanbanSubBtn) kanbanSubBtn.style.display = s.kanbanEnabled !== false ? '' : 'none';
  const timerSubBtn2 = document.querySelector('.feature-sub-btn[onclick*="timer"]');
  if (timerSubBtn2) timerSubBtn2.style.display = s.breakEnabled ? '' : 'none';
  if (!s.breakEnabled) {
    const timerTab = document.getElementById('feature-tab-timer');
    if (timerTab && timerTab.classList.contains('active')) {
      switchFeatureTab('streak', document.querySelectorAll('.feature-sub-btn')[1]);
    }
  }
  // If kanban sub-tab is active and kanban is disabled, switch to timer tab
  if (s.kanbanEnabled === false) {
    const kanbanTab = document.getElementById('feature-tab-kanban');
    if (kanbanTab && kanbanTab.classList.contains('active')) {
      switchFeatureTab('timer', document.querySelector('.feature-sub-btn'));
    }
  }
  // If kanban is disabled and currently active, switch to list view
  if (s.kanbanEnabled === false && kanbanMode) {
    kanbanMode = false;
    const listContainer   = document.getElementById('task-list-container');
    const kanbanContainer = document.getElementById('kanban-container');
    if (listContainer)   listContainer.style.display = '';
    if (kanbanContainer) kanbanContainer.classList.remove('active');
    currentView = 'all';
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    const allItem = document.querySelector('[data-view="all"]');
    if (allItem) allItem.classList.add('active');
    document.getElementById('view-title').textContent = 'All Tasks';
    renderTasks();
  }
  // Show empty state in Feature Settings if no features with settings are enabled
  const hasFeatureSettings = s.breakEnabled || s.streakEnabled !== false || s.kanbanEnabled !== false;
  const emptyState = document.getElementById('feature-settings-empty');
  const featureSubNav = document.getElementById('settings-tab-feature-settings')?.querySelector('div[style*="flex"]');
  if (emptyState) emptyState.style.display = hasFeatureSettings ? 'none' : 'block';
  document.querySelectorAll('.feature-sub-btn').forEach(b => {
    if (!hasFeatureSettings) b.closest('div') && (b.closest('div[style]').style.display = 'none');
  });
  document.querySelectorAll('.feature-sub-section').forEach(el => {
    if (!hasFeatureSettings) el.style.display = 'none';
  });
}

async function openSettings() {
  const s = settings;
  // Sync dark mode toggle to current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.getElementById('set-darkmode').checked = isDark;
  if (document.getElementById('set-break-enabled')) document.getElementById('set-break-enabled').checked = s.breakEnabled;
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
  document.getElementById('set-streak-weekends').checked     = s.streakWeekends;
  if (document.getElementById('set-grace-day')) document.getElementById('set-grace-day').checked = s.graceDayEnabled !== false;
  if (document.getElementById('set-energy-enabled'))    document.getElementById('set-energy-enabled').checked    = s.energyEnabled !== false;
  if (document.getElementById('set-status-enabled'))    document.getElementById('set-status-enabled').checked    = s.statusEnabled !== false;
  if (document.getElementById('set-subtasks-enabled'))  document.getElementById('set-subtasks-enabled').checked  = s.subtasksEnabled !== false;
  if (document.getElementById('set-recurrence-enabled')) document.getElementById('set-recurrence-enabled').checked = s.recurrenceEnabled !== false;
  if (document.getElementById('set-kanban-enabled'))    document.getElementById('set-kanban-enabled').checked    = s.kanbanEnabled !== false;
  if (document.getElementById('set-kanban-group-tags')) document.getElementById('set-kanban-group-tags').checked = s.kanbanGroupByTags !== false;
  if (document.getElementById('set-break-enabled-general')) document.getElementById('set-break-enabled-general').checked = s.breakEnabled;
  // Show/hide timer feature settings based on break enabled
  const timerSubBtn = document.querySelector('.feature-sub-btn[onclick*="timer"]');
  if (timerSubBtn) timerSubBtn.style.display = s.breakEnabled ? '' : 'none';
  updateVacationUI();
  toggleStreakSettings();
  // Populate account info
  const emailEl    = document.getElementById('account-email-display');
  const statusEl   = document.getElementById('account-status-display');
  const signoutRow = document.getElementById('account-signout-row');
  const connectRow = document.getElementById('account-connect-row');
  if (offlineMode) {
    if (emailEl)     emailEl.textContent        = 'Offline mode';
    if (statusEl)    statusEl.textContent       = 'Tasks are stored locally on this computer';
    if (signoutRow)  signoutRow.style.display   = 'none';
    if (connectRow)  connectRow.style.display   = '';
  } else {
    const cfg = await api.loadConfig();
    if (emailEl)     emailEl.textContent        = (cfg && cfg.userEmail) || 'Google account';
    if (statusEl)    statusEl.textContent       = 'Syncing to Google Sheets';
    if (signoutRow)  signoutRow.style.display   = '';
    if (connectRow)  connectRow.style.display   = 'none';
  }
  // Reset to first tab
  switchSettingsTab('general', document.querySelector('.settings-nav-item'));
  // Only switch to timer tab if break is enabled, otherwise go to streak
  const firstFeatureBtn = s.breakEnabled
    ? document.querySelector('.feature-sub-btn')
    : document.querySelectorAll('.feature-sub-btn')[1];
  if (firstFeatureBtn) switchFeatureTab(firstFeatureBtn.getAttribute('onclick').match(/'([^']+)'/)[1], firstFeatureBtn);
  const soundPath = document.getElementById('sound-file-path');
  soundPath.textContent = s.soundFile ? s.soundFile.split(/[\\/]/).pop() : 'Default (chime)';
  soundPath.style.color = s.soundFile ? 'var(--text)' : 'var(--text3)';
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

function updateVacationUI() {
  const s = settings;
  const activeDiv = document.getElementById('vacation-active');
  const setDiv    = document.getElementById('vacation-set');
  const returnLbl = document.getElementById('vacation-return-date');
  if (s.vacationMode && s.vacationReturn) {
    if (activeDiv) activeDiv.style.display = '';
    if (setDiv)    setDiv.style.display    = 'none';
    if (returnLbl) returnLbl.textContent   = s.vacationReturn;
  } else {
    if (activeDiv) activeDiv.style.display = 'none';
    if (setDiv)    setDiv.style.display    = '';
  }
}

function activateVacationMode() {
  const dateInput = document.getElementById('vacation-return-input');
  const returnDate = dateInput ? dateInput.value : null;
  if (!returnDate) { showToast('Please pick a return date first'); return; }
  if (returnDate <= todayStr()) { showToast('Return date must be in the future'); return; }
  settings.vacationMode   = true;
  settings.vacationReturn = returnDate;
  api.saveConfig({ settings });
  updateVacationUI();
  updateStreak();
  showToast('Vacation mode on — streak paused until ' + returnDate + ' ⏸');
  closeModal('settings-modal-overlay');
}

function cancelVacationMode() {
  settings.vacationMode   = false;
  settings.vacationReturn = null;
  api.saveConfig({ settings });
  updateVacationUI();
  updateStreak();
  showToast('Vacation mode cancelled');
}

function toggleStreakSettings() {
  const enabled = document.getElementById('set-streak') && document.getElementById('set-streak').checked;
  const section = document.getElementById('streak-extra-settings');
  if (section) section.style.display = enabled ? '' : 'none';
  // Also hide the Streak sub-nav button in Feature Settings
  document.querySelectorAll('.feature-sub-btn').forEach(btn => {
    if (btn.textContent.trim() === 'Streak') btn.style.display = enabled ? '' : 'none';
  });
  // If streak is being hidden and is currently active, switch to Timer tab
  if (!enabled) {
    const streakTab = document.getElementById('feature-tab-streak');
    if (streakTab && streakTab.classList.contains('active')) {
      switchFeatureTab('timer', document.querySelector('.feature-sub-btn'));
    }
  }
}

function switchSettingsTab(tab, el) {
  document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.settings-panel-section').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('settings-tab-' + tab);
  if (panel) panel.classList.add('active');
  // Reset feature sub-nav when switching to feature settings
  if (tab === 'feature-settings') switchFeatureTab('timer', document.querySelector('.feature-sub-btn'));
}

function switchFeatureTab(tab, el) {
  document.querySelectorAll('.feature-sub-btn').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.feature-sub-section').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  const panel = document.getElementById('feature-tab-' + tab);
  if (panel) panel.classList.add('active');
}

// ── Recurring tasks ─────────────────────────────────────────────────────────
function promptRecurringTask(task) {
  const label = {
    daily: 'daily', weekly: 'weekly', monthly: 'monthly',
    custom: 'every ' + (task.recurrence.interval||1) + ' days',
    days: 'on selected days'
  }[task.recurrence.type] || 'recurring';
  if (!confirm('This is a ' + label + ' task.\n\nWould you like to create the next occurrence?')) return;
  const newTask = {
    id: Date.now(),
    title: task.title,
    desc: task.desc || '',
    priority: task.priority,
    due: calcNextDueDate(task),
    tags: [...(task.tags||[])],
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: '',
    timeLogged: 0, timeSessions: [],
    impact: '', outcome: '', deliverable: '',
    estimate: task.estimate || 0,
    status: 'not-started',
    energy: task.energy || 'medium',
    subtasks: [],
    recurrence: { ...task.recurrence },
  };
  tasks.push(newTask);
  saveTasks();
  renderAll();
  showToast('Next occurrence created ↺');
}

function calcNextDueDate(task) {
  const r = task.recurrence;
  if (!r || r.type === 'none') return task.due || '';
  const base = task.due ? new Date(task.due + 'T00:00:00') : new Date();
  if (r.type === 'daily')        { base.setDate(base.getDate() + 1); }
  else if (r.type === 'weekly')  { base.setDate(base.getDate() + 7); }
  else if (r.type === 'monthly') { base.setMonth(base.getMonth() + 1); }
  else if (r.type === 'custom')  { base.setDate(base.getDate() + (parseInt(r.interval)||1)); }
  else if (r.type === 'days') {
    const days = r.days || [];
    if (!days.length) return task.due || '';
    let next = new Date(base); next.setDate(next.getDate() + 1);
    for (let i = 0; i < 7; i++) {
      if (days.includes(next.getDay())) break;
      next.setDate(next.getDate() + 1);
    }
    return dateToLocalStr(next);
  }
  return dateToLocalStr(base);
}

function loadRecurrenceUI(r) {
  const type = (r && r.type) || 'none';
  const sel = document.getElementById('tm-recurrence-type');
  if (sel) sel.value = type;
  // Reset day buttons
  document.querySelectorAll('.day-btn').forEach(b => b.classList.remove('selected'));
  updateRecurrenceUI();
  if (type === 'custom') {
    const inp = document.getElementById('tm-recurrence-interval');
    if (inp) inp.value = r.interval || 1;
  }
  if (type === 'days' && r.days) {
    r.days.forEach(d => {
      const btn = document.querySelector(`.day-btn[data-day='${d}']`);
      if (btn) btn.classList.add('selected');
    });
  }
}

function updateRecurrenceUI() {
  const sel = document.getElementById('tm-recurrence-type');
  const type = sel ? sel.value : 'none';
  const customRow = document.getElementById('recurrence-custom-row');
  const daysRow   = document.getElementById('recurrence-days-row');
  if (customRow) customRow.style.display = type === 'custom' ? '' : 'none';
  if (daysRow)   daysRow.style.display   = type === 'days'   ? '' : 'none';
}

function toggleDayBtn(btn, event) {
  if (event) event.stopPropagation();
  btn.classList.toggle('selected');
}

function getRecurrenceFromUI() {
  const sel = document.getElementById('tm-recurrence-type');
  const type = sel ? sel.value : 'none';
  if (type === 'none') return { type: 'none' };
  if (type === 'custom') {
    const interval = parseInt(document.getElementById('tm-recurrence-interval')?.value) || 1;
    return { type: 'custom', interval };
  }
  if (type === 'days') {
    const days = [...document.querySelectorAll('.day-btn.selected')].map(b => parseInt(b.dataset.day));
    return { type: 'days', days };
  }
  return { type };
}

function toggleBreakFeatureTab() {
  const enabled = document.getElementById('set-break-enabled-general')?.checked;
  const timerSubBtn = document.querySelector('.feature-sub-btn[onclick*="timer"]');
  if (timerSubBtn) timerSubBtn.style.display = enabled ? '' : 'none';
  if (!enabled) {
    const timerTab = document.getElementById('feature-tab-timer');
    if (timerTab && timerTab.classList.contains('active')) {
      const nextBtn = document.querySelector('.feature-sub-btn:not([style*="none"])');
      if (nextBtn) switchFeatureTab(nextBtn.getAttribute('onclick').match(/'([^']+)'/)[1], nextBtn);
    }
  }
}

function toggleBreakInputs() {
  const el = document.getElementById('set-break-enabled') || document.getElementById('set-break-enabled-general');
  const enabled = el ? el.checked : settings.breakEnabled;
  const row = document.getElementById('break-timing-row');
  if (row) row.style.opacity = enabled ? '1' : '0.4';
  document.getElementById('set-break-interval').disabled = !enabled;
  document.getElementById('set-break-duration').disabled = !enabled;
}

function saveSettingsFromModal() {
  settings.breakEnabled      = document.getElementById('set-break-enabled-general')
    ? document.getElementById('set-break-enabled-general').checked
    : (document.getElementById('set-break-enabled') ? document.getElementById('set-break-enabled').checked : settings.breakEnabled);
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
  settings.streakWeekends    = document.getElementById('set-streak-weekends').checked;
  if (document.getElementById('set-grace-day')) settings.graceDayEnabled = document.getElementById('set-grace-day').checked;
  if (document.getElementById('set-energy-enabled'))    settings.energyEnabled    = document.getElementById('set-energy-enabled').checked;
  if (document.getElementById('set-status-enabled'))    settings.statusEnabled    = document.getElementById('set-status-enabled').checked;
  if (document.getElementById('set-subtasks-enabled'))  settings.subtasksEnabled  = document.getElementById('set-subtasks-enabled').checked;
  if (document.getElementById('set-recurrence-enabled')) settings.recurrenceEnabled = document.getElementById('set-recurrence-enabled').checked;
  if (document.getElementById('set-kanban-enabled'))    settings.kanbanEnabled    = document.getElementById('set-kanban-enabled').checked;
  if (document.getElementById('set-kanban-group-tags')) settings.kanbanGroupByTags = document.getElementById('set-kanban-group-tags').checked;
  if (document.getElementById('set-break-enabled-general')) settings.breakEnabled = document.getElementById('set-break-enabled-general').checked;
  api.saveConfig({ settings });
  applySettings();
  renderAll();
  closeModal('settings-modal-overlay');
  showToast('Settings saved');
}

// ── Archive ─────────────────────────────────────────────────────────────────
function openArchiveModal() {
  document.getElementById('archive-modal-overlay').classList.add('open');
  const d = new Date(); d.setDate(1);
  document.getElementById('archive-date-input').value = dateToLocalStr(d);
  updateArchivePreview();
}

function updateArchivePreview() {
  const dateVal = document.getElementById('archive-date-input').value;
  if (!dateVal) return;
  const count = tasks.filter(t => t.completed && t.completedAt &&
    dateToLocalStr(new Date(t.completedAt)) < dateVal).length;
  const el = document.getElementById('archive-preview-count');
  if (el) el.textContent = count + ' task' + (count !== 1 ? 's' : '') + ' will be archived';
}

async function confirmArchive() {
  const dateVal = document.getElementById('archive-date-input').value;
  if (!dateVal) return;
  const toArchive = tasks.filter(t => t.completed && t.completedAt &&
    dateToLocalStr(new Date(t.completedAt)) < dateVal);
  if (!toArchive.length) { showToast('No tasks to archive'); return; }
  if (!confirm('Archive ' + toArchive.length + ' task' + (toArchive.length !== 1 ? 's' : '') + '?\n\nThey will be moved to your Archived tab in Google Sheets.')) return;
  const archivedTasks = toArchive.map(t => ({ ...t, archivedAt: new Date().toISOString() }));
  // Flag tasks as archived in the array (keep them for the Archived view)
  toArchive.forEach(t => {
    const task = tasks.find(x => x.id === t.id);
    if (task) { task.archived = true; task.archivedAt = new Date().toISOString(); }
  });
  closeModal('archive-modal-overlay');
  showToast('Archived ' + archivedTasks.length + ' task' + (archivedTasks.length !== 1 ? 's' : '') + ' \uD83D\uDCE6');
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      await api.archiveAppend({ accessToken, spreadsheetId, tasks: archivedTasks });
    } catch (e) { console.error('Archive error:', e); }
  }
  saveTasks();
  renderAll();
}

function unarchiveTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.archived = false;
  task.archivedAt = '';
  saveTasks();
  renderAll();
  showToast('Task restored ✓');
}

function unarchiveSelected() {
  const checked = document.querySelectorAll('.archive-select-cb:checked');
  if (!checked.length) { showToast('Select at least one task to restore'); return; }
  checked.forEach(cb => {
    const task = tasks.find(t => t.id === parseInt(cb.dataset.id));
    if (task) { task.archived = false; task.archivedAt = ''; }
  });
  saveTasks(); renderAll();
  showToast(checked.length + ' task' + (checked.length !== 1 ? 's' : '') + ' restored ✓');
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
  const excludeArchived = document.getElementById('export-exclude-archived')?.checked;
  let toExport = exportOption === 'completed'
    ? tasks.filter(t => t.completed)
    : [...tasks];
  if (excludeArchived) toExport = toExport.filter(t => !t.archived);

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
  updateMoodSidebarBtn();
  setTimeout(() => closeModal('mood-modal-overlay'), 700);
}

function updateMoodSidebarBtn() {
  const btn = document.getElementById('mood-sidebar-btn');
  if (!btn) return;
  const mood = getTodayMood();
  if (mood) {
    const icons = { sad: '😔', okay: '😐', good: '😊' };
    btn.textContent = `${icons[mood] || '♥'} \u00a0You're feeling ${mood === 'sad' ? 'not great' : mood} today`;
  } else {
    btn.innerHTML = '\u2665 \u00a0How are you feeling?';
  }
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
  // Save to mood history in Google Sheets
  if (!offlineMode && accessToken && spreadsheetId) {
    saveMoodHistory(todayStr(), mood);
  }
}

async function saveMoodHistory(date, mood) {
  try {
    await ensureToken();
    await api.moodAppend({ accessToken, spreadsheetId, date, mood });
  } catch (e) {}
}

// ── What's New ───────────────────────────────────────────────────────────────
async function checkWhatsNew(currentVersion) {
  try {
    const cfg = await api.loadConfig();
    const lastSeen = cfg && cfg.lastSeenVersion;
    if (lastSeen === currentVersion) return; // already seen this version
    // Fetch changelog from GitHub
    const res = await fetch('https://api.github.com/repos/janasridler-web/TaskSpark/releases/latest');
    const release = await res.json();
    if (!release || !release.tag_name) return;
    // Show modal after a short delay so app finishes loading first
    setTimeout(() => showWhatsNew(currentVersion, release), 1500);
  } catch (e) {
    console.warn('Could not fetch changelog:', e);
  }
}

function showWhatsNew(version, release) {
  const overlay = document.getElementById('whatsnew-modal-overlay');
  const versionEl = document.getElementById('whatsnew-version');
  const bodyEl = document.getElementById('whatsnew-body');
  if (!overlay) return;
  versionEl.textContent = `Version ${version}`;
  // Parse the markdown release notes into readable text
  const body = release.body || 'No changelog available for this release.';
  bodyEl.textContent = body;
  overlay.classList.add('open');
}

function closeWhatsNew() {
  document.getElementById('whatsnew-modal-overlay').classList.remove('open');
  // Save current version so modal doesn't show again
  api.getVersion().then(v => api.saveConfig({ lastSeenVersion: v }));
}

// ── Tutorial ─────────────────────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    target: null,
    title: 'Welcome to TaskSpark! 👋',
    desc: 'TaskSpark is built for neuro-diverse minds — reducing decision fatigue, fighting time blindness, and making it easier to start, focus, and actually finish. Let\'s take a quick tour.'
  },
  {
    target: '#task-list',
    title: 'Your Task List',
    desc: 'This is where all your tasks live. Each card shows the priority, due date, tags, status and energy level at a glance. Click the checkbox to complete a task.'
  },
  {
    target: '.btn-new-task',
    title: 'Adding Tasks',
    desc: 'Click "+ New Task" to add something new. You can set a title, description, priority, due date, tags, status and energy level. You can also press Ctrl+Space from anywhere to quickly capture a task.'
  },
  {
    target: '.btn-what-now',
    title: 'What Now?',
    desc: 'Not sure where to start? Hit "What Now?" and TaskSpark will pick the most important task for you based on priority, due date, and how you\'re feeling today.'
  },
  {
    target: '.streak-widget',
    title: 'Your Streak',
    desc: 'Complete at least one task every day to build your streak. TaskSpark tracks your current streak and your best ever. Weekends can be included or excluded in Settings.'
  },
  {
    target: '#sidebar-scroll',
    title: 'Sidebar Filters',
    desc: 'Use the sidebar to filter tasks by view, priority, status or tag. "Due Today" and "Overdue" help you stay on top of what needs attention right now.'
  },
  {
    target: '.mood-sidebar-btn, #mood-sidebar-btn',
    title: 'Mood Check-in',
    desc: 'Tell TaskSpark how you\'re feeling today. Your mood influences what "What Now?" recommends — on low energy days it suggests lighter tasks, on good days it pushes the big ones.'
  },
  {
    target: '.sidebar-bottom',
    title: 'Settings & Refresh',
    desc: 'Open Settings to customise every feature — turn things on or off, adjust timers, manage your account and export your data.'
  },
  {
    target: null,
    title: 'How would you like to get started?',
    desc: 'Choose a starting configuration — you can always change anything in Settings later.',
    preset: true
  }
];

let tutorialStep = 0;

function startTutorial() {
  tutorialStep = 0;
  document.getElementById('tutorial-overlay').classList.add('active');
  showTutorialStep(0);
}

function showTutorialStep(index) {
  const steps = TUTORIAL_STEPS;
  if (index >= steps.length) { endTutorial(); return; }
  const step = steps[index];

  document.getElementById('tut-step-label').textContent = `Step ${index + 1} of ${steps.length}`;
  document.getElementById('tut-title').textContent = step.title;
  document.getElementById('tut-desc').textContent   = step.desc;
  document.getElementById('tut-next-btn').textContent = step.last ? 'Get started!' : 'Next';
  const normalActions = document.getElementById('tut-normal-actions');
  const presetActions = document.getElementById('tut-preset-actions');
  if (normalActions) normalActions.style.display = step.preset ? 'none' : 'flex';
  if (presetActions) presetActions.style.display = step.preset ? 'flex' : 'none';

  // Highlight target element
  const hl = document.getElementById('tutorial-highlight');
  if (step.target) {
    const el = document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const pad = 6;
      hl.style.left   = (r.left - pad) + 'px';
      hl.style.top    = (r.top - pad) + 'px';
      hl.style.width  = (r.width + pad * 2) + 'px';
      hl.style.height = (r.height + pad * 2) + 'px';
      hl.style.display = 'block';
    } else {
      hl.style.display = 'none';
    }
  } else {
    hl.style.display = 'none';
  }
}

function tutorialNext() {
  tutorialStep++;
  if (tutorialStep >= TUTORIAL_STEPS.length) {
    endTutorial();
  } else {
    showTutorialStep(tutorialStep);
  }
}

function skipTutorial() {
  endTutorial();
}

function applyPreset(preset) {
  if (preset === 'basic') {
    settings.tagsEnabled = false; settings.streakEnabled = false;
    settings.estimatesEnabled = false; settings.quickAddEnabled = false;
    settings.whatNowEnabled = false; settings.completionDialog = false;
    settings.moodEnabled = false; settings.energyEnabled = false;
    settings.statusEnabled = false; settings.soundEnabled = false;
    settings.breakEnabled = false;
  } else if (preset === 'full') {
    settings.tagsEnabled = true; settings.streakEnabled = true;
    settings.estimatesEnabled = true; settings.quickAddEnabled = true;
    settings.whatNowEnabled = true; settings.completionDialog = true;
    settings.moodEnabled = true; settings.energyEnabled = true;
    settings.statusEnabled = true; settings.soundEnabled = true;
    settings.breakEnabled = true;
  }
  api.saveConfig({ settings });
  applySettings();
  renderAll();
  endTutorial();
  if (preset === 'basic') showToast('Basic mode set — start simple, add more later!');
  if (preset === 'full')  showToast('Full mode set — all features on!');
}

function applyCustomPreset() {
  endTutorial();
  setTimeout(() => openSettings(), 200);
}

function endTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('active');
  document.getElementById('tutorial-highlight').style.display = 'none';
  api.saveConfig({ tutorialComplete: true });
}

// ── Offline mode ─────────────────────────────────────────────────────────────
function showOfflineConfirm() {
  document.getElementById('offline-confirm-screen').classList.add('active');
}

function cancelOfflineConfirm() {
  document.getElementById('offline-confirm-screen').classList.remove('active');
}

async function startOfflineMode() {
  offlineMode = true;
  await api.saveConfig({ offlineMode: true });
  document.getElementById('offline-confirm-screen').classList.remove('active');
  showApp();
  loadOfflineTasks();
  setTimeout(startTutorial, 1000);
}

async function loadOfflineTasks() {
  tasks = await api.loadCache();
  if (!tasks.length) tasks = sampleTasks();
  await api.saveCache(tasks);
  setSyncStatus('offline');
  const btn = document.getElementById('connect-google-btn');
  if (btn) btn.style.display = '';
  renderAll();
}

async function connectGoogle() {
  const localTasks = await api.loadCache();
  if (localTasks.length) {
    const migrate = confirm(
      'You have ' + localTasks.length + ' task' + (localTasks.length === 1 ? '' : 's') + ' saved locally.\n\n' +
      'Would you like to migrate them to your Google account?\n\n' +
      'Click OK to migrate your tasks, or Cancel to start fresh with an empty list.'
    );
    if (!migrate) await api.saveCache([]);
  }
  offlineMode = false;
  await api.saveConfig({ offlineMode: false });
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('btn-google-signin').onclick = startOAuth;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
// Listen for break choice from the separate break prompt window
api.onBreakChoice((choice) => {
  if (choice === 'break') takeBreak();
  else snoozeBreak();
});

// Listen for stop signal from the separate timer window
api.onTimerPauseRequest(() => pauseTimer());
api.onTimerResumeRequest(() => resumeTimer());
api.onGlobalQuickAdd((data) => {
  if (settings.quickAddEnabled) {
    const fromBackground = !!(data && !data.wasFocused);
    openQuickAdd(fromBackground);
  }
});
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
  timerPaused   = false; timerPausedAt = null; timerPausedElapsed = 0;
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
