const { app, BrowserWindow, Menu, dialog, session, ipcMain, shell } = require('electron');
const crypto = require('node:crypto');
const presetCodec = require('./app/preset-codec.js');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const installBluetoothPicker = require('./bluetooth.cjs');

const smoke = process.argv.includes('--smoke-test');
const appVersion = app.getVersion();
const appTitle = `GP5 Editor Offline — v${appVersion}`;
const entry = path.join(__dirname, 'app', 'index.html');
const entryURL = pathToFileURL(entry).href;
const bluetoothEntry = path.join(__dirname, 'app', 'bluetooth.html');
const bluetoothURL = pathToFileURL(bluetoothEntry).href;
const smokeDir = process.env.GP5_SMOKE_DIR || path.join(__dirname, 'smoke');
let win;
let bluetoothPicker;
let mode = 'usb';
let smokeDownloadDone;
let smokeRejectBackup = false;
const failures = [];
const blockedRequests = [];

// A test run has separate storage; it never connects to a MIDI port or sends messages.
if (smoke) {
  fs.mkdirSync(path.join(smokeDir, 'user-data'), { recursive: true });
  app.setPath('userData', path.join(smokeDir, 'user-data'));
}
app.setAppUserModelId('local.gp5.editor.offline');

function isEditor(contents) {
  return contents && contents === win?.webContents && [entryURL, bluetoothURL].includes(contents.getURL().split('#')[0]);
}

async function switchMode(next) {
  if (mode === next) return;
  if (await win.webContents.executeJavaScript('!!window.GP5Patches?.busy')) return;
  const connected = await win.webContents.executeJavaScript(mode === 'usb'
    ? 'typeof inputPort !== "undefined" && inputPort !== null'
    : 'typeof device !== "undefined" && !!device?.gatt?.connected');
  if (connected) {
    const { response } = await dialog.showMessageBox(win, { type: 'question',
      buttons: ['切り替える', 'キャンセル'], defaultId: 1, cancelId: 1,
      message: '接続方式を切り替えますか？', detail: '現在の接続を終了します。必要なパッチ保存は先に行ってください。' });
    if (response !== 0) {
      Menu.getApplicationMenu().getMenuItemById('mode-usb').checked = mode === 'usb';
      Menu.getApplicationMenu().getMenuItemById('mode-bluetooth').checked = mode === 'bluetooth';
      return;
    }
    await win.webContents.executeJavaScript('gui.btn_disconnect.onclick()');
  }
  bluetoothPicker.cancel();
  mode = next;
  await win.loadFile(mode === 'usb' ? entry : bluetoothEntry);
  Menu.getApplicationMenu().getMenuItemById('mode-usb').checked = mode === 'usb';
  Menu.getApplicationMenu().getMenuItemById('mode-bluetooth').checked = mode === 'bluetooth';
}

