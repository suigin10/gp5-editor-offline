(function(root) {
  'use strict';
  const C=typeof module!=='undefined'&&module.exports?require('./preset-codec.js'):root.GP5PresetCodec;
  // Stored-preset scanning changes the active tone. Preserve the edit buffer before the first selection.
  async function scan(session,{slots=Array.from({length:100},(_,i)=>i),save,editing,cancelled=()=>false,progress=()=>{}}) {
    if(!Array.isArray(slots)||!slots.length||slots.length>100||new Set(slots).size!==slots.length||slots.some(n=>!Number.isInteger(n)||n<0||n>99))throw Error('バックアップ範囲が不正です。');
    const original=await session.currentSlot(),names=await session.names(),body=await session.body();
    if(await session.currentSlot()!==original)throw Error('本体のパッチが変わりました。');
    await editing(C.build(names[original],body,'gp5'),original);
    let selected=false,count=0,cancelledAtEnd=false;
    try {
      // Reload even if the first requested slot is the active slot, so RAM edits never replace the stored backup.
      for(const slot of slots) {
        if(cancelled()){cancelledAtEnd=true;break;}
        selected=true;
        if(slot===await session.currentSlot())await session.reload(slot);else await session.select(slot);
        const currentNames=await session.names(),data=await session.body();
        if(await session.currentSlot()!==slot)throw Error('バックアップ中に本体のパッチが変わりました。');
        await save(C.build(currentNames[slot],data,'gp5'),slot);count++;progress(count,slots.length);
      }
      return {count,cancelled:cancelledAtEnd,selectionChanged:selected};
    } finally {
      if(selected)await session.select(original);
      if(await session.currentSlot()!==original)throw Error('元のパッチへ戻せませんでした。再接続して確認してください。');
    }
  }
  const api={scan};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GP5LibraryOps=api;
})(globalThis);
