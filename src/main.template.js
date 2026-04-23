const { app, BrowserWindow, ipcMain, shell, dialog, protocol, globalShortcut } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');
const url   = require('url');


// ── Config paths ──────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const CACHE_PATH  = path.join(app.getPath('userData'), 'tasks_cache.json');
const WORKSPACES_PATH = path.join(app.getPath('userData'), 'workspaces.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}
function saveConfig(data) {
  const existing = loadConfig() || {};
  const merged = { ...existing, ...data };
  // Remove keys explicitly set to null so they don't persist
  Object.keys(merged).forEach(k => { if (merged[k] === null) delete merged[k]; });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
}
function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch { return []; }
}
function saveCache(tasks) {
  try { fs.writeFileSync(CACHE_PATH, JSON.stringify(tasks, null, 2)); } catch {} 
}

// ── Windows ───────────────────────────────────────────────────────────────────
let mainWindow;
let timerWindow      = null;
let breakPromptWindow = null;

function getWindowState() {
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      return cfg.windowState || null;
    }
  } catch {}
  return null;
}

function saveWindowState() {
  try {
    const cfgPath = path.join(app.getPath('userData'), 'config.json');
    let cfg = {};
    if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? (cfg.windowState?.bounds || { width: 1080, height: 720 }) : mainWindow.getBounds();
    cfg.windowState = { isMaximized, bounds };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  } catch {}
}

