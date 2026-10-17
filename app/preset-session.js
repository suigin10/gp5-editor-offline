(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./preset-codec.js') : root.GP5PresetCodec;
  class PresetSession {
    constructor(send, timeout = 4000) { this.send = send; this.timeout = timeout; this.pending = null; }
    wait(test) {
      if (this.pending) throw Error('通信処理が競合しました。');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.cancel(Error('GP-5からの応答がありません。接続を確認してください。')), this.timeout);
        this.pending = { test, resolve: data => { clearTimeout(timer); this.pending = null; resolve(data); },
          reject: error => { clearTimeout(timer); this.pending = null; reject(error); } };
      });
    }
    cancel(error) { this.pending?.reject(error); }
    receive(wire) {
      const frame = C.decode(wire);
      if (!frame || !this.pending) return;
      try {
        const result = this.pending.test(frame);
        if (result) this.pending.resolve(result);
      } catch (error) { this.cancel(error); }
    }
    async exchange(frame, test) {
      const response = this.wait(test);
      try { await this.send(frame); } catch (error) { this.cancel(error); }
      return response;
    }
    async command(frame) {
      return this.exchange(frame, f => f.total === 1 && f.index === 0 && f.payload[0] === 20 ? f.payload : null);
    }
    async read(selector) {
      let chunks = [], total = 0, size = 0;
      return this.exchange(C.packetize([18, selector])[0], frame => {
        if (frame.index === 0) {
          if (frame.payload[0] !== 18 || frame.payload[1] !== selector) return null;
          if (total) throw Error('読み取り中に別の応答が重複しました。');
          total = frame.total;
        }
        if (!total || frame.total !== total) return null;
        if (frame.index !== chunks.length) throw Error('パッチ応答の順番または一部が欠けています。');
        chunks.push(frame.payload);
        size += frame.payload.length;
        if (size > 2200) throw Error('本体の応答が長すぎます。');
        if (chunks.length !== total) return null;
        const payload = Uint8Array.from(chunks.flatMap(c => Array.from(c)));
        const expected = { 64: 2002, 65: 468 }[selector];
        if (expected && payload.length !== expected) throw Error('本体の応答サイズが一致しません。');
        if (selector === 67 && ![4, 6].includes(payload.length)) throw Error('パッチ番号の応答が不正です。');
        return payload;
      });
    }
    async currentSlot() {
      const data = await this.read(67);
      const n = data[2] + data[3] * 256;
      if (n > 99) throw Error('本体のパッチ番号が不正です。');
      return n;
    }
    async names() {
      const data = await this.read(64);
      return Array.from({ length: 100 }, (_, i) => C.readName(data.slice(6 + i * 20, 16 + i * 20)));
    }
    async body() { return (await this.read(65)).slice(2); }
    async select(target) {
      await this.command(C.selectFrame(target));
      if (await this.currentSlot() !== target) throw Error('本体のパッチ切り替えを確認できません。');
    }
    async reload(target) { await this.select((target + 1) % 100); await this.select(target); }
    async write(bytes, target, progress = () => {}) {
      // No blind retry: one outstanding, CRC-checked ACK per captured Suite frame.
      const frames = C.writeFrames(bytes, target);
      for (let i = 0; i < frames.length; i++) { await this.command(frames[i]); progress(i + 1, frames.length); }
      await this.reload(target);
      const body = await this.body(), names = await this.names();
      const expected = C.parse(bytes);
      if (!C.eq(body, expected.body) || names[target] !== expected.name) throw Error('書き込み後のパッチが一致しません。バックアップを保持し、再接続して確認してください。');
      return { body, names };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PresetSession;
  else root.GP5PresetSession = PresetSession;
})(globalThis);
