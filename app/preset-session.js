(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./preset-codec.js') : root.GP5PresetCodec;
  class PresetSession {
    constructor(send, timeout = 4000, deviceKey = 'gp5') { this.send = send; this.timeout = timeout; this.pending = null; this.lastReceived = 0; this.profile = (typeof module !== 'undefined' && module.exports ? require('./device-profiles.js') : root.GPProfiles).get(deviceKey); }
    wait(test, selector = null) {
      if (this.pending) throw Error('通信処理が競合しました。');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.cancel(Error('本体からの応答がありません。接続を確認してください。')), this.timeout);
        this.pending = { test, selector, resolve: data => { clearTimeout(timer); this.pending = null; resolve(data); },
          reject: error => { clearTimeout(timer); this.pending = null; reject(error); } };
      });
    }
    cancel(error) { this.pending?.reject(error); }
    receive(wire) {
      const frame = C.decode(wire);
      if (!frame) return;
      this.lastReceived = Date.now();
      if (!this.pending) return;
      try {
        const result = this.pending.test(frame);
        if (result) this.pending.resolve(result);
      } catch (error) { this.cancel(error); }
    }
    async exchange(frame, test, selector = null) {
      const response = this.wait(test, selector);
      try { await this.send(frame); } catch (error) { this.cancel(error); }
      return response;
    }
    async command(frame) {
      return this.exchange(frame, f => {
        if(f.total!==1||f.index!==0||f.payload[0]!==20)return null;
        if(f.payload.length<3||f.payload[2]!==0)throw Error('本体が操作を拒否しました。処理を中止します。');
        return f.payload;
      });
    }
    async readQuiet() {
      // Drain the tail of an interrupted reply before issuing another read.
      const deadline = Date.now() + 600;
      while (Date.now() - this.lastReceived < 40) {
        if (Date.now() >= deadline) throw Error('本体からの応答が続いています。操作を止めて同期を待ってください。');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    async read(selector) {
      for (let attempt = 0; attempt < 2; attempt++) {
        await this.readQuiet();
        try { return await this.readOnce(selector); }
        catch (error) { if (!error.readCollision || attempt) throw error; }
      }
    }
    async readOnce(selector) {
      let chunks = [], total = 0, size = 0;
      const collision = message => { throw Object.assign(Error(message), {readCollision:true}); };
      return this.exchange(C.packetize([18, selector])[0], frame => {
        if (frame.index === 0) {
          if (frame.payload[0] !== 18 || frame.payload[1] !== selector) {
            // A single-frame notification cannot add continuation packets to our reply.
            if (total && frame.total > 1) collision('読み取り中に別の応答が割り込みました。');
            return null;
          }
          if (total) {
            if (frame.total === total && C.eq(frame.payload, chunks[0])) return null;
            collision('読み取り中に応答内容が変わりました。');
          }
          total = frame.total;
        }
        if (!total) return null;
        if (frame.total !== total) collision('読み取り中に応答の構成が変わりました。');
        if (frame.index < chunks.length) {
          if (C.eq(frame.payload, chunks[frame.index])) return null;
          collision('読み取り中に同じ番号の応答内容が変わりました。');
        }
        if (frame.index !== chunks.length) collision('パッチ応答の順番または一部が欠けています。');
        chunks.push(frame.payload);
        size += frame.payload.length;
        if (size > 2200) throw Error('本体の応答が長すぎます。');
        if (chunks.length !== total) return null;
        const payload = Uint8Array.from(chunks.flatMap(c => Array.from(c)));
        const expected = { 64: 2002, 65: this.profile.bodyLength + 2 }[selector];
        if (expected && payload.length !== expected) throw Error('本体の応答サイズが一致しません。');
        if (selector === 67 && ![4, 6].includes(payload.length)) throw Error('パッチ番号の応答が不正です。');
        return payload;
      }, selector);
    }
    async currentSlot() {
      const data = await this.read(67);
      const n = data[2] + data[3] * 256;
      if (n > 99) throw Error('本体のパッチ番号が不正です。');
      return n;
    }
    async names() {
      const data = await this.read(64);
      return Array.from({ length: 100 }, (_, i) => C.readName(data.slice(6 + i * 20, 6 + this.profile.fileNameLength + i * 20)));
    }
    async body() { return (await this.read(65)).slice(2); }
    async assetTable(kind) {
      const A=typeof module!=='undefined'&&module.exports?require('./asset-codec.js'):root.GP5AssetCodec;
      return A.table(kind,await this.read(A.kindInfo(kind).selector));
    }
    async uploadAsset(kind,slot,name,data,progress=()=>{}) {
      const A=typeof module!=='undefined'&&module.exports?require('./asset-codec.js'):root.GP5AssetCodec;
      const frames=A.frames(kind,slot,name,data);
      await new Promise(resolve=>setTimeout(resolve,300));
      for(let i=0;i<frames.length;i++) {
        await this.exchange(frames[i],frame=>{
          const p=frame.payload;
          if(frame.total!==1||frame.index!==0||![19,20].includes(p[0]))return null;
          if(p.length<3||p[2]!==0)throw Error(`本体が転送を拒否しました（${i+1}/${frames.length}）。自動再送は行いません。`);
          return p;
        });
        progress(i+1,frames.length);
      }
      for(let attempt=0;attempt<3;attempt++) {
        await new Promise(resolve=>setTimeout(resolve,500));
        const entry=(await this.assetTable(kind))[slot];
        if(entry.flag===0&&entry.name===name)return entry;
      }
      throw Error('転送後の名前・状態が一致しません。内容の完全照合はできません。元ファイルを保管して再接続後に確認してください。');
    }
    async select(target) {
      await this.command(C.selectFrame(target));
      await new Promise(resolve => setTimeout(resolve, 300));
      if (await this.currentSlot() !== target) throw Error('本体のパッチ切り替えを確認できません。');
    }
    async reload(target) { await this.select((target + 1) % 100); await this.select(target); }
    async write(bytes, target, progress = () => {}) {
      // No blind retry: one outstanding, CRC-checked ACK per captured Suite frame.
      const frames = C.writeFrames(bytes, target, this.profile.key);
      for (let i = 0; i < frames.length; i++) { await this.command(frames[i]); progress(i + 1, frames.length); }
      await this.reload(target);
      const body = await this.body(), names = await this.names();
      const expected = C.parse(bytes, this.profile.key);
      if (!C.eq(body, expected.body) || names[target] !== expected.name) throw Error('書き込み後のパッチが一致しません。バックアップを保持し、再接続して確認してください。');
      return { body, names };
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = PresetSession;
  else root.GP5PresetSession = PresetSession;
})(globalThis);
