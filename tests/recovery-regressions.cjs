const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const API = 'https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
const turn = () => new Promise(resolve => setImmediate(resolve));
function harness(fetch) {
  const memory = new Map([['lexiTravelApiKey','fixture']]), timers = new Map(); let sequence = 0;
  const c = {URL,URLSearchParams,Response,AbortController,Math,JSON,Date,Promise,Set,Map,
    location:{href:'https://fixture.test/lexi-travel/'},navigator:{onLine:true},
    localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},
    document:{hidden:false,addEventListener(){},querySelector(){return null}},
    setInterval(){},setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),addEventListener(){},fetch};
  c.window=c; vm.createContext(c); vm.runInContext(fs.readFileSync('offline.js','utf8'),c);
  return {c,memory,timers,
    post:(action,fields={})=>c.fetch(API,{method:'POST',body:new URLSearchParams({key:'fixture',action,...fields})}).then(r=>r.json()),
    queue:()=>JSON.parse(memory.get('lexiTravelOfflineChecksV1')||'{}'),
    expire(ms){const timer=[...timers.values()].find(t=>t.ms===ms);assert(timer,`deadline ${ms} must remain active`);timer.fn()}
  };
}
(async()=>{
  for(const family of ['shopping','visit']) {
    const field=family==='shopping'?'bought':'visited',name=family==='shopping'?'product':'place',action=family==='shopping'?'shoppingSetBought':'visitSetVisited';
    let release,backend=false;const calls=[];
    const h=harness(async(_,init)=>{
      const p=new URLSearchParams(init.body),value=p.get(field)==='true';calls.push(value);
      if(value)await new Promise(resolve=>release=()=>{backend=true;resolve()});else backend=false;
      return Response.json({ok:true});
    });
    h.c.navigator.onLine=false;await h.post(action,{[name]:'Fixture',[field]:'true'});
    h.c.navigator.onLine=true;const retry=h.c.lexiTravelRetryOfflineChecks();await turn();assert(release);
    const undo=h.post(action,{[name]:'Fixture',[field]:'false'});await turn();
    assert.deepEqual(calls,[true],'The newer online undo must wait for the old retry');
    assert.equal(Object.values(h.queue())[0].fields[field],'false','Newest intent must be durable before waiting');
    release();await Promise.all([retry,undo]);
    assert.deepEqual(calls,[true,false]);assert.equal(backend,false);assert.equal(Object.keys(h.queue()).length,0);
    console.log('PASS',family,'background retry and online undo preserve final server ordering');
  }
  {
    let release;const calls=[];const h=harness(async(_,init)=>{const p=new URLSearchParams(init.body);calls.push(p.get('product'));if(p.get('product')==='A')await new Promise(r=>release=r);return Response.json({ok:true})});
    const first=h.post('shoppingSetBought',{product:'A',bought:'true'});await turn();
    const retry=h.c.lexiTravelRetryOfflineChecks();await h.post('shoppingSetBought',{product:'B',bought:'true'});
    assert.deepEqual(calls,['A','B'],'Unrelated rows must remain usable');release();await Promise.all([first,retry]);
    assert.equal(calls.filter(x=>x==='A').length,1,'A queued retry must not resend an already acknowledged version');
    console.log('PASS independent rows and duplicate retry suppression');
  }
  for(const action of ['data','noteCapabilities','noteUpsert','eventUpsert','shoppingSetBought']) {
    let stall=true,calls=0;
    const h=harness(async()=>{calls++;return stall?{ok:true,status:200,text:()=>new Promise(()=>{})}:Response.json({ok:true,events:[],notes:[]})});
    const isRead=action==='data';
    const result=(isRead?h.c.fetch(API+'?key=fixture&action=data').then(r=>r.json()):h.post(action,{product:'Fixture',bought:'true'})).then(value=>({value}),error=>({error}));
    await turn();h.expire(isRead?15000:25000);const outcome=await result;
    if(action==='shoppingSetBought'){assert(outcome.value.queued);assert.equal(Object.keys(h.queue()).length,1)}else assert(outcome.error);
    stall=false;
    if(isRead)assert((await (await h.c.fetch(API+'?key=fixture&action=data')).json()).ok);
    else if(action==='shoppingSetBought'){await h.c.lexiTravelRetryOfflineChecks();assert.equal(Object.keys(h.queue()).length,0)}
    else assert((await h.post(action)).ok);
    assert.equal(calls,2,'A stalled body must release its read/write lane for retry');
    console.log('PASS',action,'full-body deadline and recovery');
  }
  {
    const listeners={},documentListeners={},timers=[];let reads=0,probes=0,replacements=0;
    const c={KEY_STORAGE:'fixture-key',localStorage:{getItem:()=> 'fixture'},document:{hidden:false,getElementById:id=>id==='calendarView'?{classList:{contains:()=>true}}:{querySelector:()=>null},addEventListener:(k,fn)=>documentListeners[k]=fn},window:{addEventListener:(k,fn)=>listeners[k]=fn,location:{replace(){replacements++}},setInterval(){throw Error('Shell polling must not run')}},setTimeout:fn=>timers.push(fn),fetch:()=>{probes++;return Promise.resolve({ok:true,text:async()=>'<html data-build="new-release">'})},loadAllData:async()=>{reads++},Date};
    vm.runInNewContext(fs.readFileSync('calendar-resume-refresh.js','utf8'),c);
    listeners.pageshow();for(const fn of timers)fn();await turn();documentListeners.visibilitychange();await turn();listeners.focus();await turn();
    assert(reads>0,'Resume must continue refreshing Sheet data');assert.equal(probes,0);assert.equal(replacements,0);
    console.log('PASS data refresh survives without build probing, polling or forced navigation');
  }
})().catch(e=>{console.error(e);process.exitCode=1});
