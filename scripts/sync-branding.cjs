const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
for (const name of ['index.html', 'bluetooth.html']) {
  const filename = path.join(root, 'app', name);
  let html = fs.readFileSync(filename, 'utf8');
  html = html.replace(/GP(?:5|50)? Editor(?: Offline)?(?: — Offline)?(?: —| -)? v[\d.]+b?/g, `GP Editor Offline — v${version}`);
  html = html.replace(/Editor for the GP5 v[\d.]+/g, `Offline USB / Bluetooth editor for GP-5, app v${version}`);
  html = html.replace(/<meta name="description" content="[^"]*"\s*\/>/g, `<meta name="description" content="Offline USB / Bluetooth editor for GP-5, app v${version}" />`);
  const bluetooth = name.includes('bluetooth');
  const model = name.startsWith('gp50') ? 'GP-50' : 'GP-5';
  html = html.replace(/Not Connected - Use Chrome Web browser[^<]*/g, `未接続 — ${model}の${bluetooth ? 'Bluetoothを有効にして' : 'USBを接続して'}Connectを押してください。`);
  html = html.replaceAll('Web Bluetooth is not supported in this browser.', 'Bluetooth機能を利用できません。WindowsのBluetooth設定を確認してください。');
  html = html.replace(/^\s*<meta property="og:[^\n]+\n/gm, '');
  html = html.replaceAll('vendor/iconogp5.png', 'assets/app-icon.png');
  html = html.replace(/<meta name="application-version" content="[^"]*">\s*/g, '');
  html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n        <meta name="application-version" content="${version}">`);
  fs.writeFileSync(filename, html);
}
console.log(`Page branding synchronized: v${version}`);
