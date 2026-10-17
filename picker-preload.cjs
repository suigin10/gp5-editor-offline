const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gp5Bluetooth', {
  onDevices: callback => ipcRenderer.on('gp5-ble-devices', (_event, devices) => callback(devices)),
  select: id => ipcRenderer.send('gp5-ble-select', id),
  cancel: () => ipcRenderer.send('gp5-ble-cancel')
});
