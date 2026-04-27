// ── Web API layer — replaces Electron's api.* calls ────────────────────────
// Config & cache stored in localStorage
const WEB_VERSION = '4.0.0';
const CONFIG_KEY  = 'taskspark_config';
const CACHE_KEY   = 'taskspark_cache';

const api = {
  loadConfig: () => {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); } catch { return null; }
  },
  saveConfig: (data) => {
    try {
      const existing = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...existing, ...data }));
    } catch(e) { console.warn('saveConfig error', e); }
  },
  loadCache: () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
  },
  saveCache: (tasks) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(tasks)); } catch(e) {}
  },
  getVersion: () => WEB_VERSION,
  // Not applicable on web — no-ops
  minimize: () => {},
  restore: () => {},
  timerShow: () => {},
  timerHide: () => {},
  breakPromptShow: () => { showInPageBreakPrompt(); },
  breakPromptHide: () => {},
  pickSoundFile: async () => null,
  quickaddDone: () => {},
  installUpdate: () => {},
  onUpdateAvailable: () => {},
  onUpdateDownloaded: () => {},
  onTimerStopped: () => {},
  onTimerPauseRequest: () => {},
  onTimerResumeRequest: () => {},
  onGlobalQuickAdd: () => {},
  onOauthCode: () => {},
  onBreakChoice: () => {},
  // Google Sheets via direct browser fetch
  sheetsEnsure:  (args) => sheetsEnsureWeb(args),
  sheetsLoad:    (args) => sheetsLoadWeb(args),
  sheetsSave:    (args) => sheetsSaveWeb(args),
  habitsSave:    (args) => habitsSaveWeb(args),
  habitsLoad:    (args) => habitsLoadWeb(args),
  ideasSave:     (args) => ideasSaveWeb(args),
  ideasLoad:     (args) => ideasLoadWeb(args),
  winsSave:      (args) => winsSaveWeb(args),
  eventsSave:    (args) => eventsSaveWeb(args),
  eventsLoad:    (args) => eventsLoadWeb(args),
  winsLoad:      (args) => winsLoadWeb(args),
  archiveAppend: (args) => archiveAppendWeb(args),
  moodAppend:    (args) => moodAppendWeb(args),
  // OAuth handled in-browser
  oauthStart:    () => oauthStartWeb(),
  oauthExchange: (args) => oauthExchangeWeb(args),
  oauthRefresh:  (args) => oauthRefreshWeb(args),
  driveFindSheet:   (args) => driveFindSheetWeb(args),
  driveCreateSheet: (args) => driveCreateSheetWeb(args),
  // Workspaces — stored in localStorage on web
  workspacesLoad: () => {
    try { return JSON.parse(localStorage.getItem('taskspark_workspaces') || 'null'); } catch { return null; }
  },
  workspacesSave: (data) => {
    try {
      if (data === null) { localStorage.removeItem('taskspark_workspaces'); return true; }
      localStorage.setItem('taskspark_workspaces', JSON.stringify(data));
      return true;
    } catch(e) { console.warn('workspacesSave error', e); return null; }
  },
  driveCreateSheetNamed:  (args) => driveCreateSheetNamedWeb(args),
  driveFindSheetById:     (args) => driveFindSheetByIdWeb(args),
  driveWorkspacesLoad:    (args) => driveWorkspacesLoadWeb(args),
  driveWorkspacesSave:    (args) => driveWorkspacesSaveWeb(args),
};

// ── OAuth credentials (web) ─────────────────────────────────────────────────
// These are read from a config file loaded at startup — see oauth-config.js
const WEB_CLIENT_ID     = window.TASKSPARK_CLIENT_ID     || '';
const WEB_CLIENT_SECRET = window.TASKSPARK_CLIENT_SECRET || '';
const REDIRECT_URI      = window.location.origin + '/auth.html';

// ── Web OAuth flow ──────────────────────────────────────────────────────────
async function oauthStartWeb() {
  const state = Math.random().toString(36).slice(2);
  sessionStorage.setItem('oauth_state', state);
  const params = new URLSearchParams({
    client_id:     WEB_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email openid',
    access_type:   'offline',
    prompt:        'consent',
    state,
  });
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  return { waiting: false };
}

async function oauthExchangeWeb({ code }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     WEB_CLIENT_ID,
      client_secret: WEB_CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });
  return res.json();
}

async function oauthRefreshWeb({ refreshToken }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id:     WEB_CLIENT_ID,
      client_secret: WEB_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  });
  return res.json();
}

// ── Drive helpers (web) ─────────────────────────────────────────────────────
async function driveFindSheetWeb({ accessToken }) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name%3D'TaskSpark'%20and%20mimeType%3D'application%2Fvnd.google-apps.spreadsheet'%20and%20trashed%3Dfalse&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.files && data.files[0] ? { id: data.files[0].id } : null;
}

async function driveCreateSheetWeb({ accessToken }) {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ properties: { title: 'TaskSpark' } }),
  });
  return res.json();
}

async function driveCreateSheetNamedWeb({ accessToken, name }) {
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ properties: { title: name }, sheets: [{ properties: { title: 'Tasks' } }] }),
  });
  return res.json();
}

async function driveFindSheetByIdWeb({ accessToken, spreadsheetId }) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}?fields=id,name,trashed`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const result = await res.json();
  return result.trashed ? null : result;
}

const CONFIG_SHEET_NAME = 'TaskSpark-Config';

async function findOrCreateConfigSheetWeb(accessToken) {
  // Only creates — never searches. Caller must supply known ID or trigger Picker.
  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ properties: { title: CONFIG_SHEET_NAME }, sheets: [{ properties: { title: 'Config' } }] }),
  });
  const created = await createRes.json();
  return created.spreadsheetId || null;
}

// Opens Google Picker in a popup for the user to select their TaskSpark-Config file.
function openConfigPickerWeb(accessToken) {
  return new Promise((resolve) => {
    if (!window.google || !window.google.picker) {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.onload = () => gapi.load('picker', () => showPicker());
      document.head.appendChild(script);
    } else {
      showPicker();
    }
    function showPicker() {
      const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
        .setQuery('TaskSpark-Config');
      const picker = new google.picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(accessToken)
        .setTitle('Select your TaskSpark-Config file')
        .setCallback((data) => {
          if (data.action === google.picker.Action.PICKED) {
            resolve(data.docs[0].id);
          } else if (data.action === google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    }
  });
}

async function driveWorkspacesLoadWeb({ accessToken, configSheetId }) {
  try {
    // Only load if we have a known ID — never search Drive
    if (!configSheetId) return null;
    const data = await sheetsRequest('GET',
      `/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent('Config!A1')}`, accessToken);
    const val = data.values && data.values[0] && data.values[0][0];
    if (!val) return { id: configSheetId, data: null };
    return { id: configSheetId, data: JSON.parse(val) };
  } catch (e) { console.warn('driveWorkspacesLoadWeb error:', e); return null; }
}

async function driveWorkspacesSaveWeb({ accessToken, configSheetId, data }) {
  try {
    const configId = configSheetId || await findOrCreateConfigSheetWeb(accessToken);
    if (!configId) return null;
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${configId}/values/${encodeURIComponent('Config!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Config!A1', values: [[JSON.stringify(data)]], majorDimension: 'ROWS' });
    return { id: configId };
  } catch (e) { console.warn('driveWorkspacesSaveWeb error:', e); return null; }
}

// ── Sheets helpers (web) ────────────────────────────────────────────────────
async function sheetsRequest(method, path, accessToken, body) {
  const base = 'https://sheets.googleapis.com';
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(base + path, opts);
  if (!res.ok) { const t = await res.text(); throw new Error(t); }
  return res.json();
}

async function sheetsEnsureWeb({ accessToken, spreadsheetId }) {
  const tabs = ['Tasks','Ideas','Habits','Wins','Archive','Mood','Events'];
  const meta = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, accessToken);
  const existing = (meta.sheets||[]).map(s => s.properties.title);
  const missing  = tabs.filter(t => !existing.includes(t));
  if (missing.length) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken, {
      requests: missing.map(title => ({ addSheet: { properties: { title } } }))
    });
  }
}

async function sheetsLoadWeb({ accessToken, spreadsheetId }) {
  const res = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2:Y10000')}`, accessToken);
  const rows = res.values || [];
  return rows.map(r => {
    while (r.length < 25) r.push('');
    return {
      id: Number(r[0]) || Date.now(),
      title: r[1] || '',
      desc: r[2] || '',
      priority: r[3] || 'medium',
      due: r[4] || '',
      tags: safeJSON(r[5], []),
      completed: r[6] === '1',
      createdAt: r[7] || '',
      completedAt: r[8] || '',
      timeLogged: Number(r[9]) || 0,
      timeSessions: safeJSON(r[10], []),
      impact: r[11] || '',
      outcome: r[12] || '',
      deliverable: r[13] || '',
      estimate: Number(r[14]) || 0,
      status: r[15] || 'not-started',
      energy: r[16] || 'medium',
      subtasks: safeJSON(r[17], []),
      archived: r[18] === '1',
      archivedAt: r[19] || '',
      recurrence: safeJSON(r[20], { type: 'none' }),
      dueTime: /^\d{1,2}:\d{2}$/.test(r[21]) ? r[21] : '',
      budget: parseFloat(r[22]) || 0,
      spent: parseFloat(r[23]) || 0,
      attachments: safeJSON(r[24], []),
    };
  });
}

async function sheetsSaveWeb({ accessToken, spreadsheetId, tasks }) {
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2:Y10000')}:clear`, accessToken);
  if (tasks.length) {
    const rows = tasks.map(t => [
      String(t.id), t.title, t.desc||'', t.priority||'medium', t.due||'',
      JSON.stringify(t.tags||[]), t.completed?'1':'0',
      t.createdAt||'', t.completedAt||'', String(t.timeLogged||0),
      JSON.stringify(t.timeSessions||[]), t.impact||'', t.outcome||'',
      t.deliverable||'', String(t.estimate||0),
      t.status||'not-started', t.energy||'medium',
      JSON.stringify(t.subtasks||[]),
      t.archived ? '1' : '0',
      t.archivedAt||'',
      JSON.stringify(t.recurrence||{type:'none'}),
      t.dueTime||'',
      String(t.budget||0),
      String(t.spent||0),
      JSON.stringify(t.attachments||[]),
    ]);
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2')}?valueInputOption=RAW`,
      accessToken, { range: 'Tasks!A2', values: rows, majorDimension: 'ROWS' });
  }
}

async function habitsSaveWeb({ accessToken, spreadsheetId, habits }) {
  await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A2:F10000')}:clear`, accessToken);
  if (habits.length) {
    const rows = habits.map(h => [
      String(h.id), h.name, h.icon||'🔄',
      JSON.stringify(h.days||[]), JSON.stringify(h.completions||{}), h.createdAt||''
    ]);
    await sheetsRequest('POST',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      accessToken, { values: rows, majorDimension: 'ROWS' });
  }
}

async function eventsSaveWeb({ accessToken, spreadsheetId, events }) {
  await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A2:I10000')}:clear`, accessToken);
  if (!events.length) return true;
  const rows = events.map(e => [
    String(e.id), e.title||'', e.allDay?'1':'0', e.start||'', e.end||'', e.date||'', e.desc||'', JSON.stringify(e.tags||[]), e.dateEnd||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { values: rows, majorDimension: 'ROWS' });
  return true;
}

async function eventsLoadWeb({ accessToken, spreadsheetId }) {
  try {
    const res = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A2:G10000')}`, accessToken);
    return (res.values||[]).filter(r => r[0]).map(r => ({
      id: r[0], title: r[1]||'', allDay: r[2]==='1',
      start: r[3]||'', end: r[4]||'', date: r[5]||'', desc: r[6]||'',
      tags: safeJSON(r[7], []), dateEnd: r[8]||''
    }));
  } catch(e) { return []; }
}

async function habitsLoadWeb({ accessToken, spreadsheetId }) {
  try {
    const res = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A2:F10000')}`, accessToken);
    return (res.values||[]).filter(r => r[0] && r[1]).map(r => ({
      id: r[0], name: r[1], icon: r[2]||'🔄',
      days: safeJSON(r[3], []), completions: safeJSON(r[4], {}), createdAt: r[5]||''
    }));
  } catch { return []; }
}

async function ideasSaveWeb({ accessToken, spreadsheetId, ideas }) {
  await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A2:E10000')}:clear`, accessToken);
  if (ideas.length) {
    const rows = ideas.map(i => [
      String(i.id), i.title, i.desc||'', JSON.stringify(i.tags||[]), i.createdAt||''
    ]);
    await sheetsRequest('POST',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      accessToken, { values: rows, majorDimension: 'ROWS' });
  }
}

async function ideasLoadWeb({ accessToken, spreadsheetId }) {
  try {
    const res = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A2:E10000')}`, accessToken);
    return (res.values||[]).filter(r => r[0]).map(r => ({
      id: parseInt(r[0]), title: r[1]||'', desc: r[2]||'',
      tags: safeJSON(r[3], []), createdAt: r[4]||''
    }));
  } catch { return []; }
}

async function winsSaveWeb({ accessToken, spreadsheetId, wins }) {
  await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A2:G10000')}:clear`, accessToken);
  if (wins.length) {
    const rows = wins.map(w => [
      String(w.id), w.quote||'', w.source||'', w.category||'',
      w.date||'', w.mood||'', w.createdAt||''
    ]);
    await sheetsRequest('POST',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      accessToken, { values: rows, majorDimension: 'ROWS' });
  }
}

async function winsLoadWeb({ accessToken, spreadsheetId }) {
  try {
    const res = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A2:G10000')}`, accessToken);
    return (res.values||[]).filter(r => r[0]).map(r => ({
      id: r[0], quote: r[1]||'', source: r[2]||'', category: r[3]||'',
      date: r[4]||'', mood: r[5]||'proud', createdAt: r[6]||''
    }));
  } catch { return []; }
}

async function archiveAppendWeb({ accessToken, spreadsheetId, tasks }) {
  const rows = tasks.map(t => [
    String(t.id), t.title, t.desc||'', t.priority||'medium', t.due||'',
    JSON.stringify(t.tags||[]), t.completed?'1':'0',
    t.createdAt||'', t.completedAt||'', String(t.timeLogged||0),
    t.impact||'', t.outcome||'', t.deliverable||'', t.archivedAt||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Archive!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { range: 'Archive!A1', values: rows, majorDimension: 'ROWS' });
}

async function moodAppendWeb({ accessToken, spreadsheetId, date, mood }) {
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Mood!A1')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { range: 'Mood!A1', values: [[date, mood]], majorDimension: 'ROWS' });
}

function safeJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── In-page break prompt (replaces Electron's always-on-top window) ─────────
function showInPageBreakPrompt() {
  playBreakSound();
  notify('Time for a break!', "You've been working for a while. Step away for a few minutes.");
  const overlay = document.getElementById('web-break-prompt');
  if (overlay) overlay.classList.add('active');
}

function webBreakChoice(choice) {
  const overlay = document.getElementById('web-break-prompt');
  if (overlay) overlay.classList.remove('active');
  if (choice === 'break') takeBreak();
  else snoozeBreak();
}

// ── In-page timer panel (web's equivalent of desktop's floating window) ─────
function showInPageTimer(taskName, baseLogged) {
  const panel = document.getElementById('web-timer-panel');
  const nameEl = document.getElementById('wtp-task-name');
  if (!panel) return;
  panel.style.display = 'block';
  if (nameEl) nameEl.textContent = taskName;
  updateInPageTimer(baseLogged || 0);
  updateInPageTimerPauseUI();
}

function hideInPageTimer() {
  const panel = document.getElementById('web-timer-panel');
  if (panel) panel.style.display = 'none';
}

function updateInPageTimer(totalSecs) {
  const el = document.getElementById('wtp-time');
  if (!el) return;
  const t = Math.max(0, Math.floor(totalSecs || 0));
  const h = Math.floor(t/3600), m = Math.floor((t%3600)/60), s = t%60;
  const pad = n => String(n).padStart(2, '0');
  el.textContent = h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function updateInPageTimerPauseUI() {
  const btn = document.getElementById('wtp-pause-btn');
  if (btn) btn.textContent = timerPaused ? '▶ Resume' : '⏸ Pause';
}

function toggleTimerPause() {
  if (timerPaused) resumeTimer();
  else pauseTimer();
}

// ── Browser notifications ────────────────────────────────────────────────────
function isIOSWithoutPWA() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return !standalone;
}

function _notificationsFail(checkbox, title, body) {
  checkbox.checked = false;
  settings.browserNotificationsEnabled = false;
  showConfirmModal(title, body, 'OK', () => {});
}

async function onNotificationsToggle(checkbox) {
  if (!checkbox.checked) {
    settings.browserNotificationsEnabled = false;
    return;
  }
  if (!('Notification' in window)) {
    _notificationsFail(checkbox, 'Not supported',
      "This browser doesn't support notifications, so we can't enable them here.");
    return;
  }
  if (isIOSWithoutPWA()) {
    _notificationsFail(checkbox, 'Install TaskSpark first',
      'iOS only allows notifications for installed web apps. Tap the share icon in Safari and choose <strong>Add to Home Screen</strong>, then open TaskSpark from the icon and try again.');
    return;
  }
  if (Notification.permission === 'denied') {
    _notificationsFail(checkbox, 'Notifications blocked',
      "Your browser is blocking notifications for this site. To unblock:<br><br>1. Click the <strong>lock or settings icon</strong> in the address bar.<br>2. Find <strong>Notifications</strong> and set it to <strong>Allow</strong>.<br>3. Reload the page and try the toggle again.");
    return;
  }
  try {
    const result = await Notification.requestPermission();
    console.log('[notifications] requestPermission result:', result);
    if (result === 'granted') {
      settings.browserNotificationsEnabled = true;
      // Tiny sample so the user knows it worked.
      try { new Notification('Notifications on', { body: 'TaskSpark will alert you here when it\'s break time.', icon: 'assets/icon-192.png' }); } catch {}
    } else if (result === 'denied') {
      _notificationsFail(checkbox, 'Notifications blocked',
        "You picked Block in the browser prompt. To change your mind, click the <strong>lock or settings icon</strong> in the address bar, set Notifications to <strong>Allow</strong>, then reload and try again.");
    } else {
      // 'default' — user dismissed without choosing
      _notificationsFail(checkbox, 'Permission needed',
        'You need to choose <strong>Allow</strong> in the browser prompt for notifications to work. Try the toggle again and pick Allow.');
    }
  } catch (e) {
    console.warn('[notifications] requestPermission threw:', e);
    _notificationsFail(checkbox, "Couldn't enable notifications",
      'Something went wrong asking your browser for permission. Try reloading the page and toggling again.');
  }
}

function notify(title, body, opts = {}) {
  if (!settings.browserNotificationsEnabled) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: 'assets/icon-192.png', tag: 'taskspark', ...opts });
  } catch {}
}

// Favicon "timer running" indicator — visible in the browser tab strip
// even when TaskSpark isn't the active tab.
function setFaviconRunning(running) {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  if (!link.dataset.original) link.dataset.original = link.getAttribute('href') || '';
  if (running) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
              + '<circle cx="16" cy="16" r="14" fill="#10b981"/>'
              + '<circle cx="16" cy="16" r="5" fill="#fff"/></svg>';
    link.href = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  } else {
    link.href = link.dataset.original;
  }
}

// ── Handle OAuth callback (code in URL params after redirect) ───────────────
async function handleOAuthCallback() {
  // Read code from sessionStorage (set by callback.html to avoid Mod_Security blocking)
  const code  = sessionStorage.getItem('oauth_code');
  const state = sessionStorage.getItem('oauth_callback_state');
  const error = sessionStorage.getItem('oauth_error');
  if (error) {
    sessionStorage.removeItem('oauth_error');
    document.getElementById('auth-error').textContent = 'Sign-in cancelled. Please try again.';
    document.getElementById('auth-error').style.display = 'block';
    return true;
  }
  if (!code) return false;
  // Clear sessionStorage
  sessionStorage.removeItem('oauth_code');
  sessionStorage.removeItem('oauth_callback_state');
  const savedState = sessionStorage.getItem('oauth_state');
  if (state && savedState && state !== savedState) {
    document.getElementById('auth-error').textContent = 'Sign-in failed: state mismatch. Please try again.';
    document.getElementById('auth-error').style.display = 'block';
    return true;
  }
  sessionStorage.removeItem('oauth_state');
  // Show waiting UI
  document.getElementById('auth-waiting').style.display = 'block';
  document.getElementById('auth-status').textContent = 'Completing sign-in…';
  try {
    const tokens = await api.oauthExchange({ code, redirectUri: REDIRECT_URI });
    if (tokens.access_token) {
      accessToken  = tokens.access_token;
      refreshToken = tokens.refresh_token;
      tokenExpiry  = Date.now() + (tokens.expires_in || 3600) * 1000;
      document.getElementById('auth-status').textContent = 'Signing you in…';
      const userInfo = await fetchUserInfo(accessToken);
      const newEmail = userInfo ? userInfo.email : null;
      const existingCfg = api.loadConfig();
      const previousEmail = existingCfg && existingCfg.userEmail;
      if (previousEmail && newEmail && previousEmail !== newEmail) {
        api.saveCache([]);
      }
      document.getElementById('auth-status').textContent = 'Looking for your spreadsheet…';
      const existingSheet = await api.driveFindSheet({ accessToken });
      let isBrandNewUser = false;
      if (existingSheet && existingSheet.id) {
        spreadsheetId = existingSheet.id;
        document.getElementById('auth-status').textContent = 'Reconnecting…';
      } else {
        document.getElementById('auth-status').textContent = 'Setting up your spreadsheet…';
        const sheet = await api.driveCreateSheet({ accessToken });
        if (!sheet.spreadsheetId) throw new Error('Could not create spreadsheet');
        spreadsheetId = sheet.spreadsheetId;
        isBrandNewUser = true;
      }
      offlineMode = false;
      rootSpreadsheetId = spreadsheetId;
      api.saveConfig({ spreadsheetId, accessToken, refreshToken, tokenExpiry, userEmail: newEmail, offlineMode: false });
      showApp();

      // V3: Load workspace config from the spreadsheet before connecting
      try {
        await ensureToken();
        const driveWs = await api.driveWorkspacesLoad({ accessToken, configSheetId: configSheetId || null });
        if (driveWs && driveWs.data && driveWs.data.workspaces && driveWs.data.workspaces.length) {
          workspaces = driveWs.data.workspaces;
          activeWorkspaceId = driveWs.data.activeWorkspaceId || workspaces[0].id;
          await api.workspacesSave({ workspaces, activeWorkspaceId });
          const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
          if (active) {
            spreadsheetId = active.spreadsheetId;
            activeWorkspaceId = active.id;
            if (active.settings) { settings = { ...DEFAULT_SETTINGS, ...active.settings }; applySettings(); }
          }
          renderWorkspaceDropdown();
          updateWorkspaceTitle();
        } else {
          // V3.5.1: No workspaces found locally.
          // - Brand-new user (no existing TaskSpark sheet): show welcome modal
          // - Returning user on new device (found existing TaskSpark sheet but no
          //   workspace config): show welcome modal with the restore path emphasised
          configSheetId = null;
          await showFirstRunWelcomeModal({ isBrandNewUser });
        }
      } catch (e) { console.warn('[OAuth] workspace load failed:', e.message); }

      // Ensure task list container is visible before connecting
      const tlc = document.getElementById('task-list-container');
      if (tlc) { tlc.style.display = 'block'; tlc.style.flex = '1'; tlc.style.minHeight = '0'; }

      await connectToSheets();
      await Promise.all([loadIdeas(), loadHabits(), loadWins()]);
      if (workspaces.length > 1) setTimeout(prefetchAllWorkspaces, 2000);
      if (workspaces.length === 0) setTimeout(showWorkspaceSetupModal, 800);
    } else {
      throw new Error(tokens.error_description || 'No access token received');
    }
  } catch(e) {
    document.getElementById('auth-error').textContent = `Sign-in failed: ${e.message}`;
    document.getElementById('auth-error').style.display = 'block';
    document.getElementById('auth-waiting').style.display = 'none';
  }
  return true;
}

// ── State ──────────────────────────────────────────────────────────────────
let outlookAccessToken = null, outlookRefreshToken = null, outlookConnected = false, outlookEvents = [];
let tasks        = [];
let currentView  = 'all';
let editingId    = null;
let modalTags    = [];
let modalDue     = '';
let modalDueTime = '';
let calYear      = null;
let calMonth     = null;
let completionTaskId = null;
let selectedImpact   = 'medium';
let undoStack    = [];

// View mode
let kanbanMode = false;
let ideasMode  = false;
let budgetViewMode = false;
let calendarViewMode = false;

// Calendar
let calEvents = [];
let editingCalEventId = null;
let calEventTags = []; // separate tag system for calendar events
let calViewType = 'month';
let calDate = new Date();

// Attachments
let modalAttachments = [];

// Ideas
let ideas = [];
let editingIdeaId = null;
let ideaTags = [];

// Habits
let habits = [];
let editingHabitId = null;
let habitsViewDays = 7; // 7 or 30

// Wins Board
let wins = [];
let editingWinId = null;
let winsMode = false;



// Workspaces
const MAX_WORKSPACES = 3;
const WORKSPACE_COLOURS = [
  { id: 'green',  label: 'Green',  hex: '#4a9e6e' },
  { id: 'blue',   label: 'Blue',   hex: '#4a7abe' },
  { id: 'purple', label: 'Purple', hex: '#8b5cf6' },
  { id: 'red',    label: 'Red',    hex: '#e05252' },
  { id: 'amber',  label: 'Amber',  hex: '#d97706' },
  { id: 'teal',   label: 'Teal',   hex: '#0d9488' },
];
let workspaces = [];         // [{id, name, colour, spreadsheetId, settings}]
let activeWorkspaceId = null;
let workspaceSetupPending = false; // true if we need to prompt on first V3 launch
let onboardingChecklist = { addTask: false, completeTask: false, whatNow: false, mood: false, dismissed: false };
let configSheetId = null;  // ID of the TaskSpark-Config spreadsheet
let rootSpreadsheetId = null;      // The original spreadsheet — used for cross-app workspace config
// Pre-fetched workspace data cache: { [wsId]: { tasks, habits, ideas, wins } }
const _wsCache = {};

// Auth state
let offlineMode   = false;
let accessToken   = null;
let refreshToken  = null;
let tokenExpiry   = 0;
let spreadsheetId = null;
let redirectUri   = null;

// Timer state
let activeTimerId      = null;
let timerStart         = null;
let timerInterval      = null;
let timerPaused        = false;
let timerPausedAt      = null;
let timerPausedElapsed = 0;
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
  dueEnabled:        true,
  dueTimeEnabled:    true,
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
  kanbanShowCompleted: false,
  workspacesEnabled: true,
  ideasEnabled:      true,
  habitsEnabled:     true,
  winsEnabled:       true,
  streakWeekends:    false,  // include weekends in streak count
  graceDayEnabled:   true,   // allow one missed day per streak
  vacationMode:      false,  // pause streak while away
  outlookRefreshToken: null,
  vacationReturn:    null,   // return date YYYY-MM-DD
  changelogEnabled:  true,
  sodEnabled:        true,
  sodShowDueToday:   true,
  sodShowOverdue:    true,
  sodShowMood:       true,
  eodEnabled:        true,
  eodTime:           '17:00',
  eodShowCompleted:  true,
  eodShowTomorrow:   true,
  eodShowStreak:     true,
  timerEnabled:      true,
  focusModeEnabled:  false,
  budgetEnabled:     true,
  currencySymbol:    '£',
  budgetGroupByTags: false,
  attachmentsEnabled: true,
  calendarEnabled:   true,
  deferEnabled:      false,
  tagCustomColorsEnabled: false,
  tagColors:         {},
  browserNotificationsEnabled: false,
};
let settings = { ...DEFAULT_SETTINGS };

