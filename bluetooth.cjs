const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

// The original page supplies its BLE service filter. This window replaces only
// Chromium's browser device picker; the original GATT/MIDI code stays unchanged.
module.exports = function installBluetoothPicker(parent) {
  let pending = null;
  function finish(id = '') {
    if (!pending) return;
    const current = pending;
    pending = null;
    current.callback(id);
    if (!current.window.isDestroyed()) current.window.close();
  }
  function select(event, id) {
    if (pending && event.sender === pending.window.webContents && pending.devices.has(id)) finish(id);
  }
  function cancel(event) {
    if (pending && event.sender === pending.window.webContents) finish();
  }
  ipcMain.on('gp5-ble-select', select);
  ipcMain.on('gp5-ble-cancel', cancel);
  parent.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (!pending) {
      const picker = new BrowserWindow({
        width: 480, height: 430, resizable: false, modal: true, parent,
        show: false, backgroundColor: '#212529', autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'picker-preload.cjs'),
          session: parent.webContents.session, nodeIntegration: false, contextIsolation: true, sandbox: true }
      });
      pending = { window: picker, callback, devices: new Map() };
      picker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      picker.webContents.on('will-navigate', e => e.preventDefault());
      picker.once('ready-to-show', () => { if (!process.argv.includes('--smoke-test')) picker.show(); });
      picker.webContents.once('did-finish-load', () => {
        if (pending?.window === picker) picker.webContents.send('gp5-ble-devices', [...pending.devices.values()]);
      });
      picker.on('closed', () => { if (pending?.window === picker) finish(); });
      picker.loadFile(path.join(__dirname, 'app', 'bluetooth-picker.html'));
    }
    pending.callback = callback;
    // The page's service filter may match other BLE MIDI devices; show the names
    // and require an explicit choice rather than connecting to the first result.
    for (const device of devices) pending.devices.set(device.deviceId, device);
    pending.window.webContents.send('gp5-ble-devices', [...pending.devices.values()]);
  });
  parent.on('closed', () => {
    finish();
    ipcMain.removeListener('gp5-ble-select', select);
    ipcMain.removeListener('gp5-ble-cancel', cancel);
  });
  return { cancel: () => finish(), isPending: () => !!pending };
};