function createWindow() {
  const savedState = getWindowState();
  const bounds = savedState?.bounds || { width: 1080, height: 720 };

  mainWindow = new BrowserWindow({
    width: bounds.width, height: bounds.height,
    x: bounds.x, y: bounds.y,
    minWidth: 820, minHeight: 560,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#f0ede8',
    icon: path.join(__dirname, '../assets/taskspark.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (savedState?.isMaximized) mainWindow.maximize();

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' };
  });

  // Save window state on close and resize/move
  mainWindow.on('close', saveWindowState);
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
}

app.whenReady().then(() => {
  createWindow();
  // Register global Ctrl+Space shortcut for Quick Add
  globalShortcut.register('CommandOrControl+Space', () => {
    if (mainWindow) {
      const wasFocused = mainWindow.isFocused() && mainWindow.isVisible() && !mainWindow.isMinimized();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('global-quick-add', { wasFocused });
    }
  });
  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ── Auto-updater ──────────────────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
  // Silently ignore update errors — don't interrupt the user
  console.error('Update error:', err.message);
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// ── Window controls ───────────────────────────────────────────────────────────
ipcMain.on('quickadd-done', () => {
  setTimeout(() => {
    if (mainWindow) mainWindow.minimize();
  }, 300);
});

ipcMain.on('window-minimize', () => {
  mainWindow._wasMaximized = mainWindow.isMaximized();
  mainWindow.minimize();
});
ipcMain.on('window-restore', () => {
  if (mainWindow._wasMaximized) { mainWindow.restore(); mainWindow.maximize(); }
  else mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
});
ipcMain.on('window-maximize', () => {
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow.close());

// ── Timer window ──────────────────────────────────────────────────────────────
ipcMain.handle('timer-show', async (_, { taskName, baseLogged }) => {
  if (timerWindow) { try { timerWindow.close(); } catch {} timerWindow = null; }
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = 340, h = 70;
  timerWindow = new BrowserWindow({
    width: w, height: h, x: width-w-20, y: height-h-20,
    frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: { preload: path.join(__dirname, 'timer-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  timerWindow.loadFile(path.join(__dirname, 'timer.html'));
  timerWindow.setAlwaysOnTop(true, 'screen-saver');
  timerWindow.webContents.once('did-finish-load', () => {
    timerWindow.webContents.send('timer-start', { taskName, baseLogged });
  });
  timerWindow.on('closed', () => { timerWindow = null; });
  return true;
});

ipcMain.handle('timer-hide', async () => {
  if (timerWindow) { try { timerWindow.close(); } catch {} timerWindow = null; }
  return true;
});

ipcMain.handle('timer-pause', async () => {
  if (timerWindow) timerWindow.webContents.send('timer-paused');
  return true;
});

ipcMain.handle('timer-resume', async () => {
  if (timerWindow) timerWindow.webContents.send('timer-resumed');
  return true;
});

ipcMain.on('timer-stop', (_, elapsed) => {
  if (mainWindow) mainWindow.webContents.send('timer-stopped', elapsed);
  if (timerWindow) { try { timerWindow.close(); } catch {} timerWindow = null; }
});

// Timer pause/resume — main.js coordinates both windows
ipcMain.on('timer-pause-request', () => {
  // Tell main window to pause (handles elapsed time)
  if (mainWindow) mainWindow.webContents.send('timer-pause-request');
  // Tell timer window to update its UI
  if (timerWindow) timerWindow.webContents.send('timer-paused');
});

ipcMain.on('timer-resume-request', () => {
  // Tell main window to resume (handles elapsed time)
  if (mainWindow) mainWindow.webContents.send('timer-resume-request');
  // Tell timer window to update its UI
  if (timerWindow) timerWindow.webContents.send('timer-resumed');
});

// ── Break prompt window ───────────────────────────────────────────────────────
ipcMain.handle('break-prompt-show', async (_, { intervalMins } = {}) => {
  if (breakPromptWindow) { try { breakPromptWindow.close(); } catch {} breakPromptWindow = null; }
  const { screen } = require('electron');
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const w = 320, h = 120;
  breakPromptWindow = new BrowserWindow({
    width: w, height: h, x: width-w-20, y: height-h-100,
    frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: { preload: path.join(__dirname, 'break-prompt-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  breakPromptWindow.loadFile(path.join(__dirname, 'break-prompt.html'));
  breakPromptWindow.setAlwaysOnTop(true, 'screen-saver');
  // Send the interval duration once the window has loaded
  breakPromptWindow.webContents.once('did-finish-load', () => {
    if (breakPromptWindow) breakPromptWindow.webContents.send('break-duration', intervalMins || 30);
  });
  breakPromptWindow.on('closed', () => { breakPromptWindow = null; });
  return true;
});

ipcMain.handle('break-prompt-hide', async () => {
  if (breakPromptWindow) { try { breakPromptWindow.close(); } catch {} breakPromptWindow = null; }
  return true;
});

ipcMain.on('break-choice', (_, choice) => {
  if (breakPromptWindow) { try { breakPromptWindow.close(); } catch {} breakPromptWindow = null; }
  if (mainWindow) mainWindow.webContents.send('break-choice', choice);
});

// ── Config / cache IPC ────────────────────────────────────────────────────────
ipcMain.handle('config-load', () => loadConfig());
ipcMain.handle('config-save', (_, data) => { saveConfig(data); return true; });
ipcMain.handle('cache-load', () => loadCache());
ipcMain.handle('cache-save', (_, tasks) => { saveCache(tasks); return true; });
ipcMain.handle('get-version', () => app.getVersion());

// ── Sound file picker ─────────────────────────────────────────────────────────
ipcMain.handle('pick-sound-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a sound file',
    filters: [{ name: 'Audio', extensions: ['wav','mp3','ogg','m4a','aac'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('pick-attachment-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose a file to attach',
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('open-attachment', async (_, pathOrUrl) => {
  if (!pathOrUrl) return;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    shell.openExternal(pathOrUrl);
  } else {
    shell.openPath(pathOrUrl);
  }
});

// ── Google OAuth ──────────────────────────────────────────────────────────────
// V2: Single shared OAuth app — users just sign in with Google, no setup needed
let oauthServer = null;

// Shared JSON parse helper
const _j = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; }; };

// These are your app's OAuth credentials — set once, shared by all users
// IMPORTANT: Replace these with your actual credentials from Google Cloud Console
// after your OAuth app is verified
const APP_CLIENT_ID     = '__APP_CLIENT_ID__';
const APP_CLIENT_SECRET = '__APP_CLIENT_SECRET__';

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'openid', 'email', 'profile',
].join(' ');

ipcMain.handle('oauth-start', async () => {
  if (oauthServer) { try { oauthServer.close(); } catch {} oauthServer = null; }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/callback') return;
      const code = parsed.query.code;
      const error = parsed.query.error;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;
        justify-content:center;height:100vh;background:#0d1f14;color:white;margin:0">
        <div style="text-align:center">
          <div style="font-size:52px;margin-bottom:12px">${error ? '✕' : '✓'}</div>
          <h2 style="margin:0 0 8px">${error ? 'Sign-in cancelled' : 'Connected!'}</h2>
          <p style="color:#6a9e80;margin:0">You can close this tab and return to TaskSpark.</p>
        </div></body></html>`);
      // Save port before closing server
      const port = server.address() ? server.address().port : null;
      server.close(); oauthServer = null;
      if (error) { reject(new Error(`OAuth error: ${error}`)); return; }
      mainWindow.webContents.send('oauth-code', { code });  // resolve already called in listen callback
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      oauthServer = server;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', APP_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', OAUTH_SCOPES);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
      shell.openExternal(authUrl.toString());
      resolve({ waiting: true, redirectUri });
    });
    server.on('error', reject);
  });
});

ipcMain.handle('oauth-exchange', async (_, { code, redirectUri }) => {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      code, client_id: APP_CLIENT_ID, client_secret: APP_CLIENT_SECRET,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }).toString();
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
});

ipcMain.handle('oauth-refresh', async (_, { refreshToken }) => {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id: APP_CLIENT_ID, client_secret: APP_CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }).toString();
    const req = https.request({
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
});


// ── Outlook OAuth ────────────────────────────────────────────────────────────
const OUTLOOK_CLIENT_ID     = '__OUTLOOK_CLIENT_ID__';
const OUTLOOK_CLIENT_SECRET = '__OUTLOOK_CLIENT_SECRET__';
const OUTLOOK_SCOPES        = 'Calendars.Read User.Read offline_access';
let outlookOauthServer = null;

ipcMain.handle('outlook-start', async () => {
  if (outlookOauthServer) { try { outlookOauthServer.close(); } catch {} outlookOauthServer = null; }
  // Generate PKCE code verifier and challenge
  const crypto = require('crypto');
  const codeVerifier = crypto.randomBytes(64).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);
      if (parsed.pathname !== '/') return;
      const code  = parsed.query.code;
      const error = parsed.query.error;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:sans-serif;display:flex;align-items:center;
        justify-content:center;height:100vh;background:#0a0a1a;color:white;margin:0">
        <div style="text-align:center">
          <div style="font-size:52px;margin-bottom:12px">${error ? 'x' : 'OK'}</div>
          <h2 style="margin:0 0 8px">${error ? 'Connection cancelled' : 'Outlook Connected!'}</h2>
          <p style="color:#6a9e80;margin:0">You can close this tab and return to TaskSpark.</p>
        </div></body></html>`);
      const port = server.address() ? server.address().port : 0;
      server.close(); outlookOauthServer = null;
      if (error) { reject(new Error('Outlook auth error: ' + error)); return; }
      resolve({ code, redirectUri: `http://localhost:${port}/`, codeVerifier });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      outlookOauthServer = server;
      const authUrl = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
      authUrl.searchParams.set('client_id',             OUTLOOK_CLIENT_ID);
      authUrl.searchParams.set('response_type',         'code');
      authUrl.searchParams.set('redirect_uri',          `http://localhost:${port}/`);
      authUrl.searchParams.set('scope',                 OUTLOOK_SCOPES);
      authUrl.searchParams.set('response_mode',         'query');
      authUrl.searchParams.set('prompt',                'select_account');
      authUrl.searchParams.set('code_challenge',        codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      shell.openExternal(authUrl.toString());
    });
    server.on('error', reject);
  });
});

ipcMain.handle('outlook-exchange', async (_, { code, redirectUri, codeVerifier }) => {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id:     OUTLOOK_CLIENT_ID,
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      scope:         OUTLOOK_SCOPES,
      code_verifier: codeVerifier,
    }).toString();
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: '/common/oauth2/v2.0/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
});

ipcMain.handle('outlook-refresh', async (_, { refreshToken }) => {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      client_id:     OUTLOOK_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
      scope:         OUTLOOK_SCOPES,
    }).toString();
    const req = https.request({
      hostname: 'login.microsoftonline.com',
      path: '/common/oauth2/v2.0/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
});

ipcMain.handle('outlook-load-events', async (_, { accessToken, startDate, endDate }) => {
  return new Promise((resolve, reject) => {
    const path = `/v1.0/me/calendarView?startDateTime=${startDate}&endDateTime=${endDate}&$select=subject,start,end,isAllDay&$top=200`;
    const req = https.request({
      hostname: 'graph.microsoft.com',
      path,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.end();
  });
});

// ── Google Drive — search for existing TaskSpark sheet ───────────────────────
ipcMain.handle('drive-find-sheet', async (_, { accessToken }) => {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent("name='TaskSpark' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files?q=${query}&fields=files(id,name)`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          // Return the first matching spreadsheet if found
          const found = result.files && result.files.length > 0 ? result.files[0] : null;
          resolve(found);
        } catch { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
});

// ── Google Drive — auto-create spreadsheet ────────────────────────────────────
ipcMain.handle('drive-create-sheet', async (_, { accessToken }) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      properties: { title: 'TaskSpark' },
      sheets: [{ properties: { title: 'Tasks' } }],
    });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
});

// ── Google Sheets API ─────────────────────────────────────────────────────────
function sheetsRequest(method, path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'sheets.googleapis.com', path, method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            console.error(`Sheets API error [${method} ${path}]:`, JSON.stringify(parsed.error));
            reject(new Error(parsed.error.message || 'Sheets API error'));
          } else {
            resolve(parsed);
          }
        } catch { reject(new Error(`Parse error: ${data}`)); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const HEADERS = ['id','title','desc','priority','due','tags','completed',
  'createdAt','completedAt','timeLogged','timeSessions','impact','outcome',
  'deliverable','estimate','status','energy','subtasks','archived','archivedAt','recurrence','dueTime',
  'budget','spent','attachments'];

async function sheetsEnsure(accessToken, spreadsheetId) {
  const info = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}`, accessToken);
  const names = (info.sheets || []).map(s => s.properties.title);
  if (!names.includes('Tasks')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Tasks' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Tasks!A1', values: [HEADERS], majorDimension: 'ROWS' });
  }
  if (!names.includes('Mood History')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Mood History' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Mood History!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Mood History!A1', values: [['Date', 'Mood']], majorDimension: 'ROWS' });
  }
  if (!names.includes('Archived')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Archived' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Archived!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Archived!A1', values: [['id','title','desc','priority','due','tags','completed','createdAt','completedAt','archivedAt']], majorDimension: 'ROWS' });
  }
  if (!names.includes('Habits')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Habits' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Habits!A1', values: [['id','name','icon','days','completions','createdAt']], majorDimension: 'ROWS' });
  }
  if (!names.includes('Ideas')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Ideas' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Ideas!A1', values: [['id','title','desc','tags','createdAt']], majorDimension: 'ROWS' });
  }
  if (!names.includes('Wins')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Wins' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Wins!A1', values: [['id','quote','source','category','date','mood','createdAt']], majorDimension: 'ROWS' });
  }
  if (!names.includes('Events')) {
    try {
      await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
        { requests: [{ addSheet: { properties: { title: 'Events' } } }] });
      await sheetsRequest('PUT',
        `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A1')}?valueInputOption=RAW`,
        accessToken, { range: 'Events!A1', values: [['id','title','allDay','start','end','date','desc']], majorDimension: 'ROWS' });
    } catch(e) { /* Sheet may already exist */ }
  }
  return true;
}

ipcMain.handle('sheets-ensure', async (_, { accessToken, spreadsheetId }) => {
  return sheetsEnsure(accessToken, spreadsheetId);
});

// ── Habits ────────────────────────────────────────────────────────────────────
ipcMain.handle('habits-save', async (_, { accessToken, spreadsheetId, habits }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  // Clear existing data first
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A2:F10000')}:clear`,
    accessToken, {});
  if (!habits.length) return true;
  const rows = habits.map(h => [
    String(h.id), h.name, h.icon||'', JSON.stringify(h.days||[]),
    JSON.stringify(h.completions||{}), h.createdAt||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { values: rows, majorDimension: 'ROWS' });
  return true;
});

ipcMain.handle('habits-load', async (_, { accessToken, spreadsheetId }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  const data = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Habits!A2:F10000')}`,
    accessToken);
  const rows = (data.values || []).filter(r => r[0] && r[1]);
  return rows.map(r => ({
    id: r[0], name: r[1], icon: r[2]||'🔄',
    days: _j(r[3], []), completions: _j(r[4], {}), createdAt: r[5]||''
  }));
});

// ── Ideas ─────────────────────────────────────────────────────────────────────
ipcMain.handle('ideas-save', async (_, { accessToken, spreadsheetId, ideas }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  // Clear existing data first
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A2:E10000')}:clear`,
    accessToken, {});
  if (!ideas.length) return true;
  const rows = ideas.map(i => [
    String(i.id), i.title, i.desc||'', JSON.stringify(i.tags||[]), i.createdAt||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { values: rows, majorDimension: 'ROWS' });
  return true;
});

ipcMain.handle('ideas-load', async (_, { accessToken, spreadsheetId }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  const data = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Ideas!A2:E10000')}`,
    accessToken);
  const rows = (data.values || []).filter(r => r[0]);
  return rows.map(r => ({
    id: parseInt(r[0]), title: r[1]||'', desc: r[2]||'',
    tags: _j(r[3], []), createdAt: r[4]||''
  }));
});

// ── Wins Board ────────────────────────────────────────────────────────────────
ipcMain.handle('wins-save', async (_, { accessToken, spreadsheetId, wins }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A2:G10000')}:clear`,
    accessToken, {});
  if (!wins.length) return true;
  const rows = wins.map(w => [
    String(w.id), w.quote||'', w.source||'', w.category||'',
    w.date||'', w.mood||'', w.createdAt||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { values: rows, majorDimension: 'ROWS' });
  return true;
});

ipcMain.handle('wins-load', async (_, { accessToken, spreadsheetId }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  const data = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Wins!A2:G10000')}`,
    accessToken);
  const rows = (data.values || []).filter(r => r[0]);
  return rows.map(r => ({
    id: r[0], quote: r[1]||'', source: r[2]||'', category: r[3]||'',
    date: r[4]||'', mood: r[5]||'proud', createdAt: r[6]||''
  }));
});

