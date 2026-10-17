// SPDX-License-Identifier: GPL-3.0-only
// Standalone conversion adapter using the pinned VLTN DSP engine; see NOTICE.md.
import fs from 'node:fs/promises';
import {prepareNam} from './runtime/nam.mjs';
import {readSignalWav} from './runtime/signal.mjs';
import {parseA1,renderA1} from './runtime/wavenet.mjs';
import {parseA2,renderA2} from './runtime/a2.mjs';
import {convertSampleRate,cloneSnapTone} from './runtime/htkpa.mjs';
export {prepareNam,readSignalWav};
export function quantizeRoundTrip(input,bits) {
  const out=new Float32Array(input.length),shift=2**(32-bits),scale=2**(bits-1);
  for(let i=0;i<input.length;i++)out[i]=Math.floor(Math.floor(Math.max(-1,Math.min(1,input[i]))*0x7fffffff+0.5)/shift)/scale;
  return out;
}
export function crc16(bytes) {
  let crc=65535;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xa001:0);}return crc;
}
export function uploadFile(clone) {
  const b=Uint8Array.from(clone),v=new DataView(b.buffer);
  if(b.length!==8840||String.fromCharCode(...b.slice(0,4))!=='VTSI'||v.getUint32(4,true)!==b.length||b[18]||b[19]||crc16(b.slice(12))!==b[8]*256+b[9])throw Error('変換結果の形式・CRCが不正です。');
  const result=b.slice(0,2696),d=new DataView(result.buffer);
  for(let at=24;at<104;at+=8)if(result.slice(at,at+8).every(n=>n===255))d.setFloat64(at,-1,true);
  d.setUint32(4,2696,true);d.setUint32(20,2560,true);d.setUint32(132,Math.min(d.getUint32(132,true),512),true);
  const crc=crc16(result.slice(12));result[8]=crc>>8;result[9]=crc&255;return result;
}
export async function convert(namText,signalBytes,progress=()=>{}) {
  const prepared=prepareNam(namText),excitation=readSignalWav(signalBytes),a2=prepared.check.arch==='A2';
  const model=a2?parseA2(prepared.json):parseA1(prepared.json),rate=model.sampleRate??48000;
  progress('excitation',0);const source=Float32Array.from(excitation,n=>n/32768);
  const input=quantizeRoundTrip(rate===44100?source:convertSampleRate(source,44100,rate),24);
  progress('render',0);const wasm=await fs.readFile(new URL(`./runtime/${a2?'a2':'a1'}kernel.wasm`,import.meta.url));
  const rendered=await (a2?renderA2:renderA1)(wasm,model,input,f=>progress('render',f));
  for(let i=0;i<rendered.length;i++)rendered[i]=Math.fround(rendered[i]*Math.fround(.31));
  progress('clone',0);const clone=cloneSnapTone(input,quantizeRoundTrip(rendered,16),rate);
  const file=uploadFile(clone);progress('done',1);return {file,clone,check:prepared.check,rate};
}
