const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../app/preset-codec.js'),A=require('../app/asset-codec.js'),L=require('../app/library-ops.js'),Session=require('../app/preset-session.js'),Fake=require('./fake-gp5.cjs');
const fixture=fs.readFileSync(path.join(__dirname,'fixtures/97-FF-CC.prst'));
function wav(samples,{bits=16,channels=1,rate=44100,code=1}={}) {
  const data=new Uint8Array(44+samples.length*bits/8),v=new DataView(data.buffer),str=(at,s)=>data.set(Buffer.from(s),at);
  str(0,'RIFF');v.setUint32(4,data.length-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,code,true);v.setUint16(22,channels,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels*bits/8,true);v.setUint16(32,channels*bits/8,true);v.setUint16(34,bits,true);str(36,'data');v.setUint32(40,data.length-44,true);
  samples.forEach((s,i)=>bits===16?v.setInt16(44+i*2,s,true):code===3?v.setFloat32(44+i*4,s,true):v.setInt32(44+i*4,s,true));return data;
}
function snap(){const b=new Uint8Array(2696),v=new DataView(b.buffer);b.set(Buffer.from('VTSI'));v.setUint32(4,2696,true);v.setUint32(20,2560,true);v.setUint32(124,128,true);v.setUint32(128,512,true);v.setUint32(132,512,true);const crc=A.crc16(b.slice(12));b[8]=crc>>8;b[9]=crc&255;return b;}
test('IR audio conversion preserves sign, downmix, silence padding, truncation; rejects unsupported/corrupt WAV',()=>{
  const result=A.wav(wav([-32768,32767,0,16384]));const v=new DataView(result.data.buffer);
  assert.deepEqual([0,4,8,12,16].map(at=>v.getInt32(at,true)),[-8388608,8388352,0,4194304,0]);
  assert.equal(new DataView(A.wav(wav([32767,-32767],{channels:2})).data.buffer).getInt32(0,true),0);
  assert.equal(A.wav(wav(Array(600).fill(1))).data.length,2048);
  assert.throws(()=>A.wav(wav([1],{rate:48000})));assert.throws(()=>A.wav(wav([NaN],{bits:32,code:3})));
  const bad=wav([1]);bad[40]=99;assert.throws(()=>A.wav(bad));
});
test('SnapTone CRC/header/type and user-slot bounds reject bad data before sending',()=>{
  const file=snap();assert.equal(A.crc16(Buffer.from('123456789')),0x4b37);assert.equal(A.snap(file).data.length,2696);
  for(const at of [0,4,8,18,20,500]){const bad=file.slice();bad[at]^=1;assert.throws(()=>A.snap(bad));}
  assert.throws(()=>A.frames('snap',49,'Clean',file));assert.throws(()=>A.frames('snap',80,'Clean',file));assert.throws(()=>A.frames('ir',20,'Cab',new Uint8Array(2048)));assert.throws(()=>A.frames('snap',50,'Bad Name',file));
  assert.equal(A.frames('snap',50,'Clean',file).length,146);assert.equal(A.frames('ir',0,'Cab',new Uint8Array(2048)).length,112);
});
test('USB file upload sends one accepted frame at a time, then validates the complete slot table',async()=>{
  let s;const fake=new Fake(fixture,f=>s.receive(f));s=new Session(f=>fake.send(f),1000);
  assert.equal((await s.assetTable('snap'))[49].writable,false);
  await s.uploadAsset('ir',19,'Cab',new Uint8Array(2048));assert.equal(fake.assetWrites,1);assert.equal((await s.assetTable('ir'))[19].name,'Cab');
  await s.uploadAsset('snap',79,'Clean',snap());assert.equal(fake.assetWrites,2);assert.deepEqual(fake.assetData,snap());assert.equal(fake.writes,0);
});
for(const fault of ['dropAt','rejectAt'])test(`file upload ${fault} aborts immediately without retry or preset writes`,async()=>{
  let s;const fake=new Fake(fixture,f=>s.receive(f));s=new Session(f=>fake.send(f),30);fake[fault]=3;
  await assert.rejects(s.uploadAsset('ir',0,'Cab',new Uint8Array(2048)));assert.equal(fake.sent.length,3);assert.equal(fake.assetWrites,0);assert.equal(fake.writes,0);assert.equal(s.pending,null);
});
test('a changed or unknown slot table is never reported as confirmed',()=>{
  assert.throws(()=>A.table('ir',new Uint8Array(342)));const b=new Uint8Array(342);b.set([18,32]);b[2]=2;assert.throws(()=>A.table('ir',b));
});
function scanSession(){
  let current=4,ram=C.parse(fixture).body.slice();ram[48]=77;const stored=C.parse(fixture).body.slice();
  return {currentSlot:async()=>current,names:async()=>Array(100).fill('Stored'),body:async()=>ram.slice(),select:async n=>{if(current!==n){current=n;ram=stored.slice();}},reload:async n=>{current=n;ram=stored.slice();}};
}
test('all 100 stored presets backed up separately from unsaved RAM, original selection restored',async()=>{
  const session=scanSession(),saved=[];let editing;
  const result=await L.scan(session,{editing:async b=>{editing=C.parse(b);},save:async(b,slot)=>saved.push([slot,C.parse(b)])});
  assert.equal(result.count,100);assert.equal(saved.length,100);assert.equal(editing.body[48],77);assert(saved.every(([,p])=>p.body[48]===fixture[89]));assert.equal(await session.currentSlot(),4);
});
test('cancel, failed PC save, and failed initial preservation stop scanning and restore original selection',async()=>{
  for(const failure of ['cancel','save','editing']){
    const session=scanSession();let count=0;
    const operation=L.scan(session,{editing:async()=>{if(failure==='editing')throw Error('disk');},save:async()=>{if(failure==='save'&&count===2)throw Error('disk');count++;},cancelled:()=>failure==='cancel'&&count===3});
    if(failure==='cancel'){assert.equal((await operation).cancelled,true);assert.equal(count,3);}else await assert.rejects(operation,/disk/);
    assert.equal(await session.currentSlot(),4);if(failure==='editing')assert.equal((await session.body())[48],77);
  }
});
module.exports={snap,wav};