// ── Calendar Events ────────────────────────────────────────────────────────────
ipcMain.handle('events-save', async (_, { accessToken, spreadsheetId, events }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A2:I10000')}:clear`,
    accessToken, {});
  if (!events.length) return true;
  const rows = events.map(e => [
    String(e.id), e.title||'', e.allDay?'1':'0', e.start||'', e.end||'', e.date||'', e.desc||'', JSON.stringify(e.tags||[]), e.dateEnd||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A2')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { values: rows, majorDimension: 'ROWS' });
  return true;
});

ipcMain.handle('events-load', async (_, { accessToken, spreadsheetId }) => {
  await sheetsEnsure(accessToken, spreadsheetId);
  const data = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Events!A2:F10000')}`,
    accessToken);
  const rows = (data.values || []).filter(r => r[0]);
  return rows.map(r => ({
    id: r[0], title: r[1]||'', allDay: r[2]==='1',
    start: r[3]||'', end: r[4]||'', date: r[5]||'', desc: r[6]||'',
    tags: _j(r[7], []), dateEnd: r[8]||''
  }));
});



// ── Archive ───────────────────────────────────────────────────────────────────
ipcMain.handle('archive-append', async (_, { accessToken, spreadsheetId, tasks }) => {
  const rows = tasks.map(t => [
    String(t.id), t.title, t.desc||'', t.priority||'medium', t.due||'',
    JSON.stringify(t.tags||[]), t.completed?'1':'0',
    t.createdAt||'', t.completedAt||'', t.archivedAt||''
  ]);
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Archived!A:J')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    accessToken, { values: rows, majorDimension: 'ROWS' });
  return true;
});

