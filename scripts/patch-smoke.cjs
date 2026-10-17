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
    checks.gp5Only = GPDevice.key === 'gp5' && !document.getElementById('device-model');
    checks.singleModel = Object.keys(GPProfiles.PROFILES).join() === 'gp5';
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
  const wav=Buffer.alloc(44+1024);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(44100,24);wav.writeUInt32LE(88200,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1024,40);wav.writeInt16LE(32767,44);fs.writeFileSync(path.join(smokeDir,'fixture-ir.wav'),wav);
  const snap=Buffer.alloc(2696);snap.write('VTSI');snap.writeUInt32LE(2696,4);snap.writeUInt32LE(2560,20);const assetCodec=require('../app/asset-codec.js');snap.writeUInt16BE(assetCodec.crc16(snap.subarray(12)),8);fs.writeFileSync(path.join(smokeDir,'fixture-snap.vtsi'),snap);
  const fileMenu=require('electron').Menu.getApplicationMenu().items[0].submenu;
  result.fileMenu=fileMenu.items.some(i=>i.label==='パッチを一括バックアップ…')&&fileMenu.items.some(i=>i.label==='SnapTone / IR管理…');
  fileMenu.items.find(i=>i.label==='コピー／別名保存…').click();
  await new Promise(r=>setTimeout(r,100));
  result.libraryAndAssets=await win.webContents.executeJavaScript(`(async()=>{
    const wait=async fn=>{const end=Date.now()+15000;while(!fn()){if(Date.now()>end)throw Error('Extended UI timeout: '+testAlerts.join(' | '));await new Promise(r=>setTimeout(r,30));}};
    if(!document.getElementById('copy-dialog').open)throw Error('Native File menu did not open Copy');
    const original=fakePedal.current,editing=fakePedal.ram.slice();
    await GP5Patches.copyPreset(9,'PC Alias',true);
    if(!GP5PresetCodec.eq(fakePedal.ram,editing)||fakePedal.writes!==1)throw Error('PC Save As changed hardware');
    GP5Patches.openCopy();await GP5Patches.copyPreset(9,'Copy Tone',false);
    if(fakePedal.current!==original||GP5PresetCodec.parse(fakePedal.flash[9]).name!=='Copy Tone'||GP5PresetCodec.parse(fakePedal.flash[9]).body[48]!==editing[48])throw Error('Copy target/readback/return mismatch');
    await GP5Patches.batchBackup([1,2,original]);
    if(fakePedal.current!==original||!document.getElementById('patch_tools_status').textContent.includes('3件'))throw Error('Batch backup failed');
    for(const kind of ['ir','snap']){
      GP5Patches.assets.open(kind);document.getElementById('asset-refresh').click();await wait(()=>!GP5Patches.busy&&document.querySelectorAll('#asset-table tr').length===(kind==='ir'?20:80));
      document.getElementById('asset-file').click();await wait(()=>document.getElementById('asset-info').textContent.includes('SHA-256'));
      const slot=kind==='ir'?0:50;document.querySelector('#asset-table input[value="'+slot+'"]').checked=true;
      if(${mode === 'bluetooth'}){if(!document.getElementById('asset-upload').disabled)throw Error('BLE upload was enabled');}
      else{document.getElementById('asset-name').value=kind==='ir'?'TestCab':'TestTone';document.getElementById('asset-upload').click();await wait(()=>!GP5Patches.busy&&document.getElementById('asset-result').textContent.includes('転送完了'));}
    }
    document.getElementById('asset-close').click();
    if(fakePedal.assetWrites!==${mode === 'bluetooth' ? 0 : 2})throw Error('Unexpected asset writes');
    return testAlerts.length===0;
  })()`);
  const alias=C.parse(fs.readFileSync(path.join(smokeDir,`pc-${model}-${mode}.prst`)));
  result.aliasFile=alias.name==='PC Alias'&&alias.body[48]===61;
  const batchFolders=fs.readdirSync(smokeDir).filter(n=>n.startsWith('GP5-backup-'));
  result.batchFiles=batchFolders.some(name=>{const m=JSON.parse(fs.readFileSync(path.join(smokeDir,name,'manifest.json')));return m.status==='incomplete'&&m.entries.filter(e=>!e.editing).length===3&&m.entries.some(e=>e.editing);});
  if(mode==='usb'){
    const library=path.join(path.dirname(backupDir),'asset-library');const receipts=fs.readdirSync(library).map(n=>JSON.parse(fs.readFileSync(path.join(library,n,'transfer.json'))));
    result.assetArchives=['ir','snap'].every(kind=>receipts.some(r=>r.kind===kind&&r.status==='table-confirmed'&&r.contentReadback===false));
  }else result.assetArchives=true;
  for(const size of [[1100,650],[900,560]]){
    win.setContentSize(...size);await new Promise(r=>setTimeout(r,100));
    result.footerVisible=(result.footerVisible??true)&&await win.webContents.executeJavaScript(`(()=>{const r=gui.btn_save_patch.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>0;})()`);
  }
  win.setContentSize(1100,720);await new Promise(r=>setTimeout(r,100));
  result.snapOverlay=await win.webContents.executeJavaScript(`(()=>{patchNS=true;refreshGUI();return gui.amp_button.classList.contains('nam-context')&&gui.cab_button.classList.contains('nam-context')&&!gui.amp_button.classList.contains('bg-danger-subtle')&&document.querySelector('.nam-status').textContent.includes('SnapTone ON')&&document.querySelector('label[for="amp_live"] .live-effect-name').textContent==='AMP';})()`);
  fs.writeFileSync(path.join(smokeDir,`${mode}-compact.png`),(await win.webContents.capturePage()).toPNG());
  result.liveLayout=await win.webContents.executeJavaScript(`(()=>{gui.live_switch.checked=true;gui.live_switch.dispatchEvent(new Event('change'));return document.body.classList.contains('live-mode')&&getComputedStyle(document.querySelector('.file-tools')).display==='none'&&gui.btn_tap.getBoundingClientRect().height>=58&&getComputedStyle(gui.global_bpm_value).display==='none'&&document.querySelector('.btn-live').getBoundingClientRect().height>=80;})()`);
  await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(smokeDir,`${mode}-live.png`),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`gui.live_switch.checked=false;gui.live_switch.dispatchEvent(new Event('change'));`);
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
