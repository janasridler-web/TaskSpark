const { contextBridge, ipcRenderer } = require('electron');

// Phase 2 slice 1: when wrapping the web companion, the web's app.js
// declares its own top-level `const api = {...}`, which collides with the
// non-configurable `window.api` that contextBridge would otherwise expose
// here. Skip the legacy `api` surface in that mode — the web app talks to
// Google directly + uses `window.desktopAPI` for the bits that need a
// privileged main-process call.
const WRAP_WEB = process.env.TASKSPARK_USE_WEB === '1';

if (!WRAP_WEB) {
contextBridge.exposeInMainWorld('api', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  restore:  () => ipcRenderer.send('window-restore'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),

  // Config & cache
  loadConfig:  () => ipcRenderer.invoke('config-load'),
  saveConfig:  (data) => ipcRenderer.invoke('config-save', data),
  loadCache:   () => ipcRenderer.invoke('cache-load'),
  saveCache:   (tasks) => ipcRenderer.invoke('cache-save', tasks),
  getVersion:  () => ipcRenderer.invoke('get-version'),

  // OAuth — V2: no credentials needed from user
  oauthStart:    ()     => ipcRenderer.invoke('oauth-start'),
  oauthExchange: (data) => ipcRenderer.invoke('oauth-exchange', data),
  oauthRefresh:  (data) => ipcRenderer.invoke('oauth-refresh', data),
  onOauthCode:   (cb)   => ipcRenderer.on('oauth-code', (_, data) => cb(data)),

  // Drive — find or create spreadsheet
  driveFindSheet:   (data) => ipcRenderer.invoke('drive-find-sheet', data),
  driveCreateSheet: (data) => ipcRenderer.invoke('drive-create-sheet', data),

  // Break prompt
  breakPromptShow: (data) => ipcRenderer.invoke('break-prompt-show', data),
  breakPromptHide: () => ipcRenderer.invoke('break-prompt-hide'),
  onBreakChoice:   (cb) => ipcRenderer.on('break-choice', (_, choice) => cb(choice)),

  // Timer window
  timerShow:      (data) => ipcRenderer.invoke('timer-show', data),
  timerHide:      ()     => ipcRenderer.invoke('timer-hide'),
  timerPause:     ()     => ipcRenderer.invoke('timer-pause'),
  timerResume:    ()     => ipcRenderer.invoke('timer-resume'),
  onTimerStopped:       (cb) => ipcRenderer.on('timer-stopped',       (_, elapsed) => cb(elapsed)),
  onTimerPauseRequest:  (cb) => ipcRenderer.on('timer-pause-request',  () => cb()),
  onTimerResumeRequest: (cb) => ipcRenderer.on('timer-resume-request', () => cb()),

  // Sound
  pickSoundFile: () => ipcRenderer.invoke('pick-sound-file'),
  pickAttachmentFile: () => ipcRenderer.invoke('pick-attachment-file'),
  openAttachment: (pathOrUrl) => ipcRenderer.invoke('open-attachment', pathOrUrl),

  // Google Sheets
  sheetsEnsure: (data) => ipcRenderer.invoke('sheets-ensure', data),
  moodAppend:    (data) => ipcRenderer.invoke('mood-append', data),
  moodGetToday:  (data) => ipcRenderer.invoke('mood-get-today', data),
  archiveAppend: (data) => ipcRenderer.invoke('archive-append', data),
  ideasSave:     (data) => ipcRenderer.invoke('ideas-save', data),
  ideasLoad:     (data) => ipcRenderer.invoke('ideas-load', data),
  habitsSave:    (data) => ipcRenderer.invoke('habits-save', data),
  habitsLoad:    (data) => ipcRenderer.invoke('habits-load', data),
  winsSave:      (data) => ipcRenderer.invoke('wins-save', data),
  winsLoad:      (data) => ipcRenderer.invoke('wins-load', data),
  listsSave:     (data) => ipcRenderer.invoke('lists-save', data),
  listsLoad:     (data) => ipcRenderer.invoke('lists-load', data),
  eventsSave:    (data) => ipcRenderer.invoke('events-save', data),
  eventsLoad:    (data) => ipcRenderer.invoke('events-load', data),
  sheetsLoad:   (data) => ipcRenderer.invoke('sheets-load', data),
  sheetsSave:   (data) => ipcRenderer.invoke('sheets-save', data),

  // External submissions
  submissionsLoadTemplate: (data) => ipcRenderer.invoke('submissions-load-template', data),
  submissionsVerifyUrl:    (data) => ipcRenderer.invoke('submissions-verify-url', data),
  submissionsEnsureSchema: (data) => ipcRenderer.invoke('submissions-ensure-schema', data),

  // Auto-updater
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
  onGlobalQuickAdd:   (cb) => ipcRenderer.on('global-quick-add', (_, data) => cb(data)),
  quickaddDone:       () => ipcRenderer.send('quickadd-done'),
  installUpdate:      ()   => ipcRenderer.send('install-update'),

  // Outlook Calendar
  outlookStart:       ()     => ipcRenderer.invoke('outlook-start'),
  outlookExchange:    (data) => ipcRenderer.invoke('outlook-exchange', data),
  outlookRefresh:     (data) => ipcRenderer.invoke('outlook-refresh', data),
  outlookLoadEvents:  (data) => ipcRenderer.invoke('outlook-load-events', data),

  // Workspaces
  workspacesLoad: ()       => ipcRenderer.invoke('workspaces-load'),
  workspacesSave: (data)   => ipcRenderer.invoke('workspaces-save', data),
  driveCreateSheetNamed: (data) => ipcRenderer.invoke('drive-create-sheet-named', data),
  driveUploadPdf:        (data) => ipcRenderer.invoke('drive-upload-pdf', data),
  driveFindSheetById: (data)    => ipcRenderer.invoke('drive-find-sheet-by-id', data),
  driveWorkspacesLoad: (data)   => ipcRenderer.invoke('drive-workspaces-load', data),
  driveWorkspacesSave: (data)   => ipcRenderer.invoke('drive-workspaces-save', data), // data includes spreadsheetId
  showConfigPicker:   (data)   => ipcRenderer.invoke('show-config-picker', data),
});
}

