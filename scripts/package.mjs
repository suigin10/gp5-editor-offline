import { packager } from '@electron/packager';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
const electronVersion = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/package.json'))).version;
const cacheRoot = path.resolve(root, '../electron-cache');
const filename = `electron-v${electronVersion}-win32-x64.zip`;
const cached = fs.existsSync(cacheRoot) ? fs.readdirSync(cacheRoot).map(p => path.join(cacheRoot, p)).find(p => fs.existsSync(path.join(p, filename))) : undefined;
if (cached) {
  const checksums = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/electron/checksums.json')));
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(cached, filename))).digest('hex');
  if (checksums[filename] !== digest) throw new Error('Electron runtime checksum mismatch');
}
const result = await packager({
  dir: root, name: 'GP5 Editor Offline', executableName: 'GP5-Editor-Offline',
  platform: 'win32', arch: 'x64', appVersion: version, electronVersion,
  win32metadata: { CompanyName: 'Unofficial local port', FileDescription: 'GP-5 USB / Bluetooth Editor' },
  icon: path.join(root, 'app/assets/app-icon.ico'),
  electronZipDir: cached,
  out: path.resolve(root, '../../outputs', version), asar: true, overwrite: true,
  ignore: [/^\/upstream/, /^\/scripts/, /^\/smoke/, /^\/package-lock\.json/],
  download: { cacheRoot }
});
for (const output of result) {
  for (const file of ['README.txt', 'README.md', 'ACKNOWLEDGEMENTS.md', 'RELEASE_NOTES.md', 'THIRD_PARTY_NOTICES.txt', 'DISTRIBUTION.md', 'VALIDATION.md', 'BOOTSTRAP-LICENSE.txt']) {
    fs.copyFileSync(path.join(root, file), path.join(output, file));
  }
  fs.copyFileSync(path.join(root, 'upstream/ORIGIN.json'), path.join(output, 'ORIGIN.json'));
}
console.log(result.join('\n'));
