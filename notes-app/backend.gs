// Lexi Notes backend. Bind this script to the "LEXI Notes Data" spreadsheet.
// Script Properties required:
//   LEXI_NOTES_API_KEY   = private API key
//   LEXI_NOTES_PIN_HASH  = created by the app when the owner first sets a PIN

const LEXI_NOTES_SHEET = 'NOTES';
const LEXI_NOTES_HEADERS = ['ID','Created At','Updated At','Title','Body','Pinned','Locked','Archived','Sort Order'];

function doGet(e) {
  try {
    requireApiKey_(e && e.parameter ? e.parameter.key : '');
    const p = e.parameter || {};
    const action = String(p.action || 'list').toLowerCase();
    if (action === 'ping') return json_({ok:true, app:'Lexi Notes', pinConfigured:pinConfigured_()});
    if (action === 'list') return json_({ok:true, notes:listNotes_(), pinConfigured:pinConfigured_()});
    if (action === 'get') return json_(getNote_(p.id, p.pin));
    if (action === 'search') return json_({ok:true, notes:searchNotes_(p.q, p.pin), pinConfigured:pinConfigured_()});
    return json_({ok:false,error:'Unknown action'});
  } catch (error) {
    return json_({ok:false,error:error && error.message ? error.message : String(error)});
  }
}

function doPost(e) {
  try {
    requireApiKey_(e && e.parameter ? e.parameter.key : '');
    const p = e.parameter || {};
    const action = String(p.action || '').toLowerCase();
    if (action === 'setpin') return json_(setPin_(p.pin, p.currentPin));
    if (action === 'upsert') return json_(upsertNote_(p));
    if (action === 'pin') return json_(setPinned_(p));
    if (action === 'lock') return json_(setLocked_(p));
    if (action === 'delete') return json_(deleteNote_(p));
    return json_({ok:false,error:'Unknown action'});
  } catch (error) {
    return json_({ok:false,error:error && error.message ? error.message : String(error)});
  }
}

function notesSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LEXI_NOTES_SHEET);
  if (!sheet) throw new Error('Missing NOTES sheet');
  const headers = sheet.getRange(1,1,1,LEXI_NOTES_HEADERS.length).getDisplayValues()[0];
  if (headers.join('|') !== LEXI_NOTES_HEADERS.join('|')) throw new Error('NOTES schema does not match Lexi Notes backend');
  return sheet;
}

function requireApiKey_(key) {
  const saved = PropertiesService.getScriptProperties().getProperty('LEXI_NOTES_API_KEY');
  if (!saved || String(key || '') !== saved) throw new Error('Unauthorized');
}

function bool_(value) { return value === true || String(value || '').trim().toLowerCase() === 'true'; }
function hash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b < 0 ? b + 256 : b).toString(16))).slice(-2)).join('');
}
function pinConfigured_() { return Boolean(PropertiesService.getScriptProperties().getProperty('LEXI_NOTES_PIN_HASH')); }
function validPin_(pin) {
  const saved = PropertiesService.getScriptProperties().getProperty('LEXI_NOTES_PIN_HASH');
  return Boolean(saved && pin && hash_(pin) === saved);
}
function requirePin_(pin) { if (!validPin_(pin)) throw new Error('Invalid PIN'); }

function rowObject_(row) {
  const o = {}; LEXI_NOTES_HEADERS.forEach((h,i)=>o[h]=row[i]); return o;
}
function displayObject_(row) {
  const o = rowObject_(row);
  const locked = bool_(o.Locked);
  return {
    ID:String(o.ID||''),
    'Created At':o['Created At']||'',
    'Updated At':o['Updated At']||'',
    Title:String(o.Title||'Untitled Note'),
    Body:locked ? '' : String(o.Body||''),
    Pinned:bool_(o.Pinned),
    Locked:locked,
    Archived:bool_(o.Archived),
    'Sort Order':o['Sort Order']||''
  };
}
function allRows_() {
  const s=notesSheet_(), last=s.getLastRow();
  if(last<2) return [];
  return s.getRange(2,1,last-1,LEXI_NOTES_HEADERS.length).getValues();
}
function findRow_(id) {
  const s=notesSheet_(), last=s.getLastRow(); if(last<2) return 0;
  const ids=s.getRange(2,1,last-1,1).getDisplayValues();
  for(let i=0;i<ids.length;i++) if(String(ids[i][0])===String(id)) return i+2;
  return 0;
}

