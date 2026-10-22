// LEXI Travel Visit List backend.
// Add this file to the bound Apps Script project and route the three Visit
// actions from doPost in NotesSync.gs / apps-script-write-router-v2.gs.

function visitSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('VISIT_LIST');

  if (!sheet) throw new Error('Missing sheet: VISIT_LIST');
  return sheet;
}

function visitColumns_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const column = name => headers.indexOf(name) + 1;

  const columns = {
    place: column('Place'),
    area: column('Area'),
    purpose: column('Purpose'),
    price: column('Approx. price (THB; USD)'),
    source: column('Source'),
    visited: column('Visited')
  };

  if (!columns.place) throw new Error('Missing VISIT_LIST Place column');
  if (!columns.visited) throw new Error('Missing VISIT_LIST Visited column');
  return columns;
}

function visitFindRowByPlace_(sheet, columns, place) {
  const wanted = String(place || '').trim();
  if (!wanted) return 0;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const places = sheet
    .getRange(2, columns.place, lastRow - 1, 1)
    .getDisplayValues();

  let foundRow = 0;
  for (let i = 0; i < places.length; i += 1) {
    if (String(places[i][0] || '').trim() !== wanted) continue;
    if (foundRow) throw new Error('Duplicate VISIT_LIST Place: ' + wanted);
    foundRow = i + 2;
  }

  return foundRow;
}

function visitList_() {
  const sheet = visitSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, version: 1, items: [] };

  const columns = visitColumns_(sheet);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  const textAt = (row, columnNumber) =>
    columnNumber ? String(row[columnNumber - 1] || '').trim() : '';

  const items = values
    .map(row => ({
      place: textAt(row, columns.place),
      area: textAt(row, columns.area),
      purpose: textAt(row, columns.purpose),
      price: textAt(row, columns.price),
      source: textAt(row, columns.source),
      visited: noteBool_(row[columns.visited - 1])
    }))
    .filter(item => item.place);

  return { ok: true, version: 1, items: items };
}

function visitSetVisited_(p) {
  const place = String(p.place || '').trim();
  if (!place) return { ok: false, error: 'Missing place' };

  const sheet = visitSheet_();
  const columns = visitColumns_(sheet);
  const targetRow = visitFindRowByPlace_(sheet, columns, place);

  if (!targetRow) return { ok: false, error: 'Visit item not found' };

  const visited = noteBool_(p.visited);
  sheet.getRange(targetRow, columns.visited).setValue(visited);
  SpreadsheetApp.flush();

  return { ok: true, place: place, visited: visited };
}

// Add these routes inside doPost, before the final "Unknown write action":
// if (action === 'visitcapabilities') {
//   return json_({ ok: true, visitWrite: true, version: 1 });
// }
// if (action === 'visitlist') {
//   return json_(visitList_());
// }
// if (action === 'visitsetvisited') {
//   return json_(visitSetVisited_(e.parameter || {}));
// }
