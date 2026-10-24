const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=process.env.TRAVEL_SOURCE_ROOT || require('path').resolve(__dirname,'..')+'/';
const src=f=>fs.readFileSync(root+f,'utf8');
const out=[];
function func(file,name,indent=2){const s=src(file),start=s.indexOf(' '.repeat(indent)+(s.includes(' '.repeat(indent)+'async function '+name+'(')?'async ':'')+'function '+name+'(');assert(start>=0,name);const end=s.indexOf('\n'+' '.repeat(indent)+'}',start);assert(end>=0,name);return s.slice(start,end+indent+2).trim();}
function storage(seed={}){let m=new Map(Object.entries(seed));return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),all:()=>Object.fromEntries(m)}}
(async()=>{
 // Reconnect drains pending tasks across every month, not only the visible month.
 const allMonthCalls=[];const allMonth={window:{},navigator:{onLine:true},readAll:()=>({'2030-01':[{_dirty:true}],'2030-02':[{_dirty:true}],'2030-03':[{_dirty:false}]}),readDeleted:()=>({deleted:'2030-04'}),refreshMonthFromSheets:async month=>allMonthCalls.push(month)};
 vm.createContext(allMonth);const planSource=src('plan-ui.js');vm.runInContext(planSource.slice(planSource.indexOf('  let offlineRetryFlight'),planSource.indexOf('  window.lexiPlanRefreshMonth')),allMonth);
 await Promise.all([allMonth.window.lexiPlanRetryPendingWrites(),allMonth.window.lexiPlanRetryPendingWrites()]);assert.deepEqual(allMonthCalls,['2030-01','2030-02','2030-04']);out.push({test:'reconnect-all-dirty-months-and-deletes-single-flight',passed:true});
 // An authoritative empty response removes clean cached records.
 let saved=[{id:'previously-synced',text:'Removed in Sheet',_dirty:false}],uploads=[];
 const planCtx={refreshPromises:new Map(),localStorage:storage({key:'fixture'}),KEY_STORAGE:'key',setSyncState:()=>{},ensureSyncCapability:async()=>true,postAction:async()=>({ok:true,items:[]}),itemsForMonth:()=>saved,remoteItemToLocal:x=>x,readDeleted:()=>({}),writeMonth:(m,x)=>saved=x,syncUpsert:async(m,id)=>{uploads.push(id);return true},syncDelete:async()=>true};
 vm.createContext(planCtx);vm.runInContext(func('plan-ui.js','refreshMonthFromSheets'),planCtx);await planCtx.refreshMonthFromSheets('2026-10');
 assert.equal(uploads.length,0);assert.equal(saved.length,0);out.push({test:'plan-remote-removal-stays-removed',passed:true,remoteItems:0,localDirty:false,upserted:uploads});
 // Unsaved offline tasks must remain retryable.
 saved=[{id:'offline-new',text:'Unsent task',_dirty:true}];uploads=[];await planCtx.refreshMonthFromSheets('2026-10');assert.deepEqual(uploads,['offline-new']);assert.equal(saved.length,1);out.push({test:'dirty-offline-plan-is-preserved',passed:true});
 // Acknowledged local edits must yield to the canonical response.
 const noteCtx={appData:{notes:[{ID:'note1',Title:'New from Sheet',Body:'Canonical new body'}]},readDrafts:()=>({note1:{Title:'Old local title',Body:'Old body',savedAt:1,_syncedAt:1,_confirmedAt:2}}),isReadOnlyNote:()=>false,writeDrafts:()=>{}};
 vm.createContext(noteCtx);vm.runInContext(func('notes-ui.js','mergeLocalState'),noteCtx);noteCtx.mergeLocalState(3);assert(noteCtx.appData.notes[0].Title==='New from Sheet');out.push({test:'synced-note-draft-yields-to-sheet',passed:true,renderedTitle:noteCtx.appData.notes[0].Title});
 // A read begun before a save acknowledgement cannot erase that saved edit.
 noteCtx.appData.notes=[{ID:'note1',Title:'Stale server snapshot',Body:'Old'}];noteCtx.mergeLocalState(1);assert.equal(noteCtx.appData.notes[0].Title,'Old local title');out.push({test:'pre-acknowledgement-read-keeps-local-edit',passed:true});
 // Startup must not renew projected-cache freshness.
 assert(!src('theme.js').includes('preserveProjectedNotesForImmediateDisplay'));
 const expiredStore=storage({projected:JSON.stringify({savedAt:Date.now()-8*86400000,notes:[{Category:'Read-only'}]})});
 const expired={localStorage:expiredStore,PROJECTED_CACHE_STORAGE:'projected',PROJECTED_CACHE_MAX_AGE_MS:86400000,isReadOnlyNote:()=>true,Date};vm.createContext(expired);vm.runInContext(func('notes-ui.js','readProjectedCache'),expired);assert.equal(expired.readProjectedCache().length,0);assert.equal(expiredStore.getItem('projected'),null);
 out.push({test:'expired-projection-is-discarded',passed:true});
 // A retry for one ID must preserve a newly queued second ID.
 let release;const store2=storage({key:'fixture',lexiTravelDeleteRetryV1:JSON.stringify({'eventdelete:A':{action:'eventDelete',id:'A'}})});
 const native=async(url,init)=>{const p=new URLSearchParams(init?.body);if(p.get('id')==='A')return new Promise(r=>release=()=>r(new Response(JSON.stringify({ok:true}))));throw new Error('fixture offline');};
 const ctx={window:{fetch:native,location:{href:'https://fixture.test/'},setTimeout:()=>1,addEventListener:()=>{}},document:{addEventListener:()=>{}},localStorage:store2,API_URL:'https://api.fixture.test/exec',KEY_STORAGE:'key',Response,Headers,URL,URLSearchParams,Element:class{},setTimeout:()=>1,Date};vm.createContext(ctx);vm.runInContext(src('travel-api-transport.js'),ctx);
 const retry=ctx.window.lexiTravelRetryPendingDeletes();await new Promise(r=>setImmediate(r));assert(release);
 await ctx.window.fetch(ctx.API_URL,{method:'POST',body:new URLSearchParams({action:'eventDelete',id:'B'})});let during=JSON.parse(store2.getItem('lexiTravelDeleteRetryV1'));assert(during['eventdelete:B']);release();await retry;let after=JSON.parse(store2.getItem('lexiTravelDeleteRetryV1'));assert(after['eventdelete:B']);assert(!after['eventdelete:A']);out.push({test:'delete-retry-preserves-concurrent-new-id',passed:true,queuedBeforeCompletion:Object.keys(during),queuedAfterCompletion:Object.keys(after)});
 for(const family of ['shopping','visit']) {
 // A read started before a mutation must reconcile before returning.
 let domReady,resolveRead,reads=0;let state=false;
 const dummy={classList:{toggle:()=>{}},style:{},dataset:{},setAttribute:()=>{},addEventListener:()=>{}};
 const c={window:{location:{href:'https://fixture.test/'},addEventListener:()=>{},setTimeout:()=>1},document:{documentElement:dummy,querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')domReady=fn;}},localStorage:storage(),API_URL:'https://api.fixture.test/exec',KEY_STORAGE:'key',Response,URL,URLSearchParams,Date,Promise};
 c.window.fetch=async(url,init)=>{const p=new URLSearchParams(init?.body),a=p.get('action').toLowerCase();if(a===family+'list'){reads++;const snapshot=state;if(reads===1)return new Promise(r=>resolveRead=()=>r(new Response(JSON.stringify({ok:true,items:[{product:'fixture',bought:snapshot}]}))));return new Response(JSON.stringify({ok:true,items:[{product:'fixture',bought:snapshot}]}));}state=true;return new Response(JSON.stringify({ok:true}));};
 vm.createContext(c);vm.runInContext(src('theme.js'),c);domReady();const req=a=>c.window.fetch(c.API_URL,{method:'POST',body:new URLSearchParams({action:a})});const pending=req(family+'List');await new Promise(r=>setImmediate(r));await req(family==='shopping'?'shoppingSetBought':'visitSetVisited');resolveRead();await pending;const result=await (await req(family+'List')).json();assert(result.items[0].bought===true&&state===true&&reads===2);out.push({test:family+'-inflight-read-reconciles-after-mutation',passed:true,serverBought:state,cachedBought:result.items[0].bought,listNetworkCalls:reads});
 }
 // Date validation accepts real leap dates and rejects impossible dates.
 const p={};vm.createContext(p);vm.runInContext(src('apps-script-plan-sync.gs'),p);assert.equal(p.planNormalizeDueDate_('2026-02-31'),'');assert.equal(p.planNormalizeDueDate_('2028-02-29'),'2028-02-29');assert.equal(p.planNormalizeDueDate_('2026-02-29'),'');out.push({test:'backend-rejects-impossible-date-string',passed:true,accepted:p.planNormalizeDueDate_('2026-02-31')});
 console.log(JSON.stringify({passed:out.length,cases:out},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