function getBreakIntervalMs() { return settings.breakIntervalMins * 60 * 1000; }
function getBreakDurationS()  { return settings.breakDurationMins * 60; }

function playBreakSound() {
  if (!settings.soundEnabled) return;
  const src = settings.soundFile
    ? `file:///${settings.soundFile.replace(/\\/g, '/')}`
    : '../assets/break-chime.mp3';
  const audio = new Audio(src);
  audio.volume = 0.75;
  audio.play().catch(() => {
    if (!settings.soundFile) return;
    const fallback = new Audio('../assets/break-chime.mp3');
    fallback.volume = 0.75;
    fallback.play().catch(() => {});
  });
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

function fmtTime(t) {
  if (!t) return '';
  try {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2,'0')}${ampm}`;
  } catch { return t; }
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
  if (settings.tagCustomColorsEnabled && settings.tagColors && settings.tagColors[tag]) {
    const v = settings.tagColors[tag];
    return v.startsWith('#') ? v : '#' + v;
  }
  if (!tagColorMap[tag]) tagColorMap[tag] = TAG_PALETTE[Object.keys(tagColorMap).length % TAG_PALETTE.length];
  return tagColorMap[tag];
}

function isDeferred(task) {
  if (!settings.deferEnabled || !task.hideUntilDays || !task.due) return false;
  const t = todayStr();
  if (task.due <= t) return false;
  const show = new Date(task.due + 'T00:00:00');
  show.setDate(show.getDate() - task.hideUntilDays);
  return show.toISOString().slice(0, 10) > t;
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
  // Only show Synced or Offline — suppress errors and syncing spinners
  if (state === 'ok') { lbl.textContent = '● Synced'; lbl.style.color = 'var(--accent)'; }
  else if (state === 'offline') { lbl.textContent = '○ Offline'; lbl.style.color = 'var(--text3)'; }
  // error and syncing states are silently ignored
  const btn = document.getElementById('open-sheet-btn');
  if (btn) btn.style.display = spreadsheetId ? '' : 'none';
}

// ── Theme ──────────────────────────────────────────────────────────────────
function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
  const btn = document.getElementById('theme-toggle-btn');
  if (btn) btn.textContent = mode === 'dark' ? '☀ Light mode' : '☽ Dark mode';
}

const ACCENT_NAMES = {
  forest: 'Forest (default)', ocean: 'Ocean', lavender: 'Lavender',
  sunset: 'Sunset', rose: 'Rose', slate: 'Slate', moss: 'Moss'
};

function applyAccentTheme(accent) {
  if (!accent || accent === 'forest') {
    document.documentElement.removeAttribute('data-accent');
  } else {
    document.documentElement.setAttribute('data-accent', accent);
  }
  // Update picker active state if it's open
  document.querySelectorAll('.colour-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === (accent || 'forest'));
  });
  const nameEl = document.getElementById('colour-theme-name');
  if (nameEl) nameEl.textContent = ACCENT_NAMES[accent || 'forest'] || '';
}

function setAccentTheme(accent, btn) {
  applyAccentTheme(accent);
  api.saveConfig({ accentTheme: accent });
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
  // Web: handle OAuth redirect callback first before anything else
  const wasCallback = await handleOAuthCallback();
  if (wasCallback) return;

  const cfg = await api.loadConfig();
  if (cfg) {
    applyTheme(cfg.theme || 'light');
    if (cfg.accentTheme) applyAccentTheme(cfg.accentTheme);
    if (cfg.sortMode) document.getElementById('sort-select').value = cfg.sortMode;
    if (cfg.settings) settings = { ...DEFAULT_SETTINGS, ...cfg.settings };
    if (cfg.configSheetId) configSheetId = cfg.configSheetId;
    if (cfg.onboardingChecklist) onboardingChecklist = { ...onboardingChecklist, ...cfg.onboardingChecklist };
  }
  applySettings();

  // V3: Load workspaces config
  const wsData = await api.workspacesLoad();
  if (wsData && wsData.workspaces && wsData.workspaces.length) {
    workspaces = wsData.workspaces;
    activeWorkspaceId = wsData.activeWorkspaceId || workspaces[0].id;
  }

  // V2: Just need accessToken, refreshToken and spreadsheetId — no client credentials
  if (cfg && cfg.accessToken && cfg.refreshToken && cfg.spreadsheetId) {
    accessToken   = cfg.accessToken;
    refreshToken  = cfg.refreshToken;
    tokenExpiry   = cfg.tokenExpiry || 0;
    spreadsheetId = cfg.spreadsheetId;
    rootSpreadsheetId = cfg.spreadsheetId; // Remember original sheet for workspace config

    showApp();
    // V3: Check if workspaces need first-time setup
    // V3: Always try Drive first — it's the cross-platform source of truth
    try {
      await ensureToken();
      const driveWs = await api.driveWorkspacesLoad({ accessToken, configSheetId: configSheetId || null });
      if (driveWs && driveWs.data && driveWs.data.workspaces && driveWs.data.workspaces.length) {
        configSheetId = driveWs.id;
        const localHasWorkspaces = workspaces.length > 0;
        const driveData = driveWs.data;
        if (localHasWorkspaces && JSON.stringify(workspaces) !== JSON.stringify(driveData.workspaces)) {
          // Conflict — local and Drive differ
          await resolveWorkspaceConflict(driveData);
        } else {
          // No conflict or no local — use Drive data
          workspaces = driveData.workspaces;
          activeWorkspaceId = driveData.activeWorkspaceId || workspaces[0].id;
          await api.workspacesSave({ workspaces, activeWorkspaceId });
        }
      } else if (driveWs && driveWs.id) {
        configSheetId = driveWs.id;
      } else if (workspaces.length > 0) {
        // No Drive file yet — push local config up to Drive
        const result = await api.driveWorkspacesSave({ accessToken, configSheetId, data: { workspaces, activeWorkspaceId } });
        if (result && result.id) configSheetId = result.id;
      }
    } catch (e) { console.warn('[init] Drive workspace load failed:', e.message); }

    if (!wsData || !wsData.workspaces || !wsData.workspaces.length) {
      if (workspaces.length === 0) {
        // No Drive config and no local config — first time setup
        workspaceSetupPending = true;
        await connectToSheets();
        await loadIdeas();
        await loadHabits();
        await loadWins();
        if (!cfg.onboardingComplete && !cfg.tutorialComplete) setTimeout(startOnboarding, 1000);
        setTimeout(showWorkspaceSetupModal, 800);
      } else {
        // Got workspaces from Drive — proceed normally
        const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
        if (active) {
          spreadsheetId = active.spreadsheetId;
          activeWorkspaceId = active.id;
          if (active.settings) { settings = { ...DEFAULT_SETTINGS, ...active.settings }; applySettings(); }
        }
        renderWorkspaceDropdown();
        updateWorkspaceTitle();
        await connectToSheets();
        await Promise.all([loadIdeas(), loadHabits(), loadWins()]);
        if (!cfg.onboardingComplete && !cfg.tutorialComplete) setTimeout(startOnboarding, 1000);
        if (workspaces.length > 1) setTimeout(prefetchAllWorkspaces, 2000);
      }
    } else {
      const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
      if (active) {
        spreadsheetId = active.spreadsheetId;
        activeWorkspaceId = active.id;
        if (active.settings) { settings = { ...DEFAULT_SETTINGS, ...active.settings }; applySettings(); }
      }
      renderWorkspaceDropdown();
      updateWorkspaceTitle();
      await connectToSheets();
      await Promise.all([loadIdeas(), loadHabits(), loadWins()]);
      if (!cfg.onboardingComplete && !cfg.tutorialComplete) setTimeout(startOnboarding, 1000);
      if (workspaces.length > 1) setTimeout(prefetchAllWorkspaces, 2000);
    }
  } else if (cfg && cfg.offlineMode) {
    offlineMode = true;
    showApp();
    loadOfflineTasks();
    await loadIdeas();
    await loadHabits();
    await loadWins();
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
  // Init Outlook
  initOutlook().catch(e => console.error('Outlook init error:', e));
  // Check if grace day prompt needed
  checkGraceDayPrompt();
  checkStartOfDay();
  scheduleEod();
}


function hideLoadingScreen() {
  const el = document.getElementById('loading-screen');
  if (!el) return;
  const elapsed = Date.now() - (window._appStartTime || Date.now());
  const remaining = Math.max(0, 3000 - elapsed);
  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => el.classList.add('hidden'), 380);
  }, remaining);
}

function showAuth() {
  hideLoadingScreen();
  document.getElementById('auth-screen').classList.add('active');
  document.getElementById('app').style.display = 'none';
  document.getElementById('btn-google-signin').onclick = startOAuth;
}

function showApp() {
  updateChangelogSidebarBtn();
  hideLoadingScreen();
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('app').style.display = 'flex';
  // Explicitly initialise containers to a known state
  const tlc = document.getElementById('task-list-container');
  if (tlc) { tlc.style.display = 'block'; tlc.style.flex = '1'; tlc.style.minHeight = '0'; }
  const kc = document.getElementById('kanban-container');
  if (kc) kc.style.display = 'none';
  const ic = document.getElementById('ideas-container');
  if (ic) ic.classList.remove('active');
  const hc = document.getElementById('habits-container');
  if (hc) hc.classList.remove('active');
  const wc = document.getElementById('wins-container');
  if (wc) wc.classList.remove('active');
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
      rootSpreadsheetId = spreadsheetId;
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
  } catch (e) {
    console.warn('Token refresh failed:', e);
  }
}

// ── Centralised fetch wrapper for Google + Microsoft API calls ──────────────
// Adds the Authorization header automatically (when called for a Google or
// Graph endpoint), refreshes the token on 401 once and retries, and surfaces
// non-OK responses or network failures as a toast. Existing call sites can
// migrate to apiFetch gradually; new code should use it from day one.
async function apiFetch(url, options = {}) {
  const isGoogle = /googleapis\.com|accounts\.google\.com/.test(url);
  const isGraph  = /graph\.microsoft\.com|login\.microsoftonline\.com/.test(url);
  const needsAuth = isGoogle || isGraph;
  const opts = { ...options, headers: { ...(options.headers || {}) } };

  if (needsAuth) {
    if (isGoogle) await ensureToken();
    if (accessToken && !opts.headers.Authorization && !opts.headers.authorization) {
      opts.headers.Authorization = 'Bearer ' + accessToken;
    }
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    showToast('Network error. Check your connection and try again.');
    throw err;
  }

  // Retry once on 401 by refreshing the token (Google only — Graph uses its
  // own refresh path which lives elsewhere).
  if (res.status === 401 && isGoogle && refreshToken) {
    try {
      const tokens = await api.oauthRefresh({ refreshToken });
      if (tokens && tokens.access_token) {
        accessToken = tokens.access_token;
        tokenExpiry = Date.now() + (tokens.expires_in || 3600) * 1000;
        await api.saveConfig({ accessToken, tokenExpiry });
        opts.headers.Authorization = 'Bearer ' + accessToken;
        res = await fetch(url, opts);
      }
    } catch (err) {
      console.warn('apiFetch: token refresh on 401 failed', err);
    }
  }

  if (!res.ok) {
    showToast('Sync failed (HTTP ' + res.status + '). Some changes may not have saved.');
  }
  return res;
}

async function signOut() {
  if (offlineMode) {
    showConfirmModal('Leave Offline Mode', 'Your local tasks will remain on this computer.', 'Leave Offline Mode', async () => {
      await api.saveConfig({ offlineMode: false });
      location.reload();
    });
    return;
  }
  showConfirmModal('Sign Out', 'Your tasks will remain in your Google Sheet.', 'Sign Out', async () => {
    await api.saveConfig({ accessToken: null, refreshToken: null, tokenExpiry: 0, userEmail: null, spreadsheetId: null });
    await api.workspacesSave(null);
    location.reload();
  }, true);
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

    // V3: Re-check workspace config from the root spreadsheet in case new workspaces were added
    if (rootSpreadsheetId) {
      const driveWs = await api.driveWorkspacesLoad({ accessToken, configSheetId: configSheetId || null });
      if (driveWs && driveWs.data && driveWs.data.workspaces) {
        const incoming = driveWs.data.workspaces;
        // Update if anything changed — count, IDs, names, or colours
        const changed = JSON.stringify(incoming) !== JSON.stringify(workspaces);
        if (changed) {
          workspaces = incoming;
          activeWorkspaceId = driveWs.data.activeWorkspaceId || workspaces[0].id;
          await api.workspacesSave({ workspaces, activeWorkspaceId });
          renderWorkspaceDropdown();
          updateWorkspaceTitle();
          showToast('Workspaces updated');
        }
      }
    }

    tasks = await api.sheetsLoad({ accessToken, spreadsheetId });
    await api.saveCache(tasks);
    setSyncStatus('ok');
    renderAll();
  } catch (e) { setSyncStatus('error', e.message.slice(0, 50)); }
}

async function saveTasks() {
  _lastTasksHTML = ''; // Invalidate render cache
  await api.saveCache(tasks);
  if (offlineMode) { setSyncStatus('offline'); return; }
  const activeWs = getActiveWorkspace();
  if (activeWs && activeWs.readOnly) { setSyncStatus('ok'); return; }
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
  const prevText  = lbl.textContent;
  const prevColor = lbl.style.color;
  lbl.textContent = msg; lbl.style.color = 'var(--accent)';
  setTimeout(() => { lbl.textContent = prevText; lbl.style.color = prevColor; }, 2500);
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
// Safety net: clicking on the main area cleans up any stray contentEditable elements
document.getElementById('main')?.addEventListener('click', e => {
  if (!e.target.closest('[contenteditable="true"]') && !e.target.closest('.modal-overlay')) {
    document.querySelectorAll('[contenteditable="true"]').forEach(el => {
      el.contentEditable = 'false';
      el.classList.remove('editing');
    });
  }
});

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
    if (v === 'all')             return !task.completed && !task.archived && !isDeferred(task);
    if (v === 'today')           return !task.completed && !task.archived && task.due === t && !isDeferred(task);
    if (v === 'overdue')         return !task.completed && !task.archived && task.due && task.due < t;
    if (v === 'deferred')        return !task.completed && !task.archived && isDeferred(task);
    if (v === 'completed')       return task.completed && !task.archived;
    if (v === 'priority-high')        return !task.completed && !task.archived && task.priority === 'high' && !isDeferred(task);
    if (v === 'priority-medium')      return !task.completed && !task.archived && task.priority === 'medium' && !isDeferred(task);
    if (v === 'priority-low')         return !task.completed && !task.archived && task.priority === 'low' && !isDeferred(task);
    if (v === 'status-not-started')   return !task.completed && !task.archived && (task.status || 'not-started') === 'not-started' && !isDeferred(task);
    if (v === 'status-in-progress')   return !task.completed && !task.archived && task.status === 'in-progress' && !isDeferred(task);
    if (v === 'status-blocked')       return !task.completed && !task.archived && task.status === 'blocked' && !isDeferred(task);
    if (v === 'status-on-hold')       return !task.completed && !task.archived && task.status === 'on-hold' && !isDeferred(task);
    if (v === 'archived')             return task.archived === true;
    if (v.startsWith('tag:'))         return !task.completed && !task.archived && (task.tags||[]).includes(v.slice(4)) && !isDeferred(task);
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
let habitsMode = false;

function renderAll() {
  if (kanbanMode) renderKanban();
  else if (ideasMode) renderIdeas();
  else if (habitsMode) renderHabits();
  else if (winsMode) renderWins();
  else if (budgetViewMode) renderBudgetView();
  else if (calendarViewMode) renderCalendarView();
  else renderTasks();
  updateCounts();
  updateTagSidebar();
  updateStreak();
  renderGettingStartedCard();
}

function onSortChange() {
  const val = document.getElementById('sort-select').value;
  api.saveConfig({ sortMode: val });
  renderTasks();
}

let _lastTasksHTML = '';
function renderTasks() {
  const list = document.getElementById('task-list');
  // Show/hide bulk restore toolbar
  const bulkBar = document.getElementById('archive-bulk-bar');
  if (bulkBar) bulkBar.style.display = currentView === 'archived' ? '' : 'none';
  const filtered = sortTasks(filterTasks());

  if (!filtered.length) {
    const msg = currentView === 'completed' ? 'No completed tasks yet' : 'All clear!';
    const sub = currentView === 'completed' ? 'Complete a task to see it here' : 'Add a new task to get started';
    const html = `<div class="empty-state"><div class="empty-icon">✓</div><div class="empty-text">${msg}</div><div class="empty-sub">${sub}</div></div>`;
    if (html !== _lastTasksHTML) { list.innerHTML = html; _lastTasksHTML = html; }
    updateStats();
    return;
  }

  const newHTML = filtered.map(task => taskCardHTML(task)).join('');
  if (newHTML !== _lastTasksHTML) { list.innerHTML = newHTML; _lastTasksHTML = newHTML; }
  updateStats();
}

function taskCardHTML(task) {
  const ds = dueStatus(task.due);
  const isRunning = activeTimerId === task.id;
  const pColors = { high:'var(--red)', medium:'var(--amber)', low:'var(--blue)' };

  // Due badge
  let dueBadge = '';
  if (settings.dueEnabled !== false && task.due) {
    const cls = ds === 'overdue' ? 'overdue' : ds === 'today' ? 'today' : ds === 'soon' ? 'soon' : '';
    const icon = ds === 'overdue' ? '⚠' : '◷';
    const datePart = ds === 'overdue' ? `${icon} ${fmtDate(task.due)}` : ds === 'today' ? `${icon} Today` : ds === 'soon' ? `→ ${fmtDate(task.due)}` : `○ ${fmtDate(task.due)}`;
    const timePart = (settings.dueTimeEnabled !== false && task.dueTime) ? ` ${fmtTime(task.dueTime)}` : '';
    dueBadge = `<span class="badge badge-due ${cls}">${esc(datePart + timePart)}</span>`;
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

  // Budget badge
  let budgetBadge = '';
  if (settings.budgetEnabled && task.budget && task.budget > 0) {
    const sym = settings.currencySymbol || '£';
    const spent = task.spent || 0;
    const over = spent > task.budget;
    budgetBadge = `<span class="badge badge-budget${over ? ' over' : ''}">${sym}${spent.toFixed(2)}/${sym}${parseFloat(task.budget).toFixed(2)}</span>`;
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
  const timerBtn = (!task.completed && settings.timerEnabled !== false && !isReadOnly()) ? `
    <button class="action-btn timer ${isRunning?'running':''}" onclick="toggleTimer(${task.id})" title="${isRunning?'Stop':'Start'} timer">
      ${isRunning ? '■' : '▶'}
    </button>` : '';

  const cardClass = [
    'task-card',
    `priority-${task.priority}`,
    task.completed ? 'completed' : '',
  ].filter(Boolean).join(' ');

  const ro = isReadOnly();

  return `
  <div class="${cardClass}" id="task-card-${task.id}">
    <div class="task-check-wrap">
      <div class="task-checkbox ${task.completed?'checked':''}" ${ro ? '' : `onclick="toggleComplete(${task.id})"`} style="${ro ? 'pointer-events:none;opacity:0.4' : ''}">${task.completed?'✓':''}</div>
    </div>
    <div class="task-body">
      <div class="task-title" id="task-title-${task.id}" ${ro ? '' : `ondblclick="startInlineEdit(${task.id})"`}>${esc(task.title)}</div>
      ${task.desc ? `<div class="task-desc">${esc(task.desc)}</div>` : ''}
      <div class="task-meta">
        ${dueBadge}<span class="badge badge-priority-${task.priority}">${task.priority.charAt(0).toUpperCase()+task.priority.slice(1)}</span>
        ${settings.statusEnabled !== false ? (task.status ? `<span class="badge badge-status status-${task.status || 'not-started'}">${(task.status || 'not-started').replace(/-/g,' ')}</span>` : '<span class="badge badge-status status-not-started">not started</span>') : ''}
        ${settings.energyEnabled !== false ? `<span class="badge badge-energy energy-${task.energy || 'medium'}">${task.energy==='high'?'⚡ high':task.energy==='low'?'🌿 low':'◆ medium'}</span>` : ''}
        ${task.recur && task.recur !== 'none' ? `<span class="badge badge-recur">↺ ${task.recur === 'custom' ? 'every ' + (task.recurInterval||1) + 'd' : task.recur}</span>` : ''}
        ${tagBadges}${timeBadge}${liveTimeBadge}${budgetBadge}${renderAttachmentBadges(task)}
      </div>
      ${completionDetail}
      ${renderSubtasksHTML(task)}
    </div>
    ${ro ? '' : `<div class="task-actions">
      ${timerBtn}
      ${task.archived ? `<button class="action-btn" onclick="unarchiveTask(${task.id})" title="Restore" style="color:var(--accent)">↩</button>` : `<button class="action-btn" onclick="openTaskModal(${task.id})" title="Edit">✎</button>`}
      <button class="action-btn delete" onclick="deleteTask(${task.id})" title="Delete">✕</button>
      ${currentView === 'archived' ? `<input type="checkbox" class="archive-select-cb" data-id="${task.id}" style="margin-left:4px;accent-color:var(--accent);cursor:pointer">` : ''}
    </div>`}
  </div>`;
}

function rerenderTaskCard(taskId) {
  const card = document.getElementById('task-card-' + taskId);
  const task = tasks.find(t => t.id === taskId);
  if (!card || !task) { renderAll(); return; }
  card.outerHTML = taskCardHTML(task);
  updateCounts();
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
  document.getElementById('cnt-all').textContent       = active.filter(x => !isDeferred(x)).length;
  document.getElementById('cnt-today').textContent     = active.filter(x => x.due === t && !isDeferred(x)).length;
  document.getElementById('cnt-overdue').textContent   = active.filter(x => x.due && x.due < t).length;
  const cntDeferred = document.getElementById('cnt-deferred');
  if (cntDeferred) cntDeferred.textContent = active.filter(isDeferred).length;
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
  tasks.filter(t => !t.completed && !t.archived).forEach(t => (t.tags||[]).forEach(tag => { tagSet[tag] = (tagSet[tag]||0)+1; }));
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
    showConfirmModal(
      '⚡ Streak at risk',
      'You missed yesterday and your <strong>' + streakBeforeYesterday + ' day streak</strong> is at risk.<br><br>Would you like to use your grace day to protect it? You get one grace day per streak.',
      'Use Grace Day',
      () => { showToast('Grace day used — streak protected!'); }
    );
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
    icon.textContent = '★';
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
    showConfirmModal(
      'Welcome back!',
      'Your streak has been paused while you were away.<br><br>Are you ready to resume your streak?',
      'Resume Streak',
      () => {
        settings.vacationMode   = false;
        settings.vacationReturn = null;
        settings._vacationPromptShown = false;
        api.saveConfig({ settings });
        updateStreak();
        showToast('Streak resumed! Welcome back ★');
      }
    );
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
  const titles = { all:'All Tasks', kanban:'Kanban', ideas:'Ideas', wins:'Wins Board', today:'Due Today', overdue:'Overdue', completed:'Completed', archived:'Archived',
    'priority-high':'High Priority', 'priority-medium':'Medium Priority', 'priority-low':'Low Priority',
    'status-not-started':'Not Started', 'status-in-progress':'In Progress',
    'status-blocked':'Blocked', 'status-on-hold':'On Hold',
    'budget-view':'Budget View', 'calendar-view':'Calendar' };
  document.getElementById('view-title').textContent =
    view.startsWith('tag:') ? '#' + view.slice(4) : (titles[view] || view);
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  else {
    const match = document.querySelector(`[data-view="${view}"]`);
    if (match) match.classList.add('active');
  }
  if (view === 'kanban') {
    ideasMode = false; habitsMode = false; winsMode = false; budgetViewMode = false; calendarViewMode = false;
    document.getElementById('ideas-container').classList.remove('active');
    document.getElementById('habits-container').classList.remove('active');
    document.getElementById('wins-container').classList.remove('active');
    const bvcK = document.getElementById('budget-view-container'); if (bvcK) { bvcK.classList.remove('active'); }
    const cvcK = document.getElementById('calendar-view-container'); if (cvcK) { cvcK.classList.remove('active'); }
    const mainElK = document.getElementById('main');
    if (mainElK) { mainElK.style.display = ''; mainElK.style.flexDirection = ''; }
    switchViewMode('kanban');
  } else if (view === 'ideas') {
    ideasMode = true; habitsMode = false; winsMode = false; budgetViewMode = false; calendarViewMode = false;
    const cvcI = document.getElementById('calendar-view-container'); if (cvcI) { cvcI.classList.remove('active'); }
    const bvcI = document.getElementById('budget-view-container'); if (bvcI) bvcI.classList.remove('active');
    switchViewMode('list');
    document.getElementById('task-list-container').style.display = 'none';
    document.getElementById('habits-container').classList.remove('active');
    document.getElementById('wins-container').classList.remove('active');
    document.getElementById('ideas-container').classList.add('active');
    renderIdeas();
  } else if (view === 'wins') {
    winsMode = true; ideasMode = false; habitsMode = false; budgetViewMode = false; calendarViewMode = false;
    const cvW = document.getElementById('calendar-view-container'); if (cvW) { cvW.classList.remove('active'); }
    const bvcW = document.getElementById('budget-view-container'); if (bvcW) bvcW.classList.remove('active');
    switchViewMode('list');
    document.getElementById('task-list-container').style.display = 'none';
    document.getElementById('habits-container').classList.remove('active');
    document.getElementById('ideas-container').classList.remove('active');
    document.getElementById('wins-container').classList.add('active');
    renderWins();
  } else if (view === 'budget-view') {
    budgetViewMode = true; ideasMode = false; habitsMode = false; winsMode = false; calendarViewMode = false;
    const cvc = document.getElementById('calendar-view-container'); if (cvc) { cvc.classList.remove('active'); }
    switchViewMode('list');
    document.getElementById('task-list-container').style.display = 'none';
    document.getElementById('habits-container').classList.remove('active');
    document.getElementById('ideas-container').classList.remove('active');
    document.getElementById('wins-container').classList.remove('active');
    const bvc = document.getElementById('budget-view-container'); if (bvc) bvc.classList.add('active');
    renderBudgetView();
  } else if (view === 'calendar-view') {
    calendarViewMode = true; budgetViewMode = false; ideasMode = false; habitsMode = false; winsMode = false;
    switchViewMode('list');
    document.getElementById('task-list-container').style.display = 'none';
    document.getElementById('habits-container').classList.remove('active');
    document.getElementById('ideas-container').classList.remove('active');
    document.getElementById('wins-container').classList.remove('active');
    const bvcC = document.getElementById('budget-view-container'); if (bvcC) bvcC.classList.remove('active');
    const cvcC = document.getElementById('calendar-view-container'); if (cvcC) cvcC.classList.add('active');
    loadCalEvents().then(() => renderCalendarView());
  } else {
    ideasMode = false; habitsMode = false; winsMode = false; budgetViewMode = false; calendarViewMode = false;
    document.getElementById('ideas-container').classList.remove('active');
    document.getElementById('habits-container').classList.remove('active');
    document.getElementById('wins-container').classList.remove('active');
    const bvcE = document.getElementById('budget-view-container'); if (bvcE) bvcE.classList.remove('active');
    const cvcE = document.getElementById('calendar-view-container');
    if (cvcE) { cvcE.classList.remove('active'); }
    const mainEl = document.getElementById('main');
    if (mainEl) { mainEl.style.display = ''; mainEl.style.flexDirection = ''; mainEl.style.overflow = 'hidden'; }
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
  const mainEl = document.getElementById('main');
  if (kanbanMode) {
    if (listContainer)   listContainer.style.display = 'none';
    if (kanbanContainer) { kanbanContainer.style.display = 'flex'; kanbanContainer.style.flexDirection = 'column'; kanbanContainer.style.overflowY = 'auto'; kanbanContainer.style.flex = '1'; kanbanContainer.style.minHeight = '0'; }
    if (mainEl) { mainEl.style.overflow = 'hidden'; mainEl.style.display = 'flex'; mainEl.style.flexDirection = 'column'; }
    if (listBtn)   listBtn.classList.remove('active');
    if (kanbanBtn) kanbanBtn.classList.add('active');
    renderKanban();
  } else {
    if (listContainer)   { listContainer.style.display = 'block'; listContainer.style.flex = '1'; listContainer.style.minHeight = '0'; }
    if (kanbanContainer) { kanbanContainer.style.display = 'none'; kanbanContainer.style.overflowY = ''; }
    if (mainEl) mainEl.style.overflow = 'hidden';
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
  { key: 'done',        label: 'Completed',   color: 'var(--accent)' },
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
  const completedTasks = tasks.filter(t => t.completed && !t.archived);
  const showCompleted = settings.kanbanShowCompleted === true;
  const state = getKanbanGroupState();

  // If groupByTags is off, render a single group with all tasks
  if (settings.kanbanGroupByTags === false) {
    const cols = KANBAN_COLS.map(col => {
      let colTasks = activeTasks.filter(t => (t.status||'not-started') === col.key);
      if (col.key === 'done' && showCompleted) colTasks = [...colTasks, ...completedTasks];
      const cards = colTasks.map(t => `
        <div class="kanban-card priority-${t.priority}${t.completed ? ' kanban-card-completed' : ''}" draggable="${(t.completed || isReadOnly()) ? 'false' : 'true'}"
          data-task-id="${t.id}"
          ondragstart="${isReadOnly() ? '' : `onKanbanDragStart(event,${t.id})`}"
          ondragend="${isReadOnly() ? '' : 'onKanbanDragEnd(event)'}">
          <div class="kanban-card-title" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
          <div class="kanban-card-meta">
            <span class="badge badge-priority-${t.priority}">${t.priority.charAt(0).toUpperCase()+t.priority.slice(1)}</span>
            ${t.due ? `<span class="badge badge-due ${dueStatus(t.due)||''}">◷ ${fmtDate(t.due)}</span>` : ''}
          </div>
        </div>`).join('');
      return `
        <div class="kanban-col"
          data-status="${col.key}"
          ondragover="${isReadOnly() ? '' : 'onKanbanDragOver(event)'}"
          ondragleave="${isReadOnly() ? '' : 'onKanbanDragLeave(event)'}"
          ondrop="${isReadOnly() ? '' : `onKanbanDrop(event,'${col.key}')`}">
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
  if (showCompleted) {
    completedTasks.forEach(t => {
      const tTags = (t.tags||[]).length ? t.tags : ['Untagged'];
      tTags.forEach(tag => { if (!allTags.includes(tag)) allTags.push(tag); });
    });
  }
  allTags.sort((a,b) => a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b));

  container.innerHTML = allTags.map(tag => {
    const tagTasks = tag === 'Untagged'
      ? activeTasks.filter(t => !t.tags || !t.tags.length)
      : activeTasks.filter(t => (t.tags||[]).includes(tag));
    const tagCompletedTasks = showCompleted
      ? (tag === 'Untagged' ? completedTasks.filter(t => !t.tags || !t.tags.length) : completedTasks.filter(t => (t.tags||[]).includes(tag)))
      : [];
    const isOpen = tag in state ? state[tag] : true;
    const tagColor = tag === 'Untagged' ? 'var(--text3)' : getTagColor(tag);

    const cols = KANBAN_COLS.map(col => {
      let colTasks = tagTasks.filter(t => (t.status||'not-started') === col.key);
      if (col.key === 'done') colTasks = [...colTasks, ...tagCompletedTasks];
      const cards = colTasks.map(t => `
        <div class="kanban-card priority-${t.priority}${t.completed ? ' kanban-card-completed' : ''}" draggable="${(t.completed || isReadOnly()) ? 'false' : 'true'}"
          data-task-id="${t.id}"
          ondragstart="${isReadOnly() ? '' : `onKanbanDragStart(event,${t.id})`}"
          ondragend="${isReadOnly() ? '' : 'onKanbanDragEnd(event)'}">
          <div class="kanban-card-title" onclick="openTaskModal(${t.id})">${esc(t.title)}</div>
          <div class="kanban-card-meta">
            <span class="badge badge-priority-${t.priority}">${t.priority.charAt(0).toUpperCase()+t.priority.slice(1)}</span>
            ${t.due ? `<span class="badge badge-due ${dueStatus(t.due)||''}">◷ ${fmtDate(t.due)}</span>` : ''}
          </div>
        </div>`).join('');
      return `
        <div class="kanban-col"
          data-status="${col.key}"
          ondragover="${isReadOnly() ? '' : 'onKanbanDragOver(event)'}"
          ondragleave="${isReadOnly() ? '' : 'onKanbanDragLeave(event)'}"
          ondrop="${isReadOnly() ? '' : `onKanbanDrop(event,'${col.key}')`}">
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
    if (document.getElementById('tm-budget')) document.getElementById('tm-budget').value = task.budget || '';
    if (document.getElementById('tm-spent')) document.getElementById('tm-spent').value = task.spent || '';
    document.getElementById('tm-status').value   = task.status || 'not-started';
    document.getElementById('tm-energy').value   = task.energy || 'medium';
    loadRecurrenceUI(task.recurrence || { type: 'none' });
    modalTags = [...(task.tags || [])];
    modalDue  = task.due || '';
    modalDueTime = task.dueTime || '';
    modalAttachments = JSON.parse(JSON.stringify(task.attachments || []));
    if (document.getElementById('tm-due-time')) document.getElementById('tm-due-time').value = task.dueTime || '';
    const clearBtnEdit = document.getElementById('tm-due-time-clear');
    if (clearBtnEdit) clearBtnEdit.style.display = task.dueTime ? '' : 'none';
    if (document.getElementById('tm-hide-until')) document.getElementById('tm-hide-until').value = task.hideUntilDays || '';
  } else {
    document.getElementById('tm-title').value    = '';
    document.getElementById('tm-desc').value     = '';
    document.getElementById('tm-priority').value = 'medium';
    document.getElementById('tm-estimate').value = '';
    if (document.getElementById('tm-budget')) document.getElementById('tm-budget').value = '';
    if (document.getElementById('tm-spent')) document.getElementById('tm-spent').value = '';
    document.getElementById('tm-status').value   = 'not-started';
    document.getElementById('tm-energy').value   = 'medium';
    loadRecurrenceUI({ type: 'none' });
    modalAttachments = [];
    const clearBtnNewT = document.getElementById('tm-due-time-clear');
    if (clearBtnNewT) clearBtnNewT.style.display = 'none';
    if (document.getElementById('tm-hide-until')) document.getElementById('tm-hide-until').value = '';
  }
  renderModalAttachments();

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
    dueTime:  modalDueTime,
    tags:     [...modalTags],
    estimate: parseInt(document.getElementById('tm-estimate').value) || 0,
    budget:   parseFloat(document.getElementById('tm-budget').value) || 0,
    spent:    parseFloat(document.getElementById('tm-spent')?.value) || 0,
    status:     document.getElementById('tm-status').value,
    energy:     document.getElementById('tm-energy').value,
    recurrence: getRecurrenceFromUI(),
    attachments: [...modalAttachments],
    hideUntilDays: parseInt(document.getElementById('tm-hide-until')?.value) || 0,
  };

  pushUndo(editingId ? 'Edit task' : 'Add task');

  if (editingId) {
    const task = tasks.find(t => t.id === editingId);
    if (task) { const subs = task.subtasks; Object.assign(task, data); task.subtasks = subs; }
  } else {
    const newTask = {
      id: Date.now(), completed: false,
      createdAt: new Date().toISOString(), completedAt: '',
      timeLogged: 0, timeSessions: [],
      impact: '', outcome: '', deliverable: '',
      budget: 0, spent: 0,
      status: 'not-started', energy: 'medium',
      subtasks: [],
      attachments: [],
      ...data
    };
    tasks.push(newTask);
  }

  closeModal('task-modal-overlay');
  saveTasks();
  checkOnboardingItem('addTask');

  // If status was set to done and task isn't already completed, complete it
  if (editingId && data.status === 'done') {
    const t = tasks.find(t => t.id === editingId);
    if (t && !t.completed) { toggleComplete(editingId); return; }
  }

  renderAll();
}


// ── Calendar View ─────────────────────────────────────────────────────────────
function calFmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calNavPrev() {
  if (calViewType === 'month') calDate = new Date(calDate.getFullYear(), calDate.getMonth()-1, 1);
  else if (calViewType === 'day') { calDate = new Date(calDate); calDate.setDate(calDate.getDate()-1); }
  else { calDate = new Date(calDate); calDate.setDate(calDate.getDate()-7); }
  renderCalendarView();
}
function calNavNext() {
  if (calViewType === 'month') calDate = new Date(calDate.getFullYear(), calDate.getMonth()+1, 1);
  else if (calViewType === 'day') { calDate = new Date(calDate); calDate.setDate(calDate.getDate()+1); }
  else { calDate = new Date(calDate); calDate.setDate(calDate.getDate()+7); }
  renderCalendarView();
}
function calNavToday() { calDate = new Date(); renderCalendarView(); }
function setCalViewType(type) { calViewType = type; renderCalendarView(); }

function renderCalendarView() {
  const container = document.getElementById('calendar-view-container');
  if (!container) return;
  const today = calFmtDate(new Date());
  const activeTasks = tasks.filter(t => !t.completed && !t.archived && t.due);
  const completedTasks = tasks.filter(t => t.completed && !t.archived && (t.completedAt || t.due));
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  let titleStr = '';
  if (calViewType === 'month') {
    titleStr = `${MONTHS[calDate.getMonth()]} ${calDate.getFullYear()}`;
  } else if (calViewType === 'day') {
    titleStr = `${MONTHS[calDate.getMonth()]} ${calDate.getDate()}, ${calDate.getFullYear()}`;
  } else {
    const wStart = new Date(calDate);
    wStart.setDate(calDate.getDate() - calDate.getDay());
    const wEnd = new Date(wStart); wEnd.setDate(wStart.getDate()+6);
    titleStr = `${MONTHS[wStart.getMonth()]} ${wStart.getDate()} \u2013 ${wEnd.getMonth()!==wStart.getMonth()?MONTHS[wEnd.getMonth()]+' ':''}${wEnd.getDate()}, ${wStart.getFullYear()}`;
  }

  const toolbar = `<div class="cal-toolbar">
    <button class="cal-nav-btn" onclick="calNavPrev()">\u2039</button>
    <button class="cal-nav-btn" onclick="calNavToday()">Today</button>
    <button class="cal-nav-btn" onclick="calNavNext()">\u203a</button>
    <span class="cal-title">${titleStr}</span>
    <div class="cal-view-toggle">
      <button class="cal-view-btn ${calViewType==='month'?'active':''}" onclick="setCalViewType('month')">Month</button>
      <button class="cal-view-btn ${calViewType==='week'?'active':''}" onclick="setCalViewType('week')">Week</button>
      <button class="cal-view-btn ${calViewType==='day'?'active':''}" onclick="setCalViewType('day')">Day</button>
    </div>
    <button class="cal-add-btn" onclick="openCalEventModal()">+ Event</button>
    ${outlookConnected
      ? `<button class="cal-nav-btn" onclick="loadOutlookEvents()" style="margin-left:4px" title="Sync Outlook">⟳ Outlook</button>
         <button class="cal-nav-btn" onclick="disconnectOutlook()" style="margin-left:2px;color:var(--text3)" title="Disconnect Outlook">✕</button>`
      : `<button class="cal-nav-btn" onclick="connectOutlook()" style="margin-left:4px">⊕ Outlook</button>`
    }
  </div>`;

  const allEvents = [...calEvents, ...outlookEvents];
  if (calViewType === 'month') {
    container.innerHTML = toolbar + renderMonthView(calDate, today, activeTasks, completedTasks, allEvents);
  } else if (calViewType === 'day') {
    container.innerHTML = toolbar + renderDayView(calDate, today, activeTasks, completedTasks, allEvents);
  } else {
    container.innerHTML = toolbar + renderWeekView(calDate, today, activeTasks, completedTasks, allEvents);
  }
}

function getItemsForDate(dateStr, taskList, eventList, completedList = []) {
  const chips = [];
  // Events first
  eventList.forEach(e => {
    let label = esc(e.title);
    const startDate = e.allDay ? e.date : (e.start ? e.start.slice(0,10) : e.date);
    const endDate   = e.allDay ? (e.dateEnd || e.date) : (e.end ? e.end.slice(0,10) : startDate);
    // Show on every day the event spans
    if (dateStr >= startDate && dateStr <= endDate) {
      if (!e.allDay && e.start && dateStr === startDate) {
        const h = parseInt(e.start.slice(11,13)||0), m = parseInt(e.start.slice(14,16)||0);
        const ampm = h >= 12 ? 'pm' : 'am';
        const h12 = h % 12 || 12;
        label = `${h12}:${String(m).padStart(2,'0')}${ampm} ${label}`;
      }
      const isHolidayEvent = (e.tags||[]).some(t => /holiday|vacation/i.test(t));
      const isOutlookEvent = e.source === 'outlook';
      const firstTag = (e.tags||[]).filter(t => t !== 'outlook')[0];
      if (firstTag) label = `${label} · ${esc(firstTag)}`;
      chips.push({ type:'event', label, id: e.id, eventType: isOutlookEvent ? 'outlook' : isHolidayEvent ? 'holiday' : '' });
    }
  });
  // Then tasks
  taskList.forEach(t => {
    if (dateStr === t.due) {
      chips.push({ type:'task', label: esc(t.title), id: t.id });
    }
  });
  completedList.forEach(t => {
    const completedDate = t.completedAt ? dateToLocalStr(new Date(t.completedAt)) : t.due;
    if (completedDate === dateStr) {
      chips.push({ type:'task-done', label: esc(t.title), id: t.id });
    }
  });
  return chips;
}

function renderMonthView(date, today, activeTasks, completedTasks = [], allEvents = calEvents) {
  const year = date.getFullYear(), month = date.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dowHeaders = DAYS.map(d => `<div class="cal-month-dow">${d}</div>`).join('');
  let cells = '', dayCount = 0;
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = firstDay-1; i >= 0; i--) {
    cells += renderMonthCell(calFmtDate(new Date(year, month-1, prevDays-i)), prevDays-i, true, today, activeTasks, completedTasks, allEvents);
    dayCount++;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells += renderMonthCell(calFmtDate(new Date(year, month, d)), d, false, today, activeTasks, completedTasks, allEvents);
    dayCount++;
  }
  let next = 1;
  while (dayCount % 7 !== 0) {
    cells += renderMonthCell(calFmtDate(new Date(year, month+1, next)), next, true, today, activeTasks, completedTasks, allEvents);
    dayCount++; next++;
  }
  return `<div class="cal-month-wrap"><div class="cal-month-header">${dowHeaders}</div><div class="cal-month-body">${cells}</div></div>`;
}

function renderMonthCell(dateStr, dayNum, otherMonth, today, activeTasks, completedTasks = [], allEvents = []) {
  const isToday = dateStr === today;
  const isPast = dateStr < today && !isToday;
  const items = getItemsForDate(dateStr, activeTasks, allEvents, completedTasks);
  const shown = items.slice(0, 5), extra = items.length - 5;
  const chips = shown.map(item => {
    const click = (item.type === 'task' || item.type === 'task-done') ? `onclick="event.stopPropagation();openTaskModal(${item.id})"` : `onclick="event.stopPropagation();openCalEventModal('${item.id}')"`;
    const typeClass = item.eventType === 'holiday' ? ' event-holiday' : '';
    return `<div class="cal-chip ${item.type}${typeClass}" ${click}>${item.label}</div>`;
  }).join('');
  const moreBtn = extra > 0 ? `<div class="cal-more">+${extra} more</div>` : '';
  const classes = ['cal-day'];
  if (otherMonth) classes.push('other-month');
  if (isToday) classes.push('today');
  else if (isPast) classes.push('past');
  return `<div class="${classes.join(' ')}" onclick="openCalEventModal(null,'${dateStr}')">
    <div class="cal-day-num">${dayNum}</div>${chips}${moreBtn}
  </div>`;
}

function measureScrollbarWidth() {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll';
  document.body.appendChild(el);
  const w = el.offsetWidth - el.clientWidth;
  document.body.removeChild(el);
  document.documentElement.style.setProperty('--scrollbar-width', w + 'px');
}

function renderWeekView(date, today, activeTasks, completedTasks = [], allEvents = calEvents) {
  measureScrollbarWidth();
  const wStart = new Date(date);
  wStart.setDate(date.getDate() - date.getDay());
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weekDates = Array.from({length:7}, (_,i) => { const d = new Date(wStart); d.setDate(wStart.getDate()+i); return d; });

  const dowHeaders = weekDates.map(d => {
    const ds = calFmtDate(d);
    return `<div class="cal-week-dow${ds===today?' today':''}"><div class="cal-week-dow-label">${DAYS[d.getDay()]}</div><strong style="font-size:15px">${d.getDate()}</strong></div>`;
  }).join('');

  const allDayItems = weekDates.map(d => {
    const ds = calFmtDate(d);
    // Tasks always go in all-day row; only all-day events go here too
    const items = getItemsForDate(ds, activeTasks, allEvents.filter(e => e.allDay), completedTasks);
    // Also add timed events that fall on this day to all-day for tasks
    const chips = items.map(item => {
      const click = (item.type === 'task' || item.type === 'task-done') ? `onclick="openTaskModal(${item.id})"` : `onclick="openCalEventModal('${item.id}')"`;
      return `<div class="cal-chip ${item.type}" ${click}>${item.label}</div>`;
    }).join('');
    return `<div class="cal-week-allday-cell">${chips}</div>`;
  }).join('');

  const timeLabels = Array.from({length:24}, (_,h) => {
    const label = h===0?'12am':h<12?`${h}am`:h===12?'12pm':`${h-12}pm`;
    return `<div class="cal-week-time-slot">${label}</div>`;
  }).join('');

  const dayCols = weekDates.map(d => {
    const ds = calFmtDate(d);
    const timedEvents = calEvents.filter(e => !e.allDay && e.start && e.start.slice(0,10) === ds);
    const eventChips = timedEvents.map(e => {
      const sh = parseInt(e.start.slice(11,13)||0), sm = parseInt(e.start.slice(14,16)||0);
      const eh = parseInt((e.end||e.start).slice(11,13)||sh+1), em = parseInt((e.end||e.start).slice(14,16)||0);
      const top = sh*48 + sm/60*48;
      const height = Math.max(24, ((eh*60+em)-(sh*60+sm))/60*48);
      return `<div class="cal-week-event event" style="top:${top}px;height:${height}px" onclick="event.stopPropagation();openCalEventModal('${e.id}')">${esc(e.title)}</div>`;
    }).join('');
    const hourCells = Array.from({length:24}, () => '<div class="cal-week-cell"></div>').join('');
    const isPastDay = ds < today && ds !== today;
    return `<div class="cal-week-day-col${ds===today?' today':''}${isPastDay?' past':''}" onclick="openCalEventModal(null,'${ds}')">
      ${hourCells}<div style="position:absolute;inset:0;pointer-events:none;z-index:1"><div style="pointer-events:all">${eventChips}</div></div>
    </div>`;
  }).join('');

  return `<div class="cal-week-wrap">
    <div class="cal-week-outer">
      <div class="cal-week-inner">
        <div class="cal-week-header"><div class="cal-week-corner"></div>${dowHeaders}</div>
        <div class="cal-week-allday-row"><div class="cal-week-allday-label">all day</div>${allDayItems}</div>
        <div class="cal-week-scroll"><div class="cal-week-time-col">${timeLabels}</div>${dayCols}</div>
      </div>
    </div>
  </div>`;
}


function renderDayView(date, today, activeTasks, completedTasks = [], allEvents = calEvents) {
  measureScrollbarWidth();
  const ds = calFmtDate(date);
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const isToday = ds === today;
  const isPast = ds < today && !isToday;

  // All-day items (tasks + all-day events)
  const allDayItems = getItemsForDate(ds, activeTasks, allEvents.filter(e => e.allDay), completedTasks);
  const allDayChips = allDayItems.map(item => {
    const click = (item.type === 'task' || item.type === 'task-done')
      ? `onclick="openTaskModal(${item.id})"`
      : `onclick="openCalEventModal('${item.id}')"`;
    const typeClass = item.eventType === 'holiday' ? ' event-holiday' : item.eventType === 'outlook' ? ' event-outlook' : '';
    return `<div class="cal-chip ${item.type}${typeClass}" ${click}>${item.label}</div>`;
  }).join('');

  // Timed events
  const timedEvents = allEvents.filter(e => !e.allDay && e.start && e.start.slice(0,10) === ds);
  const eventChips = timedEvents.map(e => {
    const sh = parseInt(e.start.slice(11,13)||0), sm = parseInt(e.start.slice(14,16)||0);
    const eh = parseInt((e.end||e.start).slice(11,13)||sh+1), em = parseInt((e.end||e.start).slice(14,16)||0);
    const top = sh*60 + sm/60*60;
    const height = Math.max(28, ((eh*60+em)-(sh*60+sm))/60*60);
    const typeClass = e.source === 'outlook' ? ' event-outlook' : '';
    return `<div class="cal-week-event event${typeClass}" style="top:${top}px;height:${height}px;left:8px;right:8px" onclick="event.stopPropagation();openCalEventModal('${e.id}')">${esc(e.title)}</div>`;
  }).join('');

  const timeLabels = Array.from({length:24}, (_,h) => {
    const label = h===0?'12am':h<12?`${h}am`:h===12?'12pm':`${h-12}pm`;
    return `<div class="cal-week-time-slot">${label}</div>`;
  }).join('');

  const hourCells = Array.from({length:24}, () => '<div class="cal-week-cell"></div>').join('');

  const dayTitle = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

  return `<div class="cal-week-wrap">
    <div class="cal-week-outer">
      <div class="cal-week-inner">
        <div class="cal-week-header day-view">
          <div class="cal-week-corner"></div>
          <div class="cal-week-dow${isToday?' today':''}" style="padding:12px 16px;font-size:15px;text-align:left">
            <div class="cal-week-dow-label">${dayTitle}</div>
          </div>
        </div>
        <div class="cal-week-allday-row day-view">
          <div class="cal-week-allday-label">all day</div>
          <div class="cal-week-allday-cell" style="min-height:${allDayChips ? 'auto' : '26px'}">${allDayChips || ''}</div>
        </div>
        <div class="cal-week-scroll day-view">
          <div class="cal-week-time-col">${timeLabels}</div>
          <div class="cal-week-day-col${isToday?' today':''}${isPast?' past':''}" onclick="openCalEventModal(null,'${ds}')">
            ${hourCells}
            <div style="position:absolute;inset:0;pointer-events:none;z-index:1">
              <div style="pointer-events:all">${eventChips}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Calendar Event Modal ───────────────────────────────────────────────────────


// ── Outlook Calendar Integration ────────────────────────────────────────────
const OUTLOOK_CLIENT_ID = '98ede29e-2245-4715-b199-ea8fb8a54b9c';
const OUTLOOK_SCOPES = 'Calendars.Read User.Read offline_access';
const OUTLOOK_REDIRECT = window.location.origin + '/auth-outlook.html';



let outlookCodeVerifier = null;

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function outlookAuthUrl() {
  outlookCodeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(outlookCodeVerifier);
  const base = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  const params = new URLSearchParams({
    client_id:             OUTLOOK_CLIENT_ID,
    response_type:         'code',
    redirect_uri:          OUTLOOK_REDIRECT,
    scope:                 OUTLOOK_SCOPES,
    response_mode:         'query',
    prompt:                'select_account',
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256'
  });
  return `${base}?${params}`;
}

async function connectOutlook() {
  const authUrl = await outlookAuthUrl();
  const popup = window.open(authUrl, 'outlook_auth', 'width=500,height=650,scrollbars=yes');
  if (!popup) {
    window.location.href = authUrl;
    return;
  }
  // Poll sessionStorage for the code — avoids CORS/COOP issues with popup.closed
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      const code = sessionStorage.getItem('outlook_code');
      if (code) {
        clearInterval(interval);
        sessionStorage.removeItem('outlook_code');
        try { popup.close(); } catch(e) {}
        const ok = await exchangeOutlookCode(code, outlookCodeVerifier);
        if (ok) {
          showToast('Outlook calendar connected!');
          updateOutlookSettingsBtn();
          await loadOutlookEvents();
          if (calendarViewMode) renderCalendarView();
        } else {
          showToast('Failed to connect Outlook — please try again');
        }
        resolve();
      }
    }, 500);
    // Timeout after 5 minutes
    setTimeout(() => { clearInterval(interval); resolve(); }, 300000);
  });
}

