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
    .sort([
      { column: 2, ascending: true },
      { column: 4, ascending: true }
    ]);

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

function eventIsGeneratedFlightId_(id) {
  return /^evt_flight_/i.test(String(id || '').trim());
}

function eventGeneratedFlightError_(id) {
  return {
    ok: false,
    id: String(id || ''),
    error: 'Generated Flight events are read-only; edit FLIGHT_LEGS instead'
  };
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

  if (eventIsGeneratedFlightId_(id)) {
    return eventGeneratedFlightError_(id);
  }

  if (!date) {
    return { ok: false, error: 'Missing event date' };
  }

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
  if (!parsedDate || isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return { ok: false, error: 'Invalid event date' };
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

  if (eventIsGeneratedFlightId_(id)) {
    return eventGeneratedFlightError_(id);
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

// Helper for normal events entered directly in the EVENTS sheet.
// A brand-new manual row stays in place while it is being typed. Once Date,
// Title, and Category are all present, it receives a stable ID and the table
// is sorted once. Existing complete rows re-sort when Date, Title, Time, or
// Category changes.
function eventSheetOnEdit_(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'EVENTS') return;

  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getRow() + e.range.getNumRows() - 1;
  const firstColumn = e.range.getColumn();
  const lastColumn = firstColumn + e.range.getNumColumns() - 1;
  const touchesOrderingField =
    (firstColumn <= 2 && lastColumn >= 2) ||
    (firstColumn <= 3 && lastColumn >= 3) ||
    (firstColumn <= 4 && lastColumn >= 4) ||
    (firstColumn <= 5 && lastColumn >= 5);

  let shouldSort = false;

  for (let row = firstRow; row <= lastRow; row++) {
    const idCell = sheet.getRange(row, 1);
    const existingId = String(idCell.getValue() || '').trim();
    const requiredValues = sheet.getRange(row, 2, 1, 4).getDisplayValues()[0];
    const date = String(requiredValues[0] || '').trim();
    const title = String(requiredValues[1] || '').trim();
    const category = String(requiredValues[3] || '').trim();
    const isCompleteManualEvent = Boolean(date && title && category);

    if (!existingId) {
      if (!isCompleteManualEvent) continue;

      idCell.setValue('sheet-event-' + Utilities.getUuid());
      shouldSort = true;
      continue;
    }

    if (touchesOrderingField && isCompleteManualEvent) {
      shouldSort = true;
    }
  }

  SpreadsheetApp.flush();

  if (shouldSort) {
    sortEventsByDate_();
    SpreadsheetApp.flush();
  }
}
