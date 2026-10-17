(() => {
  const dialog=document.createElement('dialog');dialog.id='nam-converter';
  dialog.innerHTML=`<div class="d-flex justify-content-between gap-3"><h4>NAM → SnapTone</h4><button id="nam-close" class="btn btn-secondary">閉じる</button></div>
    <p>PC上で変換してファイルに保存します。本体への接続は不要です。</p>
    <div class="d-flex gap-2 flex-wrap my-3"><button id="nam-model" class="btn btn-info">NAMファイルを選択…</button><span id="nam-model-info" class="align-self-center small">未選択</span></div>
    <div class="border rounded p-3 my-3"><strong>Valeton Suiteのテスト信号</strong><p id="nam-signal-info" class="small my-2">確認中…</p><div class="d-flex gap-2"><button id="nam-detect" class="btn btn-outline-info">自動検出</button><button id="nam-signal" class="btn btn-outline-info">ファイルを指定…</button></div><small>nam_input_wav.wav または Valeton Suite.exe を選択できます。一度指定すれば次回も使えます。</small></div>
    <p class="small">対応: NAM A1 / A2。対応形式を選択時に検査します。出力はGP-5用SnapTone（2696バイト）です。</p>
    <progress id="nam-progress" max="100" value="0" style="width:100%"></progress><p id="nam-status" role="status" aria-live="polite">NAMファイルとテスト信号を選んでください。</p>
    <div class="d-flex gap-2 flex-wrap"><button id="nam-run" class="btn btn-primary" disabled>SnapToneに変換</button><button id="nam-cancel" class="btn btn-secondary" hidden>変換を中止</button><button id="nam-save" class="btn btn-success" disabled>ファイルに保存…</button></div>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector('#nam-'+id);let model=null,signal=false,result=null,busy=false,jobId=null;
  const clean=e=>String(e?.message||e).replace(/^Error invoking remote method '[^']+': Error: /,'');
  function controls(){for(const id of ['model','detect','signal','close'])el(id).disabled=busy;el('run').disabled=busy||!model||!signal;el('save').disabled=busy||!result;}
  async function action(fn){if(busy)return;busy=true;controls();try{return await fn();}catch(e){el('status').textContent=clean(e);}finally{busy=false;controls();}}
  async function findSignal(choose=false){await action(async()=>{const s=await gp5Files.convertSignal(choose);if(!s)return;signal=s.available;el('signal-info').textContent=signal?`${s.name} / 44.1kHz / ${Math.round(s.frames/44100)}秒`:'テスト信号が見つかりません。Valeton Suiteのファイルを指定してください。';});}
  el('model').onclick=()=>action(async()=>{let selected;try{selected=await gp5Files.convertModel();}catch(e){model=null;result=null;el('model-info').textContent='未選択';throw e;}if(!selected)return;model=selected;result=null;el('progress').value=0;el('model-info').textContent=`${selected.name} — ${selected.check.arch} / ${selected.check.size}`;el('status').textContent='NAMの形式を確認しました。変換できます。';});
  el('detect').onclick=()=>findSignal(false);el('signal').onclick=()=>findSignal(true);
  el('run').onclick=()=>action(async()=>{
    result=null;jobId=crypto.randomUUID();el('progress').value=0;el('cancel').hidden=false;el('cancel').disabled=false;el('status').textContent='変換を開始しています…';
    try{result=await gp5Files.convertRun(model.id,jobId);el('progress').value=100;el('status').textContent=`変換完了 — ${result.bytes}バイト / ${result.check.arch} / ${result.rate/1000}kHz。ファイルに保存できます。`;}
    finally{el('cancel').hidden=true;jobId=null;}
  });
  el('cancel').onclick=async()=>{el('cancel').disabled=true;await gp5Files.convertCancel();el('status').textContent='変換を中止しています…';};
  el('save').onclick=()=>action(async()=>{const saved=await gp5Files.convertSave(result.receipt);el('status').textContent=saved?`保存しました: ${saved.name}（${saved.bytes}バイト）。SnapTone / IR管理から読み込めます。`:'保存をキャンセルしました。';});
  gp5Files.onConvertProgress(message=>{
    if(message.jobId!==jobId)return;
    const names={excitation:'テスト信号を準備中…',render:'NAMの音声を計算中…',clone:'SnapToneを生成中…',done:'変換結果を検査中…'};el('status').textContent=names[message.phase]||'変換中…';
    if(message.phase==='clone')el('progress').removeAttribute('value');
    else el('progress').value=message.phase==='render'?10+Math.max(0,Math.min(1,message.fraction))*50:message.phase==='done'?98:3;
  });
  el('close').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue=false;}});
  window.GP5Converter={get busy(){return busy;},open(){if(!dialog.open)dialog.showModal();if(!signal&&!busy)findSignal();}};
})();
