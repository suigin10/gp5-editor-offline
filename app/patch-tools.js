/* PC preset tools shared by USB and Bluetooth. No hardware access on startup. */
(() => {
  'use strict';
  const C = window.GP5PresetCodec;
  const ble = location.pathname.endsWith('bluetooth.html');
  let busy = false, polling = null, lastEdit = 0, revision = 0, lastBody = null, namesDue = 0, mutated = false;
  const connected = () => ble ? !!device?.gatt?.connected && !!writeChar : !!inputPort && !!outputPort && inputPort.state !== 'disconnected' && outputPort.state !== 'disconnected';
  const session = new GP5PresetSession(async frame => {
    if (!connected()) throw Error('GP-5が接続されていません。');
    if (ble) await writeChar.writeValueWithoutResponse(Uint8Array.from([128,128,...frame]));
    else outputPort.send(frame);
  }, ble ? 8000 : 4000);
  const row = document.createElement('div');
  row.className = 'd-flex flex-wrap align-items-center gap-2 p-2 border-bottom';
  row.innerHTML = `<button id="save_pc_patch" class="btn btn-outline-info btn-sm lockable" disabled>PCに保存…</button>
    <button id="load_pc_patch" class="btn btn-outline-info btn-sm lockable" disabled>PCから読み込み…</button>
    <button id="rename_pc_patch" class="btn btn-outline-info btn-sm lockable" disabled>名前を変更…</button>
    <button id="open_patch_backups" class="btn btn-outline-secondary btn-sm">バックアップを開く</button>
    <label class="ms-sm-auto small"><input id="auto_patch_sync" type="checkbox" checked> 本体の変更を自動同期</label>
    <span id="patch_tools_status" class="small text-body-secondary" role="status" aria-live="polite">接続待ち</span>`;
  document.querySelector('.container-fluid > .row').after(row);
  gui.saveGP5Preset.closest('.dropdown').hidden = true;
  gui.btn_save_patch.textContent = '本体に保存';
  const status = document.getElementById('patch_tools_status');
  const autoSync = document.getElementById('auto_patch_sync');
  const modal = document.createElement('dialog');
  modal.className = 'bg-dark text-light border border-secondary rounded p-4';
  modal.style.cssText = 'max-width:min(94vw,540px);';
  modal.innerHTML = '<p id="patch_progress" role="status" aria-live="polite"></p><small>処理中は本体のパッチを切り替えず、接続を保ってください。</small>';
  modal.addEventListener('cancel', event => event.preventDefault());
  document.body.append(modal);
  const progress = text => { modal.querySelector('p').textContent = text; status.textContent = text; };
  const errorText = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function updateNames(names) {
    patchNames = names;
    for (let i = 0; i < names.length; i++) {
      if (gui.listPatches.options[i]) gui.listPatches.options[i].text = `${String(i).padStart(2,'0')} - ${names[i]}`;
    }
    gui.live_name.textContent = names[currentPatchNumber];
  }
  function showBody(body, target, names, resetDirty = false) {
    if (names) updateNames(names);
    const changedSlot = target !== currentPatchNumber;
    currentPatchNumber = target;
    window.currentPatchName = patchNames[target];
    gui.live_name.textContent = patchNames[target];
    gui.live_number.textContent = String(target);
    const data = [18,65,...body].flatMap(byte => [byte >> 4, byte & 15]);
    dumpPatchInfo = [data];
    applyPatchData(data);
    if (resetDirty || changedSlot) patchChanged = 0;
    refreshGUI();
    enableSaveButton(!!patchChanged);
    lastBody = Uint8Array.from(body);
  }
  async function run(title, action) {
    if (busy) return;
    if (initialSync || !connected()) { alert('GP-5を接続し、同期が終わってから操作してください。'); return; }
    busy = true;
    mutated = false;
    try {
      if (polling) await polling;
      disableGUI(true);
      progress(title); modal.showModal();
      await action();
      mutated = false;
    } catch (error) {
      status.textContent = `中止: ${errorText(error)}`;
      alert(`${errorText(error)}\n\n書き込みを自動で再試行することはありません。途中で中止した場合は、再接続して本体の状態を確認してください。バックアップは「バックアップを開く」から確認できます。`);
    } finally {
      session.cancel(Error('処理終了'));
      busy = false;
      modal.close();
      if (mutated) {
        initialSync = true;
        if (connected()) sendSysex(`${ble ? '8080' : ''}F0000E00010000000201020400F7`);
      }
      disableGUI(!connected() || initialSync);
      enableSaveButton(connected() && !initialSync && !!patchChanged);
      namesDue = 0;
    }
  }
  async function snapshot(target) {
    if (await session.currentSlot() !== target) throw Error('本体のパッチが変わりました。選択を確認して操作し直してください。');
    const names = await session.names(), body = await session.body();
    if (await session.currentSlot() !== target) throw Error('読み取り中に本体のパッチが変わりました。');
    return { bytes: C.build(names[target], body), body, names };
  }
  async function backup(bytes, label) {
    const filename = await gp5Files.backup(Array.from(bytes), label);
    if (!filename) throw Error('バックアップを保存できませんでした。');
    return filename;
  }
  async function commit(bytes, target, current) {
    // Preserve both the unsaved buffer and the actual stored slot before a full write.
    progress('変更前の編集中パッチをバックアップ中…');
    await backup(current.bytes, `${String(target).padStart(2,'0')}-editing-${current.names[target]}`);
    await sleep(300);
    mutated = true;
    await session.reload(target);
    const stored = await snapshot(target);
    progress('本体に保存されていたパッチをバックアップ中…');
    await backup(stored.bytes, `${String(target).padStart(2,'0')}-stored-${stored.names[target]}`);
    if (await session.currentSlot() !== target) throw Error('上書き先のパッチが変わりました。');
    await sleep(300);
    progress('本体に書き込み中…');
    const result = await session.write(bytes, target, (n, total) => progress(`本体に書き込み中… ${n}/${total}`));
    showBody(result.body, target, result.names, true);
    status.textContent = '保存完了・読み戻し確認済み';
  }
  async function savePC() {
    await run('PC保存用のパッチを読み取り中…', async () => {
      const target = currentPatchNumber;
      const current = await snapshot(target);
      const filename = await gp5Files.save(Array.from(current.bytes), `gp5_${String(target).padStart(2,'0')}-${current.names[target]}`);
      status.textContent = filename ? `PCに保存: ${filename}` : 'PCへの保存をキャンセルしました';
    });
  }
  async function loadPreset(file) {
    const preset = C.parse(file.bytes);
    for (let block = 1; block < 10; block++) {
      const id = C.hex(preset.bytes.slice(131 + block * 4, 135 + block * 4));
      if (effectsLIST[block][id] === undefined) throw Error(`未対応のエフェクトが含まれています（${blocksLIST[block]}: ${id}）。`);
    }
    // Validation and destination confirmation both precede any device changes.
    const target = currentPatchNumber;
    if (!confirm(`「${preset.name}」を本体の ${String(target).padStart(2,'0')} - ${patchNames[target]} に読み込みますか？\n\nこのパッチを上書き保存します。変更前の編集中・保存済みパッチはPCに自動バックアップします。\nUser IR / SnapTone本体はファイルに含まれず、同じ本体スロットを参照します。`)) return;
    await run('読み込み前のパッチを確認中…', async () => {
      const current = await snapshot(target);
      await commit(preset.bytes, target, current);
    });
  }
  async function loadPC() {
    // Native file selection has no access to MIDI and is safe while offline.
    try {
      const file = await gp5Files.open();
      if (file) await loadPreset(file);
    } catch (error) { alert(errorText(error)); }
  }
  async function saveDevice() {
    const target = currentPatchNumber;
    if (!confirm(`本体の ${String(target).padStart(2,'0')} - ${patchNames[target]} に現在の編集内容を保存しますか？\n変更前の編集中・保存済みパッチをPCにバックアップしてから上書きします。`)) return;
    await run('本体保存の準備中…', async () => {
      const current = await snapshot(target);
      await commit(current.bytes, target, current);
    });
  }
  const renameDialog = document.createElement('dialog');
  let renameTarget = null;
  renameDialog.className = 'bg-dark text-light border border-secondary rounded p-4';
  renameDialog.innerHTML = `<form><label for="patch_new_name" class="form-label">パッチ名（半角英数字・記号、10文字まで）</label>
    <input id="patch_new_name" class="form-control mb-3" required maxlength="10" pattern="[ -~]+" autocomplete="off">
    <p class="small">本体のパッチ名を変更します。音色の編集内容はそのままです。</p>
    <div class="d-flex justify-content-end gap-2"><button type="button" id="cancel_patch_rename" class="btn btn-secondary">キャンセル</button><button class="btn btn-primary">名前を変更</button></div></form>`;
  document.body.append(renameDialog);
  renameDialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const name = renameDialog.querySelector('input').value.trim();
    try { C.nameField(name); } catch (error) { alert(errorText(error)); return; }
    const target = renameTarget;
    renameDialog.close();
    if (target !== currentPatchNumber) { alert('本体のパッチが変わりました。名前変更を開き直してください。'); return; }
    await run('名前を変更中…', async () => {
      const current = await snapshot(target);
      await backup(current.bytes, `${target}-before-rename-${current.names[target]}`);
      mutated = true;
      await session.command(C.renameFrame(target, name));
      const names = await session.names();
      if (names[target] !== name) throw Error('変更後の名前を確認できません。');
      if (!C.eq(await session.body(), current.body)) throw Error('名前変更後の音色が変わっています。バックアップから復元できます。');
      updateNames(names);
      status.textContent = `名前を変更: ${name}`;
    });
  });
  document.getElementById('cancel_patch_rename').onclick = () => renameDialog.close();
  document.getElementById('save_pc_patch').onclick = savePC;
  document.getElementById('load_pc_patch').onclick = loadPC;
  document.getElementById('rename_pc_patch').onclick = () => {
    renameTarget = currentPatchNumber;
    renameDialog.querySelector('input').value = patchNames[currentPatchNumber]?.trim() || '';
    renameDialog.showModal(); renameDialog.querySelector('input').select();
  };
  document.getElementById('open_patch_backups').onclick = async () => { try { await gp5Files.showBackups(); } catch (error) { alert(errorText(error)); } };
  gui.btn_save_patch.addEventListener('click', event => { event.stopImmediatePropagation(); saveDevice(); }, true);
  // Prevent upstream number/letter shortcuts while typing a name or during a transfer.
  document.addEventListener('keydown', event => {
    if (busy || renameDialog.open || event.target.matches('input:not([type=range]):not([type=checkbox]), textarea')) event.stopPropagation();
  }, true);
  for (const type of ['input', 'change', 'pointerdown']) document.addEventListener(type, () => { revision++; lastEdit = Date.now(); }, true);
  window.addEventListener('beforeunload', event => { if (busy) { event.preventDefault(); event.returnValue = false; } });
  const API = window.GP5Patches = {
    get busy() { return busy || !!polling; }, savePC, loadPreset,
    observed(data) { lastBody = Uint8Array.from({ length: (data.length - 4) / 2 }, (_, i) => data[4 + i * 2] * 16 + data[5 + i * 2]); },
    receive(bytes) {
      // Firmware notifications use the same nibble framing on USB and BLE (two-byte BLE header).
      const wire = ble ? bytes.slice(2) : bytes;
      const frame = C.decode(wire);
      if (frame?.index === 0 && frame.payload[0] === 18 && frame.payload[1] === 27) namesDue = 0;
      if (!busy && !polling) return false;
      session.receive(wire);
      return true;
    }
  };
  async function poll() {
    if (!autoSync.checked || busy || polling || initialSync || userChangedPatch || !connected() || renameDialog.open || Date.now() - lastEdit < 500) return;
    const before = revision;
    polling = (async () => {
      try {
        const target = await session.currentSlot();
        const changedSlot = target !== currentPatchNumber;
        let names;
        if (changedSlot || Date.now() >= namesDue) { names = await session.names(); namesDue = Date.now() + 10000; }
        const body = await session.body();
        if (await session.currentSlot() !== target || revision !== before) return;
        if (changedSlot || !lastBody || !C.eq(body, lastBody)) {
          if (!changedSlot && lastBody) patchChanged = 1;
          showBody(body, target, names);
        }
        else if (names) updateNames(names);
        status.textContent = '本体と同期済み';
      } catch (error) { status.textContent = `同期待ち: ${errorText(error)}`; }
    })();
    try { await polling; } finally { polling = null; }
  }
  setInterval(poll, ble ? 3000 : 1500);
})();
