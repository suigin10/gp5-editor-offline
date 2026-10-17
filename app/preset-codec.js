// GP-5 / GP-50. Protocol facts and test vectors: see PROTOCOL_SOURCES.md.
(function (root) {
  'use strict';
  const profiles = typeof module !== 'undefined' && module.exports ? require('./device-profiles.js') : root.GPProfiles;
  const header = key => Uint8Array.from((key === 'gp50' ? '47502d3530000000000000000000000000000100' : '47502d3500000000000000000000000000000100').match(/../g), h => parseInt(h,16));
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
  function nameField(name, width = 10) {
    if (typeof name !== 'string' || !name.trim() || name.length > width || /[^\x20-\x7e]/.test(name)) {
      throw Error(`パッチ名は半角英数字・記号で1〜${width}文字にしてください。`);
    }
    return Uint8Array.from(name.padEnd(width, '\0'), c => c.charCodeAt(0));
  }
  const readName = bytes => Array.from(bytes, b => String.fromCharCode(b || 32)).join('').trimEnd();
  function records(bytes, start, end) {
    const out = new Map(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = start; offset < end;) {
      if (offset + 4 > end) throw Error('プリセットのレコードが途中で切れています。');
      const tag = view.getUint16(offset, true), length = view.getUint16(offset + 2, true);
      if (offset + 4 + length > end || out.has(tag)) throw Error('プリセットのレコード長または重複が不正です。');
      out.set(tag, { offset: offset + 4, length }); offset += 4 + length;
    }
    return out;
  }
  function parse(input, expectedKey) {
    const bytes = Uint8Array.from(input);
    const profile = Object.values(profiles.PROFILES).find(p => bytes.length === p.fileLength && eq(bytes.slice(0,20),header(p.key)));
    if (!profile) throw Error('GP-5（507バイト）またはGP-50（552バイト）の.prstを選択してください。');
    if (expectedKey && profile.key !== expectedKey) throw Error(`${profile.name}のファイルを${profiles.get(expectedKey).name}には直接読み込めません。`);
    if (crc8(bytes.slice(21)) !== bytes[20]) throw Error('ファイルのチェックサムが一致しません。');
    if (!eq(bytes.slice(21,25),[255,255,255,255])) throw Error('プリセットのヘッダーが不正です。');
    const nameBytes = bytes.slice(25, 25 + profile.fileNameLength);
    if (nameBytes.some(b => b && (b < 32 || b > 126))) throw Error('未対応のパッチ名です。');
    if (profile.key === 'gp5' && bytes.slice(35,41).some(b => b)) throw Error('GP-5の名前フィールドが不正です。');
    const name = readName(nameBytes); nameField(name, profile.fileNameLength);
    const groups = records(bytes,41,bytes.length);
    const sizes = { 255:16, 0:16, 1:profile.settingsLength, 2:390, 3:profile.fsLength };
    if (groups.size !== 5 || Object.entries(sizes).some(([tag,len]) => groups.get(+tag)?.length !== len)) throw Error(`未対応の${profile.name}プリセット構造です。`);
    const metadata = groups.get(255), info = records(bytes, metadata.offset, metadata.offset+metadata.length);
    if (info.get(2)?.length !== 4 || !eq(bytes.slice(info.get(2).offset,info.get(2).offset+4),profile.tag)) throw Error('本体の機種タグが一致しません。');
    const settingsGroup = groups.get(1), settings = records(bytes,settingsGroup.offset,settingsGroup.offset+settingsGroup.length);
    const view = new DataView(bytes.buffer);
    function setting(tag, length, min, max) {
      const rec = settings.get(tag);
      if (!rec || !length.includes(rec.length)) throw Error('未対応のパッチ設定です。');
      const value = rec.length === 1 ? bytes[rec.offset] : view.getUint32(rec.offset,true);
      if (value < min || value > max) throw Error('パッチ設定が範囲外です。');
      return rec.offset;
    }
    const volumeOffset = setting(0x2001,profile.key === 'gp5' ? [4] : [1],0,100);
    setting(0x2002,[4],40,260);
    if (profile.key === 'gp50') for (const [tag,len,max] of [[0x2003,1,1],[0x2004,4,100],[0x2005,4,100],[0x2006,1,1],[0x2007,1,100],[0x2008,1,100],[0x2009,1,10],[0x200a,1,7]]) setting(tag,[len],0,max);
    const toneGroup = groups.get(2), tone = records(bytes,toneGroup.offset,toneGroup.offset+toneGroup.length);
    for (const [tag,length] of [[0x3001,4],[0x3002,10],[0x3003,40],[0x3004,320]]) if (tone.get(tag)?.length !== length) throw Error('音色レコードが不正です。');
    const orderOffset = tone.get(0x3002).offset, modelsOffset = tone.get(0x3003).offset, paramsOffset = tone.get(0x3004).offset;
    const order = bytes.slice(orderOffset,orderOffset+10);
    if (new Set(order).size !== 10 || order.some(n => n > 9)) throw Error('エフェクトの並び順が不正です。');
    const fsOffset = groups.get(3).offset;
    for (const off of [tone.get(0x3001).offset,fsOffset,fsOffset+4]) if(view.getUint32(off,true)>1023) throw Error('スイッチ情報が範囲外です。');
    for (let off=paramsOffset;off<paramsOffset+320;off+=4) if(!Number.isFinite(view.getFloat32(off,true)) || Math.abs(view.getFloat32(off,true))>1000000) throw Error('パラメーターに不正な数値が含まれています。');
    return { bytes, name, body:bytes.slice(41), profile, modelsOffset, paramsOffset, volumeOffset };
  }
  function build(name, body, expectedKey) {
    const profile = Object.values(profiles.PROFILES).find(p=>p.bodyLength===body.length);
    if (!profile || (expectedKey && profile.key !== expectedKey)) throw Error('本体から読み取ったパッチの機種または長さが一致しません。');
    const b = new Uint8Array(profile.fileLength);
    b.set(header(profile.key)); b.set([255,255,255,255],21); b.set(nameField(name,profile.fileNameLength),25); b.set(body,41);
    b[20] = crc8(b.slice(21)); return parse(b,expectedKey).bytes;
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
  function writeFrames(bytes, target, expectedKey) { return packetize([17, 79, ...slot(target), ...parse(bytes, expectedKey).bytes.slice(25)]); }
  function renameFrame(target, name) { return packetize([17, 76, ...slot(target), ...nameField(name)])[0]; }
  function selectFrame(target) { return packetize([17, 67, ...slot(target)])[0]; }
  const API = { parse, build, crc8, eq, hex, nameField, readName, packetize, decode, writeFrames, renameFrame, selectFrame };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GP5PresetCodec = API;
})(globalThis);
