(() => {
  'use strict';
  // Filled after the bound Lexi Notes Apps Script is deployed.
  const API_URL = 'LEXI_NOTES_API_URL';
  const KEY_STORAGE = 'lexiNotesApiKey';
  const CACHE_STORAGE = 'lexiNotesIndexCacheV1';
  const PIN_SESSION = 'lexiNotesPinSessionV1';

  const $ = id => document.getElementById(id);
  const topbar=$('topbar'), connectView=$('connectView'), listView=$('listView'), noteView=$('noteView');
  const searchInput=$('searchInput'), clearSearchBtn=$('clearSearchBtn'), notesList=$('notesList'), emptyState=$('emptyState'), syncStatus=$('syncStatus');
  const apiKeyInput=$('apiKeyInput'), connectBtn=$('connectBtn'), connectError=$('connectError'), refreshBtn=$('refreshBtn'), newNoteBtn=$('newNoteBtn');
  const backBtn=$('backBtn'), pinBtn=$('pinBtn'), lockBtn=$('lockBtn'), emailBtn=$('emailBtn'), shareBtn=$('shareBtn'), editBtn=$('editBtn'), deleteBtn=$('deleteBtn');
  const lockedGate=$('lockedGate'), unlockBtn=$('unlockBtn'), noteContent=$('noteContent'), readMode=$('readMode'), readTitle=$('readTitle'), readBody=$('readBody');
  const editMode=$('editMode'), titleInput=$('titleInput'), bodyInput=$('bodyInput'), formatBar=$('formatBar'), saveStatus=$('saveStatus'), doneBtn=$('doneBtn');
  const pinDialog=$('pinDialog'), pinForm=$('pinForm'), pinDialogTitle=$('pinDialogTitle'), pinDialogText=$('pinDialogText'), pinInput=$('pinInput'), pinConfirmInput=$('pinConfirmInput'), pinError=$('pinError'), pinCancelBtn=$('pinCancelBtn'), pinSubmitBtn=$('pinSubmitBtn');

  let notes=[], activeId='', activeNote=null, pinConfigured=false, saveTimer=0, pinResolver=null, pinMode='unlock';
  const isTrue=v=>v===true||String(v||'').toLowerCase()==='true';
  const noteId=()=>`note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const sessionPin=()=>sessionStorage.getItem(PIN_SESSION)||'';

  function apiReady(){return /^https:\/\/script\.google\.com\/macros\/s\//.test(API_URL);}
  function readCache(){try{return JSON.parse(localStorage.getItem(CACHE_STORAGE)||'null')}catch(_){return null}}
  function saveCache(){const safe=notes.map(n=>({...n,Body:isTrue(n.Locked)?'':String(n.Body||'')}));localStorage.setItem(CACHE_STORAGE,JSON.stringify({savedAt:Date.now(),notes:safe,pinConfigured}))}
  function formatDate(v){const t=Date.parse(v||'');if(!Number.isFinite(t))return'';return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:new Date(t).getFullYear()===new Date().getFullYear()?undefined:'numeric'}).format(new Date(t))}
  function current(){return notes.find(n=>String(n.ID)===String(activeId))||activeNote}

  async function requestGet(action,params={}){
    if(!apiReady()) throw new Error('Backend not deployed yet');
    const key=localStorage.getItem(KEY_STORAGE); if(!key) throw new Error('Not connected');
    const url=new URL(API_URL); url.searchParams.set('key',key); url.searchParams.set('action',action); url.searchParams.set('_',String(Date.now()));
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v))});
    const r=await fetch(url,{cache:'no-store',redirect:'follow'}); if(!r.ok) throw new Error(`HTTP ${r.status}`); const d=await r.json(); if(!d.ok) throw new Error(d.error||'Request failed'); return d;
  }
  async function requestPost(action,params={}){
    if(!apiReady()) throw new Error('Backend not deployed yet');
    const key=localStorage.getItem(KEY_STORAGE); if(!key) throw new Error('Not connected');
    const body=new URLSearchParams({key,action});Object.entries(params).forEach(([k,v])=>body.set(k,v==null?'':String(v)));
    const r=await fetch(API_URL,{method:'POST',body,cache:'no-store',redirect:'follow'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json();if(!d.ok)throw new Error(d.error||'Request failed');return d;
  }

  function showConnect(message=''){connectView.hidden=false;listView.hidden=true;noteView.hidden=true;newNoteBtn.hidden=true;connectError.textContent=message}
  function showList(){connectView.hidden=true;noteView.hidden=true;listView.hidden=false;topbar.hidden=false;newNoteBtn.hidden=false;activeId='';activeNote=null;renderList()}
  function previewFor(note){if(isTrue(note.Locked)&&!note.Body)return'Locked note';return String(note.Body||'').replace(/\s+/g,' ').trim()||'Empty note'}
  function renderList(){
    const q=searchInput.value.trim().toLowerCase();clearSearchBtn.hidden=!q;
    const data=notes.filter(n=>!isTrue(n.Archived)).filter(n=>!q||`${n.Title||''}\n${n.Category||''}\n${n.Body||''}`.toLowerCase().includes(q)).sort((a,b)=>Number(isTrue(b.Pinned))-Number(isTrue(a.Pinned))||Date.parse(b['Updated At']||0)-Date.parse(a['Updated At']||0));
    notesList.replaceChildren();emptyState.hidden=data.length>0;emptyState.textContent=q?'No notes match your search.':'No notes yet.';
    data.forEach(note=>{const card=document.createElement('button');card.type='button';card.className='note-card';const top=document.createElement('div');top.className='note-card-top';const main=document.createElement('div');main.className='note-main';const title=document.createElement('div');title.className='note-title';title.textContent=note.Title||'Untitled Note';const preview=document.createElement('div');preview.className='note-preview';preview.textContent=previewFor(note);const meta=document.createElement('div');meta.className='note-meta';meta.textContent=`${isTrue(note.Locked)?'🔒 ':''}${[note.Category,formatDate(note['Updated At'])].filter(Boolean).join(' · ')}`;main.append(title,preview,meta);const pin=document.createElement('button');pin.type='button';pin.className='pin-card-btn'+(isTrue(note.Pinned)?' pinned':'');pin.textContent=isTrue(note.Pinned)?'★':'☆';pin.addEventListener('click',e=>{e.stopPropagation();togglePin(note)});top.append(main,pin);card.append(top);card.addEventListener('click',()=>openNote(note.ID));notesList.append(card)})
  }

  function linkify(target,text){const re=/(?:https?:\/\/|www\.)[^\s<]+/gi;let last=0,m;while((m=re.exec(text))){let shown=m[0],url=shown.startsWith('www.')?`https://${shown}`:shown,trailing='';while(/[),.;!?]$/.test(shown)){trailing=shown.slice(-1)+trailing;shown=shown.slice(0,-1);url=url.slice(0,-1)}if(m.index>last)target.append(document.createTextNode(text.slice(last,m.index)));const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=shown;target.append(a);if(trailing)target.append(document.createTextNode(trailing));last=m.index+m[0].length}if(last<text.length)target.append(document.createTextNode(text.slice(last)))}
  function renderBody(text){readBody.replaceChildren();String(text||'').split('\n').forEach(line=>{const row=document.createElement('div');row.className='read-line';const c=line.match(/^(\s*)\[( |x|X)\]\s*(.*)$/),b=line.match(/^(\s*)[•*-]\s+(.*)$/),n=line.match(/^(\s*)(\d+)\.\s+(.*)$/);if(c){row.classList.add('check');const mark=document.createElement('span');mark.className='marker';mark.textContent=String(c[2]).toLowerCase()==='x'?'☑':'☐';const t=document.createElement('span');linkify(t,c[3]||'');row.append(mark,t)}else if(b){const mark=document.createElement('span');mark.className='marker';mark.textContent='•';const t=document.createElement('span');linkify(t,b[2]||'');row.append(mark,t)}else if(n){const mark=document.createElement('span');mark.className='marker';mark.textContent=`${n[2]}.`;const t=document.createElement('span');linkify(t,n[3]||'');row.append(mark,t)}else if(line==='---'){row.append(document.createElement('hr'))}else linkify(row,line||' ');readBody.append(row)})}
  function paintNote(note){activeNote=note;readTitle.textContent=note.Title||'Untitled Note';renderBody(note.Body||'');pinBtn.textContent=isTrue(note.Pinned)?'★':'☆';lockBtn.textContent=isTrue(note.Locked)?'🔒':'🔓';lockedGate.hidden=true;noteContent.hidden=false;readMode.hidden=false;editMode.hidden=true;editBtn.hidden=false}

  async function openNote(id){activeId=id;const indexNote=notes.find(n=>String(n.ID)===String(id));if(!indexNote)return;topbar.hidden=true;listView.hidden=true;connectView.hidden=true;noteView.hidden=false;newNoteBtn.hidden=true;if(isTrue(indexNote.Locked)&&!indexNote.Body){noteContent.hidden=true;lockedGate.hidden=false;activeNote=indexNote;return}paintNote(indexNote)}
  async function unlockActive(){const pin=sessionPin()||await askPin('unlock');if(!pin)return;try{const d=await requestGet('get',{id:activeId,pin});sessionStorage.setItem(PIN_SESSION,pin);const i=notes.findIndex(n=>String(n.ID)===String(activeId));if(i>=0)notes[i]={...notes[i],...d.note};paintNote(d.note);syncStatus.textContent='Unlocked for this session'}catch(e){sessionStorage.removeItem(PIN_SESSION);syncStatus.textContent=e.message}}

  function enterEdit(){const n=current();if(!n)return;readMode.hidden=true;editMode.hidden=false;editBtn.hidden=true;titleInput.value=n.Title||'';bodyInput.value=n.Body||'';saveStatus.textContent='';setTimeout(()=>titleInput.focus(),20)}
  function leaveEdit(){clearTimeout(saveTimer);saveCurrent().then(()=>{readMode.hidden=false;editMode.hidden=true;editBtn.hidden=false;const n=current();if(n){readTitle.textContent=n.Title;renderBody(n.Body)}})}
  function scheduleSave(){clearTimeout(saveTimer);saveStatus.textContent='Saving…';saveTimer=setTimeout(saveCurrent,700)}
  async function saveCurrent(){const n=current();if(!n||editMode.hidden)return;const title=titleInput.value.trim()||'Untitled Note',body=bodyInput.value.replace(/\r/g,'');const pin=isTrue(n.Locked)?sessionPin():'';try{const d=await requestPost('upsert',{id:n.ID,title,category:n.Category||'',body,pinned:isTrue(n.Pinned),locked:isTrue(n.Locked),pin});n.Title=title;n.Body=body;n['Updated At']=d.updatedAt||new Date().toISOString();const i=notes.findIndex(x=>String(x.ID)===String(n.ID));if(i>=0)notes[i]={...notes[i],...n};saveCache();saveStatus.textContent='Saved';return true}catch(e){saveStatus.textContent=e.message;return false}}

  async function createNote(){const id=noteId(),now=new Date().toISOString(),n={ID:id,'Created At':now,'Updated At':now,Title:'Untitled Note',Category:'',Body:'',Pinned:false,Locked:false,Archived:false,'Sort Order':9999};notes.unshift(n);activeId=id;topbar.hidden=true;listView.hidden=true;noteView.hidden=false;newNoteBtn.hidden=true;paintNote(n);enterEdit();titleInput.select();scheduleSave()}
  async function togglePin(note=current()){if(!note)return;const next=!isTrue(note.Pinned);note.Pinned=next;pinBtn.textContent=next?'★':'☆';renderList();try{await requestPost('pin',{id:note.ID,pinned:next});saveCache()}catch(e){note.Pinned=!next;syncStatus.textContent=e.message;renderList()}}
  async function toggleLock(){const n=current();if(!n)return;if(!editMode.hidden){const saved=await saveCurrent();if(!saved)return}if(!pinConfigured){const pin=await askPin('setup');if(!pin)return;try{await requestPost('setpin',{pin});pinConfigured=true;sessionStorage.setItem(PIN_SESSION,pin)}catch(e){syncStatus.textContent=e.message;return}}let pin=sessionPin();if(!pin){pin=await askPin('unlock');if(!pin)return}const next=!isTrue(n.Locked);try{await requestPost('lock',{id:n.ID,locked:next,pin});n.Locked=next;lockBtn.textContent=next?'🔒':'🔓';if(next){sessionStorage.setItem(PIN_SESSION,pin)}saveCache();renderList()}catch(e){sessionStorage.removeItem(PIN_SESSION);syncStatus.textContent=e.message}}
  async function deleteCurrent(){const n=current();if(!n||!confirm(`Delete “${n.Title||'Untitled Note'}”?`))return;let pin='';if(isTrue(n.Locked)){pin=sessionPin()||await askPin('unlock');if(!pin)return}try{await requestPost('delete',{id:n.ID,pin});notes=notes.filter(x=>String(x.ID)!==String(n.ID));saveCache();showList()}catch(e){syncStatus.textContent=e.message}}
  function exportText(n){return `${n.Title||'Untitled Note'}\n\n${n.Body||''}`.trim()}
  function emailCurrent(){const n=current();if(n)location.href=`mailto:?subject=${encodeURIComponent(n.Title||'Lexi Note')}&body=${encodeURIComponent(exportText(n))}`}
  async function shareCurrent(){const n=current();if(!n)return;const p={title:n.Title||'Lexi Note',text:exportText(n)};if(navigator.share){try{await navigator.share(p);return}catch(e){if(e.name==='AbortError')return}}try{await navigator.clipboard.writeText(p.text);syncStatus.textContent='Copied note'}catch(_){emailCurrent()}}

  function stripPrefix(line){return line.replace(/^(\s*)(?:•\s+|[-*]\s+|\[(?: |x|X)\]\s+|\d+\.\s+)/,'$1')}
  function replaceLines(fn){const v=bodyInput.value,s=bodyInput.selectionStart,e=bodyInput.selectionEnd,ls=v.lastIndexOf('\n',Math.max(0,s-1))+1,nb=v.indexOf('\n',e),le=nb===-1?v.length:nb,r=v.slice(ls,le).split('\n').map(fn).join('\n');bodyInput.setRangeText(r,ls,le,'select');bodyInput.focus();scheduleSave()}
  function applyTool(t){if(t==='bullet')return replaceLines(l=>`• ${stripPrefix(l)}`);if(t==='number')return replaceLines((l,i)=>`${i+1}. ${stripPrefix(l)}`);if(t==='check')return replaceLines(l=>`[ ] ${stripPrefix(l)}`);if(t==='indent')return replaceLines(l=>`  ${l}`);if(t==='outdent')return replaceLines(l=>l.startsWith('  ')?l.slice(2):l.startsWith(' ')?l.slice(1):l);if(t==='date'){const d=new Date(),iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,s=bodyInput.selectionStart;bodyInput.setRangeText(`${s>0&&bodyInput.value[s-1]!=='\n'?'\n':''}${iso} — `,s,bodyInput.selectionEnd,'end');bodyInput.focus();scheduleSave();return}if(t==='undo'||t==='redo'){bodyInput.focus();try{document.execCommand(t)}catch(_){}scheduleSave()}}
  function listContinue(e){if(e.key!=='Enter'||e.shiftKey||e.metaKey||e.ctrlKey||e.altKey||bodyInput.selectionStart!==bodyInput.selectionEnd)return;const text=bodyInput.value,caret=bodyInput.selectionStart,ls=text.lastIndexOf('\n',Math.max(0,caret-1))+1,line=text.slice(ls,caret),m=line.match(/^(\s*)(•\s+|-\s+|\[(?: |x|X)\]\s+|(\d+)\.\s+)(.*)$/);if(!m)return;e.preventDefault();const ind=m[1]||'',p=m[2]||'',c=m[4]||'';if(!c.trim())bodyInput.setRangeText(ind,ls,caret,'end');else{let np=p;if(/^\[(?: |x|X)\]\s+/.test(p))np='[ ] ';if(m[3])np=`${Number(m[3])+1}. `;bodyInput.setRangeText(`\n${ind}${np}`,caret,caret,'end')}scheduleSave()}

  function askPin(mode){pinMode=mode;pinError.textContent='';pinInput.value='';pinConfirmInput.value='';pinConfirmInput.hidden=mode!=='setup';pinDialogTitle.textContent=mode==='setup'?'Set Lexi Notes PIN':'Unlock note';pinDialogText.textContent=mode==='setup'?'Choose a PIN for locked notes. It is not stored in the app.':'Enter your Lexi Notes PIN.';pinSubmitBtn.textContent=mode==='setup'?'Set PIN':'Unlock';pinDialog.showModal();setTimeout(()=>pinInput.focus(),20);return new Promise(resolve=>{pinResolver=resolve})}
  function finishPin(value){pinDialog.close();const r=pinResolver;pinResolver=null;if(r)r(value)}
  pinCancelBtn.addEventListener('click',()=>finishPin(''));
  pinForm.addEventListener('submit',e=>{e.preventDefault();const p=pinInput.value;if(pinMode==='setup'){if(p.length<4){pinError.textContent='Use at least 4 characters.';return}if(p!==pinConfirmInput.value){pinError.textContent='PINs do not match.';return}}if(!p){pinError.textContent='Enter your PIN.';return}finishPin(p)});

  async function load(show=true){const key=localStorage.getItem(KEY_STORAGE);if(!key){showConnect();return}if(show)syncStatus.textContent='Refreshing…';try{const d=await requestGet('list');notes=Array.isArray(d.notes)?d.notes:[];pinConfigured=Boolean(d.pinConfigured);saveCache();showList();syncStatus.textContent='Synced'}catch(e){if(e.message==='Unauthorized'){localStorage.removeItem(KEY_STORAGE);showConnect('The API key was not accepted.');return}const c=readCache();if(c?.notes){notes=c.notes;pinConfigured=Boolean(c.pinConfigured);showList();syncStatus.textContent=`Using saved index · ${e.message}`}else{showConnect(e.message)}}}
  let searchTimer=0;searchInput.addEventListener('input',()=>{clearSearchBtn.hidden=!searchInput.value;clearTimeout(searchTimer);const q=searchInput.value.trim();if(!q){load(false);return}searchTimer=setTimeout(async()=>{try{const d=await requestGet('search',{q,pin:sessionPin()});notes=Array.isArray(d.notes)?d.notes:[];renderList()}catch(e){syncStatus.textContent=e.message}},250)});
  clearSearchBtn.addEventListener('click',()=>{searchInput.value='';load(false);searchInput.focus()});refreshBtn.addEventListener('click',()=>load(true));newNoteBtn.addEventListener('click',createNote);backBtn.addEventListener('click',()=>{clearTimeout(saveTimer);if(!editMode.hidden)saveCurrent().finally(showList);else showList()});unlockBtn.addEventListener('click',unlockActive);editBtn.addEventListener('click',enterEdit);doneBtn.addEventListener('click',leaveEdit);pinBtn.addEventListener('click',()=>togglePin());lockBtn.addEventListener('click',toggleLock);emailBtn.addEventListener('click',emailCurrent);shareBtn.addEventListener('click',shareCurrent);deleteBtn.addEventListener('click',deleteCurrent);titleInput.addEventListener('input',scheduleSave);bodyInput.addEventListener('input',scheduleSave);bodyInput.addEventListener('keydown',listContinue);formatBar.addEventListener('pointerdown',e=>e.preventDefault());formatBar.addEventListener('click',e=>{const b=e.target.closest('button[data-tool]');if(b)applyTool(b.dataset.tool)});
  connectBtn.addEventListener('click',async()=>{const k=apiKeyInput.value.trim();if(!k)return;localStorage.setItem(KEY_STORAGE,k);connectError.textContent='';await load(true);if(!connectView.hidden)localStorage.removeItem(KEY_STORAGE)});

  const cached=readCache();if(cached?.notes){notes=cached.notes;pinConfigured=Boolean(cached.pinConfigured);renderList()}
  if(localStorage.getItem(KEY_STORAGE))load(false);else showConnect();
  if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
