const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const data = path.resolve(root, 'smoke-icon');
fs.mkdirSync(data, { recursive: true });
app.setPath('userData', data);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 256, height: 256, useContentSize: true,
    show: false, transparent: true, frame: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  await win.loadFile(path.join(root, 'app/assets/app-icon.svg'));
  await new Promise(resolve => setTimeout(resolve, 500));
  fs.writeFileSync(path.join(root, 'app/assets/app-icon.png'), (await win.webContents.capturePage()).toPNG());
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
