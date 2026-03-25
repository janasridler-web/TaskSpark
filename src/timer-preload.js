const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timerAPI', {
  onStart:   (cb) => ipcRenderer.on('timer-start',   (_, data) => cb(data)),
  onPaused:  (cb) => ipcRenderer.on('timer-paused',  () => cb()),
  onResumed: (cb) => ipcRenderer.on('timer-resumed', () => cb()),
  stop:      (elapsed) => ipcRenderer.send('timer-stop', elapsed),
  pause:     () => ipcRenderer.send('timer-pause-request'),
  resume:    () => ipcRenderer.send('timer-resume-request'),
});
