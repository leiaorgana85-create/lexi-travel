const {Window}=await import(process.env.HAPPY_DOM_MODULE || 'happy-dom');
import fs from 'node:fs';import assert from 'node:assert/strict';
const root=process.env.TRAVEL_SOURCE_ROOT || new URL('../',import.meta.url).pathname;
const htmlRoot=process.env.TRAVEL_HTML_ROOT || root;
const win=new Window({url:'https://fixture.test/lexi-travel/',settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
const errors=[],calls=[];win.addEventListener('error',e=>errors.push(e.message));win.confirm=()=>true;
// Match browser DOMTokenList.toggle(force): an unchanged forced state is a no-op.
const tokens=Object.getPrototypeOf(win.document.documentElement.classList);const toggle=tokens.toggle;tokens.toggle=function(token,force){if(force!==undefined&&this.contains(token)===Boolean(force))return Boolean(force);return toggle.call(this,token,force)};

const now=new Date(),m=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
const next=new Date(now.getFullYear(),now.getMonth()+1,1),nm=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}`;
let events=[{ID:'event-old',Date:`${m}-24`,Title:'Ordinary fixture',Time:'9:00 AM',Category:'Appointment'},{ID:'evt_flight_fixture',Date:`${m}-24`,Title:'AAA→BBB',Time:'10:00 AM → 12:00 PM',Category:'Flight'}];
let plan=[{ID:'todo1',Month:nm,Text:'Next month task','Due Date':`${nm}-10`,Completed:false}];
let notes=[{ID:'fixture-note',Title:'Reference note',Category:'Checklist',Body:JSON.stringify({version:1,blocks:[{type:'paragraph',text:'## Fixture heading\n- Normal note body\n[ ] Fixture task'}]}),Archived:false},{ID:'fixture-projection',Title:'Derived reference',Category:'read-only',Body:JSON.stringify({version:1,blocks:[{type:'schedule',heading:'Source history',columns:['Date','A','B','C','D'],rows:[['1','2','3','4','5']]},{type:'schedule',heading:'Source timeline',columns:['Date','Detail'],rows:[['1','Example']]}]}),Archived:false}];
win.localStorage.setItem('lexiTravelApiKey','fixture');
win.fetch=async(input,init={})=>{const url=new URL(String(input));if(url.origin==='https://fixture.test')return new win.Response(fs.readFileSync(htmlRoot+'index.html','utf8'));
 const p=(init.method||'GET')==='POST'?new URLSearchParams(String(init.body)):url.searchParams;const a=(p.get('action')||'data').toLowerCase();calls.push({action:a,month:p.get('month'),includeNotes:p.get('includeNotes')});let data={ok:true};
 if(a==='data')data={ok:true,events:structuredClone(events),locations:[],countries:[{Country:'Example',Code:'EX','Calendar Year Limit':160,Enabled:true}],dayOverrides:[],notes:p.get('includeNotes')==='0'?[]:structuredClone(notes)};
 else if(a.endsWith('capabilities'))data={ok:true,eventWrite:true,planWrite:true,noteWrite:true,noteOrder:true};
 else if(a==='planlist')data={ok:true,items:plan.filter(x=>x.Month===p.get('month'))};
 else if(a==='shoppinglist')data={ok:true,items:[{product:'Item',store:'Store',bought:false}]};
 else if(a==='visitlist')data={ok:true,items:[{place:'Place',area:'Area',visited:false}]};
 else if(a==='eventupsert'){events=events.filter(x=>x.ID!==p.get('id'));events.push({ID:p.get('id'),Date:p.get('date'),Title:p.get('title'),Time:p.get('time'),Category:p.get('category')});}
 else if(a==='eventdelete')events=events.filter(x=>x.ID!==p.get('id'));
 else if(a==='planupsert'){plan=plan.filter(x=>x.ID!==p.get('id'));plan.push({ID:p.get('id'),Month:p.get('month'),Text:p.get('text'),'Due Date':p.get('dueDate')});}
 else if(a==='plandelete')plan=plan.filter(x=>x.ID!==p.get('id'));
 else if(a==='noteupsert'){notes=notes.filter(x=>x.ID!==p.get('id'));notes.push({ID:p.get('id'),Title:p.get('title'),Body:p.get('body'),Pinned:p.get('pinned')==='true',Archived:false});}
 else if(a==='notepin'){notes=notes.map(x=>x.ID===p.get('id')?{...x,Pinned:p.get('pinned')==='true'}:x);}
 else if(a==='notedelete'){notes=notes.map(x=>x.ID===p.get('id')?{...x,Archived:true}:x);}
 return new win.Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
let html=fs.readFileSync(htmlRoot+'index.html','utf8');const scripts=[...html.matchAll(/<script src="([^"?]+)[^"]*"><\/script>/g)].map(m=>m[1]);win.document.write(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,''));
try{win.eval(scripts.map(file=>fs.readFileSync(root+file,'utf8')).join('\n;\n')+'\n;window.fixtureData=()=>appData;');}catch(e){errors.push(e.stack)}
win.document.dispatchEvent(new win.Event('DOMContentLoaded'));win.dispatchEvent(new win.Event('pageshow'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));const click=s=>{const e=win.document.querySelector(s);assert(e,s);if(e.matches('.tab')){win.document.elementFromPoint=()=>e;e.dispatchEvent(new win.PointerEvent('pointerdown',{bubbles:true,isPrimary:true,pointerId:1,clientX:1,clientY:1}));e.dispatchEvent(new win.PointerEvent('pointerup',{bubbles:true,isPrimary:true,pointerId:1,clientX:1,clientY:1}));}e.click()};
await wait(600);assert.equal(errors.length,0,errors.join('\n'));assert.equal(win.document.querySelectorAll('.day-cell').length>=28,true);
click('.tab[data-view="notesView"]');await wait(200);assert(win.document.querySelector('#notesList').textContent.includes('Derived reference'));click('.note-list-item[data-note-id="fixture-projection"]');await wait(100);assert.equal(win.document.querySelector('#noteEditBtn').hidden,true);assert.equal(win.document.querySelector('#noteDeleteBtn').hidden,true);assert.equal(win.document.querySelectorAll('#noteBody table').length,2);assert.equal(win.document.querySelector('#noteBody table tr').children.length,5);
click('.note-list-item[data-note-id="fixture-note"]');await wait(40);assert.equal(win.document.querySelector('.lexi-note-heading')?.textContent,'Fixture heading');assert.equal(win.document.querySelectorAll('.lexi-note-marker').length,1);
const task=win.document.querySelector('.lexi-check-input');assert(task);task.click();await wait(1800);
assert(notes.find(n=>n.ID==='fixture-note').Body.includes('[x] Fixture task'));
click('.note-list-item[data-note-id="fixture-projection"]');await wait(100);click('.note-list-item[data-note-id="fixture-note"]');await wait(100);
assert.equal(win.document.querySelector('.lexi-check-input').checked,true);
win.document.querySelector('.lexi-check-input').click();await wait(1800);assert(notes.find(n=>n.ID==='fixture-note').Body.includes('[ ] Fixture task'));
click('#noteEditBtn');await wait(40);const editor=win.document.querySelector('.lexi-plain-editor');assert(editor);editor.value='Updated fixture body';click('#noteSaveBtn');await wait(100);assert.equal(notes.find(n=>n.ID==='fixture-note').Body,'Updated fixture body');
click('.tab[data-view="calendarView"]');await wait(100);click('#nextMonthBtn');await wait(150);assert(calls.some(c=>c.action==='planlist'&&c.month===nm));assert(win.document.querySelector('.day-cell[aria-label="'+nm+'-10"]').textContent.includes('Next month task'));
click('.tab[data-view="shoppingView"]');await wait(100);assert(win.document.querySelector('#shoppingListBody').textContent.includes('Item'));click('.tab[data-view="visitView"]');await wait(100);assert(win.document.querySelector('#visitListBody').textContent.includes('Place'));
if (win.lexiRefreshCompactSelect && htmlRoot === root) {
 const visitButton=win.document.querySelector('#visitListBody .lexi-select-button');assert(visitButton);visitButton.click();
 [...win.document.querySelectorAll('.lexi-select-option')].find(e=>e.textContent==='Tomorrow').click();
 assert.equal(win.document.querySelector('#visitListBody select').value,'tomorrow');assert.equal(win.document.querySelector('#visitListBody input[type="checkbox"]').checked,false);
 assert(win.document.querySelector('#visitListBody .shopping-item').classList.contains('visit-planned-tomorrow'));
 click('.tab[data-view="calendarView"]');click('.day-cell[aria-label="'+nm+'-10"]');await wait(50);click('#calendarAddEventBtn');await wait(100);
 const form=win.document.querySelector('.calendar-event-editor');assert(form);const category=form.querySelector('.lexi-select-button');assert(category);category.click();
 [...win.document.querySelectorAll('.lexi-select-option')].find(e=>e.textContent==='Event').click();assert.equal(new win.FormData(form).get('category'),'Event');
 form.querySelector('[name="title"]').value='Dropdown save fixture';form.dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await wait(100);
 assert(events.some(e=>e.Title==='Dropdown save fixture'&&e.Category==='Event'));assert(calls.some(c=>c.action==='eventupsert'));
}
click('.tab[data-view="countryView"]');await wait(100);assert(win.document.querySelector('#countryList').textContent.includes('Example'));assert.equal(errors.length,0,errors.join('\n'));
console.log(JSON.stringify({fullDomSmoke:'passed',tabs:5,projectionTables:2,calendarMonthFetch:'passed',scriptCount:scripts.length,errors,calls:calls.length}));await win.happyDOM.close();
