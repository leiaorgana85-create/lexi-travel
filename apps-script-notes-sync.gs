const LEXI_TRAVEL_WRITE_SPREADSHEET_ID = '1sFNdzuriv-fVnYOovSTsybdHaxNUvnBa5_7DclvnEuw';
const LEXI_TRAVEL_NOTES_SHEET = 'NOTES';

function doPost(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').trim();
    const auth = lexiNotesAuthorize_(e);
    if (!auth.ok) return lexiNotesJson_(auth);

    if (action === 'noteCapabilities') {
      return lexiNotesJson_({ ok: true, noteWrite: true, version: 1 });
    }

    if (action === 'noteUpsert') {
      return lexiNotesJson_(lexiNotesUpsert_(e.parameter || {}));
    }

    if (action === 'notePin') {
      return lexiNotesJson_(lexiNotesPin_(e.parameter || {}));
    }

    if (action === 'noteDelete') {
      return lexiNotesJson_(lexiNotesDelete_(e.parameter || {}));
    }

    return lexiNotesJson_({ ok: false, error: 'Unknown write action' });
  } catch (error) {
    return lexiNotesJson_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function lexiNotesAuthorize_(e) {
  try {
    if (typeof doGet !== 'function') {
      return { ok: false, error: 'Existing doGet handler not found' };
    }

    const key = String((e && e.parameter && e.parameter.key) || '');
    const output = doGet({ parameter: { key: key, action: 'ping' } });
    const text = output && typeof output.getContent === 'function' ? output.getContent() : '';
    const parsed = JSON.parse(text || '{}');

    return parsed && parsed.ok
      ? { ok: true }
      : { ok: false, error: (parsed && parsed.error) || 'Unauthorized' };
  } catch (error) {
    return { ok: false, error: 'Authorization failed' };
  }
}

function lexiNotesSheet_() {
  const spreadsheet = SpreadsheetApp.openById(LEXI_TRAVEL_WRITE_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(LEXI_TRAVEL_NOTES_SHEET);
  if (!sheet) throw new Error('NOTES sheet not found');
  return sheet;
}

function lexiNotesFindRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i += 1) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return 0;
}

function lexiNotesBool_(value) {
  return value === true || String(value || '').toLowerCase() === 'true';
}

function lexiNotesUpsert_(p) {
  const id = String(p.id || '').trim();
  const title = String(p.title || '').trim() || 'Untitled Note';
  const body = String(p.body || '');
  const pinned = lexiNotesBool_(p.pinned);

  if (!id) return { ok: false, error: 'Missing note ID' };

  const sheet = lexiNotesSheet_();
  const row = lexiNotesFindRow_(sheet, id);
  const now = new Date();

  if (row) {
    const values = sheet.getRange(row, 1, 1, 8).getValues()[0];
    values[0] = id;
    values[1] = title;
    values[3] = body;
    values[4] = pinned;
    values[6] = now;
    values[7] = false;
    sheet.getRange(row, 1, 1, 8).setValues([values]);
  } else {
    sheet.appendRow([
      id,
      title,
      '',
      body,
      pinned,
      9999,
      now,
      false
    ]);
  }

  SpreadsheetApp.flush();
  return { ok: true, id: id, updatedAt: now.toISOString() };
}

function lexiNotesPin_(p) {
  const id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing note ID' };

  const sheet = lexiNotesSheet_();
  const row = lexiNotesFindRow_(sheet, id);
  if (!row) return { ok: false, error: 'Note not found' };

  const values = sheet.getRange(row, 1, 1, 8).getValues()[0];
  values[4] = lexiNotesBool_(p.pinned);
  values[6] = new Date();
  sheet.getRange(row, 1, 1, 8).setValues([values]);
  SpreadsheetApp.flush();

  return { ok: true, id: id, pinned: values[4] };
}

function lexiNotesDelete_(p) {
  const id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing note ID' };

  const sheet = lexiNotesSheet_();
  const row = lexiNotesFindRow_(sheet, id);
  if (!row) return { ok: true, id: id, alreadyMissing: true };

  const values = sheet.getRange(row, 1, 1, 8).getValues()[0];
  values[6] = new Date();
  values[7] = true;
  sheet.getRange(row, 1, 1, 8).setValues([values]);
  SpreadsheetApp.flush();

  return { ok: true, id: id, archived: true };
}

function lexiNotesJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
