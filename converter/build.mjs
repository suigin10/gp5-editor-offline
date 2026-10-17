// SPDX-License-Identifier: GPL-3.0-only
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
const root=path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root,'runtime'),{recursive:true});
for(const name of ['nam','signal','kernel','wavenet','a2','htkpa']) {
  let code=stripTypeScriptTypes(fs.readFileSync(path.join(root,'src',name+'.ts'),'utf8'),{mode:'transform'});
  code=code.replaceAll('"@shared/nam"','"./nam.mjs"').replaceAll('"./kernel"','"./kernel.mjs"');
  fs.writeFileSync(path.join(root,'runtime',name+'.mjs'),'// GPL-3.0; generated from ../src/'+name+'.ts. See ../NOTICE.md.\n'+code);
}
console.log('Standalone converter runtime generated from corresponding TypeScript source.');
