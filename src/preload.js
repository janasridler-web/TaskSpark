const { contextBridge, ipcRenderer } = require('electron');

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
  archiveAppend: (data) => ipcRenderer.invoke('archive-append', data),
  ideasSave:     (data) => ipcRenderer.invoke('ideas-save', data),
  ideasLoad:     (data) => ipcRenderer.invoke('ideas-load', data),
  habitsSave:    (data) => ipcRenderer.invoke('habits-save', data),
  habitsLoad:    (data) => ipcRenderer.invoke('habits-load', data),
  winsSave:      (data) => ipcRenderer.invoke('wins-save', data),
  winsLoad:      (data) => ipcRenderer.invoke('wins-load', data),
  eventsSave:    (data) => ipcRenderer.invoke('events-save', data),
  eventsLoad:    (data) => ipcRenderer.invoke('events-load', data),
  eventsSave:    (data) => ipcRenderer.invoke('events-save', data),
  eventsLoad:    (data) => ipcRenderer.invoke('events-load', data),
  sheetsLoad:   (data) => ipcRenderer.invoke('sheets-load', data),
  sheetsSave:   (data) => ipcRenderer.invoke('sheets-save', data),

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
