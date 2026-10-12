// LEXI Travel consolidated write router.
// Use this as the complete NotesSync.gs file in the bound Apps Script project.
// It expects CalendarSync.gs (event helpers) and PlanSync.gs (plan helpers)
// to exist in the same Apps Script project.

function doPost(e) {
  try {
    const savedKey = PropertiesService
      .getScriptProperties()
      .getProperty('LEXI_API_KEY');

    const suppliedKey = String((e && e.parameter && e.parameter.key) || '');

    if (!savedKey || suppliedKey !== savedKey) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const action = String((e && e.parameter && e.parameter.action) || '')
      .trim()
      .toLowerCase();

    if (action === 'notecapabilities') {
      return json_({ ok: true, noteWrite: true, version: 1 });
    }

    if (action === 'noteupsert') {
      return json_(noteUpsert_(e.parameter || {}));
    }

    if (action === 'notepin') {
      return json_(notePin_(e.parameter || {}));
    }

    if (action === 'notedelete') {
      return json_(noteDelete_(e.parameter || {}));
    }

    if (action === 'eventcapabilities') {
      return json_({ ok: true, eventWrite: true, version: 1 });
    }

    if (action === 'eventupsert') {
      return json_(eventUpsert_(e.parameter || {}));
    }

    if (action === 'eventdelete') {
      return json_(eventDelete_(e.parameter || {}));
    }

    if (action === 'plancapabilities') {
      return json_({ ok: true, planWrite: true, version: 1 });
    }

    if (action === 'planlist') {
      return json_(planList_(e.parameter || {}));
    }

    if (action === 'planupsert') {
      return json_(planUpsert_(e.parameter || {}));
    }

    if (action === 'plandelete') {
      return json_(planDelete_(e.parameter || {}));
    }

    return json_({ ok: false, error: 'Unknown write action' });
  } catch (error) {
    return json_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function notesSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('NOTES');

  if (!sheet) {
    throw new Error('Missing sheet: NOTES');
  }

  return sheet;
}

function noteFindRow_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues();

  for (let i = 0; i < ids.length; i += 1) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }

  return 0;
}

function noteBool_(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function noteUpsert_(p) {
  const id = String(p.id || '').trim();
  const title = String(p.title || '').trim() || 'Untitled Note';
  const body = String(p.body || '');
  const pinned = noteBool_(p.pinned);

  if (!id) return { ok: false, error: 'Missing note ID' };

  const sheet = notesSheet_();
  const row = noteFindRow_(sheet, id);
  const now = new Date();

  if (row) {
    const values = sheet.getRange(row, 1, 1, 8).getValues()[0];
    values[0] = id;
    values[1] = title;
    values[3] = body;
    values[4] = pinned;
    if (!values[5]) values[5] = 9999;
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

function notePin_(p) {
  const id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing note ID' };

  const sheet = notesSheet_();
  const row = noteFindRow_(sheet, id);
  if (!row) return { ok: false, error: 'Note not found' };

  const values = sheet.getRange(row, 1, 1, 8).getValues()[0];
  values[4] = noteBool_(p.pinned);
  values[6] = new Date();
  sheet.getRange(row, 1, 1, 8).setValues([values]);
  SpreadsheetApp.flush();

  return { ok: true, id: id, pinned: values[4] };
}

function noteDelete_(p) {
  const id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing note ID' };

  const sheet = notesSheet_();
  const row = noteFindRow_(sheet, id);

  if (!row) {
    return { ok: true, id: id, alreadyMissing: true };
  }

  const values = sheet.getRange(row, 1, 1, 8).getValues()[0];
  values[6] = new Date();
  values[7] = true;
  sheet.getRange(row, 1, 1, 8).setValues([values]);
  SpreadsheetApp.flush();

  return { ok: true, id: id, archived: true };
}

function handleNotesOnEdit_(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'NOTES') return;

  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getRow() + e.range.getNumRows() - 1;

  for (let row = firstRow; row <= lastRow; row += 1) {
    const values = sheet.getRange(row, 2, 1, 7).getDisplayValues()[0];
    const hasContent = values.some(value => String(value || '').trim() !== '');
    if (!hasContent) continue;

    const idCell = sheet.getRange(row, 1);
    if (!String(idCell.getValue() || '').trim()) {
      idCell.setValue('sheet-note-' + Utilities.getUuid());
    }

    const sortCell = sheet.getRange(row, 6);
    if (!String(sortCell.getValue() || '').trim()) {
      sortCell.setValue(9999);
    }

    sheet.getRange(row, 7).setValue(new Date());

    const archivedCell = sheet.getRange(row, 8);
    if (String(archivedCell.getValue() || '').trim() === '') {
      archivedCell.setValue(false);
    }
  }
}

function onEdit(e) {
  if (!e || !e.range) return;

  const sheetName = e.range.getSheet().getName();

  if (sheetName === 'EVENTS') {
    eventSheetOnEdit_(e);
    return;
  }

  if (sheetName === 'PLAN_ITEMS') {
    planSheetOnEdit_(e);
    return;
  }

  if (sheetName === 'NOTES') {
    handleNotesOnEdit_(e);
  }
}
