import fs from 'node:fs';
import assert from 'node:assert/strict';
const {Window}=await import(process.env.HAPPY_DOM_MODULE || 'happy-dom');
const source=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const API='https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
const windows=[];
try {
 for(const family of ['shopping','visit']) {
  const w=new Window({url:'https://fixture.test/lexi-travel/'});windows.push(w);
  const body=family==='shopping'?'shoppingListBody':'visitListBody',cache=family==='shopping'?'lexiTravelShoppingCacheV1':'lexiTravelVisitCacheV1';
  w.document.write(`<button class="tab" data-view="${family}View"></button><section id="${family}View"></section><div id="${body}"></div><div id="${family}Status"></div>`);
  const timers=new Map();let id=0,clock=100000,calls=0,release,mode='hold';
  w.testNow=()=>clock;w.setTimeout=(fn,ms)=>{timers.set(++id,{fn,ms});return id};w.clearTimeout=id=>timers.delete(id);w.setInterval=()=>0;
  w.localStorage.setItem('lexiTravelApiKey','synthetic-secret');
  const items=family==='shopping'?[{product:'PRIVATE_ITEM',store:'Big C',bought:false}]:[{place:'PRIVATE_PLACE',visited:false}];
  w.fetch=async()=>{calls++;if(mode==='headers')return new Promise(()=>{});return {status:200,statusText:'OK',ok:true,text:()=>mode==='body'?new Promise(()=>{}):mode==='hold'?new Promise(resolve=>release=()=>resolve(JSON.stringify({ok:true,items}))):Promise.resolve(JSON.stringify({ok:true,items}))}};
  w.eval(source('lifecycle-diagnostics.js'));
  w.eval(source('offline.js'));
  w.eval(`const KEY_STORAGE='lexiTravelApiKey',API_URL=${JSON.stringify(API)};`+source(family+'-list.js').replaceAll('Date.now()', 'window.testNow()'));
  // First open while the preload body is incomplete must share the same request.
  [...timers.values()].find(t=>t.ms===1800).fn();await turn();
  w.document.getElementById(family+'View').classList.add('active');
  const tab=w.document.querySelector('.tab');tab.click();tab.click();await turn();assert.equal(calls,1);
  release();await turn();await turn();assert(w.document.getElementById(body).querySelector('input'));
  const checkbox=w.document.querySelector('input');tab.click();await turn();assert.equal(calls,1);assert.equal(w.document.querySelector('input'),checkbox);
  // Background/resume within freshness window causes no extra traffic.
  w.dispatchEvent(new w.Event('pageshow'));await turn();assert.equal(calls,1);
  // Once stale, a resume revalidates once, retaining visible rows.
  clock+=61000;mode='ok';w.dispatchEvent(new w.Event('pageshow'));w.dispatchEvent(new w.Event('pageshow'));await turn();await turn();assert.equal(calls,2);assert(w.document.querySelector('input'));
  // A saved snapshot remains visible when the complete network body stalls.
  clock+=61000;mode='body';tab.click();await turn();assert(w.document.querySelector('input'));assert.equal(calls,3);
  [...timers.values()].find(t=>t.ms===10000).fn();await turn();await turn();
  assert.match(w.document.getElementById(family+'Status').textContent,/saved list/i);
  // A fallback is not labelled fresh: the next tap can retry immediately.
  mode='ok';tab.click();await turn();await turn();assert.equal(calls,4);
  const events=w.LexiLifecycle.snapshot().events;
  assert(events.some(e=>e.event==='list-network-end'&&e.outcome==='timeout'));
  assert(events.some(e=>e.event==='list-reuse'&&e.outcome==='inflight'));
  assert(events.some(e=>e.event==='list-load-end'&&e.outcome==='saved'));
  assert(events.some(e=>e.event==='list-load-end'&&e.trigger==='resume'));
  // Unknown fields cannot put secrets/content/URLs into exported diagnostics.
  w.LexiLifecycle.mark('list-load-end',{list:family,durationMs:3,outcome:'network',key:'LEAK_KEY',url:'LEAK_URL',items:['LEAK_CONTENT']});
  const log=JSON.stringify(w.LexiLifecycle.snapshot());
  for(const secret of ['synthetic-secret','PRIVATE_ITEM','PRIVATE_PLACE','LEAK_KEY','LEAK_URL','LEAK_CONTENT'])assert(!log.includes(secret));
  assert(JSON.parse(w.localStorage.getItem(cache)).items.length===1);
  // A new document restores saved rows before any first-launch network response.
  const reopened=new Window({url:'https://fixture.test/lexi-travel/'});windows.push(reopened);
  reopened.document.write(`<button class="tab" data-view="${family}View"></button><section class="active" id="${family}View"></section><div id="${body}"></div><div id="${family}Status"></div>`);
  reopened.localStorage.setItem('lexiTravelApiKey','synthetic-secret');
  reopened.localStorage.setItem(cache,w.localStorage.getItem(cache));
  reopened.fetch=async()=>({ok:true,json:async()=>({ok:true,items})});
  reopened.eval(`const KEY_STORAGE='lexiTravelApiKey',API_URL=${JSON.stringify(API)};`+source(family+'-list.js'));
  assert(reopened.document.querySelector('input'),'saved rows must exist synchronously on relaunch');
  await turn();
  console.log('PASS '+family+': cold open, repeated taps, warm body coalescing, cached display, fresh/stale resume, timeout fallback, immediate retry, private diagnostics');
 }
} finally { for(const w of windows)await w.happyDOM.close() }
