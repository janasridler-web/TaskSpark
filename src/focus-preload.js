const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusAPI', {
  onStart:       (cb) => ipcRenderer.on('focus-start',   (_, data) => cb(data)),
  onPaused:      (cb) => ipcRenderer.on('focus-paused',  () => cb()),
  onResumed:     (cb) => ipcRenderer.on('focus-resumed', () => cb()),
  stop:          (elapsed) => ipcRenderer.send('timer-stop', elapsed),
  pause:         () => ipcRenderer.send('timer-pause-request'),
  resume:        () => ipcRenderer.send('timer-resume-request'),
  toggleSubtask: (taskId, index) => ipcRenderer.send('focus-subtask-toggle', { taskId, index }),
});