function toggleOutlookFromSettings() {
  if (outlookConnected) {
    disconnectOutlook();
  } else {
    closeModal('settings-modal-overlay');
    setTimeout(connectOutlook, 200);
  }
}

function updateOutlookSettingsBtn() {
  const btn  = document.getElementById('outlook-settings-btn');
  const desc = document.getElementById('outlook-settings-desc');
  if (btn)  btn.textContent  = outlookConnected ? 'Disconnect' : 'Connect';
  if (desc) desc.textContent = outlookConnected ? 'Connected — Outlook events showing in calendar' : 'Connect to show your Outlook events in the calendar';
}

async function disconnectOutlook() {
  outlookAccessToken  = null;
  outlookRefreshToken = null;
  outlookConnected    = false;
  outlookEvents       = [];
  try { settings.outlookRefreshToken = null;
  await api.saveConfig({ settings }); } catch(e) {}
  updateOutlookSettingsBtn();
  renderCalendarView();
  showToast('Outlook disconnected');
}

async function exchangeOutlookCode(code, codeVerifier) {
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     OUTLOOK_CLIENT_ID,
      code,
      redirect_uri:  OUTLOOK_REDIRECT,
      grant_type:    'authorization_code',
      scope:         OUTLOOK_SCOPES,
      code_verifier: codeVerifier,
    })
  });
  const data = await res.json();
  console.log('Outlook exchange response:', JSON.stringify(data).slice(0, 300));
  if (data.access_token) {
    outlookAccessToken  = data.access_token;
    outlookRefreshToken = data.refresh_token;
    outlookConnected    = true;
    settings.outlookRefreshToken = outlookRefreshToken;
    api.saveConfig({ settings });
    return true;
  }
  return false;
}

async function refreshOutlookToken() {
  if (!outlookRefreshToken) return false;
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     OUTLOOK_CLIENT_ID,
      refresh_token: outlookRefreshToken,
      grant_type:    'refresh_token',
      scope:         OUTLOOK_SCOPES
    })
  });
  const data = await res.json();
  if (data.access_token) {
    outlookAccessToken  = data.access_token;
    if (data.refresh_token) {
      outlookRefreshToken = data.refresh_token;
      settings.outlookRefreshToken = outlookRefreshToken;
        await api.saveConfig({ settings });
    }
    outlookConnected = true;
    return true;
  }
  return false;
}

