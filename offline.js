(() => {
  'use strict';
  const API='https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
  const READS='lexiTravelOfflineReadsV1', QUEUE='lexiTravelOfflineChecksV1';
  const nativeFetch=window.fetch.bind(window);
  const readActions=new Set(['data','shoppinglist','visitlist','planlist','notecapabilities','eventcapabilities','plancapabilities','shoppingcapabilities','visitcapabilities']);
  const checkActions=new Set(['shoppingsetbought','visitsetvisited']);
  let flight=null, badge=null, revision=0;
  const readFlights=new Map();
  async function boundedFetch(input,init={}){
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timeout=init.method==='POST'?25000:15000;
    let timer;
    const abort=()=>controller?.abort();
    if(init.signal?.aborted)abort();
    init.signal?.addEventListener?.('abort',abort,{once:true});
    try{return await Promise.race([
      nativeFetch(input,controller?{...init,signal:controller.signal}:init),
      new Promise((_,reject)=>{timer=setTimeout(()=>{abort();reject(new Error('Connection timed out; saved changes will retry'))},timeout)})
    ])}finally{clearTimeout(timer);init.signal?.removeEventListener?.('abort',abort)}
  }
  function read(key){try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch(_){return {}}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function updateStatus(){if(!badge)return;const n=Object.keys(read(QUEUE)).length;badge.textContent=navigator.onLine===false?'Offline · saved data':n?`${n} waiting to sync`:'';badge.hidden=!badge.textContent}
  function json(data){return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}
  function fingerprint(key){let hash=2166136261;for(const ch of key){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16)}
  function cacheKey(p){return fingerprint(p.get('key')||'')+':'+JSON.stringify([...p].filter(([k])=>!['key','_','includeNotes','action'].includes(k)).sort())+':'+String(p.get('action')||'data').toLowerCase()}
  function queuedId(p){return String(p.get('action')).toLowerCase()+':'+String(p.get('product')||p.get('place')||'')}
  function overlay(data,p){
    const action=String(p.get('action')||'').toLowerCase();
    if(!['shoppinglist','visitlist'].includes(action)||!Array.isArray(data.items))return data;
    const shopping=action==='shoppinglist',writeAction=shopping?'shoppingsetbought':'visitsetvisited',field=shopping?'bought':'visited',name=shopping?'product':'place';
    data=JSON.parse(JSON.stringify(data));
    for(const record of Object.values(read(QUEUE))){
      if(record.account!==fingerprint(p.get('key')||'')||record.action!==writeAction)continue;
      for(const item of data.items)if(String(item[name])===record.fields[name])item[field]=record.fields[field]==='true';
    }
    return data;
  }
  function cached(p){const record=read(READS)[cacheKey(p)];if(!record)throw new Error('This section has not been saved online yet');return json({...overlay(record.data,p),__lexiOffline:true})}
  function storeResult(p,data){
    const all=read(READS),id=cacheKey(p),previous=all[id];
    // Lightweight calendar reads omit Notes; retain the last complete Notes snapshot.
    if(String(p.get('action')||'data').toLowerCase()==='data'&&p.get('includeNotes')==='0'&&previous?.data?.notes){data={...data,notes:previous.data.notes}}
    all[id]={savedAt:Date.now(),data};try{write(READS,all)}catch(_){/* Existing snapshots remain available. */}
  }
  function queueCheck(p){
    const fields=Object.fromEntries([...p].filter(([k])=>k!=='key'));
    const record={action:String(p.get('action')).toLowerCase(),fields,account:fingerprint(p.get('key')||''),token:Date.now()+':'+Math.random()};
    revision++;const queue=read(QUEUE);queue[queuedId(p)]=record;write(QUEUE,queue);updateStatus();return record;
  }
  function acknowledge(p,record){
    const queue=read(QUEUE);if(queue[queuedId(p)]?.token!==record.token)return;
    revision++;
    // Patch saved read snapshots before removing the pending overlay.
    const all=read(READS),shopping=record.action==='shoppingsetbought',name=shopping?'product':'place',field=shopping?'bought':'visited';
    for(const [id,entry] of Object.entries(all))if(id.startsWith(record.account+':')&&id.endsWith(':'+(shopping?'shoppinglist':'visitlist'))){for(const item of entry.data.items||[])if(String(item[name])===record.fields[name])item[field]=record.fields[field]==='true'}
    write(READS,all);delete queue[queuedId(p)];write(QUEUE,queue);updateStatus();
  }
  window.fetch=async function travelOfflineFetch(input,init={}){
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url;let url;
    try{url=new URL(raw,location.href)}catch(_){return nativeFetch(input,init)}
    if(url.href.split('?')[0]!==API)return nativeFetch(input,init);
    const method=String(init.method||input?.method||'GET').toUpperCase();
    const p=method==='GET'?new URLSearchParams(url.search):new URLSearchParams(init.body);
    const action=String(p.get('action')||(method==='GET'?'data':'')).toLowerCase();
    if(readActions.has(action)){
      if(navigator.onLine===false)return cached(p);
      let response;const started=revision;
      const requestKey=cacheKey(p)+':'+p.get('includeNotes')+':'+started;
      try{
        let request=readFlights.get(requestKey);
        if(!request){request=boundedFetch(input,init).finally(()=>{if(readFlights.get(requestKey)===request)readFlights.delete(requestKey)});readFlights.set(requestKey,request)}
        response=(await request).clone();
      }catch(error){try{return cached(p)}catch(_){throw error}}
      if(response.ok){try{const data=await response.clone().json();if(data.ok){if(started===revision)storeResult(p,data);return json(overlay(data,p))}}catch(_){}}
      if(response.status>=500){try{return cached(p)}catch(_){}}
      return response;
    }
    if(method==='POST'&&checkActions.has(action)){
      // Persist before network access; completion only clears its own version.
      const record=queueCheck(p);
      if(navigator.onLine===false)return json({ok:true,queued:true});
      try{
        const response=await boundedFetch(input,init);
        if(response.ok){const data=await response.clone().json();if(data.ok){acknowledge(p,record);return response}if(data.error){const queue=read(QUEUE);if(queue[queuedId(p)]?.token===record.token){delete queue[queuedId(p)];write(QUEUE,queue)}updateStatus();return response}}
        if(response.status>=400&&response.status<500)return response;
      }catch(_){/* Saved queue retries on reconnect. */}
      updateStatus();return json({ok:true,queued:true});
    }
    if(navigator.onLine===false)throw new Error('Offline · changes saved on this device will retry online');
    return boundedFetch(input,init);
  };
  function retry(){
    if(flight||navigator.onLine===false)return flight||Promise.resolve();
    flight=(async()=>{
      const key=localStorage.getItem('lexiTravelApiKey');if(!key)return;
      for(const [id,entry] of Object.entries(read(QUEUE))){
        if(entry.account!==fingerprint(key))continue;
        if(read(QUEUE)[id]?.token!==entry.token)continue;
        const p=new URLSearchParams({key,...entry.fields});
        try{const response=await boundedFetch(API,{method:'POST',body:p,cache:'no-store',redirect:'follow'});const data=await response.json();if(response.ok&&data.ok)acknowledge(p,entry);else break}catch(_){break}
      }
    })().finally(()=>{flight=null;updateStatus()});return flight;
  }
  window.lexiTravelRetryOfflineChecks=retry;
  function retryAll(){
    if(navigator.onLine===false)return;
    retry();
    window.lexiTravelRetryPendingDeletes?.();
    window.lexiCalendarRetryPendingWrites?.(true);
    window.lexiNotesRetryPendingWrites?.(true);
    window.lexiPlanRetryPendingWrites?.();
  }
  window.addEventListener('online',()=>{updateStatus();retryAll()});window.addEventListener('offline',updateStatus);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)retryAll()});
  window.addEventListener('pageshow',retryAll);
  setInterval(()=>{if(!document.hidden)retryAll()},30000);
  document.addEventListener('DOMContentLoaded',()=>{
    badge=document.createElement('div');badge.id='offlineStatus';badge.setAttribute('role','status');badge.style.cssText='font-size:11px;color:var(--muted,#8992a3);padding:0 16px 4px;text-align:right';
    // notes-ui already warms the complete Notes snapshot. A second full data
    // request here competes with first-screen reads without adding coverage.
    document.querySelector('.topbar')?.after(badge);updateStatus();retry();
    if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).catch(()=>{badge.textContent='Offline setup needs another online visit';badge.hidden=false});
  });
})();
