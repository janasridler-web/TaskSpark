const { app, BrowserWindow, ipcMain, shell, dialog, protocol } = require('electron');
// Load credentials from .env file (never committed to GitHub)
require('dotenv').config({ path: require('path').join(app.getAppPath(), '.env') });
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const https = require('https');
const http  = require('http');
const url   = require('url');

// ── Config paths ──────────────────────────────────────────────────────────────
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const CACHE_PATH  = path.join(app.getPath('userData'), 'tasks_cache.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { return null; }
}
function saveConfig(data) {
  const existing = loadConfig() || {};
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080, height: 720, minWidth: 820, minHeight: 560,
    frame: false, titleBarStyle: 'hidden',
    backgroundColor: '#f0ede8',
    icon: path.join(__dirname, '../assets/taskspark.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
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
  const w = 300, h = 70;
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

ipcMain.on('timer-stop', (_, elapsed) => {
  if (mainWindow) mainWindow.webContents.send('timer-stopped', elapsed);
  if (timerWindow) { try { timerWindow.close(); } catch {} timerWindow = null; }
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

// ── Google OAuth ──────────────────────────────────────────────────────────────
// V2: Single shared OAuth app — users just sign in with Google, no setup needed
let oauthServer = null;

// These are your app's OAuth credentials — set once, shared by all users
// IMPORTANT: Replace these with your actual credentials from Google Cloud Console
// after your OAuth app is verified
const APP_CLIENT_ID     = process.env.APP_CLIENT_ID     || 'YOUR_CLIENT_ID_HERE';
const APP_CLIENT_SECRET = process.env.APP_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE';

const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file', // needed to create the sheet
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
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { reject(new Error(`Parse error: ${data}`)); } });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

const HEADERS = ['id','title','desc','priority','due','tags','completed',
  'createdAt','completedAt','timeLogged','timeSessions','impact','outcome',
  'deliverable','estimate'];

ipcMain.handle('sheets-ensure', async (_, { accessToken, spreadsheetId }) => {
  const info = await sheetsRequest('GET', `/v4/spreadsheets/${spreadsheetId}`, accessToken);
  const names = (info.sheets || []).map(s => s.properties.title);
  if (!names.includes('Tasks')) {
    await sheetsRequest('POST', `/v4/spreadsheets/${spreadsheetId}:batchUpdate`, accessToken,
      { requests: [{ addSheet: { properties: { title: 'Tasks' } } }] });
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A1')}?valueInputOption=RAW`,
      accessToken, { range: 'Tasks!A1', values: [HEADERS], majorDimension: 'ROWS' });
  }
  return true;
});

ipcMain.handle('sheets-load', async (_, { accessToken, spreadsheetId }) => {
  const data = await sheetsRequest('GET',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2:O10000')}`, accessToken);
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
    };
  });
});

ipcMain.handle('sheets-save', async (_, { accessToken, spreadsheetId, tasks }) => {
  await sheetsRequest('POST',
    `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2:O10000')}:clear`, accessToken);
  if (tasks.length) {
    const rows = tasks.map(t => [
      String(t.id), t.title, t.desc||'', t.priority||'medium', t.due||'',
      JSON.stringify(t.tags||[]), t.completed?'1':'0',
      t.createdAt||'', t.completedAt||'', String(t.timeLogged||0),
      JSON.stringify(t.timeSessions||[]), t.impact||'', t.outcome||'',
      t.deliverable||'', String(t.estimate||0),
    ]);
    await sheetsRequest('PUT',
      `/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Tasks!A2')}?valueInputOption=RAW`,
      accessToken, { range: 'Tasks!A2', values: rows, majorDimension: 'ROWS' });
  }
  return true;
});
