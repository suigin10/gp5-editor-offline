const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const C = require('../app/preset-codec.js');
module.exports = async function patchSmoke(win, { root, mode, model = 'gp5', smokeDir, backupDir, rejectBackup }) {
  const fixture = fs.readFileSync(path.join(root,model === 'gp50' ? 'scripts/fixtures/gp50-US-Lead.prst' : 'scripts/fixtures/97-FF-CC.prst'));
  const seedName = C.parse(fixture).name;
  const otherFixture = fs.readFileSync(path.join(root,model === 'gp50' ? 'scripts/fixtures/97-FF-CC.prst' : 'scripts/fixtures/gp50-US-Lead.prst'));
  const fakeSource = fs.readFileSync(path.join(root,'scripts/fake-gp5.cjs'),'utf8');
  await win.webContents.executeJavaScript(fakeSource);
  const result = await win.webContents.executeJavaScript(`(async () => {
    const C = GP5PresetCodec, ble = ${mode === 'bluetooth'};
    window.testAlerts = []; window.alert = text => testAlerts.push(text); window.confirm = () => true;
    window.fakePedal = new FakeGP5(${JSON.stringify(Array.from(fixture))}, wire => {
      if (ble) handleNotification({ target: { value: new DataView(Uint8Array.from([128,128,...wire]).buffer) } });
      else handleMIDIMessage({ data: wire });
    }, ble ? 100 : 19);
    const fake = window.fakePedal;
    if (ble) { device = { gatt: { connected: true } }; writeChar = { writeValueWithoutResponse: bytes => fake.send(bytes.slice(2)) }; }
    else { inputPort = { state: 'connected' }; outputPort = { state: 'connected', send: bytes => fake.send(bytes) }; }
    initialSync = false; userChangedPatch = false; patchChanged = 0; currentPatchNumber = 4; GLOBALvol = 50;
    patchNames = Array(100).fill(${JSON.stringify(seedName)});
    gui.listPatches.replaceChildren(...patchNames.map((name,i) => new Option(name,i)));
    document.getElementById('auto_patch_sync').checked = false;
    disableGUI(false);
    applyPatchData([18,65,...fake.ram].flatMap(b => [b >> 4,b & 15])); refreshGUI();
    const checks = { bridge: !!window.gp5Files && typeof require === 'undefined' };
    fake.ram[48] = 63; // Unsaved buffer differs from stored memory (fixture volume 50).
    await GP5Patches.savePC();
    checks.pcSave = document.getElementById('patch_tools_status').textContent.includes('PCに保存:');
    const desired = C.build('My Tone',fake.flash[4].slice(41)); desired[89] = 73; desired[20] = C.crc8(desired.slice(21));
    const before = fake.sent.length;
    const invalid = desired.slice(); invalid[20] ^= 1;
    try { await GP5Patches.loadPreset({ bytes: invalid }); } catch {}
    checks.invalidNoTraffic = fake.sent.length === before;
    try { await GP5Patches.loadPreset({ bytes:${JSON.stringify(Array.from(otherFixture))} }); } catch {}
    checks.wrongModelNoTraffic = fake.sent.length === before;
    checks.modelSelector = GPDevice.key === ${JSON.stringify(model)} && document.querySelector('#device-model [aria-current="page"]').textContent === GPDevice.name;
    checks.experimentalDisabled = GPDevice.key !== 'gp50' || [...document.querySelectorAll('.check-ctl, #patch_bpm_value, #btn_tap, #btn_tap_minus, #btn_tap_plus')].every(control=>control.disabled);
    window.confirm = () => false;
    await GP5Patches.loadPreset({ bytes: desired });
    checks.cancelNoTraffic = fake.sent.length === before;
    window.confirm = () => true;
    await GP5Patches.loadPreset({ bytes: desired });
    checks.importVerified = fake.writes === 1 && C.eq(fake.flash[4],desired) && currentPatchNumber === 4 && patchVOL === 73 && gui.listPatches.options[4].text.includes('My Tone');
    fake.ram[48] = 37; // A rename must preserve these unsaved edits.
    document.getElementById('rename_pc_patch').click();
    document.getElementById('patch_new_name').value = 'Renamed';
    document.getElementById('patch_new_name').form.dispatchEvent(new Event('submit',{ bubbles:true, cancelable:true }));
    const wait = async predicate => { const deadline = Date.now()+12000; while(!predicate()) { if(Date.now()>deadline) throw Error('UI test timed out: '+testAlerts.join(' | ')); await new Promise(r=>setTimeout(r,40)); } };
    await wait(() => !GP5Patches.busy && document.getElementById('patch_tools_status').textContent.includes('名前を変更:'));
    checks.rename = patchNames[4] === 'Renamed' && fake.ram[48] === 37 && fake.flash[4][89] === 73;
    document.getElementById('rename_pc_patch').click();
    currentPatchNumber = 7;
    const beforeRename = fake.sent.length;
    document.getElementById('patch_new_name').form.dispatchEvent(new Event('submit',{ bubbles:true, cancelable:true }));
    checks.renameDestinationLocked = fake.sent.length === beforeRename && testAlerts.pop().includes('パッチが変わりました');
    currentPatchNumber = 4;
    document.getElementById('auto_patch_sync').checked = true;
    fake.current = 7; fake.ram = fake.flash[7].slice(41); fake.ram[48] = 61;
    await wait(() => currentPatchNumber === 7 && patchVOL === 61 && !GP5Patches.busy);
    checks.realtime = gui.listPatches.value === '7' && document.getElementById('patch_tools_status').textContent.includes('同期済み');
    document.getElementById('auto_patch_sync').checked = false;
    checks.alerts = testAlerts.slice();
    return checks;
  })()`);
  const saved = C.parse(fs.readFileSync(path.join(smokeDir,`pc-${model}-${mode}.prst`)));
  result.savedBytesVerified = saved.body[48] === 63 && saved.name === seedName;
  const backups = fs.readdirSync(backupDir).filter(n => n.endsWith('.prst')).map(n => ({ name:n, bytes:C.parse(fs.readFileSync(path.join(backupDir,n))) }));
  result.bothBackups = backups.some(b => b.name.includes('editing-') && b.bytes.body[48] === 63) && backups.some(b => b.name.includes('stored-') && b.bytes.body[48] === fixture[89]);
  rejectBackup(true);
  try {
    result.backupFailureNoWrite = await win.webContents.executeJavaScript(`(async () => {
      const before = fakePedal.writes;
      const file = GP5PresetCodec.build('Fail Test',fakePedal.ram);
      await GP5Patches.loadPreset({ bytes:file });
      return before === fakePedal.writes && document.getElementById('patch_tools_status').textContent.startsWith('中止:');
    })()`);
  } finally { rejectBackup(false); }
  await win.webContents.executeJavaScript(`(async () => {
    ${mode === 'bluetooth' ? 'device.gatt.connected = false; writeChar = null;' : 'inputPort = null; outputPort = null;'}
    initialSync = true; disableGUI(true);
    if ([...document.querySelectorAll('dialog')].some(d => d.open)) throw Error('Dialog did not close');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  })()`);
  result.passed = Object.entries(result).every(([key,value]) => key === 'alerts' ? value.length === 0 : value === true);
  assert.equal(result.passed,true,JSON.stringify(result));
  return result;
};
