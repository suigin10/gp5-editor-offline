// Application-side adapter. The GPL converter is a separate command-line process.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const A=require('./app/asset-codec.js');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
class ConverterController {
  constructor({storage,converterRoot,runtime=process.execPath,progress=()=>{},timeout=300000}) {
    this.root=path.resolve(storage,'nam-conversion');this.jobs=path.join(this.root,'jobs');this.converterRoot=converterRoot;this.runtime=runtime;this.progress=progress;this.timeout=timeout;
    fs.mkdirSync(this.jobs,{recursive:true});this.model=null;this.signal=null;this.result=null;this.child=null;this.validating=false;this.disposed=false;
  }
  get busy(){return !!this.child||this.validating;}
  atomic(filename,data){const temp=filename+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,data,{flag:'wx'});fs.renameSync(temp,filename);if(!fs.readFileSync(filename).equals(Buffer.from(data)))throw Error('保存内容が一致しません。');}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
  makeJob(){const folder=path.join(this.jobs,crypto.randomUUID());fs.mkdirSync(folder);return folder;}
  cleanup(folder){const resolved=path.resolve(folder);if(!resolved.startsWith(this.jobs+path.sep)||path.dirname(resolved)!==this.jobs)throw Error('Invalid converter workspace');fs.rmSync(resolved,{recursive:true,force:true});}
  readFile(filename,max){const stat=fs.statSync(filename);if(!stat.isFile()||stat.size>max)throw Error('ファイルサイズが範囲外です。');return fs.readFileSync(filename);}
  async exclusive(action){if(this.disposed||this.busy)throw Error('変換処理が終わるまでお待ちください。');this.validating=true;try{return await action();}finally{this.validating=false;}}
  run(args,{jobId=null}={}) {
    if(this.child)throw Error('変換処理が競合しました。');
    return new Promise((resolve,reject)=>{
      let buffer='',last=null,failure=null,stderr='',cancelled=false,timedOut=false;
      const child=spawn(this.runtime,[path.join(this.converterRoot,'cli.mjs'),...args],{windowsHide:true,shell:false,cwd:this.converterRoot,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NODE_OPTIONS:'',NODE_PATH:''},stdio:['ignore','pipe','pipe']});
      this.child=child;child.cancelConversion=()=>{cancelled=true;child.kill();};
      const timer=setTimeout(()=>{timedOut=true;child.kill();},this.timeout);
      child.stdout.on('data',chunk=>{
        buffer+=chunk.toString();if(buffer.length>65536){failure=Error('変換ツールの応答が長すぎます。');child.kill();return;}
        for(let at;(at=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const message=JSON.parse(line);if(message.type==='error')failure=Error(String(message.message).slice(0,600));else if(message.type==='progress'&&jobId)this.progress({...message,jobId});else last=message;}catch{failure=Error('変換ツールの応答を読み取れません。');child.kill();}}
      });
      child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-2000);});
      child.once('error',error=>{failure=error;});
      child.once('close',code=>{
        clearTimeout(timer);if(this.child===child)this.child=null;
        if(cancelled)return reject(Object.assign(Error('変換を中止しました。'),{cancelled:true}));
        if(timedOut)return reject(Error('変換が制限時間を超えたため中止しました。'));
        if(failure)return reject(failure);if(code!==0||!last)return reject(Error('変換ツールを実行できませんでした。'+(stderr?' '+stderr.slice(0,300):'')));
        resolve(last);
      });
    });
  }
  async chooseModel(filename){return this.exclusive(async()=>{
    this.result=null;this.model=null;const bytes=this.readFile(filename,16*1024*1024),job=this.makeJob();
    try{const input=path.join(job,'input.nam');fs.writeFileSync(input,bytes);const reply=await this.run(['--check',input]);if(reply.type!=='checked')throw Error('NAMの検査に失敗しました。');
      const id=crypto.randomUUID();this.model={id,bytes,name:path.basename(filename),sha256:hash(bytes),check:reply.check};return {id,name:this.model.name,sha256:this.model.sha256,check:reply.check};
    }finally{this.cleanup(job);}
  });}
  async useSignal(filename){
    if(path.extname(filename).toLowerCase()==='.exe')filename=path.join(path.dirname(filename),'data/flutter_assets/assets/wavs/nam_input_wav.wav');
    const bytes=this.readFile(filename,32*1024*1024),job=this.makeJob();
    try{const input=path.join(job,'signal.wav');fs.writeFileSync(input,bytes);const reply=await this.run(['--check-signal',input]);if(reply.type!=='signal')throw Error('テスト信号を検査できませんでした。');
      this.atomic(path.join(this.root,'signal.wav'),bytes);this.signal={bytes,name:'nam_input_wav.wav',sha256:hash(bytes),frames:reply.frames};return {available:true,name:this.signal.name,sha256:this.signal.sha256,frames:reply.frames};
    }finally{this.cleanup(job);}
  }
  async chooseSignal(filename){return this.exclusive(()=>this.useSignal(filename));}
  async findSignal(){return this.exclusive(async()=>{
    if(this.signal)return {available:true,name:this.signal.name,sha256:this.signal.sha256,frames:this.signal.frames};
    const candidates=[path.join(this.root,'signal.wav')];
    const suffix='data/flutter_assets/assets/wavs/nam_input_wav.wav';
    for(const root of [process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Programs')].filter(Boolean)){
      let entries=[];try{entries=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory()&&/valeton/i.test(e.name));}catch{}
      for(const entry of entries){const base=path.join(root,entry.name);candidates.push(path.join(base,suffix),path.join(base,'Valeton Suite',suffix));}
    }
    for(const filename of candidates)if(fs.existsSync(filename)){try{return await this.useSignal(filename);}catch{}}
    return {available:false};
  });}
  async convert(id,jobId){
    if(this.disposed||this.busy)throw Error('変換処理が終わるまでお待ちください。');
    if(!this.model||this.model.id!==id)throw Error('NAMファイルを選び直してください。');
    if(!this.signal)throw Error('Valeton Suiteのテスト信号を指定してください。');
    if(typeof jobId!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(jobId))throw Error('Invalid conversion job');
    const model=this.model,signal=this.signal,job=this.makeJob();this.result=null;
    try{
      const input=path.join(job,'input.nam'),excitation=path.join(job,'signal.wav'),output=path.join(job,'output.vtsi');fs.writeFileSync(input,model.bytes);fs.writeFileSync(excitation,signal.bytes);
      const reply=await this.run(['--model',input,'--signal',excitation,'--out',output],{jobId});if(reply.type!=='done')throw Error('変換が完了しませんでした。');
      const bytes=Buffer.from(A.snap(fs.readFileSync(output)).data),receipt=crypto.randomUUID();
      const metadata={version:1,converter:'VLTN-based GPL-3.0 utility',sourceCommit:'8aae5c14edc13b5857b0ce42f277a420de0731bf',model:model.name,modelSha256:model.sha256,signalSha256:signal.sha256,resultSha256:hash(bytes),created:new Date().toISOString(),check:reply.check,rate:reply.rate,bytes:bytes.length};
      this.atomic(path.join(this.root,'last-conversion.json'),Buffer.from(JSON.stringify(metadata,null,2)));
      this.result={receipt,bytes,metadata,name:model.name.replace(/\.nam$/i,'')+'.clo'};return {receipt,name:this.result.name,sha256:metadata.resultSha256,bytes:bytes.length,check:reply.check,rate:reply.rate};
    }finally{this.cleanup(job);}
  }
  save(receipt,filename){if(!this.result||receipt!==this.result.receipt||this.busy)throw Error('先にNAMを変換してください。');A.snap(this.result.bytes);this.atomic(filename,this.result.bytes);return {name:path.basename(filename),bytes:this.result.bytes.length,sha256:this.result.metadata.resultSha256};}
  cancel(){if(this.child){this.child.cancelConversion();return true;}return false;}
  dispose(){this.disposed=true;this.cancel();}
}
module.exports={ConverterController};
module.exports.install=function({win,isEditor,storage,converterRoot,smoke=false,smokeDir}){
  const {ipcMain,dialog}=require('electron');
  const controller=new ConverterController({storage,converterRoot,progress:message=>{if(!win.isDestroyed())win.webContents.send('gp5-convert-progress',message);}});
  const check=e=>{if(!isEditor(e.sender))throw Error('Invalid editor');};
  ipcMain.handle('gp5-convert-model',async e=>{check(e);const chosen=smoke?{canceled:false,filePaths:[path.join(smokeDir,'converter-model.nam')]}:await dialog.showOpenDialog(win,{title:'変換するNAMファイルを選択',properties:['openFile'],filters:[{name:'Neural Amp Modeler',extensions:['nam']}]});if(chosen.canceled)return null;return controller.chooseModel(chosen.filePaths[0]);});
  ipcMain.handle('gp5-convert-signal',async(e,choose)=>{check(e);if(!choose)return controller.findSignal();const chosen=smoke?{canceled:false,filePaths:[path.join(smokeDir,'converter-signal.wav')]}:await dialog.showOpenDialog(win,{title:'nam_input_wav.wav または Valeton Suite.exe を選択',properties:['openFile'],filters:[{name:'Valeton Suite test signal / executable',extensions:['wav','exe']}]});if(chosen.canceled)return null;return controller.chooseSignal(chosen.filePaths[0]);});
  ipcMain.handle('gp5-convert-run',(e,id,jobId)=>{check(e);return controller.convert(id,jobId);});
  ipcMain.handle('gp5-convert-cancel',e=>{check(e);return controller.cancel();});
  ipcMain.handle('gp5-convert-save',async(e,receipt)=>{check(e);if(!controller.result||receipt!==controller.result.receipt)throw Error('先にNAMを変換してください。');const chosen=smoke?{canceled:false,filePath:path.join(smokeDir,'converted-result.clo')}:await dialog.showSaveDialog(win,{title:'SnapToneファイルを保存',defaultPath:controller.result.name,filters:[{name:'SnapTone',extensions:['clo','vtsi']}]});if(chosen.canceled)return null;return controller.save(receipt,chosen.filePath);});
  win.on('closed',()=>controller.dispose());return controller;
};
