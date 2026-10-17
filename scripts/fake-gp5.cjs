// Deterministic test device. Never opens a MIDI/Bluetooth endpoint.
(function (root) {
  const C = typeof module !== 'undefined' && module.exports ? require('../app/preset-codec.js') : root.GP5PresetCodec;
  class FakeGP5 {
    constructor(fixture, deliver, blockSize = 19) {
      this.flash = Array.from({ length: 100 }, () => Uint8Array.from(fixture));
      this.current = 4; this.ram = this.flash[4].slice(41); this.deliver = deliver;
      this.blockSize = blockSize; this.sent = []; this.writes = 0; this.incoming = [];
      this.dropAt = -1;
      this.rejectAt=-1;this.assetWrites=0;
      this.tables={32:Array.from({length:20},(_,slot)=>({flag:1,name:`User IR ${slot+1}`})),36:Array.from({length:80},(_,slot)=>({flag:1,name:slot<50?`Factory${slot}`:'Empty'}))};
    }
    reply(payload) {
      const total = Math.ceil(payload.length / this.blockSize);
      for (let i = 0; i < total; i++) {
        const data = Array.from(payload.slice(i * this.blockSize, (i + 1) * this.blockSize));
        const raw = [total, i, data.length, ...data];
        const frame = Uint8Array.from([240,...[C.crc8(raw),...raw].flatMap(b => [b >> 4,b & 15]),247]);
        setTimeout(() => this.deliver(frame), 1 + i);
      }
    }
    send(wire) {
      if (wire[0] === 0xc0 && wire.length === 2) {
        this.sent.push({ short:Array.from(wire) });
        if(wire[1] !== this.current) { this.current=wire[1]; this.ram=this.flash[this.current].slice(41); }
        return;
      }
      const frame = C.decode(wire);
      if (!frame) throw Error('Test received corrupt frame');
      this.sent.push(frame);
      if (this.sent.length === this.dropAt) return;
      if (this.sent.length === this.rejectAt) { this.reply([20,8,1]);return; }
      const p = frame.payload;
      if (frame.total > 1) {
        if (frame.index !== this.incoming.length) throw Error('Out of order write');
        this.incoming.push(p);
        if (this.incoming.length === frame.total) {
          const data = Uint8Array.from(this.incoming.flatMap(v => Array.from(v)));
          if(data[0]===17&&[33,37].includes(data[1])) {
            const ir=data[1]===33,slot=new DataView(data.buffer).getUint32(6,true)-(ir?0x0a100000:0x0f000000);
            this.tables[ir?32:36][slot]={flag:0,name:C.readName(data.slice(10,26))};this.assetWrites++;this.assetData=data.slice(74);
          }else{
            if (data[0] !== 17 || data[1] !== 79) throw Error('Forbidden test opcode');
            this.flash[data[2]] = C.build(C.readName(data.slice(6,22)), data.slice(22));this.writes++;
          }
          this.incoming = [];
        }
        this.reply([20,8,0]); return;
      }
      if (p[0] === 18) {
        if (p[1] === 67) this.reply([18,67,this.current,0]);
        else if (p[1] === 65) this.reply([18,65,...this.ram]);
        else if (p[1] === 64) {
          const names = [18,64];
          this.flash.forEach((b,i) => names.push(i,0,0,0,...b.slice(25,41)));
          this.reply(names);
        } else if(this.tables[p[1]]) {
          const entries=this.tables[p[1]],payload=[18,p[1],...entries.map(e=>e.flag)];
          for(const entry of entries)payload.push(...Array.from(entry.name.padEnd(16,'\0'),c=>c.charCodeAt(0)));
          this.reply(payload);
        } else throw Error('Unexpected query');
      } else if (p[0] === 17 && p[1] === 67) {
        if (p[2] !== this.current) { this.current = p[2]; this.ram = this.flash[this.current].slice(41); }
        this.reply([20,8,0]);
      } else if (p[0] === 17 && p[1] === 76) {
        this.flash[p[2]] = C.build(C.readName(p.slice(6)), this.flash[p[2]].slice(41));
        this.reply([20,8,0]);
      } else throw Error(`Unexpected command ${C.hex(p)}`);
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = FakeGP5;
  else root.FakeGP5 = FakeGP5;
})(globalThis);
