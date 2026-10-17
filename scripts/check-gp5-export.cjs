// Compare GP-5 export bytes with the upstream implementation without a pedal.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function fn(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  const open = source.indexOf('{', start);
  let depth = 1, end = open + 1;
  // These five upstream functions have no braces in string literals or comments.
  for (; depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return source.slice(start, end);
}
function exportBytes(html, fixture) {
  let result;
  const context = {
    patchNames: fixture.names, currentPatchNumber: fixture.slot,
    dumpPatchInfo: fixture.data, saveGp5: true, saveGp50: false,
    Uint8Array,
    Blob: class { constructor(parts) { result = { bytes: Buffer.from(parts[0]) }; } },
    URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
    document: { createElement() { return { click() { result.filename = this.download; } }; } },
    alert(message) { throw Error(message); }
  };
  vm.createContext(context);
  const code = ['crc8', 'hexStringToBytes', 'stringToHexArray', 'generateVerifier', 'savePresetFile'].map(n => fn(html, n)).join('\n');
  vm.runInContext(`${code}\nsavePresetFile();`, context);
  return result;
}
for (const [original, local] of [['usb.html', 'index.html'], ['bluetooth.html', 'bluetooth.html']]) {
  const upstream = fs.readFileSync(path.join(root, 'upstream', original), 'utf8');
  const current = fs.readFileSync(path.join(root, 'app', local), 'utf8');
  assert(current.includes('data-device="gp5"'));
  assert(!/helpModal|buymeacoffee|Virtual Midi|preset Converter/i.test(current));
  for (let slot of [0, 49, 99]) {
    const fixture = { slot, names: Array.from({ length: 100 }, (_, i) => `Patch ${String(i).padStart(4, '0')}`),
      data: [Array.from({ length: 400 }, (_, i) => (i * 7 + slot) % 16)] };
    const a = exportBytes(upstream, fixture), b = exportBytes(current, fixture);
    assert.deepEqual(b, a, `${local}, patch ${slot}`);
  }
  const script = current.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)[1];
  new vm.Script(script, { filename: local });
  console.log(`${local}: GP-5 page, syntax, original preset bytes verified (patches 0, 49, 99).`);
}
