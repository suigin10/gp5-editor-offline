const {ipcMain,dialog,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const A=require('./app/asset-codec.js');
module.exports=function installFiles({win,isEditor,checked,atomicSave,storage,smokeDir,smoke}) {
  const batches=new Map(),assets=new Map(),receipts=new Map();
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  const check=e=>{if(!isEditor(e.sender))throw Error('Invalid editor');};
  const writeJson=(name,data)=>atomicSave(name,Buffer.from(JSON.stringify(data,null,2)));
  const saveManifest=batch=>writeJson(path.join(batch.folder,'manifest.json'),batch.manifest);
  ipcMain.handle('gp5-batch-start',async e=>{
    check(e);
    const result=smoke?{canceled:false,filePaths:[smokeDir]}:await dialog.showOpenDialog(win,{title:'一括バックアップの保存先（中に新しいフォルダーを作成）',properties:['openDirectory','createDirectory']});
    if(result.canceled)return null;
    const id=crypto.randomUUID(),folder=path.join(result.filePaths[0],`GP5-backup-${new Date().toISOString().replace(/[:.]/g,'-')}-${id.slice(0,8)}`);
    fs.mkdirSync(folder);
    const batch={folder,manifest:{version:1,device:'GP-5',started:new Date().toISOString(),status:'incomplete',includesAssets:false,entries:[]}};
    saveManifest(batch);batches.set(id,batch);return id;
  });
  ipcMain.handle('gp5-batch-write',(e,id,bytes,slot,editing)=>{
    check(e);const batch=batches.get(id);if(!batch)throw Error('バックアップ先が無効です。');
    if(!Number.isInteger(slot)||slot<0||slot>99||typeof editing!=='boolean')throw Error('Invalid slot');
    const data=checked(e,bytes),name=`${editing?'editing-':''}${String(slot).padStart(2,'0')}.prst`;
    if(batch.manifest.entries.some(entry=>entry.file===name))throw Error('バックアップが重複しました。');
    atomicSave(path.join(batch.folder,name),data);
    batch.manifest.entries.push({file:name,slot,editing,sha256:hash(data)});saveManifest(batch);return name;
  });
  ipcMain.handle('gp5-batch-end',(e,id,status)=>{
    check(e);const batch=batches.get(id);if(!batch)return null;
    if(!['complete','cancelled','failed'].includes(status))throw Error('Invalid backup status');
    const count=batch.manifest.entries.filter(x=>!x.editing).length;
    batch.manifest.status=status==='complete'&&count!==100?'incomplete':status;batch.manifest.finished=new Date().toISOString();saveManifest(batch);batches.delete(id);
    return {folder:path.basename(batch.folder),count,status:batch.manifest.status};
  });
  ipcMain.handle('gp5-asset-open',async(e,kind)=>{
    check(e);A.kindInfo(kind);
    const result=smoke?{canceled:false,filePaths:[path.join(smokeDir,kind==='ir'?'fixture-ir.wav':'fixture-snap.vtsi')]}:await dialog.showOpenDialog(win,{title:kind==='ir'?'IR WAVを確認':'変換済みSnapToneファイルを確認',properties:['openFile'],filters:[{name:kind==='ir'?'WAV (44.1kHz)':'SnapTone VTSI',extensions:kind==='ir'?['wav']:['clo','vtsi','bin']}]});
    if(result.canceled)return null;
    const filename=result.filePaths[0],stat=fs.statSync(filename);if(!stat.isFile()||stat.size>4*1024*1024)throw Error('ファイルは4MB以下にしてください。');
    const raw=fs.readFileSync(filename),prepared=A.prepare(kind,raw),id=crypto.randomUUID();
    assets.clear();assets.set(id,{kind,raw,prepared:Buffer.from(prepared.data),filename:path.basename(filename)});
    return {id,kind,filename:path.basename(filename),hash:hash(raw),data:Array.from(prepared.data),description:prepared.description};
  });
  ipcMain.handle('gp5-asset-archive',(e,id,slot,name)=>{
    check(e);const asset=assets.get(id);if(!asset)throw Error('ファイルを選び直してください。');
    A.frames(asset.kind,slot,name,asset.prepared);
    const receipt=crypto.randomUUID(),folder=path.join(storage,'asset-library',receipt);fs.mkdirSync(folder,{recursive:true});
    atomicSave(path.join(folder,'source'+(asset.kind==='ir'?'.wav':'.vtsi')),asset.raw);
    atomicSave(path.join(folder,'prepared.bin'),asset.prepared);
    const metadata={device:'GP-5',kind:asset.kind,slot,name,originalFile:asset.filename,sourceSha256:hash(asset.raw),preparedSha256:hash(asset.prepared),created:new Date().toISOString(),status:'pending',contentReadback:false};
    writeJson(path.join(folder,'transfer.json'),metadata);receipts.set(receipt,{folder,metadata});return receipt;
  });
  ipcMain.handle('gp5-asset-result',(e,receipt,status)=>{
    check(e);const value=receipts.get(receipt);if(!value||!['table-confirmed','unconfirmed'].includes(status))throw Error('Invalid transfer receipt');
    value.metadata.status=status;value.metadata.finished=new Date().toISOString();writeJson(path.join(value.folder,'transfer.json'),value.metadata);receipts.delete(receipt);return true;
  });
  ipcMain.handle('gp5-assets-show',async e=>{check(e);const folder=path.join(storage,'asset-library');fs.mkdirSync(folder,{recursive:true});const error=await shell.openPath(folder);if(error)throw Error(error);});
};