app.whenReady().then(async () => {
  const ses = session.fromPartition('persist:gp5-offline-v1');
  ses.setPermissionCheckHandler((contents, permission) =>
    isEditor(contents) && ['midi', 'midiSysex'].includes(permission));
  ses.setPermissionRequestHandler((contents, permission, callback) =>
    callback(isEditor(contents) && ['midi', 'midiSysex'].includes(permission)));

  // Bundled files, inline images and preset downloads work without Internet access.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed = ['file:', 'data:', 'blob:', 'devtools:'].some(p => details.url.startsWith(p));
    if (!allowed) blockedRequests.push(details.url);
    callback({ cancel: !allowed });
  });
  ses.on('will-download', (_event, item) => {
    const name = path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    if (smoke) item.setSavePath(path.join(smokeDir, 'synthetic.prst'));
    else item.setSaveDialogOptions({
      title: 'Save GP-5 preset',
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: [{ name: 'GP preset', extensions: ['prst'] }]
    });
    item.once('done', (_ev, state) => {
      if (smoke && smokeDownloadDone) smokeDownloadDone(state);
      if (state === 'interrupted' && !smoke) dialog.showErrorBox('Preset download failed', 'The preset file could not be saved.');
    });
  });

  win = new BrowserWindow({
    width: 1280, height: 900, minWidth: 760, minHeight: 600,
    show: !smoke, backgroundColor: '#212529',
    icon: path.join(__dirname, 'app', 'assets', 'app-icon.ico'),
    title: appTitle,
    webPreferences: { session: ses, preload: path.join(__dirname, 'editor-preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true }
  });
  const backupDir = path.join(app.getPath('userData'), 'patch-backups');
  const checked = (event, bytes) => {
    if (!isEditor(event.sender)) throw Error('Invalid editor');
    if (!Array.isArray(bytes) || bytes.length !== 507 || bytes.some(b => !Number.isInteger(b) || b < 0 || b > 255)) throw Error('Invalid preset');
    return Buffer.from(presetCodec.parse(bytes).bytes);
  };
  const safeName = value => String(value || 'GP5').replace(/[^A-Za-z0-9 _.-]/g, '_').slice(0, 80).replace(/[. ]+$/, '') || 'GP5';
  function atomicSave(filename, bytes) {
    const temp = `${filename}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, bytes, { flag: 'wx' });
      fs.renameSync(temp, filename);
      if (!fs.readFileSync(filename).equals(bytes)) throw Error('保存後のファイルが一致しません。');
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  ipcMain.handle('gp5-file-save', async (event, bytes, name) => {
    const data = checked(event, bytes);
    if (smoke) { atomicSave(path.join(smokeDir, `pc-${mode}.prst`), data); return `pc-${mode}.prst`; }
    const result = await dialog.showSaveDialog(win, { title: 'パッチをPCに保存',
      defaultPath: path.join(app.getPath('documents'), `${safeName(name)}.prst`),
      filters: [{ name: 'GP-5 preset', extensions: ['prst'] }] });
    if (result.canceled) return null;
    atomicSave(result.filePath, data);
    return path.basename(result.filePath);
  });
  ipcMain.handle('gp5-file-open', async event => {
    if (!isEditor(event.sender)) throw Error('Invalid editor');
    const result = await dialog.showOpenDialog(win, { title: 'GP-5パッチをPCから読み込み', properties: ['openFile'],
      filters: [{ name: 'GP-5 preset', extensions: ['prst'] }] });
    if (result.canceled) return null;
    const filename = result.filePaths[0];
    if (fs.statSync(filename).size !== 507) throw Error('GP-5用の507バイトの.prstファイルを選択してください。');
    const bytes = presetCodec.parse(fs.readFileSync(filename)).bytes;
    return { name: path.basename(filename), bytes: Array.from(bytes) };
  });
  ipcMain.handle('gp5-file-backup', (event, bytes, label) => {
    const data = checked(event, bytes);
    if (smoke && smokeRejectBackup) throw Error('テスト用: バックアップ保存失敗');
    fs.mkdirSync(backupDir, { recursive: true });
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${safeName(label)}-${crypto.randomUUID().slice(0,8)}.prst`;
    const filename = path.join(backupDir, name);
    fs.writeFileSync(filename, data, { flag: 'wx' });
    if (!fs.readFileSync(filename).equals(data)) throw Error('バックアップを確認できません。処理を中止しました。');
    return name;
  });
  ipcMain.handle('gp5-file-show-backups', async event => {
    if (!isEditor(event.sender)) throw Error('Invalid editor');
    fs.mkdirSync(backupDir, { recursive: true });
    const error = await shell.openPath(backupDir);
    if (error) throw Error(error);
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] === win.webContents.getURL().split('#')[0]) return;
    event.preventDefault();
    if (url.split('#')[0] === entryURL) switchMode('usb').catch(console.error);
    if (url.split('#')[0] === bluetoothURL) switchMode('bluetooth').catch(console.error);
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('console-message', details => {
    if (details.level === 'error' || details.level === 3) failures.push(details.message);
  });
  win.webContents.on('render-process-gone', (_ev, details) => failures.push(JSON.stringify(details)));
  bluetoothPicker = installBluetoothPicker(win);

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }] },
    { label: 'Connection', submenu: [
      { id: 'mode-usb', label: 'USB', type: 'radio', checked: true, click: () => switchMode('usb').catch(console.error) },
      { id: 'mode-bluetooth', label: 'Bluetooth', type: 'radio', click: () => switchMode('bluetooth').catch(console.error) }
    ] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'GP-5', submenu: [{ label: 'About GP5 Editor', click: () => dialog.showMessageBox(win, {
      type: 'info', title: appTitle,
      message: `${appTitle} (USB / Bluetooth)`,
      detail: 'Based on GP5 Editor by rvalladares.\n原作者rvalladares氏の開発・公開に感謝します。\nこのアプリが役に立ったら、原作者への寄付もぜひご検討ください（任意）。\n\nOriginal: https://rvalladares.com/gp5/gp5editor/\nSupport the original developer: https://www.buymeacoffee.com/rvalladares\n\n非公式のWindows移植版です。原作の再配布条件は未確認です。READMEと謝辞をご確認ください。'
    }) }] }
  ]));

  await win.loadFile(entry);
  if (smoke) {
    // Only inspect the DOM and enumerate MIDI endpoints. Do not press Connect.
    await new Promise(resolve => setTimeout(resolve, 800));
    const usb = await win.webContents.executeJavaScript(`(async () => {
      const controls = ['btn_connect','btn_disconnect','btn_save_patch','saveGP5Preset','status_text','connection-mode','mode-usb','mode-bluetooth'];
      const result = { title: document.title, secureContext: isSecureContext,
        hasWebMIDI: typeof navigator.requestMIDIAccess === 'function',
        controls: Object.fromEntries(controls.map(id => [id, !!document.getElementById(id)])),
        nodeExposed: typeof process !== 'undefined' || typeof require !== 'undefined',
        imagesComplete: [...document.images].every(i => i.complete && i.naturalWidth > 0),
        initialInputPort: inputPort === null, initialOutputPort: outputPort === null,
        originalSaveConfirmation: gui.btn_save_patch.disabled,
        gp5OnlyUI: !document.getElementById('saveGP50Preset') && !document.getElementById('helpModal') && !document.querySelector('footer'),
        activeMode: document.querySelector('#connection-mode [aria-current="page"]').textContent,
        appVersion: document.querySelector('meta[name="application-version"]').content,
        favicon: document.querySelector('link[rel="icon"]').getAttribute('href') };
      const access = await navigator.requestMIDIAccess({ sysex: true });
      result.sysexEnabled = access.sysexEnabled;
      result.inputs = [...access.inputs.values()].map(p => ({ name: p.name, connection: p.connection }));
      result.outputs = [...access.outputs.values()].map(p => ({ name: p.name, connection: p.connection }));
      try { await fetch('https://example.com/offline-probe'); result.remoteBlocked = false; }
      catch { result.remoteBlocked = true; }
      return result;
    })()`);
    fs.mkdirSync(smokeDir, { recursive: true });
    const downloadState = new Promise(resolve => { smokeDownloadDone = resolve; });
    await win.webContents.executeJavaScript(`(() => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([new Uint8Array([71,80,45,53,0])]));
      a.download = 'synthetic.prst'; a.click();
    })()`);
    const completed = await Promise.race([downloadState, new Promise(resolve => setTimeout(() => resolve('timeout'), 4000))]);
    usb.presetDownloadState = completed;
    usb.presetDownloadPassed = completed === 'completed' && fs.readFileSync(path.join(smokeDir, 'synthetic.prst')).equals(Buffer.from([71,80,45,53,0]));
    const patchTests = process.env.GP5_PATCH_TEST_ROOT ? require(path.join(process.env.GP5_PATCH_TEST_ROOT, 'scripts/patch-smoke.cjs')) : null;
    if (patchTests) usb.patchTools = await patchTests(win, { root: process.env.GP5_PATCH_TEST_ROOT, mode, smokeDir, backupDir, rejectBackup: value => { smokeRejectBackup = value; } });
    fs.writeFileSync(path.join(smokeDir, 'usb-window.png'), (await win.webContents.capturePage()).toPNG());
    await switchMode('bluetooth');
    await new Promise(resolve => setTimeout(resolve, 500));
    const bluetooth = await win.webContents.executeJavaScript(`(async () => {
      const result = { title: document.title, secureContext: isSecureContext,
        hasWebBluetooth: !!navigator.bluetooth,
        connected: typeof device !== 'undefined' && !!device?.gatt?.connected,
        connectButton: !!document.getElementById('btn_connect'),
        nodeExposed: typeof process !== 'undefined' || typeof require !== 'undefined',
        imagesComplete: [...document.images].every(i => i.complete && i.naturalWidth > 0),
        gp5OnlyUI: !document.getElementById('saveGP50Preset') && !document.getElementById('helpModal') && !document.querySelector('footer'),
        activeMode: document.querySelector('#connection-mode [aria-current="page"]').textContent,
        appVersion: document.querySelector('meta[name="application-version"]').content,
        favicon: document.querySelector('link[rel="icon"]').getAttribute('href') };
      result.adapterAvailable = await navigator.bluetooth.getAvailability();
      return result;
    })()`);
    if (patchTests) bluetooth.patchTools = await patchTests(win, { root: process.env.GP5_PATCH_TEST_ROOT, mode, smokeDir, backupDir, rejectBackup: value => { smokeRejectBackup = value; } });
    fs.writeFileSync(path.join(smokeDir, 'bluetooth-window.png'), (await win.webContents.capturePage()).toPNG());
    // Exercise our native BLE picker using synthetic discovery results only.
    const { BrowserWindow: BW, ipcMain } = require('electron');
    let selected = null;
    win.webContents.emit('select-bluetooth-device', { preventDefault() {} },
      [{ deviceId: 'SMOKE-NOT-A-REAL-DEVICE', deviceName: 'GP-5 (simulated)' }], id => { selected = id; });
    const picker = BW.getAllWindows().find(w => w !== win);
    if (picker.webContents.isLoading()) await new Promise(resolve => picker.webContents.once('did-finish-load', resolve));
    await new Promise(resolve => setTimeout(resolve, 150));
    const pickerHasDevice = await picker.webContents.executeJavaScript('document.getElementById("devices").textContent.includes("GP-5 (simulated)")');
    ipcMain.emit('gp5-ble-select', { sender: picker.webContents }, 'SMOKE-NOT-A-REAL-DEVICE');
    bluetooth.pickerSelectPassed = pickerHasDevice && selected === 'SMOKE-NOT-A-REAL-DEVICE';
    await switchMode('usb');
    const report = { usb, bluetooth, sandboxDisabledForTest: app.commandLine.hasSwitch('no-sandbox') };
    // The deliberate offline probe emits a console error; retain other errors.
    report.errors = failures.filter(e => !e.includes('Content Security Policy') && !e.includes('violates the following') && !e.includes('https://example.com/offline-probe'));
    report.blockedRequests = blockedRequests;
    const passed = usb.secureContext && usb.hasWebMIDI && usb.sysexEnabled && !usb.nodeExposed && usb.remoteBlocked && usb.imagesComplete && usb.initialInputPort && usb.initialOutputPort && usb.presetDownloadPassed && usb.gp5OnlyUI && usb.activeMode === 'USB' && Object.values(usb.controls).every(Boolean) && bluetooth.hasWebBluetooth && bluetooth.secureContext && !bluetooth.connected && !bluetooth.nodeExposed && bluetooth.imagesComplete && bluetooth.pickerSelectPassed && bluetooth.gp5OnlyUI && bluetooth.activeMode === 'Bluetooth' && !report.errors.length;
    report.passed = passed && [usb, bluetooth].every(r => r.appVersion === appVersion && r.title.includes(`v${appVersion}`) && r.favicon === 'assets/app-icon.png');
    fs.writeFileSync(path.join(smokeDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    app.exit(report.passed ? 0 : 1);
  }
}).catch(err => {
  if (smoke) { console.error(err); app.exit(1); }
  else { dialog.showErrorBox('GP5 Editor', String(err)); app.quit(); }
});
app.on('window-all-closed', () => app.quit());
