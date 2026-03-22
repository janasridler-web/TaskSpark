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

  // Drive — auto-create spreadsheet
  driveCreateSheet: (data) => ipcRenderer.invoke('drive-create-sheet', data),

  // Break prompt
  breakPromptShow: (data) => ipcRenderer.invoke('break-prompt-show', data),
  breakPromptHide: () => ipcRenderer.invoke('break-prompt-hide'),
  onBreakChoice:   (cb) => ipcRenderer.on('break-choice', (_, choice) => cb(choice)),

  // Timer window
  timerShow:      (data) => ipcRenderer.invoke('timer-show', data),
  timerHide:      ()     => ipcRenderer.invoke('timer-hide'),
  onTimerStopped: (cb)   => ipcRenderer.on('timer-stopped', (_, elapsed) => cb(elapsed)),

  // Sound
  pickSoundFile: () => ipcRenderer.invoke('pick-sound-file'),

  // Google Sheets
  sheetsEnsure: (data) => ipcRenderer.invoke('sheets-ensure', data),
  sheetsLoad:   (data) => ipcRenderer.invoke('sheets-load', data),
  sheetsSave:   (data) => ipcRenderer.invoke('sheets-save', data),

  // Auto-updater
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info) => cb(info)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', (_, info) => cb(info)),
  installUpdate:      ()   => ipcRenderer.send('install-update'),
});
