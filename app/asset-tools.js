(() => {
  'use strict';
  const A=GP5AssetCodec,P=GP5Patches,ble=GPTransport==='bluetooth';
  const panel=document.createElement('dialog');panel.id='asset-manager';
  panel.innerHTML=`<div class="d-flex justify-content-between gap-3"><h4>SnapTone / IR管理</h4><button id="asset-close" class="btn btn-secondary btn-sm">閉じる</button></div>
    <p class="small">一覧はUSB / Bluetooth、ファイル転送はUSBで利用できます。</p>
    <div class="d-flex gap-2 my-2"><select id="asset-kind" class="form-select"><option value="ir">User IR（20枠）</option><option value="snap">SnapTone（80枠・ユーザー51〜80）</option></select><button id="asset-refresh" class="btn btn-secondary">本体一覧を取得</button></div>
    <div class="asset-slots"><table class="table table-sm"><thead><tr><th>選択</th><th>本体の名前</th><th>状態</th></tr></thead><tbody id="asset-table"></tbody></table></div>
    <button id="asset-file" class="btn btn-outline-info my-2">ファイルを確認…</button><button id="asset-nam" class="btn btn-outline-info m-2">NAMから変換…</button>
    <p id="asset-info" class="small text-break">IR: 44.1kHz WAV / SnapTone: 変換済み2696バイトVTSI。NAMは「NAM → SnapTone変換」から準備できます。</p>
    <label>転送名 <input id="asset-name" maxlength="10" class="form-control" autocomplete="off"></label>
    <div class="d-flex gap-2 my-2"><button id="asset-upload" class="btn btn-warning" disabled>USBで選択枠へ転送</button><button id="asset-library" class="btn btn-secondary">元ファイル保管先</button></div>
    <p class="small">転送で選択枠を上書きします。元ファイルと転送履歴をPCに保管します。本体の既存IR / SnapToneの中身はバックアップできません。転送後は一覧の名前・状態のみ照合します。</p><p id="asset-result" role="status"></p>`;
  document.body.append(panel);
  const el=id=>panel.querySelector('#asset-'+id);
  let prepared=null,entries=[],working=false;
  const kind=()=>el('kind').value;
  function update(){el('upload').disabled=ble||working||!prepared||!entries.length;}
  function draw(){
    el('table').replaceChildren();
    const list=kind()==='snap'?gui.ns_effects_list:gui.cab_effects_list,selected=list.value;
    for(const entry of entries){const index=kind()==='snap'?entry.slot:20+entry.slot;if(list.options[index])list.options[index].textContent=entry.name;else list.add(new Option(entry.name,index));}
    list.value=selected;window.dispatchEvent(new Event('gp5-asset-names'));
    for(const entry of entries){
      const tr=document.createElement('tr'),cell=document.createElement('td'),radio=document.createElement('input');radio.type='radio';radio.name='asset-slot';radio.value=entry.slot;radio.disabled=!entry.writable;radio.setAttribute('aria-label',`スロット ${entry.slot+1}`);cell.append(radio,` ${String(entry.slot+1).padStart(2,'0')}`);tr.append(cell);
      for(const text of [entry.name,{user:'ユーザー',factory:'工場データ',empty:'空き'}[entry.state]]){const td=document.createElement('td');td.textContent=text;tr.append(td);}el('table').append(tr);
    }
    update();
  }
  async function task(title,action){
    if(working||P.busy)return;working=true;el('kind').disabled=el('file').disabled=el('refresh').disabled=true;update();
    try{await P.withTask(title,action);}finally{working=false;el('kind').disabled=el('file').disabled=el('refresh').disabled=false;update();}
  }
  el('refresh').onclick=()=>task('スロット一覧を読み取り中…',async({session})=>{entries=await session.assetTable(kind());draw();el('result').textContent='本体の一覧を取得しました。表示番号は1始まりです。';});
  el('kind').onchange=()=>{prepared=null;entries=[];draw();el('info').textContent='ファイルを選んで確認してください。';el('result').textContent='';};
  async function chooseFile(){
    if(working||P.busy)return;
    try{const file=await gp5Files.assetOpen(kind());if(!file)return;prepared=file;el('name').value=file.filename.replace(/\.[^.]*$/,'').replace(kind()==='snap'?/[^A-Za-z0-9]/g:/[^\x20-\x7e]|\$/g,'').slice(0,10)||'Tone';el('info').textContent=`${file.filename}: ${file.description} / SHA-256 ${file.hash}`;update();}catch(e){el('result').textContent=e.message;}
  }
  el('file').onclick=chooseFile;
  el('nam').onclick=()=>{if(!working&&!P.busy){panel.close();GP5Converter.open();}};
  el('upload').onclick=async()=>{
    if(ble||working||P.busy)return;
    const picked=panel.querySelector('input[name=asset-slot]:checked'),file=prepared,k=kind(),name=el('name').value;
    try{
      if(!picked||!file)throw Error('本体一覧からユーザー枠を選び、ファイルを確認してください。');
      const slot=Number(picked.value);A.frames(k,slot,name,file.data);
      // Re-read the selected entry under the exclusive session before the overwrite confirmation.
      await task('転送先を確認中…',async({session,progress})=>{
        const current=(await session.assetTable(k))[slot];
        if(!confirm(`${k==='ir'?'User IR':'SnapTone'} ${slot+1}「${current.name}」を「${name}」で上書きしますか？\n\n既存内容は本体からバックアップできません。元データがない場合は元に戻せません。転送中は電源・USB接続を保ってください。`))return;
        const receipt=await gp5Files.assetArchive(file.id,slot,name);
        try{
          await session.uploadAsset(k,slot,name,file.data,(n,total)=>progress(`USB転送中… ${n}/${total}`));
          await gp5Files.assetResult(receipt,'table-confirmed');entries=await session.assetTable(k);draw();
          el('result').textContent='転送完了：名前とユーザー状態を確認済み。';
          progress('USB転送完了・名前と状態を確認済み');
        }catch(e){await gp5Files.assetResult(receipt,'unconfirmed').catch(()=>{});el('result').textContent='転送を完了できませんでした。保管した元ファイルを保持し、再接続して本体を確認してください。';throw e;}
      });
    }catch(e){el('result').textContent=e.message;}
  };
  el('close').onclick=()=>{if(!working&&!P.busy)panel.close();};panel.addEventListener('cancel',e=>{if(working||P.busy)e.preventDefault();});
  el('library').onclick=()=>gp5Files.showAssets().catch(e=>alert(e.message));
  P.assets={open:(initialKind,choose=false)=>{if(P.busy)return;if(initialKind&&initialKind!==kind()){el('kind').value=initialKind;el('kind').onchange();}if(!panel.open)panel.showModal();if(choose)chooseFile();}};
})();