async function loadOutlookEvents() {
  if (!outlookConnected || !outlookAccessToken) return;
  try {
    const now   = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const end   = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${start}&endDateTime=${end}&$select=subject,start,end,isAllDay&$top=200`,
      { headers: { Authorization: `Bearer ${outlookAccessToken}` } }
    );
    if (res.status === 401) {
      const refreshed = await refreshOutlookToken();
      if (refreshed) { await loadOutlookEvents(); return; }
      outlookConnected = false; return;
    }
    const data = await res.json();
    outlookEvents = (data.value || []).map(e => {
      let dateEnd = e.end?.dateTime?.slice(0,10) || e.end?.date || '';
      if (e.isAllDay && dateEnd) {
        const d = new Date(dateEnd + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        dateEnd = d.toISOString().slice(0,10);
      }
      return {
        id:      'outlook_' + e.id?.slice(0, 16),
        title:   e.subject || '(No title)',
        allDay:  e.isAllDay || false,
        date:    e.start?.dateTime?.slice(0,10) || e.start?.date || '',
        dateEnd,
        start:   e.isAllDay ? '' : (e.start?.dateTime?.replace('T',' ').slice(0,16) || ''),
        end:     e.isAllDay ? '' : (e.end?.dateTime?.replace('T',' ').slice(0,16)   || ''),
        tags:    ['outlook'],
        source:  'outlook',
        readonly: true
      };
    });
    renderCalendarView();
  } catch(err) {
    console.error('Outlook load error:', err);
  }
}

async function initOutlook() {
  // Check for auth code returned from redirect
  const code = sessionStorage.getItem('outlook_code');
  if (code) {
    sessionStorage.removeItem('outlook_code');
    const ok = await exchangeOutlookCode(code);
    if (ok) {
      showToast('Outlook calendar connected!');
      updateOutlookSettingsBtn();
      await loadOutlookEvents();
      if (calendarViewMode) renderCalendarView();
      return;
    }
  }
  // Try to restore from saved refresh token
  const saved = settings.outlookRefreshToken;
  if (saved) {
    outlookRefreshToken = saved;
    const ok = await refreshOutlookToken();
    if (ok) {
      updateOutlookSettingsBtn();
      await loadOutlookEvents();
      if (calendarViewMode) renderCalendarView();
    }
  }
}

// ── Calendar Event Tags ────────────────────────────────────────────────────
function handleCalTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(/,/g,'');
    if (val && !calEventTags.includes(val)) { calEventTags.push(val); renderCalEventTags(); }
    e.target.value = '';
    hideCalTagSuggestions();
  } else if (e.key === 'Escape') {
    hideCalTagSuggestions();
  } else if (e.key === 'Backspace' && !e.target.value && calEventTags.length) {
    calEventTags.pop(); renderCalEventTags();
  } else {
    showCalTagSuggestions(e.target.value.trim());
  }
}

function renderCalEventTags() {
  const pills = document.getElementById('cev-tag-pills');
  if (!pills) return;
  pills.innerHTML = calEventTags.map(tag =>
    `<span class="tag-pill" style="background:${getCalEventTagColor(tag)}">${esc(tag)}<button class="tag-pill-x" onclick="removeCalEventTag('${esc(tag)}')">&times;</button></span>`
  ).join('');
}

function removeCalEventTag(tag) { calEventTags = calEventTags.filter(t => t !== tag); renderCalEventTags(); }

const CAL_EVENT_TAG_COLORS = {};
const CAL_TAG_PALETTE = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6'];
function getCalEventTagColor(tag) {
  if (!CAL_EVENT_TAG_COLORS[tag]) {
    CAL_EVENT_TAG_COLORS[tag] = CAL_TAG_PALETTE[Object.keys(CAL_EVENT_TAG_COLORS).length % CAL_TAG_PALETTE.length];
  }
  return CAL_EVENT_TAG_COLORS[tag];
}

function showCalTagSuggestions(query) {
  const existing = [...new Set(calEvents.flatMap(e => e.tags || []))].filter(t => !calEventTags.includes(t));
  const filtered = query ? existing.filter(t => t.toLowerCase().startsWith(query.toLowerCase())) : existing;
  if (!filtered.length) { hideCalTagSuggestions(); return; }
  let dropdown = document.getElementById('cal-tag-suggestions');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'cal-tag-suggestions';
    dropdown.style.cssText = 'position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:1000;max-height:160px;overflow-y:auto;width:100%;left:0;top:100%;margin-top:2px';
    const area = document.getElementById('cev-tag-area');
    if (area) { area.style.position = 'relative'; area.appendChild(dropdown); }
  }
  dropdown.innerHTML = filtered.slice(0,8).map(tag =>
    `<div onclick="selectCalTagSuggestion('${esc(tag)}')" style="padding:7px 12px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:${getCalEventTagColor(tag)};flex-shrink:0"></span>${esc(tag)}
    </div>`
  ).join('');
  dropdown.style.display = 'block';
}

function selectCalTagSuggestion(tag) {
  if (!calEventTags.includes(tag)) { calEventTags.push(tag); renderCalEventTags(); }
  const input = document.getElementById('cev-tag-input');
  if (input) input.value = '';
  hideCalTagSuggestions();
}

function hideCalTagSuggestions() {
  const d = document.getElementById('cal-tag-suggestions');
  if (d) d.style.display = 'none';
}

function openCalEventModal(id = null, prefillDate = null) {
  if (id) {
    const ev = calEvents.find(e => e.id == id) || outlookEvents.find(e => e.id == id);
    if (ev && ev.source === 'outlook') { showToast('Outlook events are read-only'); return; }
  }
  editingCalEventId = id;
  document.getElementById('cal-event-modal-title').textContent = id ? 'Edit Event' : 'New Event';
  document.getElementById('cev-delete-btn').style.display = id ? '' : 'none';
  if (id) {
    const ev = calEvents.find(e => e.id == id);
    if (!ev) return;
    document.getElementById('cev-title').value    = ev.title;
    calEventTags = [...(ev.tags || [])];
    renderCalEventTags();
    document.getElementById('cev-allday').checked = ev.allDay;
    document.getElementById('cev-start').value    = ev.start || '';
    document.getElementById('cev-end').value      = ev.end   || '';
    if (document.getElementById('cev-date-start')) document.getElementById('cev-date-start').value = ev.date || '';
    if (document.getElementById('cev-date-end')) document.getElementById('cev-date-end').value = ev.dateEnd || ev.date || '';
    if (document.getElementById('cev-desc')) document.getElementById('cev-desc').value = ev.desc || '';
  } else {
    document.getElementById('cev-title').value    = '';
    if (document.getElementById('cev-desc')) document.getElementById('cev-desc').value = '';
    document.getElementById('cev-allday').checked = false;
    const now = new Date();
    const ds = prefillDate || calFmtDate(now);
    const hh = String(now.getHours()).padStart(2,'0'), mm = String(now.getMinutes()).padStart(2,'0');
    document.getElementById('cev-start').value = `${ds}T${hh}:${mm}`;
    const end = new Date(now.getTime()+3600000);
    document.getElementById('cev-end').value   = `${ds}T${String(end.getHours()).padStart(2,'0')}:${mm}`;
    if (document.getElementById('cev-date-start')) document.getElementById('cev-date-start').value = ds;
    if (document.getElementById('cev-date-end')) document.getElementById('cev-date-end').value = ds;
  }
  toggleCalEventAllDay();
  document.getElementById('cal-event-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('cev-title').focus(), 100);
}

function toggleCalEventAllDay() {
  const allDay = document.getElementById('cev-allday').checked;
  document.getElementById('cev-time-row').style.display = allDay ? 'none' : '';
  document.getElementById('cev-date-row').style.display = allDay ? '' : 'none';
  if (allDay) {
    // Always sync date-start from cev-start when switching to all-day
    const startInput = document.getElementById('cev-start');
    const dateStartInput = document.getElementById('cev-date-start');
    const dateEndInput = document.getElementById('cev-date-end');
    const dateOnly = (startInput && startInput.value) ? startInput.value.slice(0, 10) : calFmtDate(new Date());
    if (dateStartInput) dateStartInput.value = dateOnly;
    if (dateEndInput && !dateEndInput.value) dateEndInput.value = dateOnly;
  }
}

function saveCalEvent() {
  const title = document.getElementById('cev-title').value.trim();
  if (!title) { document.getElementById('cev-title').focus(); return; }
  const allDay = document.getElementById('cev-allday').checked;
  const desc = document.getElementById('cev-desc') ? document.getElementById('cev-desc').value.trim() : '';
  const isHoliday = calEventTags.some(t => /holiday|vacation/i.test(t));
  const ev = {
    id:    editingCalEventId || String(Date.now()),
    title, allDay, desc,
    tags: [...calEventTags],
    start: allDay ? '' : document.getElementById('cev-start').value,
    end:   allDay ? '' : document.getElementById('cev-end').value,
    date:    allDay ? (document.getElementById('cev-date-start') ? document.getElementById('cev-date-start').value : '') : document.getElementById('cev-start').value.slice(0,10),
    dateEnd: allDay ? (document.getElementById('cev-date-end') ? document.getElementById('cev-date-end').value : '') : (document.getElementById('cev-end') ? document.getElementById('cev-end').value.slice(0,10) : ''),
  };
  if (editingCalEventId) {
    const idx = calEvents.findIndex(e => e.id == editingCalEventId);
    if (idx !== -1) calEvents[idx] = ev; else calEvents.push(ev);
  } else {
    calEvents.push(ev);
  }
  saveCalEvents();
  // If this is a holiday/vacation event, offer to enable vacation mode
  if (isHoliday && allDay) {
    const startDate = document.getElementById('cev-date-start') ? document.getElementById('cev-date-start').value : '';
        const endDate = document.getElementById('cev-date-end') ? document.getElementById('cev-date-end').value : startDate;
    if (startDate && startDate > calFmtDate(new Date())) {
      if (confirm('Enable vacation mode for this period? Your streak will be paused until the event ends.')) {
        settings.vacationMode = true;
        settings.vacationReturn = endDate;
        api.saveConfig({ settings });
        applySettings();
        showToast('Vacation mode enabled — streak paused until ' + endDate);
      }
    }
  }
  closeModal('cal-event-modal-overlay');
  renderCalendarView();
}

function deleteCalEvent() {
  if (!editingCalEventId) return;
  calEvents = calEvents.filter(e => e.id != editingCalEventId);
  saveCalEvents();
  closeModal('cal-event-modal-overlay');
  renderCalendarView();
}

async function saveCalEvents() {
  if (offlineMode) return;
  try {
    await ensureToken();
    await api.eventsSave({ accessToken, spreadsheetId, events: calEvents });
  } catch(e) { console.error('Events save error:', e); }
}

async function loadCalEvents() {
  if (offlineMode) return;
  try {
    await ensureToken();
    calEvents = await api.eventsLoad({ accessToken, spreadsheetId });
  } catch(e) { calEvents = []; }
}

function renderBudgetView() {
  const container = document.getElementById('budget-view-container');
  if (!container) return;
  const sym = settings.currencySymbol || '£';

  const budgetTasks = tasks.filter(t => !t.archived && t.budget && t.budget > 0);

  if (!budgetTasks.length) {
    container.innerHTML = `<div class="budget-empty">No tasks with budgets found.<br>Add a budget to a task to see it here.</div>`;
    return;
  }

  function makeCard(t) {
    const spent = t.spent || 0;
    const pct   = Math.min(100, Math.round((spent / t.budget) * 100));
    const over  = spent > t.budget;
    const barColor = t.completed ? 'var(--accent)' : over ? 'var(--red)' : 'var(--blue)';
    const dueBadge = t.due ? `<span class="badge badge-due ${dueStatus(t.due)||''}">◷ ${fmtDate(t.due)}</span>` : '';
    const tagBadges = (t.tags||[]).map(tag => `<span class="badge" style="background:${getTagColor(tag)}22;color:${getTagColor(tag)};border-color:${getTagColor(tag)}44">${esc(tag)}</span>`).join('');
    return `<div class="budget-card priority-${t.priority}" onclick="openTaskModal(${t.id})">
      <div class="budget-card-title">${esc(t.title)}</div>
      <div class="budget-card-amounts">
        <span style="font-size:12px;color:${over?'var(--red)':'var(--text2)'}">
          ${sym}${spent.toFixed(2)} <span style="color:var(--text3)">of</span> ${sym}${parseFloat(t.budget).toFixed(2)}
          ${over ? `<span style="color:var(--red);font-weight:700"> +${sym}${(spent-t.budget).toFixed(2)}</span>` : ''}
        </span>
        <div class="budget-bar-wrap"><div class="budget-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      </div>
      <div class="budget-card-meta">${dueBadge}${tagBadges}${renderAttachmentBadges(t)}</div>
    </div>`;
  }

  function makeColumns(taskList) {
    const notStarted  = taskList.filter(t => !t.completed && (t.spent || 0) === 0);
    const underBudget = taskList.filter(t => !t.completed && (t.spent || 0) > 0 && (t.spent || 0) <= t.budget);
    const overBudget  = taskList.filter(t => !t.completed && (t.spent || 0) > t.budget);
    const completed   = taskList.filter(t => t.completed);

    function makeCol(label, color, list) {
      const cards = list.length ? list.map(makeCard).join('') : `<div class="budget-empty" style="padding:16px 8px">No tasks</div>`;
      return `<div class="budget-col">
        <div class="budget-col-header" style="color:${color}">${label}<span class="budget-col-count">${list.length}</span></div>
        <div class="budget-col-body">${cards}</div>
      </div>`;
    }

    return `<div class="budget-view-columns">
      ${makeCol('Not Started', 'var(--text3)', notStarted)}
      ${makeCol('Under Budget', 'var(--blue)', underBudget)}
      ${makeCol('Over Budget', 'var(--red)', overBudget)}
      ${makeCol('Completed', 'var(--accent)', completed)}
    </div>`;
  }

  function makeSummaryBar(taskList) {
    const totalBudget = taskList.reduce((s, t) => s + (t.budget || 0), 0);
    const totalSpent  = taskList.reduce((s, t) => s + (t.spent || 0), 0);
    const totalOver   = taskList.filter(t => (t.spent||0) > t.budget).reduce((s, t) => s + ((t.spent||0) - t.budget), 0);
    const isOverall   = totalSpent > totalBudget;
    return `<div class="budget-summary-bar">
      <div class="budget-summary-item"><div class="budget-summary-label">Total Budget</div><div class="budget-summary-value">${sym}${totalBudget.toFixed(2)}</div></div>
      <div class="budget-summary-item"><div class="budget-summary-label">Total Spent</div><div class="budget-summary-value ${isOverall?'over':''}">${sym}${totalSpent.toFixed(2)}</div></div>
      ${totalOver > 0 ? `<div class="budget-summary-item"><div class="budget-summary-label">Over Budget By</div><div class="budget-summary-value over">${sym}${totalOver.toFixed(2)}</div></div>` : ''}
      <div class="budget-summary-item"><div class="budget-summary-label">Remaining</div><div class="budget-summary-value ${isOverall?'over':''}">${isOverall?'-':''}${sym}${Math.abs(totalBudget-totalSpent).toFixed(2)}</div></div>
    </div>`;
  }

  if (settings.budgetGroupByTags) {
    const allTags = [...new Set(budgetTasks.flatMap(t => (t.tags||[]).length ? t.tags : ['Untagged']))];
    allTags.sort((a,b) => a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b));

    container.innerHTML = allTags.map(tag => {
      const tagTasks = tag === 'Untagged'
        ? budgetTasks.filter(t => !t.tags || !t.tags.length)
        : budgetTasks.filter(t => (t.tags||[]).includes(tag));
      const tagColor = tag === 'Untagged' ? 'var(--text3)' : getTagColor(tag);
      return `<div class="budget-tag-group">
        <div class="budget-tag-header" style="color:${tagColor}">${esc(tag)}</div>
        ${makeSummaryBar(tagTasks)}
        ${makeColumns(tagTasks)}
      </div>`;
    }).join('');
  } else {
    container.innerHTML = makeSummaryBar(budgetTasks) + makeColumns(budgetTasks);
  }
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
    if (document.getElementById('tm-budget')) document.getElementById('tm-budget').value = task.budget || '';
    if (document.getElementById('tm-spent')) document.getElementById('tm-spent').value = task.spent || '';
    document.getElementById('tm-status').value   = task.status || 'not-started';
    document.getElementById('tm-energy').value   = task.energy || 'medium';
    loadRecurrenceUI(task.recurrence || { type: 'none' });
    modalTags = [...(task.tags || [])];
    modalDue  = task.due || '';
    modalDueTime = task.dueTime || '';
    modalAttachments = JSON.parse(JSON.stringify(task.attachments || []));
    if (document.getElementById('tm-due-time')) document.getElementById('tm-due-time').value = task.dueTime || '';
    const clearBtnEdit = document.getElementById('tm-due-time-clear');
    if (clearBtnEdit) clearBtnEdit.style.display = task.dueTime ? '' : 'none';
    if (document.getElementById('tm-hide-until')) document.getElementById('tm-hide-until').value = task.hideUntilDays || '';
  } else {
    document.getElementById('tm-title').value    = '';
    document.getElementById('tm-desc').value     = '';
    document.getElementById('tm-priority').value = 'medium';
    document.getElementById('tm-estimate').value = '';
    if (document.getElementById('tm-budget')) document.getElementById('tm-budget').value = '';
    if (document.getElementById('tm-spent')) document.getElementById('tm-spent').value = '';
    document.getElementById('tm-status').value   = 'not-started';
    document.getElementById('tm-energy').value   = 'medium';
    loadRecurrenceUI({ type: 'none' });
    modalAttachments = [];
    const clearBtnNewT = document.getElementById('tm-due-time-clear');
    if (clearBtnNewT) clearBtnNewT.style.display = 'none';
    if (document.getElementById('tm-hide-until')) document.getElementById('tm-hide-until').value = '';
  }

  renderModalAttachments();

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
    dueTime:  modalDueTime,
    tags:     [...modalTags],
    estimate: parseInt(document.getElementById('tm-estimate').value) || 0,
    budget:   parseFloat(document.getElementById('tm-budget').value) || 0,
    spent:    parseFloat(document.getElementById('tm-spent')?.value) || 0,
    status:     document.getElementById('tm-status').value,
    energy:     document.getElementById('tm-energy').value,
    recurrence: getRecurrenceFromUI(),
    attachments: [...modalAttachments],
    hideUntilDays: parseInt(document.getElementById('tm-hide-until')?.value) || 0,
  };

  pushUndo(editingId ? 'Edit task' : 'Add task');

  if (editingId) {
    const task = tasks.find(t => t.id === editingId);
    if (task) { const subs = task.subtasks; Object.assign(task, data); task.subtasks = subs; }
  } else {
    const newTask = {
      id: Date.now(), completed: false,
      createdAt: new Date().toISOString(), completedAt: '',
      timeLogged: 0, timeSessions: [],
      impact: '', outcome: '', deliverable: '',
      budget: 0, spent: 0,
      status: 'not-started', energy: 'medium',
      subtasks: [],
      attachments: [],
      ...data
    };
    tasks.push(newTask);
  }

  closeModal('task-modal-overlay');
  saveTasks();
  checkOnboardingItem('addTask');

  // If status was set to done and task isn't already completed, complete it
  if (editingId && data.status === 'done') {
    const t = tasks.find(t => t.id === editingId);
    if (t && !t.completed) { toggleComplete(editingId); return; }
  }

  renderAll();
}


function renderBudgetView() {
  const container = document.getElementById('budget-view-container');
  if (!container) return;
  const sym = settings.currencySymbol || '£';

  const budgetTasks = tasks.filter(t => !t.archived && t.budget && t.budget > 0);

  if (!budgetTasks.length) {
    container.innerHTML = `<div class="budget-empty">No tasks with budgets found.<br>Add a budget to a task to see it here.</div>`;
    return;
  }

  function makeCard(t) {
    const spent = t.spent || 0;
    const pct   = Math.min(100, Math.round((spent / t.budget) * 100));
    const over  = spent > t.budget;
    const barColor = t.completed ? 'var(--accent)' : over ? 'var(--red)' : 'var(--blue)';
    const dueBadge = t.due ? `<span class="badge badge-due ${dueStatus(t.due)||''}">◷ ${fmtDate(t.due)}</span>` : '';
    const tagBadges = (t.tags||[]).map(tag => `<span class="badge" style="background:${getTagColor(tag)}22;color:${getTagColor(tag)};border-color:${getTagColor(tag)}44">${esc(tag)}</span>`).join('');
    return `<div class="budget-card priority-${t.priority}" onclick="openTaskModal(${t.id})">
      <div class="budget-card-title">${esc(t.title)}</div>
      <div class="budget-card-amounts">
        <span style="font-size:12px;color:${over?'var(--red)':'var(--text2)'}">
          ${sym}${spent.toFixed(2)} <span style="color:var(--text3)">of</span> ${sym}${parseFloat(t.budget).toFixed(2)}
          ${over ? `<span style="color:var(--red);font-weight:700"> +${sym}${(spent-t.budget).toFixed(2)}</span>` : ''}
        </span>
        <div class="budget-bar-wrap"><div class="budget-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
      </div>
      <div class="budget-card-meta">${dueBadge}${tagBadges}${renderAttachmentBadges(t)}</div>
    </div>`;
  }

  function makeColumns(taskList) {
    const notStarted  = taskList.filter(t => !t.completed && (t.spent || 0) === 0);
    const underBudget = taskList.filter(t => !t.completed && (t.spent || 0) > 0 && (t.spent || 0) <= t.budget);
    const overBudget  = taskList.filter(t => !t.completed && (t.spent || 0) > t.budget);
    const completed   = taskList.filter(t => t.completed);

    function makeCol(label, color, list) {
      const cards = list.length ? list.map(makeCard).join('') : `<div class="budget-empty" style="padding:16px 8px">No tasks</div>`;
      return `<div class="budget-col">
        <div class="budget-col-header" style="color:${color}">${label}<span class="budget-col-count">${list.length}</span></div>
        <div class="budget-col-body">${cards}</div>
      </div>`;
    }

    return `<div class="budget-view-columns">
      ${makeCol('Not Started', 'var(--text3)', notStarted)}
      ${makeCol('Under Budget', 'var(--blue)', underBudget)}
      ${makeCol('Over Budget', 'var(--red)', overBudget)}
      ${makeCol('Completed', 'var(--accent)', completed)}
    </div>`;
  }

  function makeSummaryBar(taskList) {
    const totalBudget = taskList.reduce((s, t) => s + (t.budget || 0), 0);
    const totalSpent  = taskList.reduce((s, t) => s + (t.spent || 0), 0);
    const totalOver   = taskList.filter(t => (t.spent||0) > t.budget).reduce((s, t) => s + ((t.spent||0) - t.budget), 0);
    const isOverall   = totalSpent > totalBudget;
    return `<div class="budget-summary-bar">
      <div class="budget-summary-item"><div class="budget-summary-label">Total Budget</div><div class="budget-summary-value">${sym}${totalBudget.toFixed(2)}</div></div>
      <div class="budget-summary-item"><div class="budget-summary-label">Total Spent</div><div class="budget-summary-value ${isOverall?'over':''}">${sym}${totalSpent.toFixed(2)}</div></div>
      ${totalOver > 0 ? `<div class="budget-summary-item"><div class="budget-summary-label">Over Budget By</div><div class="budget-summary-value over">${sym}${totalOver.toFixed(2)}</div></div>` : ''}
      <div class="budget-summary-item"><div class="budget-summary-label">Remaining</div><div class="budget-summary-value ${isOverall?'over':''}">${isOverall?'-':''}${sym}${Math.abs(totalBudget-totalSpent).toFixed(2)}</div></div>
    </div>`;
  }

  if (settings.budgetGroupByTags) {
    const allTags = [...new Set(budgetTasks.flatMap(t => (t.tags||[]).length ? t.tags : ['Untagged']))];
    allTags.sort((a,b) => a === 'Untagged' ? 1 : b === 'Untagged' ? -1 : a.localeCompare(b));

    container.innerHTML = allTags.map(tag => {
      const tagTasks = tag === 'Untagged'
        ? budgetTasks.filter(t => !t.tags || !t.tags.length)
        : budgetTasks.filter(t => (t.tags||[]).includes(tag));
      const tagColor = tag === 'Untagged' ? 'var(--text3)' : getTagColor(tag);
      return `<div class="budget-tag-group">
        <div class="budget-tag-header" style="color:${tagColor}">${esc(tag)}</div>
        ${makeSummaryBar(tagTasks)}
        ${makeColumns(tagTasks)}
      </div>`;
    }).join('');
  } else {
    container.innerHTML = makeSummaryBar(budgetTasks) + makeColumns(budgetTasks);
  }
}

// ── Calendar View ─────────────────────────────────────────────────────────────
// ── Attachments ───────────────────────────────────────────────────────────────

function renderModalAttachments() {
  const list = document.getElementById('tm-attachments-list');
  if (!list) return;
  if (!modalAttachments.length) { list.innerHTML = ''; return; }
  list.innerHTML = modalAttachments.map((a, i) => {
    const icon = a.type === 'link' ? '⇗' : '⊙';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--surface2);border-radius:6px;margin-bottom:4px;border:1px solid var(--border)">
      <span style="font-size:11px;color:var(--accent)">${icon}</span>
      <span style="flex:1;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.path)}">${esc(a.name)}</span>
      <button onclick="openAttachment(${i})" style="font-size:11px;padding:2px 8px;border-radius:4px;border:1px solid var(--accent);background:none;color:var(--accent);cursor:pointer;flex-shrink:0">Open</button>
      <button onclick="removeAttachment(${i})" style="font-size:11px;padding:2px 6px;border-radius:4px;border:none;background:none;color:var(--text3);cursor:pointer;flex-shrink:0" title="Remove">✕</button>
    </div>`;
  }).join('');
}

async function addAttachment() {
  // Web app only supports links — go straight to link dialog
  showLinkInputDialog();
}

