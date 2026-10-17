const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gp5Files', {
  convertModel: () => ipcRenderer.invoke('gp5-convert-model'),
  convertSignal: choose => ipcRenderer.invoke('gp5-convert-signal',!!choose),
  convertRun: (id,jobId) => ipcRenderer.invoke('gp5-convert-run',id,jobId),
  convertCancel: () => ipcRenderer.invoke('gp5-convert-cancel'),
  convertSave: receipt => ipcRenderer.invoke('gp5-convert-save',receipt),
  onConvertProgress: callback => ipcRenderer.on('gp5-convert-progress',(_event,message)=>callback(message)),
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