// Phase 2 bridge for the wrapped web app. Slice 1 surface: a liveness ping,
// the platform string, and the four OAuth primitives needed to make sign-in
// work under file://. Everything else (timer, break prompt, CSV export,
// calendar, offline) lands in later slices.
contextBridge.exposeInMainWorld('desktopAPI', {
  ping:          ()     => 'pong',
  platform:      process.platform,
  oauthStart:    ()     => ipcRenderer.invoke('oauth-start'),
  oauthExchange: (data) => ipcRenderer.invoke('oauth-exchange', data),
  oauthRefresh:  (data) => ipcRenderer.invoke('oauth-refresh', data),
  onOauthCode:   (cb)   => ipcRenderer.on('oauth-code', (_, data) => cb(data)),
  showConfigPicker: (data) => ipcRenderer.invoke('show-config-picker', data),
  // Auto-updater (slice 2). Wires the existing update-available /
  // update-downloaded events from main and lets the renderer trigger
  // an immediate install via install-update (otherwise the update
  // applies the next time the user quits the app).
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
  installUpdate:      ()   => ipcRenderer.send('install-update'),
  // Quick Add global shortcut (slice 3). Main registers Ctrl+Space (or
  // Ctrl+Shift+Space as fallback) and fires global-quick-add with
  // { wasFocused } so the renderer can decide whether to send
  // quickaddDone after submission (to restore the previously-focused app).
  onGlobalQuickAdd:   (cb) => ipcRenderer.on('global-quick-add', (_, data) => cb(data)),
  quickaddDone:       ()   => ipcRenderer.send('quickadd-done'),
  // Floating timer window (slice 4). Reuses the existing src/timer.html +
  // src/timer-preload.js — self-contained assets that don't depend on the
  // legacy window.api. Renderer-initiated controls go via the timer*
  // invokes; floating-window-initiated events come back via the on*
  // listeners. Window controls (minimize/restore) are also exposed so the
  // main window can hide itself while the timer is up, matching V4.1.1
  // desktop UX.
  timerShow:           (data) => ipcRenderer.invoke('timer-show', data),
  timerHide:           ()     => ipcRenderer.invoke('timer-hide'),
  timerPause:          ()     => ipcRenderer.invoke('timer-pause'),
  timerResume:         ()     => ipcRenderer.invoke('timer-resume'),
  onTimerStopped:      (cb)   => ipcRenderer.on('timer-stopped',       (_, elapsed) => cb(elapsed)),
  onTimerPauseRequest: (cb)   => ipcRenderer.on('timer-pause-request',  () => cb()),
  onTimerResumeRequest:(cb)   => ipcRenderer.on('timer-resume-request', () => cb()),
  minimize:            ()     => ipcRenderer.send('window-minimize'),
  restore:             ()     => ipcRenderer.send('window-restore'),
  // Break prompt window (slice 5). Same shape as the floating timer —
  // self-contained src/break-prompt.html + break-prompt-preload.js. Stays
  // on top of the focus overlay when one's up.
  breakPromptShow:     (data) => ipcRenderer.invoke('break-prompt-show', data),
  breakPromptHide:     ()     => ipcRenderer.invoke('break-prompt-hide'),
  onBreakChoice:       (cb)   => ipcRenderer.on('break-choice', (_, choice) => cb(choice)),
  // Custom break sound file picker (slice 7). Main opens an OS file
  // dialog and returns the chosen path; the renderer plays it via
  // `new Audio('file:///' + path)` (same pattern V4.1.1 desktop uses).
  pickSoundFile:       ()     => ipcRenderer.invoke('pick-sound-file'),
});