function showLinkInputDialog() {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `<div style="background:var(--surface);border-radius:12px;padding:24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:12px">Add Web Link</div>
    <input id="att-link-input" type="text" placeholder="https://example.com" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--surface2);color:var(--text);font-family:inherit;margin-bottom:12px">
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button id="att-link-cancel" style="padding:7px 14px;border:1px solid var(--border);border-radius:6px;background:none;color:var(--text2);font-size:12px;cursor:pointer">Cancel</button>
      <button id="att-link-confirm" style="padding:7px 14px;border:none;border-radius:6px;background:var(--accent);color:#fff;font-size:12px;font-weight:600;cursor:pointer">Add Link</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#att-link-input');
  input.focus();
  const confirm = () => {
    const url = input.value.trim();
    if (!url) return;
    const withProtocol = /^https?:\/\//i.test(url) ? url : 'https://' + url;
    const name = withProtocol.replace(/^https?:\/\//, '').split('/')[0];
    modalAttachments.push({ type: 'link', name, path: withProtocol });
    renderModalAttachments();
    document.body.removeChild(overlay);
  };
  overlay.querySelector('#att-link-confirm').onclick = confirm;
  overlay.querySelector('#att-link-cancel').onclick  = () => document.body.removeChild(overlay);
  input.onkeydown = e => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') document.body.removeChild(overlay); };
}

function showAttachmentTypeDialog() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:var(--surface);border-radius:12px;padding:24px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,.2)">
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:16px">Add Attachment</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button id="att-file-btn" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;cursor:pointer;text-align:left">📎 Local File</button>
        <button id="att-link-btn" style="padding:10px;border:1px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);font-size:13px;cursor:pointer;text-align:left">🔗 Web Link</button>
        <button id="att-cancel-btn" style="padding:8px;border:none;background:none;color:var(--text3);font-size:12px;cursor:pointer;margin-top:4px">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#att-file-btn').onclick   = () => { document.body.removeChild(overlay); resolve('file'); };
    overlay.querySelector('#att-link-btn').onclick   = () => { document.body.removeChild(overlay); resolve('link'); };
    overlay.querySelector('#att-cancel-btn').onclick = () => { document.body.removeChild(overlay); resolve(null); };
  });
}

function removeAttachment(i) {
  modalAttachments.splice(i, 1);
  renderModalAttachments();
}

function openCurrentSheet() {
  if (!spreadsheetId) return;
  window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank');
}

function openAttachment(i) {
  const a = modalAttachments[i];
  if (!a) return;
  if (/^https?:\/\//i.test(a.path)) window.open(a.path, '_blank');
  else showToast('Local files cannot be opened in the web app');
}

function openTaskAttachment(taskId, i) {
  const task = tasks.find(t => t.id === taskId);
  if (!task || !task.attachments || !task.attachments[i]) return;
  const a = task.attachments[i];
  if (/^https?:\/\//i.test(a.path)) window.open(a.path, '_blank');
  else showToast('Local files cannot be opened in the web app');
}

function renderAttachmentBadges(task) {
  if (settings.attachmentsEnabled === false) return '';
  const atts = task.attachments || [];
  if (!atts.length) return '';
  return atts.map((a, i) => {
    const icon = a.type === 'link' ? '⇗' : '⊙';
    return `<span class="badge" style="background:var(--surface2);color:var(--text2);cursor:pointer" onclick="event.stopPropagation();openTaskAttachment(${task.id},${i})" title="${esc(a.path)}">${icon} ${esc(a.name)}</span>`;
  }).join('');
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
  rerenderTaskCard(taskId);
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
  saveTasksDebounced();
  scheduleRender();
}

function deleteSubtask(taskId, subtaskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  task.subtasks = (task.subtasks || []).filter(s => s.id !== subtaskId);
  saveTasks();
  rerenderTaskCard(taskId);
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
      rerenderTaskCard(taskId);
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
  rerenderTaskCard(taskId);
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
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  showConfirmModal(
    'Delete Task',
    `Delete "<strong>${esc(task.title)}</strong>"? This cannot be undone.`,
    'Delete',
    () => {
      if (activeTimerId === id) cancelTimer();
      pushUndo('Delete task');
      tasks = tasks.filter(t => t.id !== id);
      saveTasks();
      renderAll();
    },
    true // danger style
  );
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
    task.status = 'done';
    checkOnboardingItem('completeTask');
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
    const cmBudgetRow = document.getElementById('cm-budget-row');
    if (cmBudgetRow) {
      if (settings.budgetEnabled && task.budget && task.budget > 0) {
        const sym = settings.currencySymbol || '£';
        cmBudgetRow.style.display = '';
        const cmBudgetLabel = document.getElementById('cm-budget-label');
        if (cmBudgetLabel) cmBudgetLabel.textContent = `Amount Spent (${sym}) — Budget: ${sym}${parseFloat(task.budget).toFixed(2)}`;
        const cmSpent = document.getElementById('cm-spent');
        if (cmSpent) cmSpent.value = task.spent || '';
      } else {
        cmBudgetRow.style.display = 'none';
      }
    }
    selectImpact('medium');
    document.getElementById('completion-modal-overlay').classList.add('open');
  } else {
    task.completed   = false;
    task.completedAt = '';
    task.impact = task.outcome = task.deliverable = '';
    if (task.status === 'done') task.status = 'not-started';
    saveTasks(); renderAll();
  }
}

function saveCompletion(skip) {
  const task = tasks.find(t => t.id === completionTaskId);
  if (task && !skip) {
    task.impact      = selectedImpact;
    task.outcome     = document.getElementById('cm-outcome').value.trim();
    task.deliverable = document.getElementById('cm-deliverable').value.trim();
    const cmSpentVal = document.getElementById('cm-spent');
    if (cmSpentVal && cmSpentVal.value !== '') task.spent = parseFloat(cmSpentVal.value) || 0;
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
  // Offer to add to Wins Board if enabled
  if (settings.winsEnabled !== false && completedTask) {
    setTimeout(() => {
      showConfirmModal(
        'Add to Wins Board',
        `Capture <strong>${esc(completedTask.title)}</strong> as a win?`,
        'Add Win',
        () => addWinFromTask(completedTask.title)
      );
    }, 400);
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
    hideTagSuggestions();
  } else if (e.key === 'Escape') {
    hideTagSuggestions();
  } else if (e.key === 'Backspace' && !e.target.value && modalTags.length) {
    modalTags.pop(); renderModalTags();
  } else {
    showTagSuggestions(e.target.value.trim());
  }
}

function showTagSuggestions(query) {
  const existing = [...new Set(tasks.flatMap(t => t.tags || []))].filter(t => !modalTags.includes(t));
  const filtered = query
    ? existing.filter(t => t.toLowerCase().startsWith(query.toLowerCase()))
    : existing;
  if (!filtered.length) { hideTagSuggestions(); return; }
  let dropdown = document.getElementById('tag-suggestions-dropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'tag-suggestions-dropdown';
    dropdown.style.cssText = 'position:absolute;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 4px 16px rgba(0,0,0,.1);z-index:1000;max-height:160px;overflow-y:auto;width:100%;left:0;top:100%;margin-top:2px';
    const area = document.getElementById('tm-tag-area');
    if (area) { area.style.position = 'relative'; area.appendChild(dropdown); }
  }
  dropdown.innerHTML = filtered.slice(0,8).map(tag =>
    `<div onclick="selectTagSuggestion('${esc(tag)}')" style="padding:7px 12px;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:${getTagColor(tag)};flex-shrink:0"></span>${esc(tag)}
    </div>`
  ).join('');
  dropdown.style.display = 'block';
}

function selectTagSuggestion(tag) {
  if (!modalTags.includes(tag)) { modalTags.push(tag); getTagColor(tag); renderModalTags(); }
  const input = document.getElementById('tm-tag-input');
  if (input) input.value = '';
  hideTagSuggestions();
}

function hideTagSuggestions() {
  const d = document.getElementById('tag-suggestions-dropdown');
  if (d) d.style.display = 'none';
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
    const timePart = modalDueTime ? ` ${fmtTime(modalDueTime)}` : '';
    lbl.textContent = fmtDate(modalDue) + timePart;
    btn.classList.add('has-date');
  } else {
    lbl.textContent = 'Pick a date';
    btn.classList.remove('has-date');
  }
  // Hide-until only makes sense if a due date is set AND the defer feature is on
  const hideUntilGroup = document.getElementById('hide-until-form-group');
  if (hideUntilGroup) hideUntilGroup.style.display = (settings.deferEnabled && !!modalDue) ? '' : 'none';
}

function onDueTimeChange(val) {
  modalDueTime = val;
  refreshDueBtn();
  const clearBtn = document.getElementById('tm-due-time-clear');
  if (clearBtn) clearBtn.style.display = val ? '' : 'none';
}

function clearDueTime() {
  modalDueTime = '';
  const input = document.getElementById('tm-due-time');
  if (input) input.value = '';
  refreshDueBtn();
  const clearBtn = document.getElementById('tm-due-time-clear');
  if (clearBtn) clearBtn.style.display = 'none';
}

// ── Focus mode overlay (in-window full-viewport timer view) ──────────────────
function showFocusOverlay(task) {
  const titleEl = document.getElementById('focus-title');
  const descEl = document.getElementById('focus-desc');
  if (!titleEl) return;
  titleEl.textContent = task.title;
  if (descEl) {
    descEl.textContent = task.desc || '';
    descEl.style.display = task.desc ? '' : 'none';
  }
  renderFocusSubtasks(task.id);
  updateFocusTime(task.timeLogged || 0);
  updateFocusPauseUI();
  document.getElementById('focus-overlay').classList.add('active');
}

function hideFocusOverlay() {
  const el = document.getElementById('focus-overlay');
  if (el) el.classList.remove('active');
}

function isFocusOverlayActive() {
  const el = document.getElementById('focus-overlay');
  return !!(el && el.classList.contains('active'));
}

function renderFocusSubtasks(taskId) {
  const task = tasks.find(t => t.id === taskId);
  const el = document.getElementById('focus-subtasks');
  if (!el) return;
  if (!task || !task.subtasks || !task.subtasks.length) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  el.style.display = 'flex';
  el.innerHTML = task.subtasks.map(s => `
    <div class="focus-sub-row" onclick="toggleFocusSubtask(${task.id}, ${s.id})">
      <div class="focus-sub-check ${s.done ? 'done' : ''}">${s.done ? '✓' : ''}</div>
      <div class="focus-sub-text ${s.done ? 'done' : ''}">${esc(s.title)}</div>
    </div>
  `).join('');
}

function toggleFocusSubtask(taskId, subtaskId) {
  toggleSubtask(taskId, subtaskId);
  renderFocusSubtasks(taskId);
}

function updateFocusTime(totalSecs) {
  if (!isFocusOverlayActive()) return;
  const t = Math.max(0, Math.floor(totalSecs || 0));
  const h = Math.floor(t/3600), m = Math.floor((t%3600)/60), s = t%60;
  const pad = n => String(n).padStart(2,'0');
  const el = document.getElementById('focus-time');
  if (el) el.textContent = h ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function updateFocusPauseUI() {
  if (!isFocusOverlayActive()) return;
  const btn   = document.getElementById('focus-pause-btn');
  const time  = document.getElementById('focus-time');
  const label = document.getElementById('focus-paused-label');
  if (!btn || !time || !label) return;
  if (timerPaused) {
    btn.textContent = '▶ Resume';
    btn.classList.add('paused');
    time.classList.add('paused');
    label.textContent = 'Paused';
  } else {
    btn.textContent = '‖ Pause';
    btn.classList.remove('paused');
    time.classList.remove('paused');
    label.textContent = '';
  }
}

function toggleFocusPause() {
  if (timerPaused) resumeTimer();
  else             pauseTimer();
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

  if (settings.focusModeEnabled) showFocusOverlay(task);
  else                            showInPageTimer(task.title, task.timeLogged || 0);
  setFaviconRunning(true);

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
  updateFocusPauseUI();
  updateInPageTimerPauseUI();
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
  updateFocusPauseUI();
  updateInPageTimerPauseUI();
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
  // Mirror onto whichever timer surface is active
  updateFocusTime(total);
  updateInPageTimer(total);
}

function stopTimer() {
  // Save elapsed time to the task and reset all timer state.
  // (On desktop this normally happens via the timer-stopped IPC event
  // from the floating timer window; on web there's no IPC, so we save
  // synchronously here.)
  stopTimerSave();
  api.timerHide();
  hideFocusOverlay();
  hideInPageTimer();
  setFaviconRunning(false);
  clearBreakTimer();
  saveTasks();
  renderAll();
}

function stopTimerSave() {
  if (!activeTimerId || !timerStart) return;
  const elapsed = timerPaused
    ? timerPausedElapsed
    : Math.floor(Date.now()/1000 - timerStart) + timerPausedElapsed;
  const task    = tasks.find(t => t.id === activeTimerId);
  if (task && elapsed > 0) {
    task.timeLogged = (task.timeLogged || 0) + elapsed;
    task.timeSessions = task.timeSessions || [];
    task.timeSessions.push({ start: new Date(timerStart*1000).toISOString(), elapsed });
  }
  clearInterval(timerInterval);
  timerInterval = null;
  activeTimerId = null;
  timerStart    = null;
  timerPaused   = false;
  timerPausedElapsed = 0;
  timerPausedAt = null;
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
  checkOnboardingItem('whatNow');
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
  document.querySelectorAll('.modal-overlay').forEach(m => {
    if (m.id === 'ws-setup-modal-overlay') return;
    m.classList.remove('open');
  });
  // Clean up any active inline edits
  document.querySelectorAll('[contenteditable="true"]').forEach(el => {
    el.contentEditable = 'false';
    el.classList.remove('editing');
  });
  // Close calendar if open
  const cal = document.getElementById('calendar-popup');
  if (cal) { cal.style.display = 'none'; document.removeEventListener('click', closeCalendarOutside); }
}


// -- Settings --
// ── Defer/hide-until + Tag colour settings UI ────────────────────────────────
function toggleDeferSidebarItem() {
  const item = document.getElementById('sidebar-deferred');
  if (item) item.style.display = settings.deferEnabled ? '' : 'none';
}

let _tagColorSettingsTags = [];

function renderTagColorSettings() {
  const el = document.getElementById('tag-colors-list');
  if (!el) return;
  _tagColorSettingsTags = [...new Set(tasks.flatMap(t => t.tags || []))].sort();
  if (_tagColorSettingsTags.length === 0) {
    el.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:8px 0">No tags yet — add tags to tasks first.</div>';
    return;
  }
  el.innerHTML = _tagColorSettingsTags.map((tag, i) =>
    `<div class="setting-row" style="padding:6px 0">
      <div style="display:flex;align-items:center;gap:8px">
        <span id="tag-color-dot-${i}" style="width:10px;height:10px;border-radius:50%;background:${getTagColor(tag)};flex-shrink:0"></span>
        <span class="setting-label">${esc(tag)}</span>
      </div>
      <input type="color" value="${getTagColor(tag)}" onchange="setTagColor(${i},this.value)"
        aria-label="Color for tag ${esc(tag)}"
        style="width:36px;height:28px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:2px">
    </div>`
  ).join('');
}

function setTagColor(index, color) {
  const tag = _tagColorSettingsTags[index];
  if (!tag) return;
  if (!settings.tagColors) settings.tagColors = {};
  settings.tagColors[tag] = color;
  const dot = document.getElementById(`tag-color-dot-${index}`);
  if (dot) dot.style.background = color;
  renderAll();
}

function toggleTagColorSection() {
  const enabled = document.getElementById('set-tag-custom-colors')?.checked;
  const section = document.getElementById('tag-colors-section');
  if (section) section.style.display = enabled ? '' : 'none';
  if (enabled) renderTagColorSettings();
  renderAll();
}

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
  const budgetRow = document.getElementById('budget-form-group');
  if (budgetRow) budgetRow.style.display = s.budgetEnabled !== false ? '' : 'none';
  const dueFormGroup = document.getElementById('due-form-group');
  if (dueFormGroup) dueFormGroup.style.display = s.dueEnabled !== false ? '' : 'none';
  const dueTimeFormGroup = document.getElementById('due-time-form-group');
  if (dueTimeFormGroup) dueTimeFormGroup.style.display = (s.dueEnabled !== false && s.dueTimeEnabled !== false) ? '' : 'none';
  // Deferred sidebar item + hide-until form group (only when defer feature on)
  const deferredSidebar = document.getElementById('sidebar-deferred');
  if (deferredSidebar) deferredSidebar.style.display = s.deferEnabled ? '' : 'none';
  const hideUntilGroup = document.getElementById('hide-until-form-group');
  if (hideUntilGroup) hideUntilGroup.style.display = (s.deferEnabled && !!modalDue) ? '' : 'none';
  // Defer setting row depends on dueEnabled — hidden when due dates are off
  const deferSettingRow = document.getElementById('defer-setting-row');
  if (deferSettingRow) deferSettingRow.style.display = s.dueEnabled !== false ? '' : 'none';
  // Tag Colours settings section depends on tagsEnabled
  const tagColoursSection = document.getElementById('tag-colours-settings-section');
  if (tagColoursSection) tagColoursSection.style.display = s.tagsEnabled ? '' : 'none';
  // Break sub-settings depend on breakEnabled
  const breakSub = document.getElementById('break-sub-settings');
  if (breakSub) breakSub.style.display = s.breakEnabled ? '' : 'none';
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
  const budgetSubBtn = document.querySelector('.feature-sub-btn[onclick*="budget"]');
  if (budgetSubBtn) budgetSubBtn.style.display = s.budgetEnabled !== false ? '' : 'none';
  const summariesSubBtn = document.querySelector('.feature-sub-btn[onclick*="summaries"]');
  if (summariesSubBtn) summariesSubBtn.style.display = (s.sodEnabled !== false || s.eodEnabled !== false) ? '' : 'none';
  if (!s.breakEnabled) {
    const timerTab = document.getElementById('feature-tab-timer');
    if (timerTab && timerTab.classList.contains('active')) {
      switchFeatureTab('streak', document.querySelectorAll('.feature-sub-btn')[1]);
    }
  }
  if (s.kanbanEnabled === false) {
    const kanbanTab = document.getElementById('feature-tab-kanban');
    if (kanbanTab && kanbanTab.classList.contains('active')) {
      switchFeatureTab('timer', document.querySelector('.feature-sub-btn'));
    }
  }
  if (s.budgetEnabled === false) {
    const budgetTab = document.getElementById('feature-tab-budget');
    if (budgetTab && budgetTab.classList.contains('active')) {
      switchFeatureTab('timer', document.querySelector('.feature-sub-btn:not([style*="none"])'));
    }
  }
  if (s.sodEnabled === false && s.eodEnabled === false) {
    const summariesTab = document.getElementById('feature-tab-summaries');
    if (summariesTab && summariesTab.classList.contains('active')) {
      switchFeatureTab('timer', document.querySelector('.feature-sub-btn:not([style*="none"])'));
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
  // Ideas and Habits toggles
  const ideasItem = document.querySelector('[data-view="ideas"]');
  if (ideasItem) ideasItem.style.display = s.ideasEnabled !== false ? '' : 'none';
  const habitsItem = document.getElementById('sidebar-habits-main');
  if (habitsItem) habitsItem.style.display = s.habitsEnabled !== false ? '' : 'none';
  const winsItem = document.querySelector('[data-view="wins"]');
  if (winsItem) winsItem.style.display = s.winsEnabled !== false ? '' : 'none';
  const budgetViewItem = document.getElementById('sidebar-budget-view');
  if (budgetViewItem) budgetViewItem.style.display = s.budgetEnabled !== false ? '' : 'none';
  const calendarViewItem = document.getElementById('sidebar-calendar-view');
  if (calendarViewItem) calendarViewItem.style.display = s.calendarEnabled !== false ? '' : 'none';
  const mobileCalBtn = document.getElementById('mobile-nav-calendar');
  if (mobileCalBtn) mobileCalBtn.style.display = s.calendarEnabled !== false ? '' : 'none';
  const attachmentsRow = document.getElementById('attachments-form-group');
  if (attachmentsRow) attachmentsRow.style.display = s.attachmentsEnabled !== false ? '' : 'none';
  if (s.budgetEnabled === false && budgetViewMode) { budgetViewMode = false; setView('all', document.querySelector('[data-view="all"]')); }
  if (s.calendarEnabled === false && calendarViewMode) { calendarViewMode = false; setView('all', document.querySelector('[data-view="all"]')); }
  // Hide the entire TOOLS section if all are disabled
  const toolsSection = document.getElementById('sidebar-tools-section');
  if (toolsSection) toolsSection.style.display = (s.ideasEnabled !== false || s.habitsEnabled !== false || s.winsEnabled !== false || s.budgetEnabled !== false) ? '' : 'none';
  const wsDropdown = document.getElementById('workspace-dropdown');
  const wsTitle = document.getElementById('workspace-title');
  if (wsDropdown) wsDropdown.style.display = s.workspacesEnabled !== false ? '' : 'none';
  if (wsTitle) wsTitle.style.display = s.workspacesEnabled !== false ? '' : 'none';
  if (s.habitsEnabled === false && document.getElementById('habits-container')?.classList.contains('active')) {
    habitsMode = false;
    setView('all', document.querySelector('[data-view="all"]'));
  }
  if (s.ideasEnabled === false && currentView === 'ideas') {
    setView('all', document.querySelector('[data-view="all"]'));
  }
  if (s.winsEnabled === false && currentView === 'wins') {
    winsMode = false;
    setView('all', document.querySelector('[data-view="all"]'));
  }
  // Show empty state in Feature Settings if no features with settings are enabled
  const hasFeatureSettings = s.breakEnabled || s.streakEnabled !== false || s.kanbanEnabled !== false || s.budgetEnabled !== false || s.sodEnabled !== false || s.eodEnabled !== false;
  const emptyState = document.getElementById('feature-settings-empty');
  if (emptyState) emptyState.style.display = hasFeatureSettings ? 'none' : 'block';
  const featureSubNav = document.getElementById('settings-tab-feature-settings')?.querySelector('div[style*="flex"]') ||
    document.getElementById('settings-tab-feature-settings')?.querySelector('div:has(.feature-sub-btn)');
  if (featureSubNav) featureSubNav.style.display = hasFeatureSettings ? 'flex' : 'none';
  if (hasFeatureSettings) {
    document.querySelectorAll('.feature-sub-section').forEach(el => { el.style.display = ''; });
  } else {
    document.querySelectorAll('.feature-sub-section').forEach(el => { el.style.display = 'none'; });
  }
}

async function openSettings() {
  const s = settings;
  // Sync dark mode toggle to current theme
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (document.getElementById('set-darkmode')) document.getElementById('set-darkmode').checked = isDark;
  // Sync accent theme picker
  const currentAccent = document.documentElement.getAttribute('data-accent') || 'forest';
  document.querySelectorAll('.colour-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.accent === currentAccent);
  });
  const nameEl = document.getElementById('colour-theme-name');
  if (nameEl) nameEl.textContent = ACCENT_NAMES[currentAccent] || '';
  if (document.getElementById('set-break-enabled')) document.getElementById('set-break-enabled').checked = s.breakEnabled;
  if (document.getElementById('set-break-enabled-general')) document.getElementById('set-break-enabled-general').checked = s.breakEnabled;
  if (document.getElementById('set-break-interval')) document.getElementById('set-break-interval').value = s.breakIntervalMins;
  if (document.getElementById('set-break-duration')) document.getElementById('set-break-duration').value = s.breakDurationMins;
  if (document.getElementById('set-tags'))           document.getElementById('set-tags').checked           = s.tagsEnabled;
  if (document.getElementById('set-streak'))         document.getElementById('set-streak').checked         = s.streakEnabled;
  if (document.getElementById('set-estimates'))      document.getElementById('set-estimates').checked      = s.estimatesEnabled;
  if (document.getElementById('set-timer-enabled')) document.getElementById('set-timer-enabled').checked = s.timerEnabled !== false;
  if (document.getElementById('set-due-enabled'))    document.getElementById('set-due-enabled').checked    = s.dueEnabled !== false;
  if (document.getElementById('set-due-time-enabled')) document.getElementById('set-due-time-enabled').checked = s.dueTimeEnabled !== false;
  if (document.getElementById('set-quickadd'))       document.getElementById('set-quickadd').checked       = s.quickAddEnabled;
  if (document.getElementById('set-whatnow'))        document.getElementById('set-whatnow').checked        = s.whatNowEnabled;
  if (document.getElementById('set-completion'))     document.getElementById('set-completion').checked     = s.completionDialog;
  if (document.getElementById('set-sound-enabled'))  document.getElementById('set-sound-enabled').checked  = s.soundEnabled;
  if (document.getElementById('set-mood-enabled'))   document.getElementById('set-mood-enabled').checked   = s.moodEnabled;
  if (document.getElementById('set-changelog-enabled')) document.getElementById('set-changelog-enabled').checked = s.changelogEnabled !== false;
  if (document.getElementById('set-streak-weekends')) document.getElementById('set-streak-weekends').checked = s.streakWeekends;
  if (document.getElementById('set-grace-day')) document.getElementById('set-grace-day').checked = s.graceDayEnabled !== false;
  if (document.getElementById('set-energy-enabled'))    document.getElementById('set-energy-enabled').checked    = s.energyEnabled !== false;
  if (document.getElementById('set-status-enabled'))    document.getElementById('set-status-enabled').checked    = s.statusEnabled !== false;
  if (document.getElementById('set-subtasks-enabled'))  document.getElementById('set-subtasks-enabled').checked  = s.subtasksEnabled !== false;
  if (document.getElementById('set-recurrence-enabled')) document.getElementById('set-recurrence-enabled').checked = s.recurrenceEnabled !== false;
  if (document.getElementById('set-kanban-enabled'))    document.getElementById('set-kanban-enabled').checked    = s.kanbanEnabled !== false;
  if (document.getElementById('set-kanban-group-tags')) document.getElementById('set-kanban-group-tags').checked = s.kanbanGroupByTags !== false;
  if (document.getElementById('set-kanban-show-completed')) document.getElementById('set-kanban-show-completed').checked = s.kanbanShowCompleted === true;
  if (document.getElementById('set-ideas-enabled'))     document.getElementById('set-ideas-enabled').checked     = s.ideasEnabled !== false;
  if (document.getElementById('set-habits-enabled'))    document.getElementById('set-habits-enabled').checked    = s.habitsEnabled !== false;
  if (document.getElementById('set-wins-enabled'))      document.getElementById('set-wins-enabled').checked      = s.winsEnabled !== false;
  if (document.getElementById('set-workspaces-enabled')) document.getElementById('set-workspaces-enabled').checked = s.workspacesEnabled !== false;
  if (document.getElementById('set-break-enabled-general')) document.getElementById('set-break-enabled-general').checked = s.breakEnabled;
  if (document.getElementById('set-budget-enabled'))  document.getElementById('set-budget-enabled').checked  = s.budgetEnabled !== false;
  if (document.getElementById('set-currency-symbol')) document.getElementById('set-currency-symbol').value   = s.currencySymbol || '£';
  if (document.getElementById('set-budget-group-tags')) document.getElementById('set-budget-group-tags').checked = s.budgetGroupByTags === true;
  if (document.getElementById('set-attachments-enabled')) document.getElementById('set-attachments-enabled').checked = s.attachmentsEnabled !== false;
  if (document.getElementById('set-calendar-enabled')) document.getElementById('set-calendar-enabled').checked = s.calendarEnabled !== false;
  if (document.getElementById('set-defer-enabled')) document.getElementById('set-defer-enabled').checked = s.deferEnabled === true;
  if (document.getElementById('set-focus-mode-enabled')) document.getElementById('set-focus-mode-enabled').checked = s.focusModeEnabled === true;
  if (document.getElementById('set-browser-notifications')) document.getElementById('set-browser-notifications').checked = s.browserNotificationsEnabled === true;
  if (document.getElementById('set-tag-custom-colors')) document.getElementById('set-tag-custom-colors').checked = s.tagCustomColorsEnabled === true;
  if (typeof toggleTagColorSection === 'function') toggleTagColorSection();
  if (document.getElementById('set-sod-enabled'))         document.getElementById('set-sod-enabled').checked         = s.sodEnabled !== false;
  if (document.getElementById('set-sod-due-today'))       document.getElementById('set-sod-due-today').checked       = s.sodShowDueToday !== false;
  if (document.getElementById('set-sod-overdue'))         document.getElementById('set-sod-overdue').checked         = s.sodShowOverdue !== false;
  if (document.getElementById('set-sod-mood'))            document.getElementById('set-sod-mood').checked            = s.sodShowMood !== false;
  if (document.getElementById('set-eod-enabled'))         document.getElementById('set-eod-enabled').checked         = s.eodEnabled !== false;
  if (document.getElementById('set-eod-time'))            document.getElementById('set-eod-time').value              = s.eodTime || '17:00';
  if (document.getElementById('set-eod-completed'))       document.getElementById('set-eod-completed').checked       = s.eodShowCompleted !== false;
  if (document.getElementById('set-eod-tomorrow'))        document.getElementById('set-eod-tomorrow').checked        = s.eodShowTomorrow !== false;
  if (document.getElementById('set-eod-streak'))          document.getElementById('set-eod-streak').checked          = s.eodShowStreak !== false;
  toggleSodEodSettings();
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
  // Reset to first tab (V4 tab structure)
  switchSettingsTab('task-org', document.querySelector('.settings-nav-item'));
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


// ── Contact Form ────────────────────────────────────────────────────────────
async function submitContactForm() {
  const name    = (document.getElementById('contact-name')?.value || '').trim();
  const email   = (document.getElementById('contact-email')?.value || '').trim();
  const message = (document.getElementById('contact-message')?.value || '').trim();
  const feedback = document.getElementById('contact-form-feedback');
  const btn = document.getElementById('contact-submit-btn');

  if (!name)    { if (feedback) { feedback.style.color = 'var(--red)'; feedback.textContent = 'Please enter your name.'; } return; }
  if (!email)   { if (feedback) { feedback.style.color = 'var(--red)'; feedback.textContent = 'Please enter your email address.'; } return; }
  if (!message) { if (feedback) { feedback.style.color = 'var(--red)'; feedback.textContent = 'Please enter a message.'; } return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  if (feedback) feedback.textContent = '';

  try {
    const res = await fetch('https://formspree.io/f/xwvrjnkd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ name, email, message })
    });
    const data = await res.json();
    if (res.ok) {
      if (feedback) { feedback.style.color = 'var(--accent)'; feedback.textContent = "✓ Message sent! We'll get back to you soon."; }
      if (document.getElementById('contact-name'))    document.getElementById('contact-name').value = '';
      if (document.getElementById('contact-email'))   document.getElementById('contact-email').value = '';
      if (document.getElementById('contact-message')) document.getElementById('contact-message').value = '';
    } else {
      throw new Error(data?.errors?.[0]?.message || 'Submission failed');
    }
  } catch (err) {
    if (feedback) { feedback.style.color = 'var(--red)'; feedback.textContent = 'Failed to send — please try again or email hello@taskspark.tech'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Send Message'; }
  }
}

function switchSettingsTab(tab, el) {
  if (tab === 'changelog') loadChangelogContent();
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
  showConfirmModal(
    'Recurring Task',
    'This is a <strong>' + label + '</strong> task. Would you like to create the next occurrence?',
    'Create Next',
    () => _createRecurrenceOccurrence(task)
  );
}

function _createRecurrenceOccurrence(task) {
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
  // Hide all break sub-settings (timing inputs, sound toggle, preview button,
  // browser-notification toggle) when the master Break Reminders is off.
  const sub = document.getElementById('break-sub-settings');
  if (sub) sub.style.display = enabled ? '' : 'none';
  // Legacy: was used to manage the old Feature Settings sub-tab visibility.
  // Kept null-safe for the unlikely case that DOM still has it.
  const timerSubBtn = document.querySelector('.feature-sub-btn[onclick*="timer"]');
  if (timerSubBtn) timerSubBtn.style.display = enabled ? '' : 'none';
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
  const _g = (id) => document.getElementById(id);
  const _c = (id, fallback) => _g(id) ? _g(id).checked : fallback;
  const _v = (id, fallback) => _g(id) ? parseInt(_g(id).value) || fallback : fallback;
  settings.breakEnabled      = _c('set-break-enabled-general', _c('set-break-enabled', settings.breakEnabled));
  settings.breakIntervalMins = _v('set-break-interval', 30);
  settings.breakDurationMins = _v('set-break-duration', 5);
  settings.tagsEnabled       = _c('set-tags', settings.tagsEnabled);
  settings.streakEnabled     = _c('set-streak', settings.streakEnabled);
  settings.estimatesEnabled  = _c('set-estimates', settings.estimatesEnabled);
  if (document.getElementById('set-timer-enabled')) settings.timerEnabled = document.getElementById('set-timer-enabled').checked;
  if (_g('set-due-enabled'))      settings.dueEnabled     = _c('set-due-enabled', true);
  if (_g('set-due-time-enabled')) settings.dueTimeEnabled = _c('set-due-time-enabled', true);
  if (_g('set-quickadd'))         settings.quickAddEnabled = _c('set-quickadd', settings.quickAddEnabled);
  settings.whatNowEnabled    = _c('set-whatnow', settings.whatNowEnabled);
  settings.completionDialog  = _c('set-completion', settings.completionDialog);
  settings.soundEnabled      = _c('set-sound-enabled', settings.soundEnabled);
  settings.moodEnabled       = _c('set-mood-enabled', settings.moodEnabled);
  settings.changelogEnabled  = _c('set-changelog-enabled', settings.changelogEnabled);
  updateChangelogSidebarBtn();
  settings.streakWeekends    = _c('set-streak-weekends', settings.streakWeekends);
  if (document.getElementById('set-grace-day')) settings.graceDayEnabled = document.getElementById('set-grace-day').checked;
  if (document.getElementById('set-energy-enabled'))    settings.energyEnabled    = document.getElementById('set-energy-enabled').checked;
  if (document.getElementById('set-status-enabled'))    settings.statusEnabled    = document.getElementById('set-status-enabled').checked;
  if (document.getElementById('set-subtasks-enabled'))  settings.subtasksEnabled  = document.getElementById('set-subtasks-enabled').checked;
  if (document.getElementById('set-recurrence-enabled')) settings.recurrenceEnabled = document.getElementById('set-recurrence-enabled').checked;
  if (document.getElementById('set-kanban-enabled'))    settings.kanbanEnabled    = document.getElementById('set-kanban-enabled').checked;
  if (document.getElementById('set-kanban-group-tags')) settings.kanbanGroupByTags = document.getElementById('set-kanban-group-tags').checked;
  if (document.getElementById('set-kanban-show-completed')) settings.kanbanShowCompleted = document.getElementById('set-kanban-show-completed').checked;
  if (document.getElementById('set-ideas-enabled'))     settings.ideasEnabled     = document.getElementById('set-ideas-enabled').checked;
  if (document.getElementById('set-habits-enabled'))    settings.habitsEnabled    = document.getElementById('set-habits-enabled').checked;
  if (document.getElementById('set-wins-enabled'))      settings.winsEnabled      = document.getElementById('set-wins-enabled').checked;
  if (document.getElementById('set-workspaces-enabled')) settings.workspacesEnabled = document.getElementById('set-workspaces-enabled').checked;
  if (document.getElementById('set-budget-group-tags')) settings.budgetGroupByTags = document.getElementById('set-budget-group-tags').checked;
  if (document.getElementById('set-attachments-enabled')) settings.attachmentsEnabled = document.getElementById('set-attachments-enabled').checked;
  if (document.getElementById('set-calendar-enabled')) settings.calendarEnabled = document.getElementById('set-calendar-enabled').checked;
  if (document.getElementById('set-defer-enabled')) settings.deferEnabled = document.getElementById('set-defer-enabled').checked;
  if (document.getElementById('set-focus-mode-enabled')) settings.focusModeEnabled = document.getElementById('set-focus-mode-enabled').checked;
  if (document.getElementById('set-browser-notifications')) settings.browserNotificationsEnabled = document.getElementById('set-browser-notifications').checked;
  if (document.getElementById('set-tag-custom-colors')) settings.tagCustomColorsEnabled = document.getElementById('set-tag-custom-colors').checked;
  if (document.getElementById('set-break-enabled-general')) settings.breakEnabled = document.getElementById('set-break-enabled-general').checked;
  if (document.getElementById('set-budget-enabled'))  settings.budgetEnabled   = document.getElementById('set-budget-enabled').checked;
  if (document.getElementById('set-currency-symbol')) settings.currencySymbol  = document.getElementById('set-currency-symbol').value || '£';
  if (document.getElementById('set-sod-enabled'))   settings.sodEnabled      = document.getElementById('set-sod-enabled').checked;
  if (document.getElementById('set-sod-due-today')) settings.sodShowDueToday = document.getElementById('set-sod-due-today').checked;
  if (document.getElementById('set-sod-overdue'))   settings.sodShowOverdue  = document.getElementById('set-sod-overdue').checked;
  if (document.getElementById('set-sod-mood'))      settings.sodShowMood     = document.getElementById('set-sod-mood').checked;
  if (document.getElementById('set-eod-enabled'))   settings.eodEnabled      = document.getElementById('set-eod-enabled').checked;
  if (document.getElementById('set-eod-time'))      settings.eodTime         = document.getElementById('set-eod-time').value || '17:00';
  if (document.getElementById('set-eod-completed')) settings.eodShowCompleted = document.getElementById('set-eod-completed').checked;
  if (document.getElementById('set-eod-tomorrow'))  settings.eodShowTomorrow  = document.getElementById('set-eod-tomorrow').checked;
  if (document.getElementById('set-eod-streak'))    settings.eodShowStreak    = document.getElementById('set-eod-streak').checked;
  // V3: Also save to workspace if it has its own settings
  const _ws = getActiveWorkspace();
  if (_ws && _ws.settings) {
    _ws.settings = { ...settings };
    saveWorkspaces();
  }
  api.saveConfig({ settings });
  applySettings();
  renderAll();
  scheduleEod();
  closeModal('settings-modal-overlay');
  showToast('Settings saved');
}

// ── Habits ────────────────────────────────────────────────────────────────────
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function showHabitsView() {
  // Hide other containers, show habits
  document.getElementById('task-list-container').style.display = 'none';
  document.getElementById('kanban-container').style.display = 'none';
  document.getElementById('ideas-container').classList.remove('active');
  document.getElementById('wins-container').classList.remove('active');
  const bvcH = document.getElementById('budget-view-container'); if (bvcH) bvcH.classList.remove('active');
  const cvcH = document.getElementById('calendar-view-container'); if (cvcH) { cvcH.classList.remove('active'); }
  document.getElementById('habits-container').classList.add('active');
  kanbanMode = false; ideasMode = false; habitsMode = true; winsMode = false; budgetViewMode = false; calendarViewMode = false;
  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  const habitsBtn = document.getElementById('sidebar-habits-main');
  if (habitsBtn) habitsBtn.classList.add('active');
  document.getElementById('view-title').textContent = 'Habits';
  renderHabits();
}

function renderHabits() {
  const container = document.getElementById('habits-container');
  if (!container) return;
  updateHabitsSidebar();

  const header = `
    <div class="habits-header">
      <div class="habits-view-toggle">
        <button class="habits-view-btn ${habitsViewDays===7?'active':''}" onclick="setHabitsView(7)">7 days</button>
        <button class="habits-view-btn ${habitsViewDays===30?'active':''}" onclick="setHabitsView(30)">30 days</button>
      </div>
      <button class="btn-primary" onclick="openHabitModal()">+ New Habit</button>
    </div>`;

  if (!habits.length) {
    container.innerHTML = header + `
      <div class="habits-empty">
        <div style="font-size:40px;margin-bottom:12px">🔄</div>
        <div style="font-size:15px;font-weight:600;color:var(--text2);margin-bottom:6px">No habits yet</div>
        <div style="font-size:13px">Add your first habit to start tracking</div>
      </div>`;
    return;
  }

  const cards = habits.map(h => renderHabitCard(h)).join('');
  container.innerHTML = header + cards;
}

function setHabitsView(days) {
  habitsViewDays = days;
  renderHabits();
}

function renderHabitCard(habit) {
  const today = new Date();
  const days = [];
  for (let i = habitsViewDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  const streak = calcHabitStreak(habit);
  const best   = calcHabitBestStreak(habit);

  const cells = days.map(d => {
    const dow     = d.getDay();
    const ds      = dateToLocalStr(d);
    const isFuture = ds > todayStr();
    const isNA    = habit.freqMode === 'week' ? false : !habit.days.includes(dow);
    const isDone  = (habit.completions || {})[ds];
    const isToday = ds === todayStr();

    let cls = 'habit-day-cell';
    let title = '';
    if (isNA)          { cls += ' na'; title = 'N/A'; }
    else if (isFuture) { cls += ' future'; }
    else if (isDone)   { cls += ' done'; title = '✓'; }
    else if (isToday)  { cls += ' today-empty'; title = '○'; }
    else               { cls += ' missed'; title = '✕'; }

    const onclick = (!isNA && !isFuture) ? `onclick="toggleHabitDay('${habit.id}','${ds}')"` : '';
    const label = habitsViewDays <= 7 ? `<div class="habit-day-label">${DAY_NAMES[dow].slice(0,1)}</div>` : '';

    return `<div>
      <div class="${cls}" ${onclick} title="${ds}">${isDone?'✓':isNA?'':isToday?'':''}</div>
      ${label}
    </div>`;
  }).join('');

  return `
    <div class="habit-card">
      <div class="habit-card-top">
        <div class="habit-card-left">
          <div class="habit-icon">${habit.icon||'🔄'}</div>
          <div>
            <div class="habit-name">${esc(habit.name)}</div>
            <div class="habit-days-label">${habit.freqMode === 'week' ? `${habit.timesPerWeek || 3}× per week` : habit.days.map(d=>DAY_NAMES[d]).join(', ')}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="habit-streaks">
            <div class="habit-streak-item">
              <div class="habit-streak-num">${streak}</div>
              <div class="habit-streak-label">Streak</div>
            </div>
            <div class="habit-streak-item">
              <div class="habit-streak-num" style="color:var(--amber)">${best}</div>
              <div class="habit-streak-label">Best</div>
            </div>
          </div>
          <div class="habit-actions">
            <button class="action-btn" onclick="openHabitModal('${habit.id}')" title="Edit">✎</button>
            <button class="action-btn delete" onclick="deleteHabit('${habit.id}')" title="Delete">✕</button>
          </div>
        </div>
      </div>
      <div class="habit-grid-wrap">
        <div class="habit-grid">${cells}</div>
      </div>
    </div>`;
}

function toggleHabitDay(habitId, dateStr) {
  const habit = habits.find(h => h.id === habitId);
  if (!habit) return;
  if (!habit.completions) habit.completions = {};
  if (habit.completions[dateStr]) delete habit.completions[dateStr];
  else habit.completions[dateStr] = true;
  saveHabitsDebounced();
  renderHabits();
}

function calcHabitStreak(habit) {
  const completions = habit.completions || {};
  if (habit.freqMode === 'week') {
    // Week mode: count consecutive weeks where target was met
    const target = habit.timesPerWeek || 3;
    let streak = 0;
    const today = new Date();
    // Get start of this week (Sunday)
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    for (let w = 0; w < 52; w++) {
      const ws = new Date(weekStart); ws.setDate(weekStart.getDate() - w * 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      if (ws > today) continue;
      let count = 0;
      for (let d = new Date(ws); d <= we && d <= today; d.setDate(d.getDate()+1)) {
        if (completions[dateToLocalStr(d)]) count++;
      }
      // Current week: partial count is ok (in progress)
      if (w === 0 && count < target) break;
      if (w > 0 && count < target) break;
      streak++;
    }
    return streak;
  }
  let streak = 0;
  const check = new Date();
  // If today is an active day and not completed yet, still check previous days
  while (true) {
    const dow = check.getDay();
    const ds  = dateToLocalStr(check);
    if (!habit.days.includes(dow)) { check.setDate(check.getDate()-1); continue; }
    if (completions[ds]) { streak++; check.setDate(check.getDate()-1); }
    else if (ds === todayStr()) { check.setDate(check.getDate()-1); } // today not done yet, skip
    else break;
  }
  return streak;
}

function calcHabitBestStreak(habit) {
  const completions = habit.completions || {};
  const dates = Object.keys(completions).filter(d => completions[d]).sort();
  if (!dates.length) return 0;
  let best = 0, current = 0;
  const start = new Date(dates[0] + 'T00:00:00');
  const end   = new Date();
  const check = new Date(start);
  while (check <= end) {
    const dow = check.getDay();
    const ds  = dateToLocalStr(check);
    if (habit.days.includes(dow)) {
      if (completions[ds]) { current++; best = Math.max(best, current); }
      else if (ds < todayStr()) current = 0;
    }
    check.setDate(check.getDate()+1);
  }
  return best;
}

function pickHabitEmoji(emoji) {
  if (!emoji || !emoji.trim()) return;
  const val = emoji.trim();
  document.getElementById('habit-icon').value = val;
  document.getElementById('habit-icon-preview').textContent = val;
  const customInput = document.getElementById('habit-icon-custom');
  if (customInput && !customInput.matches(':focus')) customInput.value = val;
  document.querySelectorAll('.emoji-pick-btn').forEach(b => {
    b.classList.toggle('selected', b.textContent.trim() === val);
  });
}

function setHabitFreqMode(mode) {
  const daysSection = document.getElementById('habit-days-section');
  const weekSection = document.getElementById('habit-week-section');
  const daysBtn = document.getElementById('habit-freq-days-btn');
  const weekBtn = document.getElementById('habit-freq-week-btn');
  if (mode === 'days') {
    if (daysSection) daysSection.style.display = '';
    if (weekSection) weekSection.style.display = 'none';
    if (daysBtn) daysBtn.classList.add('selected');
    if (weekBtn) weekBtn.classList.remove('selected');
  } else {
    if (daysSection) daysSection.style.display = 'none';
    if (weekSection) weekSection.style.display = '';
    if (daysBtn) daysBtn.classList.remove('selected');
    if (weekBtn) weekBtn.classList.add('selected');
  }
}

function openHabitModal(id = null) {
  editingHabitId = id || null;
  document.getElementById('habit-modal-title').textContent = id ? '✎ Edit Habit' : '＋ New Habit';
  // Reset day buttons
  document.querySelectorAll('#habit-day-picker .day-btn').forEach(b => b.classList.remove('selected'));
  if (id) {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    document.getElementById('habit-name').value = habit.name;
    const icon = habit.icon || '🔄';
    document.getElementById('habit-icon').value = icon;
    document.getElementById('habit-icon-preview').textContent = icon;
    document.querySelectorAll('.emoji-pick-btn').forEach(b => {
      b.classList.toggle('selected', b.textContent.trim() === icon);
    });
    const freqMode = habit.freqMode || 'days';
    setHabitFreqMode(freqMode);
    if (freqMode === 'week') {
      if (document.getElementById('habit-times-per-week')) document.getElementById('habit-times-per-week').value = habit.timesPerWeek || 3;
    } else {
      habit.days.forEach(d => {
        const btn = document.querySelector(`#habit-day-picker .day-btn[data-day="${d}"]`);
        if (btn) btn.classList.add('selected');
      });
    }
  } else {
    document.getElementById('habit-name').value = '';
    document.getElementById('habit-icon').value = '🔄';
    document.getElementById('habit-icon-preview').textContent = '🔄';
    setHabitFreqMode('days');
    // Select all days by default
    document.querySelectorAll('#habit-day-picker .day-btn').forEach(b => b.classList.add('selected'));
    const defaultBtn = document.querySelector('.emoji-pick-btn[onclick*="🔄"]');
    if (defaultBtn) defaultBtn.classList.add('selected');
  }
  document.getElementById('habit-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('habit-name').focus(), 50);
}

