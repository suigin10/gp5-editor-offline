const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../app/preset-codec.js');
const Session = require('../app/preset-session.js');
const Fake = require('./fake-gp5.cjs');
const fixture = fs.readFileSync(path.join(__dirname,'fixtures/97-FF-CC.prst'));
const capture = require('./fixtures/gp5_suite_import.json');
test('26 GP-5 import frames and rename match the Suite recording exactly', () => {
  assert.deepEqual(C.writeFrames(fixture, capture.slot).map(C.hex), capture.write);
  assert.equal(C.hex(C.renameFrame(capture.slot,'Walk')), capture.rename[0]);
});
test('PRST roundtrip preserves spaces, short names, 10-character names and all body bytes', () => {
  for (const name of ['A','Clean Tone','Lead - 001']) {
    const result = C.parse(C.build(name, C.parse(fixture).body));
    assert.equal(result.name,name); assert.deepEqual(result.body,C.parse(fixture).body);
  }
  assert.throws(() => C.nameField('あ')); assert.throws(() => C.nameField('           '));
});
test('reject corruption, foreign files, bad structures, NaN, invalid order and slot before building writes', () => {
  for (const offset of [0,20,57,105,117,175]) {
    const b = Uint8Array.from(fixture);
    if (offset === 175) new DataView(b.buffer).setFloat32(offset,NaN,true);
    else b[offset] = 255;
    if (offset > 20) b[20] = C.crc8(b.slice(21));
    assert.throws(() => C.writeFrames(b,4),`offset ${offset}`);
  }
  assert.throws(() => C.writeFrames(fixture,-1));
  assert.throws(() => C.writeFrames(fixture,100));
  assert.throws(() => C.parse(fixture.slice(0,500)));
  const bad = C.writeFrames(fixture,4)[0].slice(); bad[6] ^= 1;
  assert.equal(C.decode(bad),null);
});
for (const chunk of [19,100]) test(`simulated ${chunk === 19 ? 'USB' : 'Bluetooth'} import verifies stored body/name; rename preserves unsaved tone`, async () => {
  let session;
  const fake = new Fake(fixture, frame => session.receive(frame),chunk);
  session = new Session(frame => fake.send(frame),300);
  const desired = C.build('My Tone',C.parse(fixture).body);
  desired[89] = 73; desired[20] = C.crc8(desired.slice(21));
  const result = await session.write(desired,4);
  assert.equal(fake.writes,1); assert.equal(result.names[4],'My Tone');
  assert.deepEqual(result.body,C.parse(desired).body);
  fake.ram[48] = 31;
  await session.command(C.renameFrame(4,'Renamed'));
  assert.equal((await session.names())[4],'Renamed');
  assert.equal((await session.body())[48],31);
});
test('missing ACK stops after one frame; no retry or further write', async () => {
  let session;
  const fake = new Fake(fixture, frame => session.receive(frame));
  fake.dropAt = 1; session = new Session(frame => fake.send(frame),20);
  await assert.rejects(session.write(fixture,4));
  assert.equal(fake.sent.length,1); assert.equal(fake.writes,0);
});
test('transport errors reject and release pending state', async () => {
  const session = new Session(() => { throw Error('Disconnected'); },20);
  await assert.rejects(session.body(),/Disconnected/); assert.equal(session.pending,null);
});
test('missing or out-of-order response packets cannot produce a snapshot', async () => {
  let session;
  const fake = new Fake(fixture, frame => { if (C.decode(frame).index !== 1) session.receive(frame); });
  session = new Session(frame => fake.send(frame),100);
  await assert.rejects(session.body(),/順番|欠け/);
});

test('GP-50 files and device names are rejected',()=>{
  const foreign=fs.readFileSync(path.join(__dirname,'fixtures/gp50-US-Lead.prst'));
  assert.throws(()=>C.parse(foreign));
  assert.equal(require('../app/device-profiles.js').matchesName('gp5','GP-50'),false);
});

for(const chunk of [19,100]) test(`duplicate first and continuation packets are ignored (${chunk===19?'USB':'Bluetooth'})`,async()=>{
 let session;const fake=new Fake(fixture,wire=>{session.receive(wire);const f=C.decode(wire);if(f.index===0||f.index===2)session.receive(wire);},chunk);
 session=new Session(wire=>fake.send(wire),400);
 assert.deepEqual(await session.body(),fake.ram);assert.equal(fake.sent.length,1);assert.equal(fake.writes,0);
});
function changedFrame(wire,at=3){const f=C.decode(wire),payload=Array.from(f.payload);payload[at]^=1;const raw=[f.total,f.index,payload.length,...payload];return Uint8Array.from([240,...[C.crc8(raw),...raw].flatMap(b=>[b>>4,b&15]),247]);}
for(const index of [0,2]) test(`conflicting duplicate packet ${index} discards the snapshot and re-reads without writes`,async()=>{
 let session,first=true;const fake=new Fake(fixture,wire=>{session.receive(wire);if(first&&C.decode(wire).index===index){first=false;session.receive(changedFrame(wire));}});
 session=new Session(wire=>fake.send(wire),400);
 assert.deepEqual(await session.body(),fake.ram);assert.equal(fake.sent.length,2);assert(fake.sent.every(f=>f.payload[0]===18));assert.equal(fake.writes,0);
});
test('a foreign multi-frame reply is drained and a single notification is harmless',async()=>{
 let session,interrupted=false;const fake=new Fake(fixture,wire=>{
  const f=C.decode(wire);session.receive(wire);
  if(!interrupted&&f.index===1){interrupted=true;for(const other of C.packetize([18,64,...Array(40).fill(90)]))session.receive(other);}
 });
 session=new Session(wire=>{fake.send(wire);session.receive(C.packetize([18,27,0,0,0,0])[0]);},400);
 assert.deepEqual(await session.body(),fake.ram);assert.equal(fake.sent.length,2);assert.equal(fake.writes,0);
});
test('persistent conflicting replies stop after one read-only retry; no mixed snapshot or writes',async()=>{
 let session;const fake=new Fake(fixture,wire=>{session.receive(wire);if(C.decode(wire).index===2)session.receive(changedFrame(wire));});
 session=new Session(wire=>fake.send(wire),400);
 await assert.rejects(session.body(),/応答内容/);assert.equal(fake.sent.length,2);assert.equal(fake.writes,0);assert.equal(session.pending,null);
});
