const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=require('path').resolve(__dirname,'..');
const API='https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
const source=fs.readFileSync(root+'/offline.js','utf8');
const memory=new Map([['lexiTravelApiKey','synthetic']]);let requests=[],failure=false,resolveWrite=null,holdWrite=null;
function env(){const listeners={};const c={URL,URLSearchParams,Response,Math,JSON,Date,Promise,Set,Map,location:{href:'https://example.test/lexi-travel/'},navigator:{onLine:true},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},document:{hidden:false,addEventListener(){},querySelector(){return null}},setInterval(){},addEventListener(k,f){listeners[k]=f},fetch:async(input,init={})=>{requests.push({input,init});if(failure)throw Error('Synthetic offline');const p=init.method==='POST'?new URLSearchParams(init.body):new URL(input).searchParams;const action=(p.get('action')||'data').toLowerCase();if(action.endsWith('setbought')||action.endsWith('setvisited')){if(holdWrite)await holdWrite;return Response.json({ok:true})}if(action==='data')return Response.json({ok:true,locations:[{ID:'location'}],events:[],notes:p.get('includeNotes')==='0'?[]:[{ID:'note',Body:'Offline reference'}]});return Response.json({ok:true,items:action==='shoppinglist'?[{product:'Synthetic product',bought:false}]:[{place:'Synthetic place',visited:false}]})}};c.window=c;vm.createContext(c);vm.runInContext(source,c);return {c,listeners}}
function post(c,action,fields={}){return c.fetch(API,{method:'POST',body:new URLSearchParams({key:'synthetic',action,...fields})}).then(r=>r.json())}
(async()=>{
 let {c}=env();
 await c.fetch(API+'?key=synthetic&action=data&includeNotes=1').then(r=>r.json());await c.fetch(API+'?key=synthetic&action=data&includeNotes=0').then(r=>r.json());
 await post(c,'shoppingList');await post(c,'visitList');
 c.navigator.onLine=false;const before=requests.length;
 const data=await c.fetch(API+'?key=synthetic&action=data&_=123').then(r=>r.json());assert.equal(data.notes[0].Body,'Offline reference');assert.equal(requests.length,before);
 assert.equal((await post(c,'shoppingSetBought',{product:'Synthetic product',bought:'true'})).queued,true);
 assert.equal((await post(c,'visitSetVisited',{place:'Synthetic place',visited:'true'})).queued,true);
 assert.equal((await post(c,'shoppingList')).items[0].bought,true);assert.equal((await post(c,'visitList')).items[0].visited,true);
 // A new app process restores snapshots and queued changes.
 ({c}=env());c.navigator.onLine=false;assert.equal((await post(c,'shoppingList')).items[0].bought,true);
 c.navigator.onLine=true;failure=true;await c.lexiTravelRetryOfflineChecks();assert.equal(Object.keys(JSON.parse(memory.get('lexiTravelOfflineChecksV1'))).length,2);
 failure=false;await c.lexiTravelRetryOfflineChecks();assert.equal(Object.keys(JSON.parse(memory.get('lexiTravelOfflineChecksV1'))).length,0);
 c.navigator.onLine=false;assert.equal((await post(c,'shoppingList')).items[0].bought,true);
 // Newer same-row edits survive an in-flight acknowledgement.
 await post(c,'shoppingSetBought',{product:'Synthetic product',bought:'false'});c.navigator.onLine=true;holdWrite=new Promise(r=>resolveWrite=r);const retry=c.lexiTravelRetryOfflineChecks();await Promise.resolve();c.navigator.onLine=false;await post(c,'shoppingSetBought',{product:'Synthetic product',bought:'true'});holdWrite=null;resolveWrite();await retry;assert.equal(Object.values(JSON.parse(memory.get('lexiTravelOfflineChecksV1')))[0].fields.bought,'true');
 // Other apps and third-party links do not receive API snapshots.
 c.navigator.onLine=true;const count=requests.length;await c.fetch('https://example.test/lexi-notes/');assert.equal(requests.length,count+1);
 console.log('PASS: offline data/notes, Shopping + Visit durable edits, restart recovery, failed retry retention, reconnect sync, newer-edit race, app isolation');
 const sw=fs.readFileSync(root+'/sw.js','utf8');const shell=JSON.parse(sw.match(/const SHELL=(.*);/)[1]);for(const asset of shell){if(asset==='./')continue;assert(fs.existsSync(root+'/'+asset.replace(/^\.\//,'').split('?')[0]),asset)}assert(shell.includes('offline.js?v=1'));assert(!shell.some(x=>x.includes('notes-app/')));console.log('PASS: all service-worker shell assets exist; legacy Notes excluded');
})().catch(e=>{console.error(e);process.exitCode=1});