// ── Mood History ──────────────────────────────────────────────────────────────
ipcMain.handle('mood-append', async (_, { accessToken, spreadsheetId, date, mood }) => {
  // Check if there's already an entry for today and update it
  const existing = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Mood History!A2:B1000')}`, accessToken);
  const rows = (existing.values || []);
  const todayRow = rows.findIndex(r => r[0] === date);
  if (todayRow >= 0) {
    // Update existing row
    const rowNum = todayRow + 2;
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(`Mood History!A${rowNum}`)}?valueInputOption=RAW`,
      accessToken, { range: `Mood History!A${rowNum}`, values: [[date, mood]], majorDimension: 'ROWS' });
  } else {
    // Append new row
    await sheetsRequest('POST',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Mood History!A:B')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      accessToken, { values: [[date, mood]], majorDimension: 'ROWS' });
  }
  return true;
});

ipcMain.handle('sheets-load', async (_, { accessToken, spreadsheetId }) => {
  const data = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2:Y10000')}`, accessToken);
  const rows = data.values || [];
  return rows.filter(r => r && r[0]).map(row => {
    while (row.length < HEADERS.length) row.push('');
    const _j = (v, fb) => { try { return v ? JSON.parse(v) : fb; } catch { return fb; } };
    return {
      id: parseInt(row[0]) || 0, title: row[1], desc: row[2],
      priority: row[3] || 'medium', due: row[4], tags: _j(row[5], []),
      completed: row[6] === '1', createdAt: row[7], completedAt: row[8],
      timeLogged: parseInt(row[9]) || 0, timeSessions: _j(row[10], []),
      impact: row[11], outcome: row[12], deliverable: row[13],
      estimate: parseInt(row[14]) || 0,
      status:   row[15] || 'not-started',
      energy:   row[16] || 'medium',
      subtasks:   _j(row[17], []),
      archived:   row[18] === '1',
      archivedAt: row[19] || '',
      dueTime: /^\d{1,2}:\d{2}$/.test(row[21]) ? row[21] : '',
      recurrence: _j(row[20], { type: 'none' }),
      budget: parseFloat(row[22]) || 0,
      spent:  parseFloat(row[23]) || 0,
      attachments: _j(row[24], []),
    };
  });
});

