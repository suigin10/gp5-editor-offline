const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gp5Files', {
  save: (bytes, name) => ipcRenderer.invoke('gp5-file-save', bytes, name),
  open: () => ipcRenderer.invoke('gp5-file-open'),
  backup: (bytes, label) => ipcRenderer.invoke('gp5-file-backup', bytes, label),
  showBackups: () => ipcRenderer.invoke('gp5-file-show-backups')
});
