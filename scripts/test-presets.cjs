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

const fixture50 = fs.readFileSync(path.join(__dirname,'fixtures/gp50-US-Lead.prst'));
const capture50 = require('./fixtures/gp50_suite_write_slot0.json');
test('all 29 GP-50 frames match the captured Suite import; model detection is exact', () => {
  assert.deepEqual(C.writeFrames(fixture50,0,'gp50').map(C.hex),capture50.write);
  assert.equal(C.parse(fixture50).profile.key,'gp50');
  assert.throws(()=>C.writeFrames(fixture50,0,'gp5'));
  assert.throws(()=>C.writeFrames(fixture,0,'gp50'));
  const P = require('../app/device-profiles.js');
  assert.equal(P.matchesName('gp5','Valeton GP-50 MIDI'),false);
  assert.equal(P.matchesName('gp50','Valeton GP-5 MIDI'),false);
  assert.equal(P.matchesName('gp5','Valeton GP-5 MIDI'),true);
  assert.equal(P.matchesName('gp50','Valeton GP-50 MIDI'),true);
});
for (const chunk of [19,100]) test(`GP-50 model-specific session, ${chunk}-byte response chunks, Program Change reload and name16 preservation`, async()=>{
  let session;
  const fake = new Fake(fixture50,frame=>session.receive(frame),chunk);
  session = new Session(frame=>fake.send(frame),300,'gp50');
  const desired = C.build('Long Name ABCDEF',C.parse(fixture50).body,'gp50');
  const result = await session.write(desired,4);
  assert.equal(result.names[4],'Long Name ABCDEF');
  assert.deepEqual(result.body,C.parse(desired).body);
  assert.equal(fake.writes,1);
  assert.equal(fake.sent.filter(p=>p.short?.[0]===0xc0).length,2);
  const before=fake.sent.length;
  await assert.rejects(session.write(fixture,4));
  assert.equal(fake.sent.length,before);
});
test('GP-50 malformed records and wrong device tag are rejected before write',()=>{
  for(const off of [57,81,160,218]) {
    const b=Uint8Array.from(fixture50); if(off===218) new DataView(b.buffer).setFloat32(off,NaN,true); else b[off]=255; b[20]=C.crc8(b.slice(21));
    assert.throws(()=>C.writeFrames(b,0,'gp50'));
  }
});