ipcMain.handle('sheets-save', async (_, { accessToken, spreadsheetId, tasks }) => {
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
  return true;
});


// ── Workspaces ────────────────────────────────────────────────────────────────
ipcMain.handle('workspaces-load', () => {
  try { return JSON.parse(fs.readFileSync(WORKSPACES_PATH, 'utf8')); } catch { return null; }
});

ipcMain.handle('workspaces-save', (_, data) => {
  fs.writeFileSync(WORKSPACES_PATH, JSON.stringify(data, null, 2));
  return true;
});

ipcMain.handle('drive-create-sheet-named', async (_, { accessToken, name }) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      properties: { title: name },
      sheets: [{ properties: { title: 'Tasks' } }],
    });
    const req = https.request({
      hostname: 'sheets.googleapis.com',
      path: '/v4/spreadsheets',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject); req.write(body); req.end();
  });
});

// Renders HTML to PDF via a hidden Electron window, then uploads to Google Drive.
ipcMain.handle('drive-upload-pdf', async (_, { accessToken, title, html }) => {
  const os = require('os');
  const tmpPath = path.join(os.tmpdir(), `ts_stats_${Date.now()}.html`);
  fs.writeFileSync(tmpPath, html, 'utf8');

  let win;
  let pdfBuffer;
  try {
    win = new BrowserWindow({ show: false, width: 1280, height: 1600, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    // Race against a timeout so pending external resources don't hang forever
    await Promise.race([
      win.loadFile(tmpPath),
      new Promise(resolve => setTimeout(resolve, 12000)),
    ]);
    pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' });
  } finally {
    if (win) { try { win.close(); } catch {} }
    try { fs.unlinkSync(tmpPath); } catch {}
  }

  return new Promise((resolve, reject) => {
    const boundary = 'ts_pdf_' + Date.now();
    const metadata = JSON.stringify({ name: title + '.pdf', mimeType: 'application/pdf' });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(metadata, 'utf8'),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      pdfBuffer,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: '/upload/drive/v3/files?uploadType=multipart&fields=id',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.id) resolve(result);
          else reject(new Error(result.error ? JSON.stringify(result.error) : 'Upload failed'));
        } catch { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
});

ipcMain.handle('drive-find-sheet-by-id', async (_, { accessToken, spreadsheetId }) => {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path: `/drive/v3/files/${spreadsheetId}?fields=id,name,trashed`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve(result.trashed ? null : result);
        } catch { reject(new Error('Parse error')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
});

// ── TaskSpark-Config spreadsheet — dedicated workspace registry ──────────────
// Config sheet is accessed by stored ID only. On a new device, the user
// selects it once via Google Picker — no drive.readonly needed.
const CONFIG_SHEET_NAME = 'TaskSpark-Config';

async function findOrCreateConfigSheet(accessToken) {
  // Only creates — never searches. Caller must supply known ID or trigger Picker.
  const body = JSON.stringify({
    properties: { title: CONFIG_SHEET_NAME },
    sheets: [{ properties: { title: 'Config' } }]
  });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'sheets.googleapis.com', path: '/v4/spreadsheets', method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d).spreadsheetId || null); }
        catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null)); req.write(body); req.end();
  });
}