function saveHabit() {
  const name = document.getElementById('habit-name').value.trim();
  if (!name) { showToast('Please enter a habit name'); return; }
  const icon = document.getElementById('habit-icon').value.trim() || '🔄';
  const freqMode = document.getElementById('habit-week-section') && document.getElementById('habit-week-section').style.display !== 'none' ? 'week' : 'days';
  const timesPerWeek = freqMode === 'week' ? (parseInt(document.getElementById('habit-times-per-week')?.value) || 3) : null;
  const days = freqMode === 'days' ? [...document.querySelectorAll('#habit-day-picker .day-btn.selected')].map(b => parseInt(b.dataset.day)) : [0,1,2,3,4,5,6];
  if (freqMode === 'days' && !days.length) { showToast('Please select at least one active day'); return; }

  if (editingHabitId) {
    const habit = habits.find(h => h.id === editingHabitId);
    if (habit) { habit.name = name; habit.icon = icon; habit.days = days; habit.freqMode = freqMode; habit.timesPerWeek = timesPerWeek; }
  } else {
    habits.push({ id: String(Date.now()), name, icon, days, freqMode, timesPerWeek, completions: {}, createdAt: new Date().toISOString() });
  }
  closeModal('habit-modal-overlay');
  saveHabits();
  renderHabits();
}

function deleteHabit(id) {
  const habit = habits.find(h => h.id === id);
  if (!habit) return;
  showConfirmModal('Delete Habit', `Delete <strong>${esc(habit.name)}</strong>? This cannot be undone.`, 'Delete', () => {
    habits = habits.filter(h => h.id !== id);
    saveHabits();
    renderHabits();
  }, true);
}

function updateHabitsSidebar() {
  // Individual habits no longer shown in sidebar
}

async function saveHabits() {
  api.saveConfig({ habits });
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      await api.habitsSave({ accessToken, spreadsheetId, habits });
    } catch (e) { console.error('Habits save error:', e); }
  }
}

async function loadHabits() {
  habits = [];
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      const remote = await api.habitsLoad({ accessToken, spreadsheetId });
      if (remote) habits = remote;
    } catch (e) {
      console.error('Habits load error:', e);
      // Fallback to config cache only if sheet load fails
      try { const cfg = await api.loadConfig(); habits = cfg && cfg.habits ? cfg.habits : []; } catch {}
    }
  } else {
    try { const cfg = await api.loadConfig(); habits = cfg && cfg.habits ? cfg.habits : []; } catch { habits = []; }
  }
  updateHabitsSidebar();
}

// ── Ideas ─────────────────────────────────────────────────────────────────────
function renderIdeas() {
  const container = document.getElementById('ideas-container');
  if (!container) return;
  const cntEl = document.getElementById('cnt-ideas');
  if (cntEl) cntEl.textContent = ideas.length;

  if (!ideas.length) {
    container.innerHTML = `
      <div class="ideas-header">
        <div></div>
        <button class="btn-primary" onclick="openIdeaModal()">+ New Idea</button>
      </div>
      <div class="idea-empty">
        <div class="idea-empty-icon">💡</div>
        <div class="idea-empty-text">No ideas yet</div>
        <div class="idea-empty-sub">Capture thoughts here and turn them into tasks when you're ready</div>
      </div>`;
    return;
  }

  const cards = ideas.map(idea => {
    const tags = (idea.tags||[]).map(t =>
      `<span class="badge badge-tag" style="background:${getTagColor(t)}">${esc(t)}</span>`).join('');
    return `
      <div class="idea-card">
        <div class="idea-card-title">${esc(idea.title)}</div>
        ${idea.desc ? `<div class="idea-card-desc">${esc(idea.desc)}</div>` : ''}
        <div class="idea-card-actions">
          <div class="idea-card-tags" style="flex:1">${tags}</div>
          <button class="btn-secondary" style="font-size:12px;padding:5px 10px" onclick="openIdeaModal(${idea.id})">Edit</button>
          <button class="btn-secondary" style="font-size:12px;padding:5px 10px;color:var(--red);border-color:var(--red)" onclick="deleteIdea(${idea.id})">Delete</button>
          <button class="btn-primary" style="font-size:12px;padding:5px 10px" onclick="convertIdeaToTask(${idea.id})">→ Make task</button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="ideas-header">
      <div style="font-size:13px;color:var(--text3)">${ideas.length} idea${ideas.length !== 1 ? 's' : ''}</div>
      <button class="btn-primary" onclick="openIdeaModal()">+ New Idea</button>
    </div>
    <div class="ideas-grid">${cards}</div>`;
}

function openIdeaModal(id = null) {
  editingIdeaId = id;
  ideaTags = [];
  document.getElementById('idea-modal-title').textContent = id ? '💡 Edit Idea' : '💡 New Idea';
  if (id) {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    document.getElementById('idea-title').value = idea.title;
    document.getElementById('idea-desc').value  = idea.desc || '';
    ideaTags = [...(idea.tags || [])];
  } else {
    document.getElementById('idea-title').value = '';
    document.getElementById('idea-desc').value  = '';
  }
  renderIdeaTags();
  document.getElementById('idea-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('idea-title').focus(), 50);
}

function renderIdeaTags() {
  const area = document.getElementById('idea-tag-area');
  if (!area) return;
  const pills = ideaTags.map(t =>
    `<span class="tag-pill" style="background:${getTagColor(t)}">${esc(t)}<button class="tag-pill-x" onclick="removeIdeaTag('${esc(t)}')">&times;</button></span>`
  ).join('');
  area.innerHTML = pills + `<input class="tag-text-input" id="idea-tag-input" placeholder="${ideaTags.length ? '' : 'Add tag…'}" onkeydown="handleIdeaTagKey(event)">`;
}

function handleIdeaTagKey(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const val = e.target.value.trim().replace(',', '');
    if (val && !ideaTags.includes(val)) { ideaTags.push(val); renderIdeaTags(); setTimeout(() => document.getElementById('idea-tag-input')?.focus(), 0); }
    else e.target.value = '';
  }
}

function removeIdeaTag(tag) {
  ideaTags = ideaTags.filter(t => t !== tag);
  renderIdeaTags();
}

function saveIdea() {
  const title = document.getElementById('idea-title').value.trim();
  if (!title) { showToast('Please enter a title'); return; }
  if (editingIdeaId) {
    const idea = ideas.find(i => i.id === editingIdeaId);
    if (idea) { idea.title = title; idea.desc = document.getElementById('idea-desc').value.trim(); idea.tags = [...ideaTags]; }
  } else {
    ideas.push({ id: Date.now(), title, desc: document.getElementById('idea-desc').value.trim(), tags: [...ideaTags], createdAt: new Date().toISOString() });
  }
  closeModal('idea-modal-overlay');
  saveIdeas();
  renderIdeas();
}

function deleteIdea(id) {
  const idea = ideas.find(i => i.id === id);
  showConfirmModal('Delete Idea', idea ? `Delete <strong>${esc(idea.title)}</strong>? This cannot be undone.` : 'Delete this idea?', 'Delete', () => {
    ideas = ideas.filter(i => i.id !== id);
    saveIdeas();
    renderIdeas();
  }, true);
}

function convertIdeaToTask(id) {
  const idea = ideas.find(i => i.id === id);
  if (!idea) return;
  pushUndo('Convert idea to task');
  tasks.push({
    id: Date.now(), title: idea.title, desc: idea.desc || '',
    priority: 'medium', due: '', tags: [...(idea.tags||[])],
    completed: false, createdAt: new Date().toISOString(), completedAt: '',
    timeLogged: 0, timeSessions: [], impact: '', outcome: '', deliverable: '',
    estimate: 0, status: 'not-started', energy: 'medium', subtasks: [],
    recurrence: { type: 'none' },
  });
  ideas = ideas.filter(i => i.id !== id);
  saveTasks();
  saveIdeas();
  renderIdeas();
  showToast('Idea converted to task ✓');
}

async function saveIdeas() {
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      await api.ideasSave({ accessToken, spreadsheetId, ideas });
    } catch (e) { console.error('Ideas save error:', e); }
  }
  // Also keep a local copy in config
  api.saveConfig({ ideas });
}

async function loadIdeas() {
  ideas = [];
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      const remote = await api.ideasLoad({ accessToken, spreadsheetId });
      if (remote) ideas = remote;
    } catch (e) {
      console.error('Ideas load error:', e);
      try { const cfg = await api.loadConfig(); ideas = cfg && cfg.ideas ? cfg.ideas : []; } catch {}
    }
  } else {
    try { const cfg = await api.loadConfig(); ideas = cfg && cfg.ideas ? cfg.ideas : []; } catch { ideas = []; }
  }
  const cntEl = document.getElementById('cnt-ideas');
  if (cntEl) cntEl.textContent = ideas.length;
}

// ── Wins Board ────────────────────────────────────────────────────────────────
const WIN_MOODS = [
  { key: 'proud',    emoji: '💪', label: 'Proud' },
  { key: 'grateful', emoji: '🙏', label: 'Grateful' },
  { key: 'excited',  emoji: '🎉', label: 'Excited' },
  { key: 'relieved', emoji: '😌', label: 'Relieved' },
  { key: 'inspired', emoji: '✨', label: 'Inspired' },
];
const WIN_CATEGORIES = ['Work', 'Personal', 'Client', 'Milestone', 'Health', 'Learning', 'Other'];

