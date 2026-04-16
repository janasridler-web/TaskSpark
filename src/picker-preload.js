const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pickerApi', {
  onInit: (cb) => ipcRenderer.on('picker-init', (_, data) => cb(data)),
  selected: (fileId) => ipcRenderer.send('picker-selected', fileId),
  cancelled: () => ipcRenderer.send('picker-cancelled'),
});