// ── Google Picker — opens in default browser, result returned via local HTTP ──
let pickerServer = null;
ipcMain.handle('show-config-picker', async (_, { accessToken, clientId }) => {
  return new Promise((resolve) => {
    // Close any existing picker server
    if (pickerServer) { try { pickerServer.close(); } catch {} pickerServer = null; }

    const port = 45783;

    pickerServer = http.createServer((req, res) => {
      const parsed = url.parse(req.url, true);

      if (parsed.pathname === '/picker') {
        // Serve the picker HTML page
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Restore TaskSpark Data</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0d1f14; color: #e0e0e0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; padding: 32px; text-align: center; }
    .logo { font-size: 40px; margin-bottom: 16px; }
    h1 { font-size: 20px; font-weight: 600; color: #fff; margin-bottom: 12px; }
    p { font-size: 14px; color: #aaa; line-height: 1.6; max-width: 460px; margin-bottom: 12px; }
    .hint { background: #1a2e1f; border: 1px solid #2e4d35; border-radius: 8px;
      padding: 12px 20px; font-size: 13px; color: #8bc48f; max-width: 420px;
      margin-bottom: 24px; line-height: 1.6; }
    .hint strong { color: #a8d5ab; }
    .btn { background: #4caf50; color: #fff; border: none; border-radius: 8px;
      padding: 12px 28px; font-size: 15px; font-weight: 600; cursor: pointer;
      margin-bottom: 12px; width: 100%; max-width: 320px; }
    .btn:hover { background: #45a049; }
    .btn-secondary { background: none; border: 1px solid #444; color: #aaa;
      font-size: 13px; padding: 10px 24px; }
    .btn-secondary:hover { border-color: #666; color: #ccc; }
    #status { font-size: 13px; color: #aaa; margin-top: 16px; min-height: 20px; }
    #picker-container { width: 100%; display: flex; flex-direction: column; align-items: center; }
  </style>
</head>
<body>
  <div class="logo">&#10022;</div>
  <h1>Restore Your TaskSpark Data</h1>
  <p>It looks like you're signing in on a new device. To reconnect to your existing tasks, select your TaskSpark config file from Google Drive.</p>
  <div class="hint">Look for a file called <strong>TaskSpark-Config</strong> &mdash; it's a Google Sheet created automatically by TaskSpark. The Picker will only show files with that name. This only needs to be done once on this device.</div>
  <div id="picker-container">
    <button class="btn" id="btn-open-picker">Find My TaskSpark-Config File</button>
    <button class="btn btn-secondary" id="btn-cancel">Start Fresh Instead</button>
  </div>
  <div id="status"></div>
  <script src="https://apis.google.com/js/api.js"></script>
  <script>
    const accessToken = '${accessToken}';
    const clientId = '${clientId}';
    document.getElementById('btn-open-picker').addEventListener('click', () => {
      document.getElementById('status').textContent = 'Loading Drive Picker...';
      gapi.load('picker', () => {
        const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS)
          .setQuery('TaskSpark-Config');
        const picker = new google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(accessToken)
          .setTitle('Select your TaskSpark-Config file')
          .setCallback((data) => {
            if (data.action === google.picker.Action.PICKED) {
              const fileId = data.docs[0].id;
              document.getElementById('status').textContent = 'Connecting...';
              fetch('http://localhost:${port}/picker-result?fileId=' + fileId);
              document.getElementById('status').textContent = 'Done! You can close this tab and return to TaskSpark.';
              document.getElementById('picker-container').style.display = 'none';
            } else if (data.action === google.picker.Action.CANCEL) {
              document.getElementById('status').textContent = '';
            }
          }).build();
        picker.setVisible(true);
        document.getElementById('status').textContent = '';
      });
    });
    document.getElementById('btn-cancel').addEventListener('click', () => {
      fetch('http://localhost:${port}/picker-result?cancelled=1');
      document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:Segoe UI,sans-serif;color:#aaa;">You can close this tab and return to TaskSpark.</div>';
    });
  </script>
</body>
</html>`;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      if (parsed.pathname === '/picker-result') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        if (pickerServer) { try { pickerServer.close(); } catch {} pickerServer = null; }
        if (parsed.query.cancelled) {
          resolve(null);
        } else {
          resolve(parsed.query.fileId || null);
        }
        return;
      }

      res.writeHead(404); res.end();
    });

    pickerServer.listen(port, '127.0.0.1', () => {
      shell.openExternal(`http://localhost:${port}/picker`);
    });

    pickerServer.on('error', () => {
      resolve(null);
    });
  });
});

ipcMain.handle('drive-workspaces-load', async (_, { accessToken, configSheetId }) => {
  try {
    // Only load if we have a known ID — never search Drive
    if (!configSheetId) return null;
    const data = await sheetsRequest('GET',
      `/v4/spreadsheets/${configSheetId}/values/${encodeURIComponent('Config!A1')}`, accessToken);
    const val = data.values && data.values[0] && data.values[0][0];
    if (!val) return { id: configSheetId, data: null };
    return { id: configSheetId, data: JSON.parse(val) };
  } catch (e) { console.warn('[drive-workspaces-load] error:', e.message); return null; }
});

ipcMain.handle('drive-workspaces-save', async (_, { accessToken, configSheetId, data }) => {
  try {
    const configId = configSheetId || await findOrCreateConfigSheet(accessToken);
    if (!configId) return null;
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${configId}/values/${encodeURIComponent('Config!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Config!A1', values: [[JSON.stringify(data)]], majorDimension: 'ROWS' });
    return { id: configId };
  } catch (e) { console.warn('[drive-workspaces-save] error:', e.message); return null; }
});
