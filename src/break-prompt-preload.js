const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('breakPromptAPI', {
  choose: (choice) => ipcRenderer.send('break-choice', choice),
});