function showWinsView() {
  document.getElementById('task-list-container').style.display = 'none';
  document.getElementById('kanban-container').style.display = 'none';
  document.getElementById('ideas-container').classList.remove('active');
  document.getElementById('habits-container').classList.remove('active');
  const bvcWV = document.getElementById('budget-view-container'); if (bvcWV) bvcWV.classList.remove('active');
  const cvcWV = document.getElementById('calendar-view-container'); if (cvcWV) { cvcWV.classList.remove('active'); }
  document.getElementById('wins-container').classList.add('active');
  kanbanMode = false; ideasMode = false; habitsMode = false; winsMode = true; budgetViewMode = false; calendarViewMode = false;
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
  const winsBtn = document.querySelector('[data-view="wins"]');
  if (winsBtn) winsBtn.classList.add('active');
  document.getElementById('view-title').textContent = 'Wins Board';
  renderWins();
}

function renderWins() {
  const container = document.getElementById('wins-container');
  if (!container) return;
  const cntEl = document.getElementById('cnt-wins');
  if (cntEl) cntEl.textContent = wins.length;

  const header = `
    <div class="wins-header">
      <div style="font-size:13px;color:var(--text3)">${wins.length} win${wins.length !== 1 ? 's' : ''}</div>
      <div style="display:flex;gap:8px">
        ${wins.length ? `<button class="btn-secondary wins-random-btn" onclick="showRandomWin()">🎲 Random Win</button>` : ''}
        <button class="btn-primary" onclick="openWinModal()">+ Add Win</button>
      </div>
    </div>`;

  if (!wins.length) {
    container.innerHTML = `
      <div class="wins-header">
        <div></div>
        <button class="btn-primary" onclick="openWinModal()">+ Add Win</button>
      </div>
      <div class="wins-empty">
        <div class="wins-empty-icon">⭐</div>
        <div class="wins-empty-title">Your Wins Board is empty</div>
        <div class="wins-empty-sub">Capture praise, achievements and moments you're proud of.<br>Come back here whenever you need a reminder of how far you've come.</div>
      </div>`;
    return;
  }

  const cards = wins.slice().reverse().map(win => {
    const mood = WIN_MOODS.find(m => m.key === win.mood);
    const moodBadge = mood ? `<span class="badge wins-mood-badge wins-mood-${win.mood}">${mood.emoji} ${mood.label}</span>` : '';
    const catBadge  = win.category ? `<span class="badge wins-cat-badge">${esc(win.category)}</span>` : '';
    const dateStr   = win.date ? fmtDate(win.date) : '';
    const source    = win.source ? `<div class="win-card-source">— ${esc(win.source)}</div>` : '';
    return `
      <div class="win-card">
        <div class="win-card-quote">"${esc(win.quote)}"</div>
        ${source}
        <div class="win-card-meta">
          ${moodBadge}${catBadge}
          ${dateStr ? `<span class="badge wins-date-badge">📅 ${dateStr}</span>` : ''}
        </div>
        <div class="win-card-actions">
          <button class="action-btn" onclick="openWinModal('${win.id}')" title="Edit">✎</button>
          <button class="action-btn delete" onclick="deleteWin('${win.id}')" title="Delete">✕</button>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = header + `<div class="wins-grid">${cards}</div>`;
}

function showRandomWin() {
  if (!wins.length) return;
  const win = wins[Math.floor(Math.random() * wins.length)];
  const mood = WIN_MOODS.find(m => m.key === win.mood);
  const overlay = document.getElementById('random-win-overlay');
  document.getElementById('rw-emoji').textContent  = mood ? mood.emoji : '⭐';
  document.getElementById('rw-quote').textContent  = `"${win.quote}"`;
  document.getElementById('rw-source').textContent = win.source ? `— ${win.source}` : '';
  document.getElementById('rw-source').style.display = win.source ? '' : 'none';
  const moodBadge = mood ? `<span class="badge wins-mood-badge wins-mood-${win.mood}">${mood.emoji} ${mood.label}</span>` : '';
  const catBadge  = win.category ? `<span class="badge wins-cat-badge">${esc(win.category)}</span>` : '';
  const dateStr   = win.date ? fmtDate(win.date) : '';
  const dateBadge = dateStr ? `<span class="badge wins-date-badge">📅 ${dateStr}</span>` : '';
  document.getElementById('rw-badges').innerHTML = moodBadge + catBadge + dateBadge;
  overlay.classList.add('open');
}

function openWinModal(id = null) {
  editingWinId = id || null;
  const isEdit = !!id;
  document.getElementById('win-modal-title').textContent = isEdit ? '✎ Edit Win' : '⭐ Add a Win';

  if (isEdit) {
    const win = wins.find(w => w.id === id);
    if (!win) return;
    document.getElementById('win-quote').value    = win.quote || '';
    document.getElementById('win-source').value   = win.source || '';
    document.getElementById('win-category').value = win.category || '';
    document.getElementById('win-date').value     = win.date || '';
    // Set mood
    document.querySelectorAll('.win-mood-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.mood === win.mood);
    });
  } else {
    document.getElementById('win-quote').value    = '';
    document.getElementById('win-source').value   = '';
    document.getElementById('win-category').value = '';
    document.getElementById('win-date').value     = todayStr();
    document.querySelectorAll('.win-mood-btn').forEach(b => b.classList.remove('selected'));
    // Default to 'proud'
    const defaultBtn = document.querySelector('.win-mood-btn[data-mood="proud"]');
    if (defaultBtn) defaultBtn.classList.add('selected');
  }
  document.getElementById('win-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('win-quote').focus(), 50);
}

function selectWinMood(btn) {
  document.querySelectorAll('.win-mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function saveWin() {
  const quote = document.getElementById('win-quote').value.trim();
  if (!quote) { showToast('Please enter the win or feedback'); return; }
  const source   = document.getElementById('win-source').value.trim();
  const category = document.getElementById('win-category').value;
  const date     = document.getElementById('win-date').value || todayStr();
  const moodBtn  = document.querySelector('.win-mood-btn.selected');
  const mood     = moodBtn ? moodBtn.dataset.mood : 'proud';

  if (editingWinId) {
    const win = wins.find(w => w.id === editingWinId);
    if (win) { win.quote = quote; win.source = source; win.category = category; win.date = date; win.mood = mood; }
  } else {
    wins.push({ id: String(Date.now()), quote, source, category, date, mood, createdAt: new Date().toISOString() });
  }
  closeModal('win-modal-overlay');
  saveWinsDebounced();
  renderWins();
  const cntEl = document.getElementById('cnt-wins');
  if (cntEl) cntEl.textContent = wins.length;
}

function deleteWin(id) {
  showConfirmModal('Delete Win', 'Delete this win? This cannot be undone.', 'Delete', () => {
    wins = wins.filter(w => w.id !== id);
    saveWinsDebounced ? saveWinsDebounced() : saveWins();
    renderWins();
    const cntEl = document.getElementById('cnt-wins');
    if (cntEl) cntEl.textContent = wins.length;
  }, true);
}

// Called from completion dialog — quick-add a win from a completed task
function addWinFromTask(taskTitle) {
  closeModal('completion-modal-overlay');
  document.getElementById('win-quote').value    = '';
  document.getElementById('win-source').value   = `Completed: ${taskTitle}`;
  document.getElementById('win-category').value = 'Milestone';
  document.getElementById('win-date').value     = todayStr();
  document.querySelectorAll('.win-mood-btn').forEach(b => b.classList.remove('selected'));
  const proudBtn = document.querySelector('.win-mood-btn[data-mood="proud"]');
  if (proudBtn) proudBtn.classList.add('selected');
  editingWinId = null;
  document.getElementById('win-modal-title').textContent = '⭐ Add a Win';
  document.getElementById('win-modal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('win-quote').focus(), 50);
}

async function saveWins() {
  api.saveConfig({ wins });
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      await api.winsSave({ accessToken, spreadsheetId, wins });
    } catch (e) { console.error('Wins save error:', e); }
  }
}

async function loadWins() {
  wins = [];
  if (!offlineMode && accessToken && spreadsheetId) {
    try {
      await ensureToken();
      const remote = await api.winsLoad({ accessToken, spreadsheetId });
      if (remote) wins = remote;
    } catch (e) {
      console.error('Wins load error:', e);
      try { const cfg = await api.loadConfig(); wins = cfg && cfg.wins ? cfg.wins : []; } catch {}
    }
  } else {
    try { const cfg = await api.loadConfig(); wins = cfg && cfg.wins ? cfg.wins : []; } catch { wins = []; }
  }
  const cntEl = document.getElementById('cnt-wins');
  if (cntEl) cntEl.textContent = wins.length;
}

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
  showConfirmModal(
    'Archive Tasks',
    'Archive <strong>' + toArchive.length + ' task' + (toArchive.length !== 1 ? 's' : '') + '</strong>? They will be moved to your Archived tab in Google Sheets.',
    'Archive',
    () => _doArchive(toArchive)
  );
}

async function _doArchive(toArchive) {
  const archivedTasks = toArchive.map(t => ({ ...t, archivedAt: new Date().toISOString() }));
  toArchive.forEach(t => {
    const task = tasks.find(x => x.id === t.id);
    if (task) { task.archived = true; task.archivedAt = new Date().toISOString(); }
  });
  closeModal('archive-modal-overlay');
  showToast('Archived ' + archivedTasks.length + ' task' + (archivedTasks.length !== 1 ? 's' : ''));
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

// ── Import from template ──────────────────────────────────────────────────────
function triggerImport() {
  closeModal('settings-modal-overlay');
  setTimeout(() => {
    const anchorEl = document.getElementById('import-anchor-date');
    const tagEl    = document.getElementById('import-extra-tag');
    if (anchorEl) anchorEl.value = '';
    if (tagEl)    tagEl.value   = '';
    document.getElementById('import-preview-summary').textContent = '';
    document.getElementById('import-preview-list').innerHTML = '';
    pendingImport = [];
    updateImportCount();
    document.getElementById('import-modal-overlay').classList.add('open');
  }, 200);
}

function triggerImportFilePicker() {
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-file-input').click();
}

let pendingImport = [];

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const anchorDate = (document.getElementById('import-anchor-date') || {}).value || '';
      const imported = parseTemplateCSV(e.target.result, anchorDate);
      if (!imported.length) {
        showToast('No tasks found in file — check it is a valid TaskSpark CSV');
        return;
      }
      showImportPreview(imported);
    } catch (err) {
      showToast('Could not read file — check it is a valid TaskSpark CSV');
    }
  };
  reader.readAsText(file);
}

function showImportPreview(imported) {
  pendingImport = imported;
  const pColor = { high: 'var(--red)', medium: 'var(--amber)', low: 'var(--blue)' };
  document.getElementById('import-preview-summary').textContent =
    `${imported.length} task${imported.length !== 1 ? 's' : ''} found — select which ones to import then click Import Tasks.`;
  document.getElementById('import-preview-list').innerHTML = imported.map((t, i) => `
    <div style="padding:12px 14px;background:var(--surface2);border-radius:var(--radius);border:1px solid var(--border);display:flex;gap:12px;align-items:flex-start">
      <input type="checkbox" class="import-task-cb" data-index="${i}" checked
        style="width:16px;height:16px;margin-top:2px;accent-color:var(--accent);cursor:pointer;flex-shrink:0"
        onchange="updateImportCount()">
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:3px">${esc(t.title)}</div>
        ${t.desc ? `<div style="font-size:12px;color:var(--text3);margin-bottom:5px;line-height:1.5">${esc(t.desc)}</div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          <span style="font-size:11px;font-weight:600;color:${pColor[t.priority]||'var(--text3)'}">${t.priority}</span>
          ${t.estimate ? `<span style="font-size:11px;color:var(--text3)">~${t.estimate}m</span>` : ''}
          ${(t.tags||[]).map(tag => `<span style="font-size:11px;background:var(--accent-l);color:var(--accent);padding:1px 6px;border-radius:4px">${esc(tag)}</span>`).join('')}
        </div>
      </div>
    </div>`).join('');
  const selectAll = document.getElementById('import-select-all');
  if (selectAll) selectAll.checked = true;
  updateImportCount();
  document.getElementById('import-modal-overlay').classList.add('open');
}

function updateImportCount() {
  const checked = document.querySelectorAll('.import-task-cb:checked').length;
  const total = document.querySelectorAll('.import-task-cb').length;
  const btn = document.getElementById('import-confirm-btn');
  if (btn) btn.textContent = checked === 0 ? 'Import Tasks' : `Import ${checked} Task${checked !== 1 ? 's' : ''}`;
  const selectAll = document.getElementById('import-select-all');
  if (selectAll) selectAll.checked = checked === total;
}

function toggleImportSelectAll(checked) {
  document.querySelectorAll('.import-task-cb').forEach(cb => cb.checked = checked);
  updateImportCount();
}

function confirmImport() {
  const checked = [...document.querySelectorAll('.import-task-cb:checked')].map(cb => parseInt(cb.dataset.index));
  if (!checked.length) { showToast('No tasks selected'); return; }
  const extraTag = ((document.getElementById('import-extra-tag') || {}).value || '').trim();
  const toImport = checked.map(i => {
    const task = pendingImport[i];
    if (extraTag) {
      task.tags = [...new Set([...(task.tags || []), extraTag])];
    }
    return task;
  });
  pushUndo('Import template');
  tasks.push(...toImport);
  pendingImport = [];
  saveTasks();
  renderAll();
  closeModal('import-modal-overlay');
  showToast(`✓ Imported ${toImport.length} task${toImport.length !== 1 ? 's' : ''}`);
}

function parseTemplateCSV(csv, anchorDate, extraTag) {
  const lines = csv.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length < 2) return [];
  const headers = parseCSVRow(lines[0]);
  const col = (name) => headers.indexOf(name);

  function resolveDate(rawDue) {
    if (!rawDue) return '';
    const m = rawDue.match(/^T([+-]?\d+)$/i);
    if (m) {
      if (!anchorDate) return '';
      const offset = parseInt(m[1]);
      const base = new Date(anchorDate + 'T00:00:00');
      base.setMonth(base.getMonth() + offset);
      const yyyy = base.getFullYear();
      const mm = String(base.getMonth() + 1).padStart(2, '0');
      const dd = String(base.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return rawDue;
  }

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (!row[col('title')] || !row[col('title')].trim()) continue;

    const subtaskRaw = col('subtasks') >= 0 ? (row[col('subtasks')] || '') : '';
    const subtasks = subtaskRaw
      ? subtaskRaw.split('|').map(s => s.trim()).filter(Boolean).map((s, si) => ({
          id: Date.now() + i * 1000 + si,
          title: s,
          completed: false
        }))
      : [];

    const linksRaw = col('links') >= 0 ? (row[col('links')] || '') : '';
    const attachments = linksRaw
      ? linksRaw.split('|').map(u => u.trim()).filter(Boolean).map(u => {
          const path = /^https?:\/\//i.test(u) ? u : 'https://' + u;
          let name = u;
          try { name = new URL(path).hostname.replace(/^www\./, ''); } catch {}
          return { type: 'link', name, path };
        })
      : [];

    const csvTags = col('tags') >= 0 && row[col('tags')]
      ? row[col('tags')].split(',').map(t => t.trim()).filter(Boolean)
      : [];
    const tags = extraTag ? [...new Set([...csvTags, extraTag.trim()])] : csvTags;

    results.push({
      id: Date.now() + i,
      title: row[col('title')] || '',
      desc: row[col('desc')] || '',
      priority: row[col('priority')] || 'medium',
      due: resolveDate(row[col('due')] || ''),
      dueTime: row[col('dueTime')] || '',
      tags,
      energy: row[col('energy')] || 'medium',
      status: row[col('status')] || 'not-started',
      estimate: parseInt(row[col('estimate')]) || 0,
      completed: false, archived: false,
      createdAt: new Date().toISOString(),
      completedAt: '', timeLogged: 0, timeSessions: [],
      impact: '', outcome: '', deliverable: '',
      subtasks, attachments, recurrence: { type: 'none' },
    });
  }
  return results;
}

function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
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
  checkOnboardingItem('mood');
  // Save to mood history in Google Sheets
  if (!offlineMode && accessToken && spreadsheetId) {
    saveMoodHistory(todayStr(), mood);
  }
}

async function saveMoodHistory(date, mood) {
  try {
    await ensureToken();
    await api.moodAppend({ accessToken, spreadsheetId, date, mood });
  } catch (e) {
    console.warn('Failed to save mood history:', e);
  }
}

// ── What's New ───────────────────────────────────────────────────────────────
let cachedRelease = null;


// ── Start of Day / End of Day ────────────────────────────────────────────────

function checkStartOfDay() {
  if (!settings.sodEnabled) return;
  const key = 'taskspark_sod_shown';
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    if (stored && stored.date === todayStr()) return;
  } catch {}
  try { localStorage.setItem(key, JSON.stringify({ date: todayStr() })); } catch {}
  setTimeout(showStartOfDayModal, 800);
}

function showStartOfDayModal() {
  const today = todayStr();
  const s = settings;
  const dueToday = tasks.filter(t => !t.completed && t.due === today);
  const overdue  = tasks.filter(t => !t.completed && t.due && t.due < today);
  const sodHour = new Date().getHours();
  const sodGreeting = sodHour < 12 ? 'Good morning' : sodHour < 17 ? 'Good afternoon' : 'Good evening';
  const sodIcon = sodHour < 12 ? '☀' : sodHour < 17 ? '🌤' : '🌙';
  let html = `<div style="font-size:22px;margin-bottom:4px">${sodIcon}</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px">${sodGreeting}!</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:20px">Here's your day at a glance</div>`;
  if (s.sodShowDueToday) {
    html += `<div style="margin-bottom:14px;text-align:left">
      <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent);margin-bottom:8px">Due Today</div>`;
    if (dueToday.length) {
      html += dueToday.map(t => `<div style="padding:8px 12px;background:var(--surface2);border-radius:var(--radius);font-size:13px;color:var(--text);margin-bottom:6px;text-align:left;border-left:3px solid var(--accent)">${esc(t.title)}</div>`).join('');
    } else {
      html += `<div style="font-size:13px;color:var(--text3);padding:8px 0">Nothing due today ✓</div>`;
    }
    html += `</div>`;
  }
  if (s.sodShowOverdue && overdue.length) {
    html += `<div style="margin-bottom:14px;text-align:left">
      <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--red);margin-bottom:8px">Overdue</div>`;
    html += overdue.map(t => `<div style="padding:8px 12px;background:var(--surface2);border-radius:var(--radius);font-size:13px;color:var(--text);margin-bottom:6px;text-align:left;border-left:3px solid var(--red)">${esc(t.title)}</div>`).join('');
    html += `</div>`;
  }
  if (s.sodShowMood) {
    const mood = getTodayMood();
    if (!mood) {
      html += `<div style="margin-bottom:14px;text-align:left">
        <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Mood Check-in</div>
        <div style="display:flex;gap:10px;justify-content:flex-start">
          <button onclick="selectMood('sad');closeModal('sod-modal-overlay')" style="flex:1;padding:10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);font-size:18px;cursor:pointer">😔</button>
          <button onclick="selectMood('neutral');closeModal('sod-modal-overlay')" style="flex:1;padding:10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);font-size:18px;cursor:pointer">😐</button>
          <button onclick="selectMood('happy');closeModal('sod-modal-overlay')" style="flex:1;padding:10px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface2);font-size:18px;cursor:pointer">😊</button>
        </div>
      </div>`;
    }
  }
  const overlay = document.getElementById('sod-modal-overlay');
  const content = document.getElementById('sod-modal-content');
  if (!overlay || !content) return;
  content.innerHTML = html;
  overlay.classList.add('open');
}

let _eodTimer = null;

function scheduleEod() {
  if (_eodTimer) { clearTimeout(_eodTimer); _eodTimer = null; }
  if (!settings.eodEnabled || !settings.eodTime) return;
  const [h, m] = settings.eodTime.split(':').map(Number);
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0);
  if (target <= now) return;
  const ms = target - now;
  _eodTimer = setTimeout(showEndOfDayModal, ms);
}

function showEndOfDayModal() {
  const today = todayStr();
  const s = settings;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = dateToLocalStr(tomorrow);
  const completedToday = tasks.filter(t => t.completed && t.completedAt && dateToLocalStr(new Date(t.completedAt)) === today);
  const dueTomorrow    = tasks.filter(t => !t.completed && t.due === tomorrowStr);
  let html = `<div style="font-size:22px;margin-bottom:4px">🌙</div>
    <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:4px">End of Day</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:20px">Here's how today went</div>`;
  if (s.eodShowCompleted) {
    html += `<div style="margin-bottom:14px;text-align:left">
      <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--accent);margin-bottom:8px">Completed Today</div>`;
    if (completedToday.length) {
      html += completedToday.map(t => `<div style="padding:8px 12px;background:var(--surface2);border-radius:var(--radius);font-size:13px;color:var(--text);margin-bottom:6px;text-align:left;border-left:3px solid var(--accent)">✓ ${esc(t.title)}</div>`).join('');
    } else {
      html += `<div style="font-size:13px;color:var(--text3);padding:8px 0">No tasks completed today</div>`;
    }
    html += `</div>`;
  }
  if (s.eodShowTomorrow) {
    html += `<div style="margin-bottom:14px;text-align:left">
      <div style="font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text3);margin-bottom:8px">Due Tomorrow</div>`;
    if (dueTomorrow.length) {
      html += dueTomorrow.map(t => `<div style="padding:8px 12px;background:var(--surface2);border-radius:var(--radius);font-size:13px;color:var(--text);margin-bottom:6px;text-align:left;border-left:3px solid var(--border)">${esc(t.title)}</div>`).join('');
    } else {
      html += `<div style="font-size:13px;color:var(--text3);padding:8px 0">Nothing due tomorrow ✓</div>`;
    }
    html += `</div>`;
  }
  if (s.eodShowStreak) {
    const streak = parseInt(document.getElementById('streak-count')?.textContent) || 0;
    const msg = completedToday.length
      ? `You completed ${completedToday.length} task${completedToday.length > 1 ? 's' : ''} today${streak > 0 ? ` — ${streak} day streak! ★` : '!'}`
      : `Rest well — tomorrow is a new day.`;
    html += `<div style="padding:14px 16px;background:var(--accent-l);border-radius:var(--radius);font-size:13px;color:var(--accent);font-weight:600;text-align:left;margin-bottom:4px">${msg}</div>`;
  }
  const overlay = document.getElementById('eod-modal-overlay');
  const content = document.getElementById('eod-modal-content');
  if (!overlay || !content) return;
  content.innerHTML = html;
  overlay.classList.add('open');
}

function toggleSodEodSettings() {
  // Sub-options now live in Feature Settings — no DOM manipulation needed here
}

