// Independent implementation of GP-5 file-format/protocol facts. See PROTOCOL_SOURCES.md.
(function(root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./preset-codec.js') : root.GP5PresetCodec;
  function kindInfo(kind) {
    if (kind === 'ir') return { count:20, first:0, selector:32, command:33, base:0x0a100000, size:2048 };
    if (kind === 'snap') return { count:80, first:50, selector:36, command:37, base:0x0f000000, size:2696 };
    throw Error('未対応のデータ種別です。');
  }
  function label(kind,name) {
    kindInfo(kind);
    if(typeof name !== 'string' || !name.trim() || name.length>10 || (kind==='snap' ? /[^A-Za-z0-9]/ : /[^\x20-\x7e]|\$/).test(name)) throw Error(kind==='snap' ? 'SnapTone名は半角英数字1〜10文字にしてください。' : 'IR名は半角英数字・記号1〜10文字（$以外）にしてください。');
    return name;
  }
  function crc16(bytes) {
    let value=65535;
    for(const b of bytes) { value^=b; for(let bit=0;bit<8;bit++) value=(value>>>1)^((value&1)?0xa001:0); }
    return value;
  }
  function snap(bytes) {
    const b=Uint8Array.from(bytes), d=new DataView(b.buffer);
    if(b.length!==2696 || String.fromCharCode(...b.slice(0,4))!=='VTSI') throw Error('2696バイトの変換済みSnapTone（VTSI）ファイルを選択してください。NAMは変換メニューで先に変換してください。8840バイトの中間ファイルは転送できません。');
    if(d.getUint32(4,true)!==2696 || d.getUint32(20,true)!==2560 || b[18]!==0 || b[19]!==0) throw Error('SnapToneの形式・サイズが未対応です。');
    if(crc16(b.slice(12))!==(b[8]*256+b[9])) throw Error('SnapToneのCRCが一致しません。');
    return {data:b,description:'VTSI / 2696 bytes / CRC確認済み'};
  }
  function wav(bytes) {
    const b=Uint8Array.from(bytes),d=new DataView(b.buffer),text=(at,n)=>String.fromCharCode(...b.slice(at,at+n));
    if(b.length<44 || text(0,4)!=='RIFF' || text(8,4)!=='WAVE' || d.getUint32(4,true)+8!==b.length) throw Error('RIFF/WAVEファイルが不正です。');
    let format=null,audio=null;
    for(let at=12;at+8<=b.length;) {
      const size=d.getUint32(at+4,true),end=at+8+size;
      if(end>b.length) throw Error('WAVチャンクが途中で切れています。');
      if(text(at,4)==='fmt ') { if(format || size<16) throw Error('WAV形式が不正です。'); format={code:d.getUint16(at+8,true),channels:d.getUint16(at+10,true),rate:d.getUint32(at+12,true),align:d.getUint16(at+20,true),bits:d.getUint16(at+22,true)}; }
      if(text(at,4)==='data') { if(audio) throw Error('複数の音声チャンクには未対応です。'); audio=b.slice(at+8,end); }
      at=end+(size%2);
    }
    if(!format || !audio?.length) throw Error('WAVの音声データがありません。');
    const {code,channels,rate,align,bits}=format;
    if(rate!==44100 || ![1,2].includes(channels) || !(code===1 && [16,24,32].includes(bits) || code===3 && bits===32) || align!==channels*bits/8 || audio.length%align) throw Error('44.1kHz・モノラル/ステレオのPCM16/24/32bitまたはFloat32 WAVを使用してください。');
    const out=new Uint8Array(2048),v=new DataView(audio.buffer),o=new DataView(out.buffer),frames=audio.length/align;
    let peak=0;
    for(let i=0;i<Math.min(frames,512);i++) {
      let sum=0;
      for(let ch=0;ch<channels;ch++) {
        const at=i*align+ch*bits/8;
        let sample;
        if(code===3) sample=v.getFloat32(at,true);
        else if(bits===16) sample=v.getInt16(at,true)/32768;
        else if(bits===32) sample=v.getInt32(at,true)/2147483648;
        else { let n=audio[at]+audio[at+1]*256+audio[at+2]*65536; if(n&0x800000)n-=0x1000000; sample=n/8388608; }
        if(!Number.isFinite(sample) || Math.abs(sample)>1) throw Error('WAVに範囲外または不正なサンプルがあります。');
        sum+=sample/channels;
      }
      peak=Math.max(peak,Math.abs(sum));o.setInt32(i*4,Math.max(-8388608,Math.min(8388607,Math.round(sum*8388608))),true);
    }
    return {data:out,description:`44.1kHz / ${channels}ch → mono / 24bit / ${Math.min(frames,512)} samples（512まで切詰め・不足分ゼロ埋め、正規化なし） / peak ${peak.toFixed(3)}`};
  }
  function prepare(kind,bytes) { return kind==='ir' ? wav(bytes) : (kindInfo(kind),snap(bytes)); }
  function frames(kind,slot,name,data) {
    const info=kindInfo(kind);label(kind,name);
    if(!Number.isInteger(slot)||slot<info.first||slot>=info.count) throw Error('書き込めるユーザースロットを選択してください。');
    const b=Uint8Array.from(data);
    if(b.length!==info.size) throw Error('転送データのサイズが不正です。');
    if(kind==='snap') snap(b);
    else { const view=new DataView(b.buffer); for(let at=0;at<2048;at+=4) if(Math.abs(view.getInt32(at,true))>8388608 || view.getInt32(at,true)>8388607) throw Error('IRサンプルが24bit範囲外です。'); }
    const payload=new Uint8Array(74+b.length),view=new DataView(payload.buffer);
    payload.set([17,info.command]);view.setUint32(6,info.base+slot,true);payload.set(Array.from(name,c=>c.charCodeAt(0)),10);payload.set(b,74);
    return C.packetize(Array.from(payload));
  }
  function table(kind,bytes) {
    const info=kindInfo(kind),b=Uint8Array.from(bytes);
    if(b.length!==2+info.count*17 || b[0]!==18 || b[1]!==info.selector) throw Error('スロット一覧のサイズ・種別が一致しません。');
    return Array.from({length:info.count},(_,slot)=>{
      const flag=b[2+slot];if(flag>1) throw Error('スロットの状態が未対応です。');
      const name=C.readName(b.slice(2+info.count+slot*16,2+info.count+(slot+1)*16)).trim();
      const state=flag===0?'user':kind==='snap'&&slot<50?'factory':/^Empty$|^User IR \d+$/i.test(name)||!name?'empty':'factory';
      return {slot,name,flag,state,writable:slot>=info.first};
    });
  }
  const api={kindInfo,label,crc16,snap,wav,prepare,frames,table};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;else root.GP5AssetCodec=api;
})(globalThis);