function listNotes_() {
  return allRows_().map(displayObject_).filter(n=>n.ID&&!n.Archived).sort((a,b)=>Number(b.Pinned)-Number(a.Pinned)||Number(a['Sort Order']||9999)-Number(b['Sort Order']||9999)||String(b['Updated At']).localeCompare(String(a['Updated At'])));
}
function getNote_(id,pin) {
  const row=findRow_(id); if(!row) return {ok:false,error:'Note not found'};
  const raw=notesSheet_().getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0];
  const note=displayObject_(raw); if(note.Archived) return {ok:false,error:'Note not found'};
  if(note.Locked) { requirePin_(pin); note.Body=String(raw[4]||''); }
  return {ok:true,note:note};
}
function searchNotes_(q,pin) {
  const needle=String(q||'').trim().toLowerCase(); if(!needle) return listNotes_();
  const allowLocked=validPin_(pin);
  return allRows_().map(raw=>({raw,note:displayObject_(raw)})).filter(({raw,note})=>{
    if(!note.ID||note.Archived) return false;
    const body=(!note.Locked||allowLocked)?String(raw[4]||''):'';
    return `${note.Title}\n${body}`.toLowerCase().includes(needle);
  }).map(({raw,note})=>{ if(note.Locked&&allowLocked) note.Body=String(raw[4]||''); return note; });
}
function setPin_(pin,currentPin) {
  const value=String(pin||''); if(value.length<4) return {ok:false,error:'PIN must be at least 4 characters'};
  if(pinConfigured_()) requirePin_(currentPin);
  PropertiesService.getScriptProperties().setProperty('LEXI_NOTES_PIN_HASH',hash_(value));
  return {ok:true,pinConfigured:true};
}
function upsertNote_(p) {
  const id=String(p.id||'').trim(); if(!id) return {ok:false,error:'Missing note ID'};
  const s=notesSheet_(), row=findRow_(id), now=new Date();
  const existing=row?s.getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0]:null;
  if(existing&&bool_(existing[6])) requirePin_(p.pin);
  const locked=Object.prototype.hasOwnProperty.call(p,'locked')?bool_(p.locked):(existing?bool_(existing[6]):false);
  if(locked&&!validPin_(p.pin)) throw new Error('PIN required for locked note');
  const values=existing||[id,now,now,'','',false,false,false,9999];
  values[0]=id; if(!values[1]) values[1]=now; values[2]=now;
  values[3]=String(p.title||'').trim()||'Untitled Note';
  values[4]=String(p.body||'');
  values[5]=bool_(p.pinned); values[6]=locked; values[7]=false; if(!values[8]) values[8]=9999;
  if(row) s.getRange(row,1,1,values.length).setValues([values]); else s.appendRow(values);
  SpreadsheetApp.flush(); return {ok:true,id:id,updatedAt:now.toISOString(),locked:locked};
}
function setPinned_(p) {
  const row=findRow_(p.id); if(!row) return {ok:false,error:'Note not found'};
  const s=notesSheet_(), values=s.getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0];
  values[5]=bool_(p.pinned); values[2]=new Date(); s.getRange(row,1,1,values.length).setValues([values]); SpreadsheetApp.flush();
  return {ok:true,id:String(p.id),pinned:values[5]};
}
function setLocked_(p) {
  if(!pinConfigured_()) return {ok:false,error:'PIN not configured'};
  requirePin_(p.pin);
  const row=findRow_(p.id); if(!row) return {ok:false,error:'Note not found'};
  const s=notesSheet_(), values=s.getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0];
  values[6]=bool_(p.locked); values[2]=new Date(); s.getRange(row,1,1,values.length).setValues([values]); SpreadsheetApp.flush();
  return {ok:true,id:String(p.id),locked:values[6]};
}
function deleteNote_(p) {
  const row=findRow_(p.id); if(!row) return {ok:true,id:String(p.id),alreadyMissing:true};
  const s=notesSheet_(), values=s.getRange(row,1,1,LEXI_NOTES_HEADERS.length).getValues()[0];
  if(bool_(values[6])) requirePin_(p.pin);
  values[7]=true; values[2]=new Date(); s.getRange(row,1,1,values.length).setValues([values]); SpreadsheetApp.flush();
  return {ok:true,id:String(p.id),archived:true};
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
