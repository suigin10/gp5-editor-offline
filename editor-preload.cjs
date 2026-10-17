const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gp5Files', {
  onAction: callback => ipcRenderer.on('gp5-action',(_event,action)=>callback(action)),
  save: (bytes, name) => ipcRenderer.invoke('gp5-file-save', bytes, name),
  open: () => ipcRenderer.invoke('gp5-file-open'),
  backup: (bytes, label) => ipcRenderer.invoke('gp5-file-backup', bytes, label),
  showBackups: () => ipcRenderer.invoke('gp5-file-show-backups'),
  batchStart: () => ipcRenderer.invoke('gp5-batch-start'),
  batchWrite: (id,bytes,slot,editing=false) => ipcRenderer.invoke('gp5-batch-write',id,bytes,slot,editing),
  batchEnd: (id,status) => ipcRenderer.invoke('gp5-batch-end',id,status),
  assetOpen: kind => ipcRenderer.invoke('gp5-asset-open',kind),
  assetArchive: (id,slot,name) => ipcRenderer.invoke('gp5-asset-archive',id,slot,name),
  assetResult: (id,status) => ipcRenderer.invoke('gp5-asset-result',id,status),
  showAssets: () => ipcRenderer.invoke('gp5-assets-show')
});
