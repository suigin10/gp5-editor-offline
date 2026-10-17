// GP-5 only. Protocol facts and test vectors: see PROTOCOL_SOURCES.md.
(function (root) {
  'use strict';
  const HEADER = Uint8Array.from('47502d3500000000000000000000000000000100'.match(/../g), h => parseInt(h, 16));
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  function crc8(bytes) {
    let c = 0;
    for (const b of bytes) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = c & 128 ? ((c << 1) ^ 7) & 255 : (c << 1) & 255;
    }
    return c;
  }
  function nameField(name) {
    if (typeof name !== 'string' || !name.trim() || name.length > 10 || /[^\x20-\x7e]/.test(name)) {
      throw Error('パッチ名は半角英数字・記号で1〜10文字にしてください。');
    }
    return Uint8Array.from(name.padEnd(10, '\0'), c => c.charCodeAt(0));
  }
  const readName = bytes => Array.from(bytes, b => String.fromCharCode(b || 32)).join('').trimEnd();
  function parse(input) {
    const bytes = Uint8Array.from(input);
    if (bytes.length !== 507 || !eq(bytes.slice(0, 20), HEADER)) throw Error('GP-5用の507バイトの.prstファイルを選択してください。');
    if (crc8(bytes.slice(21)) !== bytes[20]) throw Error('ファイルのチェックサムが一致しません。破損したファイルは読み込めません。');
    const markers = {
      21: [255,255,255,255], 35: [0,0,0,0,0,0],
      41: [255,0,16,0], 45: [1,0,4,0], 53: [2,0,4,0], 57: [10,69,77,81],
      61: [0,0,16,0], 65: [1,16,4,0], 73: [2,16,4,0],
      81: [1,0,16,0], 85: [1,32,4,0], 93: [2,32,4,0],
      101: [2,0,134,1], 105: [1,48,4,0], 113: [2,48,10,0],
      127: [3,48,40,0], 171: [4,48,64,1], 495: [3,0,8,0]
    };
    for (const [offset, marker] of Object.entries(markers)) {
      if (!eq(bytes.slice(+offset, +offset + marker.length), marker)) throw Error(`未対応のGP-5プリセット構造です（offset ${offset}）。`);
    }
    const name = readName(bytes.slice(25, 35));
    nameField(name);
    if (bytes.slice(25, 35).some(b => b !== 0 && (b < 32 || b > 126))) throw Error('未対応のパッチ名です。');
    const view = new DataView(bytes.buffer);
    if (view.getUint32(89, true) > 100 || view.getUint32(97, true) < 40 || view.getUint32(97, true) > 260) throw Error('音量またはテンポが範囲外です。');
    for (const offset of [109, 499, 503]) if (view.getUint32(offset, true) > 1023) throw Error('エフェクトのスイッチ情報が範囲外です。');
    const order = bytes.slice(117, 127);
    if (new Set(order).size !== 10 || order.some(n => n > 9)) throw Error('エフェクトの並び順が不正です。');
    for (let offset = 175; offset < 495; offset += 4) {
      const v = view.getFloat32(offset, true);
      if (!Number.isFinite(v) || Math.abs(v) > 1000000) throw Error('パラメーターに不正な数値が含まれています。');
    }
    return { bytes, name, body: bytes.slice(41) };
  }
  function build(name, body) {
    if (body.length !== 466) throw Error('本体から読み取ったパッチの長さが不正です。');
    const b = new Uint8Array(507);
    b.set(HEADER); b.set([255,255,255,255], 21); b.set(nameField(name), 25); b.set(body, 41);
    b[20] = crc8(b.slice(21));
    return parse(b).bytes;
  }
  function slot(n) {
    if (!Number.isInteger(n) || n < 0 || n > 99) throw Error('パッチ番号が範囲外です。');
    return [n, 0, 0, 0];
  }
  function packetize(payload) {
    const count = Math.ceil(payload.length / 19);
    return Array.from({ length: count }, (_, index) => {
      const data = payload.slice(index * 19, (index + 1) * 19);
      const raw = [count, index, data.length, ...data];
      return Uint8Array.from([240, ...[crc8(raw), ...raw].flatMap(b => [b >> 4, b & 15]), 247]);
    });
  }
  function decode(wire) {
    if (wire[0] !== 240 || wire[wire.length - 1] !== 247 || wire.length < 10 || wire.length % 2) return null;
    const n = Array.from(wire).slice(1, -1);
    if (n.some(b => b > 15)) return null;
    const b = Uint8Array.from({ length: n.length / 2 }, (_, i) => n[i * 2] * 16 + n[i * 2 + 1]);
    if (crc8(b.slice(1)) !== b[0] || b[3] !== b.length - 4 || !b[1] || b[2] >= b[1]) return null;
    return { total: b[1], index: b[2], payload: b.slice(4) };
  }
  function writeFrames(bytes, target) { return packetize([17, 79, ...slot(target), ...parse(bytes).bytes.slice(25)]); }
  function renameFrame(target, name) { return packetize([17, 76, ...slot(target), ...nameField(name)])[0]; }
  function selectFrame(target) { return packetize([17, 67, ...slot(target)])[0]; }
  const API = { parse, build, crc8, eq, hex, nameField, readName, packetize, decode, writeFrames, renameFrame, selectFrame };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GP5PresetCodec = API;
})(globalThis);
