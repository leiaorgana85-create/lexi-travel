const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function check(family,stall){
 const cap=family[0].toUpperCase()+family.slice(1),timers=new Map(),nodes=new Map();let next=0,calls=0,mode=stall;
 const node=()=>({textContent:'',innerHTML:'',childElementCount:1,classList:{contains:()=>true},addEventListener(){},append(){}});
 const document={hidden:false,querySelector:()=>node(),getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)},createElement:node,addEventListener(){}};
 const c={document,localStorage:{getItem:k=>k==='key'?'fixture':null,setItem(){}},KEY_STORAGE:'key',API_URL:'https://fixture.test/api',URLSearchParams,AbortController,Map,Date,JSON,String,Object,Array,Promise,Error,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next},clearTimeout:id=>timers.delete(id),setInterval(){},addEventListener(){},fetch:async()=>{calls++;if(mode==='headers')return new Promise(()=>{});return {ok:true,json:()=>mode==='body'?new Promise(()=>{}):Promise.resolve({ok:true,items:[]})}}};c.window=c;
 vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/../'+family+'-list.js','utf8').replace(/\}\)\(\);\s*$/,'window.retry=load'+cap+';})();'),c);
 await turn();assert.equal(nodes.get(family+'Status').textContent,'Loading…');
 [...timers.values()].find(t=>t.ms===12000).fn();await turn();
 const body=nodes.get(family==='shopping'?'shoppingListBody':'visitListBody');assert.notEqual(nodes.get(family+'Status').textContent,'Loading…');
 mode='ok';await c.retry();assert.equal(calls,2,'timeout must release loading guard so retry works');
 await c.retry();assert.equal(calls,2,'fresh list must avoid redundant requests');
 console.log('PASS',family,stall,'timeout covers complete response; retry and fresh-cache reuse');
}
(async()=>{for(const family of ['shopping','visit'])for(const stall of ['headers','body'])await check(family,stall)})().catch(e=>{console.error(e);process.exitCode=1});