async function checkWhatsNew(currentVersion) {
  try {
    const cfg = await api.loadConfig();
    const lastSeen = cfg && cfg.lastSeenVersion;
    if (lastSeen === currentVersion) return; // already seen this version — don't show modal
    const res = await fetch('https://api.github.com/repos/janasridler-web/TaskSpark/releases/latest');
    const release = await res.json();
    if (!release || !release.tag_name) return;
    cachedRelease = release;
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
  const body = release.body || 'No changelog available for this release.';
  bodyEl.textContent = body;
  overlay.classList.add('open');
}

function closeWhatsNew() {
  document.getElementById('whatsnew-modal-overlay').classList.remove('open');
  api.saveConfig({ lastSeenVersion: api.getVersion() });
}

// ── V4 onboarding (preset modal) ─────────────────────────────────────────────
function startOnboarding() {
  const modal = document.getElementById('onboarding-modal');
  if (modal) modal.classList.add('open');
}

function closeOnboardingModal() {
  const modal = document.getElementById('onboarding-modal');
  if (modal) modal.classList.remove('open');
  api.saveConfig({ onboardingComplete: true, onboardingChecklist });
  if (workspaceSetupPending) showWorkspaceSetupModal();
}

function applyOnboardingPreset(preset) {
  if (preset === 'custom') applyCustomPreset();
  else applyPreset(preset);
  closeOnboardingModal();
}

function applyPreset(preset) {
  if (preset === 'basic') {
    settings.breakEnabled = false; settings.tagsEnabled = false;
    settings.streakEnabled = true; settings.estimatesEnabled = false; settings.timerEnabled = false;
    settings.dueEnabled = false; settings.dueTimeEnabled = false;
    settings.quickAddEnabled = false; settings.whatNowEnabled = true;
    settings.completionDialog = false; settings.soundEnabled = false;
    settings.moodEnabled = true; settings.energyEnabled = false;
    settings.statusEnabled = false; settings.subtasksEnabled = false;
    settings.recurrenceEnabled = false; settings.kanbanEnabled = false;
    settings.workspacesEnabled = false; settings.ideasEnabled = false;
    settings.habitsEnabled = false; settings.winsEnabled = false;
    settings.sodEnabled = false; settings.eodEnabled = false;
    settings.budgetEnabled = false; settings.attachmentsEnabled = false; settings.calendarEnabled = false;
  } else if (preset === 'full') {
    settings.tagsEnabled = true; settings.streakEnabled = true;
    settings.estimatesEnabled = true; settings.timerEnabled = true; settings.quickAddEnabled = true;
    settings.whatNowEnabled = true; settings.completionDialog = true;
    settings.moodEnabled = true; settings.energyEnabled = true;
    settings.statusEnabled = true; settings.soundEnabled = true;
    settings.breakEnabled = true; settings.dueTimeEnabled = true;
    settings.budgetEnabled = true; settings.attachmentsEnabled = true; settings.calendarEnabled = true;
    settings.subtasksEnabled = true; settings.recurrenceEnabled = true;
    settings.kanbanEnabled = true; settings.workspacesEnabled = true;
    settings.ideasEnabled = true; settings.habitsEnabled = true;
    settings.winsEnabled = true; settings.sodEnabled = true;
    settings.eodEnabled = true; settings.dueEnabled = true;
  }
  api.saveConfig({ settings });
  applySettings();
  if (typeof renderAll === 'function') renderAll();
  if (preset === 'basic') showToast('Basic mode set — start simple, add more later!');
  if (preset === 'full')  showToast('Full mode set — all features on!');
}

function applyCustomPreset() {
  setTimeout(() => openSettings(), 200);
}

// ── V4 onboarding "Get started" inline card ──────────────────────────────────
function checkOnboardingItem(key) {
  if (!onboardingChecklist.hasOwnProperty(key)) return;
  if (onboardingChecklist.dismissed || onboardingChecklist[key]) return;
  onboardingChecklist[key] = true;
  api.saveConfig({ onboardingChecklist });
  renderGettingStartedCard();
}

function dismissGettingStarted() {
  onboardingChecklist.dismissed = true;
  api.saveConfig({ onboardingChecklist });
  const card = document.getElementById('getting-started-card');
  if (card) card.remove();
}

function renderGettingStartedCard() {
  if (onboardingChecklist.dismissed) return;
  const container = document.getElementById('task-list-container');
  const taskList  = document.getElementById('task-list');
  if (!container || !taskList) return;

  const items = [
    { key: 'addTask',      label: 'Add your first task',  hint: '',                                action: 'openTaskModal()' },
    { key: 'completeTask', label: 'Complete a task',       hint: 'Check off any task on your list', action: null },
    { key: 'whatNow',      label: 'Try "What Now?"',       hint: '',                                action: 'whatNow()' },
    { key: 'mood',         label: "Set today's mood",      hint: '',                                action: 'openMoodModal()' },
  ];

  const doneCount = items.filter(i => onboardingChecklist[i.key]).length;
  if (doneCount === items.length) {
    const card = document.getElementById('getting-started-card');
    if (card) card.remove();
    return;
  }

  const pct = Math.round(doneCount / items.length * 100);
  const itemsHtml = items.map(i => {
    const done = onboardingChecklist[i.key];
    const hint = (!done && i.hint) ? `<span style="font-size:11px;color:var(--text3);margin-left:4px">${i.hint}</span>` : '';
    const clickAttr = (!done && i.action) ? `onclick="${i.action}"` : '';
    return `<div class="gs-item${done ? ' done' : ''}" ${clickAttr}>
      <div class="gs-check">${done ? '✓' : ''}</div>
      <span>${i.label}</span>${hint}
    </div>`;
  }).join('');

  const html = `
    <div class="gs-header">
      <div>
        <div class="gs-title">Get started</div>
        <div class="gs-sub">${doneCount} of ${items.length} complete</div>
      </div>
      <button class="gs-dismiss" onclick="dismissGettingStarted()" title="Dismiss">✕</button>
    </div>
    <div class="gs-progress"><div class="gs-progress-fill" style="width:${pct}%"></div></div>
    <div class="gs-items">${itemsHtml}</div>`;

  let card = document.getElementById('getting-started-card');
  if (card) {
    card.innerHTML = html;
  } else {
    card = document.createElement('div');
    card.id = 'getting-started-card';
    card.innerHTML = html;
    container.insertBefore(card, taskList);
  }
}

function openChangelog() {
  openSettings();
  setTimeout(() => {
    const tab = document.querySelector('[onclick*="changelog"]');
    if (tab) tab.click();
    loadChangelogContent();
  }, 100);
}

async function loadChangelogContent() {
  const el = document.getElementById('changelog-content');
  if (!el) return;
  try {
    if (cachedRelease) { el.textContent = cachedRelease.body || 'No changelog available.'; return; }
    el.textContent = 'Loading…';
    const res = await fetch('https://api.github.com/repos/janasridler-web/TaskSpark/releases/latest');
    const release = await res.json();
    cachedRelease = release;
    el.textContent = release.body || 'No changelog available.';
  } catch (e) { el.textContent = 'Could not load changelog.'; }
}

function updateChangelogSidebarBtn() {
  const btn = document.getElementById('changelog-sidebar-btn');
  if (btn) btn.style.display = settings.changelogEnabled !== false ? '' : 'none';
  // Also rebuild mobile drawer if open
  if (document.getElementById('mobile-drawer')?.classList.contains('open')) {
    if (typeof buildMobileDrawer === 'function') buildMobileDrawer();
  }
}


// ── Performance ─────────────────────────────────────────────────────────────


// ── Styled Confirm Modal ───────────────────────────────────────────────────────
let _confirmCallback = null;
let _cancelCallback = null;

function showConfirmModal(title, bodyHtml, okLabel, callback, danger = false, cancelCallback = null) {
  _confirmCallback = callback;
  _cancelCallback = cancelCallback;
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-body').innerHTML = bodyHtml;
  const okBtn = document.getElementById('confirm-modal-ok');
  okBtn.textContent = okLabel || 'Confirm';
  okBtn.style.background = danger ? 'var(--red)' : '';
  okBtn.style.borderColor = danger ? 'var(--red)' : '';
  document.getElementById('confirm-modal-overlay').classList.add('open');
}

function closeConfirmModal() {
  const cb = _cancelCallback;
  _confirmCallback = null;
  _cancelCallback = null;
  document.getElementById('confirm-modal-overlay').classList.remove('open');
  if (cb) cb();
}

function confirmModalOk() {
  const cb = _confirmCallback;
  _confirmCallback = null;
  _cancelCallback = null;
  document.getElementById('confirm-modal-overlay').classList.remove('open');
  if (cb) cb();
}

// ── Workspaces ────────────────────────────────────────────────────────────────


async function prefetchAllWorkspaces() {
  // Silently fetch all non-active workspaces in the background after startup
  const others = workspaces.filter(w => w.id !== activeWorkspaceId);
  for (const ws of others) {
    try {
      await ensureToken();
      const [wsTasks, wsHabits, wsIdeas, wsWins] = await Promise.all([
        api.sheetsLoad({ accessToken, spreadsheetId: ws.spreadsheetId }).catch(() => []),
        api.habitsLoad({ accessToken, spreadsheetId: ws.spreadsheetId }).catch(() => []),
        api.ideasLoad({ accessToken, spreadsheetId: ws.spreadsheetId }).catch(() => []),
        api.winsLoad({ accessToken, spreadsheetId: ws.spreadsheetId }).catch(() => []),
      ]);
      _wsCache[ws.id] = {
        tasks: wsTasks || [],
        habits: wsHabits || [],
        ideas: wsIdeas || [],
        wins: wsWins || [],
      };
    } catch (e) {
      console.warn(`[prefetch] Failed for workspace ${ws.name}:`, e.message);
    }
  }
}


function setWorkspaceSwitching(name) {
  const btn = document.getElementById('workspace-dropdown-btn');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid var(--border2);border-top-color:var(--accent);border-radius:50%;animation:ws-spin .6s linear infinite;flex-shrink:0;margin-right:8px"></span><span style="flex:1;color:var(--text2)">Switching to ${esc(name)}…</span>`;
}

function clearWorkspaceSwitching() {
  const btn = document.getElementById('workspace-dropdown-btn');
  if (!btn) return;
  btn.disabled = false;
  renderWorkspaceDropdown();
}

function getActiveWorkspace() {
  return workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0] || null;
}

function isReadOnly() {
  const ws = getActiveWorkspace();
  return !!(ws && ws.readOnly);
}

async function saveWorkspaces() {
  await api.workspacesSave({ workspaces, activeWorkspaceId });
  // Also save to TaskSpark-Config spreadsheet so desktop and web stay in sync
  if (accessToken) {
    try {
      await ensureToken();
      const result = await api.driveWorkspacesSave({
        accessToken,
        configSheetId: configSheetId || null,
        data: { workspaces, activeWorkspaceId }
      });
      if (result && result.id) {
        configSheetId = result.id;
        // Persist configSheetId so we don't need to search Drive every time
        api.saveConfig({ configSheetId });
      }
    } catch (e) { console.error('[saveWorkspaces] Drive sync failed:', e.message); showToast('Warning: workspace sync failed'); }
  }
}

function updateWorkspaceTitle() {
  const ws = getActiveWorkspace();
  const el = document.getElementById('workspace-title');
  const badge = document.getElementById('ws-readonly-badge');
  if (!el) return;
  if (ws) {
    const colour = WORKSPACE_COLOURS.find(c => c.id === ws.colour);
    el.textContent = ws.name;
    el.style.color = colour ? colour.hex : 'var(--accent)';
    el.style.display = 'inline-block';
  } else {
    el.style.display = 'none';
  }
  if (badge) badge.style.display = (ws && ws.readOnly) ? 'inline-block' : 'none';

  const ro = !!(ws && ws.readOnly);
  const newTaskBtn = document.getElementById('new-task-btn') || document.querySelector('.btn-new-task');
  if (newTaskBtn) newTaskBtn.style.display = ro ? 'none' : '';
}

function renderWorkspaceDropdown() {
  const btn = document.getElementById('workspace-dropdown-btn');
  const menu = document.getElementById('workspace-dropdown-menu');
  if (!btn || !menu) return;

  const ws = getActiveWorkspace();
  const colour = ws ? (WORKSPACE_COLOURS.find(c => c.id === ws.colour) || WORKSPACE_COLOURS[0]) : WORKSPACE_COLOURS[0];

  btn.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colour.hex};margin-right:6px;flex-shrink:0"></span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ws ? ws.name : 'My Workspace'}</span><span style="margin-left:4px;font-size:10px;color:var(--text3)">▾</span>`;

  menu.innerHTML = workspaces.map(w => {
    const c = WORKSPACE_COLOURS.find(x => x.id === w.colour) || WORKSPACE_COLOURS[0];
    const isActive = w.id === activeWorkspaceId;
    const sharedIcon = w.shared ? `<span style="font-size:11px;color:var(--text3);margin-right:4px" title="Shared workspace">⇄</span>` : '';
    return `<div class="ws-menu-item${isActive ? ' ws-active' : ''}" onclick="switchWorkspace('${w.id}')">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.hex};margin-right:8px;flex-shrink:0"></span>
      <span style="flex:1">${esc(w.name)}</span>
      ${sharedIcon}
      ${isActive ? '<span style="color:var(--accent);font-size:12px">✓</span>' : ''}
    </div>`;
  }).join('') +
  `<div class="ws-menu-divider"></div>` +
  (workspaces.length < MAX_WORKSPACES ? `<div class="ws-menu-item" onclick="openNewWorkspaceModal()"><span style="margin-right:8px">+</span>New Workspace</div>` : `<div class="ws-menu-item ws-disabled"><span style="margin-right:8px">+</span>Max ${MAX_WORKSPACES} workspaces</div>`) +
  `<div class="ws-menu-item" onclick="openAddSharedWorkspaceModal()"><span style="margin-right:8px">⇄</span>Add Shared Workspace</div>` +
  `<div class="ws-menu-item" onclick="openManageWorkspacesModal()"><span style="margin-right:8px">⚙</span>Manage Workspaces</div>`;
}

function toggleWorkspaceDropdown(e) {
  e.stopPropagation();
  const menu = document.getElementById('workspace-dropdown-menu');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  closeWorkspaceDropdown();
  if (!isOpen) {
    menu.classList.add('open');
    renderWorkspaceDropdown();
  }
}

function closeWorkspaceDropdown() {
  const menu = document.getElementById('workspace-dropdown-menu');
  if (menu) menu.classList.remove('open');
}

async function switchWorkspace(id) {
  closeWorkspaceDropdown();
  if (id === activeWorkspaceId) return;

  const target = workspaces.find(w => w.id === id);
  if (!target) return;
  setWorkspaceSwitching(target.name);

  try {
    // Snapshot current data into cache before leaving
    _wsCache[activeWorkspaceId] = {
      tasks: [...tasks],
      habits: [...habits],
      ideas: [...ideas],
      wins: [...wins],
    };

    activeWorkspaceId = id;
    spreadsheetId = target.spreadsheetId;

    // Apply per-workspace settings if they exist
    if (target.settings) {
      settings = { ...DEFAULT_SETTINGS, ...target.settings };
      applySettings();
    }

    await saveWorkspaces();
    updateWorkspaceTitle();
    renderWorkspaceDropdown();

    // If we have pre-fetched data, show instantly then sync in background
    if (_wsCache[id]) {
      tasks   = _wsCache[id].tasks   || [];
      habits  = _wsCache[id].habits  || [];
      ideas   = _wsCache[id].ideas   || [];
      wins    = _wsCache[id].wins    || [];
      renderAll();
      updateHabitsSidebar();
      const cntIdeas = document.getElementById('cnt-ideas');
      if (cntIdeas) cntIdeas.textContent = ideas.length;
      const cntWins = document.getElementById('cnt-wins');
      if (cntWins) cntWins.textContent = wins.length;
      clearWorkspaceSwitching();
      showToast(`Switched to ${target.name}`);
      // Background sync to pick up any remote changes
      setTimeout(async () => {
        await api.saveCache([]);
        await connectToSheets();
        await Promise.all([loadHabits(), loadIdeas(), loadWins()]);
        _wsCache[id] = { tasks: [...tasks], habits: [...habits], ideas: [...ideas], wins: [...wins] };
      }, 500);
    } else {
      // No cache yet — load fresh
      tasks = []; habits = []; ideas = []; wins = [];
      await api.saveCache([]);
      renderAll();
      await connectToSheets();
      await Promise.all([loadHabits(), loadIdeas(), loadWins()]);
      _wsCache[id] = { tasks: [...tasks], habits: [...habits], ideas: [...ideas], wins: [...wins] };
      clearWorkspaceSwitching();
      showToast(`Switched to ${target.name}`);
    }
  } catch (e) {
    console.error('[switchWorkspace] error:', e.message);
    clearWorkspaceSwitching();
    showToast('Switch failed — please try again');
  }
}

// ── First-run welcome modal (V3.5.1) ───────────────────────────────────────
// Presents new users with a friendly choice instead of the bare restore picker.
let welcomeModalResolver = null;

function showFirstRunWelcomeModal(opts = {}) {
  return new Promise((resolve) => {
    welcomeModalResolver = resolve;
    const overlay = document.getElementById('welcome-modal-overlay');
    if (!overlay) { resolve(); return; }
    overlay.classList.add('open');
  });
}

function hideFirstRunWelcomeModal() {
  const overlay = document.getElementById('welcome-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

function welcomeGetStarted() {
  hideFirstRunWelcomeModal();
  if (workspaces.length === 0) workspaceSetupPending = true;
  if (welcomeModalResolver) { const r = welcomeModalResolver; welcomeModalResolver = null; r(); }
  setTimeout(() => {
    showConfirmModal(
      'Quick tour?',
      'Would you like to set up TaskSpark before creating your workspace?',
      'Set up',
      () => startOnboarding(),
      false,
      () => { if (workspaceSetupPending) showWorkspaceSetupModal(); }
    );
  }, 500);
}

async function welcomeRestoreExisting() {
  hideFirstRunWelcomeModal();
  try {
    const pickedId = await openConfigPickerWeb(accessToken);
    if (pickedId) {
      configSheetId = pickedId;
      api.saveConfig({ configSheetId });
      const restored = await api.driveWorkspacesLoad({ accessToken, configSheetId });
      if (restored && restored.data && restored.data.workspaces && restored.data.workspaces.length) {
        workspaces = restored.data.workspaces;
        activeWorkspaceId = restored.data.activeWorkspaceId || workspaces[0].id;
        await api.workspacesSave({ workspaces, activeWorkspaceId });
        const active = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
        if (active) {
          spreadsheetId = active.spreadsheetId;
          activeWorkspaceId = active.id;
          if (active.settings) { settings = { ...DEFAULT_SETTINGS, ...active.settings }; applySettings(); }
        }
        renderWorkspaceDropdown();
        updateWorkspaceTitle();
      }
    }
  } catch (e) { console.warn('[welcome] restore failed:', e.message); }
  if (welcomeModalResolver) { const r = welcomeModalResolver; welcomeModalResolver = null; r(); }
}

// ── First-time setup modal (for V2 → V3 upgrade) ──────────────────────────
function showWorkspaceSetupModal() {
  const overlay = document.getElementById('ws-setup-modal-overlay');
  if (overlay) overlay.classList.add('open');
  setTimeout(() => {
    const nameInput = document.getElementById('ws-setup-name');
    if (nameInput) { nameInput.value = ''; nameInput.focus(); }
  }, 100);
}

async function confirmWorkspaceSetup() {
  const nameInput = document.getElementById('ws-setup-name');
  const name = (nameInput ? nameInput.value.trim() : '') || 'My Workspace';
  const colourId = document.querySelector('.ws-colour-btn.selected')?.dataset.colour || 'green';

  const ws = {
    id: 'ws_' + Date.now(),
    name,
    colour: colourId,
    spreadsheetId,
    settings: null,
  };
  workspaces = [ws];
  activeWorkspaceId = ws.id;
  await saveWorkspaces();

  const overlay = document.getElementById('ws-setup-modal-overlay');
  if (overlay) overlay.classList.remove('open');

  workspaceSetupPending = false;
  updateWorkspaceTitle();
  renderWorkspaceDropdown();
  showToast('Workspace set up!');
}

// ── New workspace modal ────────────────────────────────────────────────────
function openNewWorkspaceModal() {
  closeWorkspaceDropdown();
  if (workspaces.length >= MAX_WORKSPACES) {
    showToast(`Maximum ${MAX_WORKSPACES} workspaces allowed`);
    return;
  }
  const overlay = document.getElementById('ws-new-modal-overlay');
  if (!overlay) return;
  const input = document.getElementById('ws-new-name');
  if (input) input.value = '';
  // Reset colour selection
  document.querySelectorAll('#ws-new-modal-overlay .ws-colour-btn').forEach(b => b.classList.remove('selected'));
  const first = document.querySelector('#ws-new-modal-overlay .ws-colour-btn');
  if (first) first.classList.add('selected');
  overlay.classList.add('open');
}

function closeNewWorkspaceModal() {
  const overlay = document.getElementById('ws-new-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

// ── Add Shared Workspace ───────────────────────────────────────────────────
function openAddSharedWorkspaceModal() {
  closeWorkspaceDropdown();
  const overlay = document.getElementById('ws-shared-modal-overlay');
  if (!overlay) return;
  const input = document.getElementById('ws-shared-url');
  if (input) input.value = '';
  const status = document.getElementById('ws-shared-status');
  if (status) status.textContent = '';
  const howTo = document.getElementById('ws-shared-howto');
  if (howTo) howTo.style.display = 'none';
  const arrow = document.getElementById('ws-shared-howto-arrow');
  if (arrow) arrow.textContent = '▸';
  overlay.classList.add('open');
}

function closeAddSharedWorkspaceModal() {
  const overlay = document.getElementById('ws-shared-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

function toggleSharedWorkspaceHowTo() {
  const howTo = document.getElementById('ws-shared-howto');
  const arrow = document.getElementById('ws-shared-howto-arrow');
  if (!howTo) return;
  const isOpen = howTo.style.display !== 'none';
  howTo.style.display = isOpen ? 'none' : 'block';
  if (arrow) arrow.textContent = isOpen ? '▸' : '▾';
}

function extractSpreadsheetId(url) {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

async function confirmAddSharedWorkspace() {
  const urlInput = document.getElementById('ws-shared-url');
  const nameInput = document.getElementById('ws-shared-name');
  const statusEl = document.getElementById('ws-shared-status');
  const url = urlInput ? urlInput.value.trim() : '';

  if (!url) { if (statusEl) statusEl.textContent = 'Please paste the Google Sheet URL.'; return; }

  const sheetId = extractSpreadsheetId(url);
  if (!sheetId) { if (statusEl) statusEl.textContent = "That doesn't look like a valid Google Sheet URL."; return; }

  if (!accessToken) { if (statusEl) statusEl.textContent = 'You must be signed in to Google first.'; return; }

  if (statusEl) statusEl.textContent = 'Connecting…';

  try {
    await ensureToken();

    // Fetch sheet metadata to validate access and get title
    const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (metaRes.status === 403 || metaRes.status === 404) {
      if (statusEl) statusEl.textContent = 'Sheet not accessible. Make sure the owner has shared it with your Google account.';
      return;
    }
    if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);

    const meta = await metaRes.json();
    const sheetTitle = meta.properties?.title || 'Shared Workspace';

    // Check if already added
    if (workspaces.find(w => w.spreadsheetId === sheetId)) {
      if (statusEl) statusEl.textContent = 'This workspace has already been added.';
      return;
    }

    // Detect read-only by attempting a no-op batchUpdate
    let readOnly = false;
    try {
      const writeTest = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [] })
      });
      if (writeTest.status === 403) readOnly = true;
    } catch { readOnly = false; }

    const customName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : sheetTitle;

    const ws = {
      id: 'ws_' + Date.now(),
      name: customName,
      colour: 'blue',
      spreadsheetId: sheetId,
      settings: null,
      shared: true,
      readOnly,
    };

    workspaces.push(ws);
    await saveWorkspaces();
    closeAddSharedWorkspaceModal();
    renderWorkspaceDropdown();
    showToast(`Shared workspace "${customName}" added${readOnly ? ' (view only)' : ''}`);
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
  }
}

async function confirmCreateWorkspace() {
  const nameInput = document.getElementById('ws-new-name');
  const name = (nameInput ? nameInput.value.trim() : '');
  if (!name) { showToast('Please enter a workspace name'); return; }
  const colourId = document.querySelector('#ws-new-modal-overlay .ws-colour-btn.selected')?.dataset.colour || 'green';

  const statusEl = document.getElementById('ws-new-status');

  // Must be signed in to Google to create a new workspace sheet
  if (!accessToken) {
    if (statusEl) statusEl.textContent = 'You must be signed in to Google to create a new workspace.';
    return;
  }

  if (statusEl) statusEl.textContent = 'Creating spreadsheet…';

  try {
    await ensureToken();
    const sheetName = `TaskSpark – ${name}`;
    const sheet = await api.driveCreateSheetNamed({ accessToken, name: sheetName });
    if (!sheet.spreadsheetId) throw new Error('Could not create spreadsheet');

    const ws = {
      id: 'ws_' + Date.now(),
      name,
      colour: colourId,
      spreadsheetId: sheet.spreadsheetId,
      settings: null,
    };
    workspaces.push(ws);
    await saveWorkspaces();
    closeNewWorkspaceModal();
    if (statusEl) statusEl.textContent = '';
    showToast(`Workspace "${name}" created`);
    renderWorkspaceDropdown();
  } catch (e) {
    if (statusEl) statusEl.textContent = `Error: ${e.message}`;
  }
}

// ── Manage workspaces modal ────────────────────────────────────────────────
function openManageWorkspacesModal() {
  closeWorkspaceDropdown();
  renderManageWorkspacesList();
  renderWorkspaceSettingsBadge();
  const overlay = document.getElementById('ws-manage-modal-overlay');
  if (overlay) overlay.classList.add('open');
}

function closeManageWorkspacesModal() {
  const overlay = document.getElementById('ws-manage-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

function renderManageWorkspacesList() {
  const list = document.getElementById('ws-manage-list');
  if (!list) return;
  list.innerHTML = workspaces.map(w => {
    const c = WORKSPACE_COLOURS.find(x => x.id === w.colour) || WORKSPACE_COLOURS[0];
    const isActive = w.id === activeWorkspaceId;
    const sharedBadge = w.shared ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--text3);border:1px solid var(--border);margin-right:4px">⇄ Shared</span>` : '';
    const readOnlyBadge = w.readOnly ? `<span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--surface2);color:var(--amber);border:1px solid var(--amber);margin-right:4px">View only</span>` : '';
    const shareNudge = !w.shared ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">To share: open the sheet via <strong>Open Sheet</strong>, then share it via Google Drive.</div>` : '';
    return `<div class="ws-manage-item" data-id="${w.id}">
      <span class="ws-manage-dot" style="background:${c.hex}"></span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span class="ws-manage-name">${esc(w.name)}</span>
          ${sharedBadge}${readOnlyBadge}
          ${isActive ? '<span class="ws-manage-badge">Active</span>' : ''}
        </div>
        ${shareNudge}
      </div>
      <div class="ws-manage-actions">
        <button class="btn-secondary" style="font-size:11px;padding:3px 8px" onclick="openRenameWorkspace('${w.id}')">Rename</button>
        ${workspaces.length > 1 ? `<button class="btn-secondary" style="font-size:11px;padding:3px 8px;color:var(--red)" onclick="promptDeleteWorkspace('${w.id}')">${w.shared ? 'Remove' : 'Delete'}</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openRenameWorkspace(id) {
  const ws = workspaces.find(w => w.id === id);
  if (!ws) return;
  // Use an inline rename row instead of prompt() for Electron compatibility
  const item = document.querySelector(`.ws-manage-item[data-id="${id}"]`);
  if (!item) return;
  const nameEl = item.querySelector('.ws-manage-name');
  if (!nameEl) return;
  const current = ws.name;
  nameEl.innerHTML = `<input class="form-input" id="ws-rename-input-${id}" value="${esc(current)}" style="font-size:13px;padding:5px 8px;width:160px" maxlength="30">`;
  const inp = document.getElementById(`ws-rename-input-${id}`);
  inp.focus(); inp.select();
  inp.onkeydown = (e) => {
    if (e.key === 'Enter') confirmRename(id, inp.value);
    if (e.key === 'Escape') { renderManageWorkspacesList(); }
  };
  inp.onblur = () => { setTimeout(() => confirmRename(id, inp.value), 150); };
}

function confirmRename(id, value) {
  const ws = workspaces.find(w => w.id === id);
  if (!ws) return;
  const trimmed = value.trim();
  if (trimmed && trimmed !== ws.name) {
    ws.name = trimmed;
    saveWorkspaces();
    renderWorkspaceDropdown();
    updateWorkspaceTitle();
  }
  renderManageWorkspacesList();
}

async function promptDeleteWorkspace(id) {
  const ws = workspaces.find(w => w.id === id);
  if (!ws) return;
  if (workspaces.length <= 1) { showToast('Cannot delete the last workspace'); return; }

  const title = ws.shared ? `Remove "${ws.name}"` : `Delete "${ws.name}"`;
  const body = ws.shared
    ? `This shared workspace will be removed from TaskSpark.<br><br>The Google Sheet will not be affected — you can re-add it any time.`
    : `This workspace will be removed from TaskSpark.<br><br>The Google Sheet linked to this workspace will <strong>not</strong> be deleted from your Google Drive — you can manage it there.`;

  showConfirmModal(
    title,
    body,
    ws.shared ? 'Remove' : 'Delete Workspace',
    async () => {
      workspaces = workspaces.filter(w => w.id !== id);
      if (activeWorkspaceId === id) {
        await switchWorkspace(workspaces[0].id);
      } else {
        await saveWorkspaces();
      }
      renderManageWorkspacesList();
      renderWorkspaceDropdown();
      showToast(`Workspace "${ws.name}" removed`);
    },
    true
  );
}

// Per-workspace settings toggle
function toggleWorkspaceSharedSettings() {
  const ws = getActiveWorkspace();
  if (!ws) return;
  if (ws.settings) {
    ws.settings = null;
    showToast('This workspace now shares settings with all workspaces');
  } else {
    ws.settings = { ...settings };
    showToast('This workspace now has its own settings');
  }
  saveWorkspaces();
  renderWorkspaceSettingsBadge();
}

function renderWorkspaceSettingsBadge() {
  const ws = getActiveWorkspace();
  const desc = document.getElementById('ws-settings-description');
  const btn = document.getElementById('ws-settings-toggle-btn');
  if (!ws) return;
  if (ws.settings) {
    if (desc) desc.textContent = 'This workspace has its own settings. Changes to sort order, features, and break timers only affect this workspace.';
    if (btn) btn.textContent = 'Switch to shared settings';
  } else {
    if (desc) desc.textContent = 'This workspace shares settings with all other workspaces. Changes to sort order, features, and break timers apply everywhere.';
    if (btn) btn.textContent = 'Give this workspace its own settings';
  }
}

function selectWorkspaceColour(btn, modalPrefix) {
  document.querySelectorAll(`#${modalPrefix} .ws-colour-btn`).forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

// Close workspace dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#workspace-dropdown-btn') && !e.target.closest('#workspace-dropdown-menu')) {
    closeWorkspaceDropdown();
  }
});

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// Debounced Google Sheets saves — batch rapid changes into a single API call
const saveTasksDebounced  = debounce(() => saveTasks(), 1500);
const saveHabitsDebounced = debounce(() => saveHabits(), 2000);
const saveIdeasDebounced  = debounce(() => saveIdeas(), 2000);
const saveWinsDebounced   = debounce(() => saveWins(), 2000);

// Debounced render — collapses rapid successive renderAll calls
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderAll(); });
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
  setTimeout(startOnboarding, 1000);
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
    await new Promise(resolve => {
      showConfirmModal(
        'Migrate Local Tasks',
        'You have <strong>' + localTasks.length + ' task' + (localTasks.length === 1 ? '' : 's') + '</strong> saved locally.<br><br>Would you like to migrate them to your Google account, or start fresh?',
        'Migrate Tasks',
        () => resolve(true),
      );
      // If cancelled, clear cache and resolve
      document.getElementById('confirm-modal-cancel').textContent = 'Continue without migrating';
      const origCancel = document.getElementById('confirm-modal-cancel').onclick;
      document.getElementById('confirm-modal-cancel').onclick = async () => {
        await api.saveCache([]);
        document.getElementById('confirm-modal-cancel').textContent = 'Cancel';
        closeConfirmModal();
        resolve(false);
      };
    });
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
