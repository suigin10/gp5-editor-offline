// SPDX-License-Identifier: GPL-3.0-only
import fs from 'node:fs/promises';
import {convert,prepareNam,readSignalWav} from './engine.mjs';
const args=process.argv.slice(2),values={};
const emit=value=>process.stdout.write(JSON.stringify(value)+'\n');
try {
  for(let i=0;i<args.length;i+=2){if(!['--model','--signal','--out','--check','--check-signal'].includes(args[i])||!args[i+1])throw Error('Invalid arguments');values[args[i]]=args[i+1];}
  if(values['--check']){
    const text=await fs.readFile(values['--check'],'utf8');if(Buffer.byteLength(text)>16*1024*1024)throw Error('NAMは16MB以下にしてください。');
    emit({type:'checked',check:prepareNam(text).check});
  }else if(values['--check-signal']){
    const b=await fs.readFile(values['--check-signal']);if(b.length>32*1024*1024)throw Error('テスト信号が大きすぎます。');emit({type:'signal',frames:readSignalWav(b).length});
  }else{
    if(!values['--model']||!values['--signal']||!values['--out'])throw Error('Use --model input.nam --signal nam_input_wav.wav --out output.vtsi');
    const text=await fs.readFile(values['--model'],'utf8'),signal=await fs.readFile(values['--signal']);
    if(Buffer.byteLength(text)>16*1024*1024||signal.length>32*1024*1024)throw Error('入力ファイルが大きすぎます。');
    const result=await convert(text,signal,(phase,fraction)=>emit({type:'progress',phase,fraction}));
    await fs.writeFile(values['--out'],result.file,{flag:'wx'});emit({type:'done',bytes:result.file.length,rate:result.rate,check:result.check});
  }
}catch(error){emit({type:'error',message:error.detail||error.message||String(error)});process.exitCode=1;}
