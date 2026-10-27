import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const {Window}=await import(process.env.HAPPY_DOM_MODULE || 'happy-dom');
const root=process.env.TRAVEL_SOURCE_ROOT || new URL('../',import.meta.url).pathname;
const source=file=>fs.readFileSync(root+'/'+file,'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const windows=[];let passed=0;
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}};
async function check(name,fn){await fn();passed++;console.log('PASS '+name)}
try{
for(const family of ['shopping','visit'])await check(`${family}: cached rows render during an unfinished warm-up, toggles respond immediately, unchanged rows stay mounted`,async()=>{
 const w=new Window({url:'https://fixture.test/'});windows.push(w);
 const view=family+'View',body=family==='shopping'?'shoppingListBody':'visitListBody',status=family+'Status';
 w.document.write(`<button class="tab" data-view="${view}"></button><div id="${view}"></div><div id="${body}"></div><div id="${status}"></div>`);
 const items=family==='shopping'?[{product:'Fixture',store:'Big C',bought:false}]:[{place:'Fixture',area:'Terminal 21',visited:false}];
 const cache=family==='shopping'?'lexiTravelShoppingCacheV1':'lexiTravelVisitCacheV1';w.localStorage.setItem('key','fixture');w.localStorage.setItem(cache,JSON.stringify({items}));
 let warm,releaseRead,releaseWrite;const timers=w.setTimeout.bind(w);
 w.setTimeout=(fn,ms,...args)=>ms===1800?(warm=fn,1):timers(fn,ms,...args);
 const calls=[];w.fetch=(_,init)=>{const p=new URLSearchParams(init.body),action=p.get('action');calls.push(action);return new Promise(resolve=>{if(action.endsWith('List'))releaseRead=()=>resolve({ok:true,json:async()=>({ok:true,items})});else releaseWrite=()=>resolve({ok:true,json:async()=>({ok:true})})})};
 w.eval("const KEY_STORAGE='key',API_URL='https://fixture.test/api';\n"+source(family+'-list.js'));
 warm();await turn();assert(releaseRead);assert.equal(w.document.getElementById(body).children.length,0);
 w.document.getElementById(view).classList.add('active');w.document.querySelector('.tab').click();
 const checkbox=w.document.querySelector('input[type="checkbox"]');assert(checkbox,'cached row must exist BEFORE the network resolves');
 checkbox.checked=true;checkbox.dispatchEvent(new w.Event('change'));assert(w.document.querySelector('.shopping-bought'));
 await turn();assert(releaseWrite);releaseWrite();await turn();
 releaseRead();await turn();
 assert.equal(w.document.querySelector('input[type="checkbox"]'),checkbox,'a completed edit and older refresh must retain the tapped row');
 assert.equal(checkbox.checked,true,'older refresh cannot undo a confirmed edit');
 assert.equal(JSON.parse(w.localStorage.getItem(cache)).items[0][family==='shopping'?'bought':'visited'],true);
 const mounted=w.document.querySelector('input[type="checkbox"]');w.document.querySelector('.tab').click();
 assert.equal(w.document.querySelector('input[type="checkbox"]'),mounted,'unchanged tab revisit must not rebuild the list');
 assert.equal(calls.filter(a=>a.endsWith('List')).length,1,'fresh list should not refetch on tab revisit');
 // After an unchanged fresh response, mounted handlers must still update the cache.
 checkbox.checked=false;checkbox.dispatchEvent(new w.Event('change'));await turn();
 assert.equal(JSON.parse(w.localStorage.getItem(cache)).items[0][family==='shopping'?'bought':'visited'],false);
 releaseWrite();await turn();
 // Complete the final background read so test cleanup never leaves work hanging.
 releaseRead();await turn();
});
await check('Notes: no capability traffic on clean startup, tab visits or resume; concurrent capability checks share one request',async()=>{
 const w=new Window({url:'https://fixture.test/'});windows.push(w);
 w.document.write('<button class="tab" data-view="notesView"></button><div id="notesList"></div><div id="noteSaveStatus"></div>');
 w.localStorage.setItem('key','fixture');const calls=[];let release;
 w.fetch=(_,init)=>{const p=new URLSearchParams(init.body);calls.push(p.get('action'));return new Promise(resolve=>release=()=>resolve({ok:true,json:async()=>({ok:true,noteWrite:true})}))};
 const code=source('notes-sync.js').replace(/\}\)\(\);\s*$/,'window.perf={ensureWriteCapability,syncUpsert};})();');
 w.eval("const KEY_STORAGE='key',API_URL='https://fixture.test/api';let appData={notes:[{ID:'n',Title:'Fixture',Body:'Base'}]};\n"+code);
 await turn();w.document.querySelector('.tab').click();w.dispatchEvent(new w.Event('pageshow'));await turn();assert.equal(calls.length,0);
 const one=w.perf.ensureWriteCapability(true),two=w.perf.ensureWriteCapability(true);await turn();assert.equal(calls.length,1);release();await Promise.all([one,two]);
});
await check('Notes: queued intermediate versions are skipped while the newest draft is preserved and acknowledged',async()=>{
 const w=new Window({url:'https://fixture.test/'});windows.push(w);w.document.write('<button class="tab" data-view="notesView"></button><div id="notesList"></div><div id="noteSaveStatus"></div>');w.localStorage.setItem('key','fixture');
 const writes=[];let release;w.fetch=async(_,init)=>{const p=new URLSearchParams(init.body);if(p.get('action')==='noteCapabilities')return {ok:true,json:async()=>({ok:true,noteWrite:true})};writes.push(p.get('body'));if(writes.length===1)await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true})}};
 const code=source('notes-sync.js').replace(/\}\)\(\);\s*$/,'window.perf={syncUpsert};})();');
 w.eval("const KEY_STORAGE='key',API_URL='https://fixture.test/api';let appData={notes:[{ID:'n',Title:'Fixture',Body:'Base'}]};\n"+code);await turn();
 const draft=v=>w.localStorage.setItem('lexiTravelNoteDraftsV1',JSON.stringify({n:{Body:'Version '+v,savedAt:v}}));
 draft(1);const one=w.perf.syncUpsert('n');await turn();assert(release);draft(2);const two=w.perf.syncUpsert('n');draft(3);const three=w.perf.syncUpsert('n');release();await Promise.all([one,two,three]);
 assert.deepEqual(writes,['Version 1','Version 3']);assert.equal(JSON.parse(w.localStorage.getItem('lexiTravelNoteDraftsV1')).n._syncedAt,3);
});
await check('API: identical reads share one request; stalled writes time out with their durable queue intact',async()=>{
 const API='https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
 const timers=new Map();let timerId=0,fetches=0;
 const c={URL,URLSearchParams,Response,AbortController,Math,JSON,Date,Promise,Set,Map,location:{href:'https://fixture.test/lexi-travel/'},navigator:{onLine:true},localStorage:memory(),document:{hidden:false,addEventListener(){},querySelector(){return null}},setInterval(){},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),addEventListener(){},fetch:()=>{fetches++;return new Promise(()=>{})}};c.window=c;vm.createContext(c);vm.runInContext(source('offline.js'),c);
 const read=()=>c.fetch(API+'?key=fixture&action=data&includeNotes=0');const reads=Promise.allSettled([read(),read(),read()]);await turn();assert.equal(fetches,1);[...timers.values()].find(t=>t.ms===15000).fn();assert((await reads).every(r=>r.status==='rejected'));
 const write=c.fetch(API,{method:'POST',body:new URLSearchParams({key:'fixture',action:'shoppingSetBought',product:'Fixture',bought:'true'})});await turn();[...timers.values()].find(t=>t.ms===25000).fn();assert.equal((await (await write).json()).queued,true);assert.equal(Object.keys(JSON.parse(c.localStorage.getItem('lexiTravelOfflineChecksV1'))).length,1);
});
await check('worker: cached launch never waits on the network; update probes reach the network and install reloads every asset',async()=>{
 const handlers={},installed=[],deleted=[];let fetches=0;const cache={match:async key=>new Response('cached'),addAll:async requests=>installed.push(...requests)};
 const context={URL,Request,Response,caches:{open:async()=>cache,keys:async()=>['lexi-travel-shell-v3','lexi-notes-shell-v29'],delete:async name=>deleted.push(name)},fetch:async()=>{fetches++;return new Response('new build')},self:{location:{href:'https://fixture.test/lexi-travel/sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting(){},clients:{claim:async()=>{}}}};
 vm.runInNewContext(source('sw.js'),context);let work;handlers.install({waitUntil:p=>work=p});await work;assert(installed.every(request=>request.cache==='reload'));handlers.activate({waitUntil:p=>work=p});await work;assert.deepEqual(deleted,['lexi-travel-shell-v3']);
 handlers.fetch({request:new Request('https://fixture.test/lexi-travel/index.html'),respondWith:p=>work=p});assert.equal(await (await work).text(),'cached');assert.equal(fetches,0);
 handlers.fetch({request:new Request('https://fixture.test/lexi-travel/index.html?lexi_build_probe=1'),respondWith:p=>work=p});assert.equal(await (await work).text(),'new build');assert.equal(fetches,1);
});
console.log(`${passed} performance regression groups passed; synthetic data only, no live Sheet writes.`);
}finally{for(const w of windows)await w.happyDOM.close()}
