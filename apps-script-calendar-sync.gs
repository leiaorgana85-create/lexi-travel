// LEXI Travel calendar write helpers.
// Paste this into a separate CalendarSync.gs file in the same Apps Script project.
// The project already has json_() and LEXI_API_KEY auth in NotesSync.gs.
//
// Add these three branches to the existing doPost(e), after `action` is calculated
// and before the final "Unknown write action" return:
//
//   if (action === 'eventcapabilities') {
//     return json_({ ok: true, eventWrite: true, version: 1 });
//   }
//
//   if (action === 'eventupsert') {
//     return json_(eventUpsert_(e.parameter || {}));
//   }
//
//   if (action === 'eventdelete') {
//     return json_(eventDelete_(e.parameter || {}));
//   }

function eventsSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('EVENTS');

  if (!sheet) {
    throw new Error('Missing sheet: EVENTS');
  }

  return sheet;
}

function sortEventsByDate_() {
  const sheet = eventsSheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 3 || lastColumn < 2) {
    return Math.max(0, lastRow - 1);
  }

  sheet
    .getRange(2, 1, lastRow - 1, lastColumn)
    .sort({ column: 2, ascending: true });

  return lastRow - 1;
}

// Public maintenance helper for a manual one-off sort if needed.
function sortEventsByDate() {
  return sortEventsByDate_();
}

function eventFindRow_(sheet, id) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const ids = sheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues();

  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      return i + 2;
    }
  }

  return 0;
}

function eventUpsert_(p) {
  const id = String(p.id || '').trim();
  const date = String(p.date || '').trim();
  const title = String(p.title || '').trim();
  const time = String(p.time || '').trim();
  const category = String(p.category || '').trim();
  const details = String(p.details || '');
  const link = String(p.link || '').trim();
  const status = String(p.status || '').trim();

  if (!id) {
    return { ok: false, error: 'Missing event ID' };
  }

  if (!date) {
    return { ok: false, error: 'Missing event date' };
  }

  if (!title) {
    return { ok: false, error: 'Missing event title' };
  }

  const sheet = eventsSheet_();
  const row = eventFindRow_(sheet, id);
  const values = [
    id,
    date,
    title,
    time,
    category,
    details,
    link,
    status
  ];

  if (row) {
    sheet.getRange(row, 1, 1, 8).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  SpreadsheetApp.flush();
  sortEventsByDate_();
  SpreadsheetApp.flush();

  return {
    ok: true,
    id: id
  };
}

function eventDelete_(p) {
  const id = String(p.id || '').trim();

  if (!id) {
    return { ok: false, error: 'Missing event ID' };
  }

  const sheet = eventsSheet_();
  const row = eventFindRow_(sheet, id);

  if (!row) {
    return {
      ok: true,
      id: id,
      alreadyMissing: true
    };
  }

  sheet.deleteRow(row);
  SpreadsheetApp.flush();
  sortEventsByDate_();
  SpreadsheetApp.flush();

  return {
    ok: true,
    id: id,
    deleted: true
  };
}

// Optional helper for events entered directly in the EVENTS sheet.
// Call eventSheetOnEdit_(e) at the TOP of your existing onEdit(e).
// It fills a stable ID when a user edits Date/Title/Time/etc. on a new event row.
function eventSheetOnEdit_(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'EVENTS') return;

  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getRow() + e.range.getNumRows() - 1;

  for (let row = firstRow; row <= lastRow; row++) {
    const idCell = sheet.getRange(row, 1);
    const existingId = String(idCell.getValue() || '').trim();
    if (existingId) continue;

    const values = sheet.getRange(row, 2, 1, 7).getDisplayValues()[0];
    const hasContent = values.some(value => String(value || '').trim() !== '');
    if (!hasContent) continue;

    idCell.setValue('sheet-event-' + Utilities.getUuid());
  }

  SpreadsheetApp.flush();
  sortEventsByDate_();
  SpreadsheetApp.flush();
}
