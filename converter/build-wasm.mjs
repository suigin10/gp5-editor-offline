// SPDX-License-Identifier: GPL-3.0-only
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const arch of ['a1','a2']) {
  const args=['--target=wasm32','-O3','-msimd128','-nostdlib','-Wl,--no-entry',`-Wl,--export=${arch}_process`,'-Wl,--export=__heap_base','-Wl,--import-memory','-o',`runtime/${arch}kernel.wasm`,`src/${arch}kernel.c`];
  const result=spawnSync('clang',args,{cwd:fileURLToPath(new URL('.',import.meta.url)),stdio:'inherit',windowsHide:true});
  if(result.error||result.status!==0)throw result.error||Error('WASM build failed');
}
