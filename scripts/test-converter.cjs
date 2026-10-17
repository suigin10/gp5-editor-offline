const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),{ConverterController}=require('../conversion-service.cjs'),A=require('../app/asset-codec.js');
const fixtures=path.join(root,'converter/tests/fixtures');
test('NAM A1/A2 classification and independent SnapTone integrity checks',async()=>{
 const E=await import(pathToFileURL(path.join(root,'converter/engine.mjs')));
 for(const arch of ['a1','a2']){assert.equal(E.prepareNam(fs.readFileSync(path.join(fixtures,arch+'.nam'),'utf8')).check.arch,arch.toUpperCase());const bytes=E.uploadFile(fs.readFileSync(path.join(fixtures,'suite-'+arch+'.clo')));assert.equal(A.snap(bytes).data.length,2696);bytes[200]^=1;assert.throws(()=>A.snap(bytes));}
 assert.throws(()=>E.prepareNam('{}'));assert.throws(()=>E.readSignalWav(Buffer.alloc(44)));assert.throws(()=>E.uploadFile(Buffer.alloc(8840)));
});
test('controller validates snapshots, cancels a child, clears stale models and contains temporary paths',async()=>{
 const storage=fs.mkdtempSync(path.join(os.tmpdir(),'gp5-converter-'));const c=new ConverterController({storage,converterRoot:path.join(root,'converter')});
 try{const m=await c.chooseModel(path.join(fixtures,'a2.nam'));assert.equal(m.check.arch,'A2');assert.equal(c.busy,false);assert.throws(()=>c.cleanup(storage));assert.throws(()=>c.save('invalid',path.join(storage,'invalid.clo')));
 const running=c.run(['--check',path.join(fixtures,'a1.nam')]);assert.equal(c.cancel(),true);await assert.rejects(running,/中止/);assert.equal(c.busy,false);
 const invalid=path.join(storage,'invalid.nam');fs.writeFileSync(invalid,'{}');await assert.rejects(c.chooseModel(invalid));assert.equal(c.model,null);assert.deepEqual(fs.readdirSync(c.jobs),[]);
 }finally{c.dispose();fs.rmSync(storage,{recursive:true,force:true});}
});
test('converter timeout kills child and releases busy state',async()=>{
 const storage=fs.mkdtempSync(path.join(os.tmpdir(),'gp5-converter-timeout-'));const c=new ConverterController({storage,converterRoot:path.join(root,'converter'),timeout:1});
 try{await assert.rejects(c.run(['--check',path.join(fixtures,'a1.nam')]),/制限時間/);assert.equal(c.busy,false);}finally{c.dispose();fs.rmSync(storage,{recursive:true,force:true});}
});
