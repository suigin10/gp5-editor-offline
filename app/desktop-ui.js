(() => {
  const tap=document.getElementById('btn_tap'),card=tap.closest('.card-body');
  const minus=document.getElementById('btn_tap_minus'),plus=document.getElementById('btn_tap_plus');
  const output=document.getElementById('global_bpm_output'),range=document.getElementById('global_bpm_value');
  const global=document.getElementById('globalbpm_switch').closest('.form-check');
  const divisions=document.querySelector('[aria-label="Tap divisions"]');
  divisions.className='btn-group btn-group-sm';
  for(const button of [tap,minus,plus]){button.classList.remove('display-3','display-5','py-4');button.classList.add('btn-sm');}
  tap.title='曲の拍に合わせて複数回押すとテンポを設定します';
  minus.setAttribute('aria-label','テンポを下げる');plus.setAttribute('aria-label','テンポを上げる');
  const bar=document.createElement('div');bar.className='d-flex align-items-center gap-2 flex-wrap';
  const bpm=document.createElement('span');bpm.append('BPM: ',output);
  bar.append(bpm,minus,tap,plus);global.classList.remove('pt-3');
  const options=document.createElement('div');options.className='d-flex align-items-center gap-3 flex-wrap mt-2';options.append(divisions,global);
  card.classList.add('tempo-panel');card.replaceChildren(bar,range,options);
  card.closest('.col-12').classList.add('tempo-column');
  const names=['NR','PRE','DST','AMP','CAB','EQ','MOD','DLY','RVB','N/S'];
  for(const input of document.querySelectorAll('.live-on input[data-effect]')){
    const label=document.querySelector(`label[for="${input.id}"]`);
    input.setAttribute('aria-label',names[Number(input.dataset.effect)]);label.setAttribute('aria-label',names[Number(input.dataset.effect)]);label.title=names[Number(input.dataset.effect)];
  }
  document.getElementById('live_switch').addEventListener('change',event=>document.body.classList.toggle('live-mode',event.target.checked));
  for(const id of ['btn_save_patch','btn_show_patch','btn_show_settings','global_vol_value'])document.getElementById(id).closest('[class*="col"]').classList.add('edit-only');
  const namStatus=document.createElement('div');namStatus.className='nam-status';namStatus.setAttribute('role','status');
  document.getElementById('btn_list').after(namStatus);
  function syncSnapTone(){
    const active=document.getElementById('ns_switch').checked;
    document.body.classList.toggle('snaptone-active',active);
    for(const id of ['amp_button','cab_button']){
      const button=document.getElementById(id);button.classList.remove('bg-danger-subtle','btn-outline-danger');button.classList.toggle('nam-context',active);
      document.querySelector(`label[for="${id.replace('_button','_live')}"]`).classList.toggle('nam-context',active);
    }
    const list=document.getElementById('ns_effects_list'),name=list.selectedOptions[0]?.textContent||'選択中のSnapTone';
    namStatus.textContent=active?`NAM / SnapTone — ${name}`:'';namStatus.hidden=!active;
    document.getElementById('ns_button').classList.toggle('nam-source',active);
  }
  const upstreamRefresh=refreshGUI;refreshGUI=function(){upstreamRefresh();syncSnapTone();};
  document.addEventListener('change',syncSnapTone);window.addEventListener('gp5-asset-names',syncSnapTone);syncSnapTone();
  document.addEventListener('DOMContentLoaded',()=>{
    const main=document.querySelector('body > .container-fluid'),content=document.createElement('div');content.className='fit-content';
    while(main.firstChild)content.append(main.firstChild);main.append(content);
    let frame=0,cacheKey='',scale=1;
    function fit(){
      frame=0;
      const key=`${innerWidth}/${innerHeight}/${document.body.classList.contains('live-mode')}`;
      const result=()=>({scale,scroll:main.scrollHeight>main.clientHeight+1});
      if(key===cacheKey)return result();
      cacheKey=key;content.style.zoom='1';
      // Measure the tallest possible editor once per viewport/view. Restore classes
      // before painting; selecting an effect or toggling SnapTone never changes zoom.
      const cards=[...content.querySelectorAll('.effects_card')],groups=[...content.querySelectorAll('[id$="_group"]')];
      const saved=[...cards,...groups].map(node=>[node,node.className]);
      const live=document.body.classList.contains('live-mode');
      function measure(metric){
        let height=0;
        if(!live){for(const group of groups)group.classList.remove('d-none');for(const card of cards)card.classList.add('d-none');}
        for(const card of live?[null]:cards){
          card?.classList.remove('d-none');height=Math.max(height,metric());card?.classList.add('d-none');
        }
        return height;
      }
      try{
        const available=main.clientHeight-2,natural=measure(()=>Math.max(content.scrollHeight,content.getBoundingClientRect().height));
        scale=Math.max(.5,Math.min(1,Math.floor(available/Math.max(1,natural)*1000)/1000));content.style.zoom=String(scale);
        for(let i=0;i<3;i++){
          const height=measure(()=>main.scrollHeight);if(height<=main.clientHeight+1||scale<=.5)break;
          scale=Math.max(.5,Math.floor(scale*available/height*1000)/1000);content.style.zoom=String(scale);
        }
      }finally{for(const [node,classes] of saved)node.className=classes;}
      main.dataset.fitScale=String(scale);return result();
    }
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};
    new ResizeObserver(schedule).observe(main);
    new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['class']});
    window.addEventListener('resize',schedule);window.addEventListener('load',()=>{cacheKey='';schedule();});window.GP5FitLayout=fit;schedule();
  });
})();
