const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timerAPI', {
  onStart: (cb) => ipcRenderer.on('timer-start', (_, data) => cb(data)),
  stop:    (elapsed) => ipcRenderer.send('timer-stop', elapsed),
});
