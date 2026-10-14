// LEXI Travel consolidated write router.
// Use this as the complete NotesSync.gs file in the bound Apps Script project.
// It expects CalendarSync.gs (event helpers), PlanSync.gs (plan helpers),
// FlightLegs.gs (structured flight calculations), and FlightHardening.gs
// (linked-trip validation / safe row clearing) to exist in the same project.

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
      return json_({ ok: true, noteWrite: true, noteOrder: true, version: 2 });
    }

    if (action === 'noteupsert') {
      return json_(noteUpsert_(e.parameter || {}));
    }

    if (action === 'notepin') {
      return json_(notePin_(e.parameter || {}));
    }

    if (action === 'noteorder') {
      return json_(noteOrder_(e.parameter || {}));
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

    if (action === 'shoppingcapabilities') {
      return json_({ ok: true, shoppingWrite: true, version: 4 });
    }

    if (action === 'shoppinglist') {
      return json_(shoppingList_());
    }

    if (action === 'shoppingsetbought') {
      return json_(shoppingSetBought_(e.parameter || {}));
    }

    if (action === 'shoppingupsert') {
      return json_(shoppingUpsert_(e.parameter || {}));
    }

    if (action === 'shoppingdelete') {
      return json_(shoppingDelete_(e.parameter || {}));
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

function noteOrder_(p) {
  let ids;
  try {
    ids = JSON.parse(String(p.ids || '[]'));
  } catch (error) {
    return { ok: false, error: 'Invalid note order payload' };
  }

  if (!Array.isArray(ids) || !ids.length) {
    return { ok: false, error: 'Missing note order' };
  }

  const orderedIds = ids.map(id => String(id || '').trim()).filter(Boolean);
  if (new Set(orderedIds).size !== orderedIds.length) {
    return { ok: false, error: 'Duplicate note ID in order' };
  }

  const sheet = notesSheet_();
  const now = new Date();

  orderedIds.forEach((id, index) => {
    const row = noteFindRow_(sheet, id);
    if (!row) throw new Error('Note not found: ' + id);
    sheet.getRange(row, 6).setValue(index + 1);
    sheet.getRange(row, 7).setValue(now);
  });

  SpreadsheetApp.flush();
  return { ok: true, count: orderedIds.length, updatedAt: now.toISOString() };
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

function shoppingSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('SHOPPING_LIST');

  if (!sheet) {
    throw new Error('Missing sheet: SHOPPING_LIST');
  }

  return sheet;
}

function shoppingColumns_(sheet) {
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const column = name => headers.indexOf(name) + 1;

  const columns = {
    store: column('Store'),
    category: column('Category'),
    product: column('Product'),
    thaiProductName: column('Thai product name'),
    note: column('Purpose / note'),
    price: column('Approx. price (THB; USD)'),
    source: column('Source'),
    bought: column('Bought')
  };

  if (!columns.product) throw new Error('Missing SHOPPING_LIST Product column');
  if (!columns.bought) throw new Error('Missing SHOPPING_LIST Bought column');

  return columns;
}

function shoppingFindRowByProduct_(sheet, columns, product) {
  const wanted = String(product || '').trim();
  if (!wanted) return 0;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const products = sheet
    .getRange(2, columns.product, lastRow - 1, 1)
    .getDisplayValues();

  for (let i = 0; i < products.length; i += 1) {
    if (String(products[i][0] || '').trim() === wanted) return i + 2;
  }

  return 0;
}

function shoppingFirstBlankProductRow_(sheet, columns) {
  const maxRows = sheet.getMaxRows();
  if (maxRows < 2) {
    sheet.insertRowsAfter(maxRows, 2 - maxRows);
    return 2;
  }

  const products = sheet
    .getRange(2, columns.product, maxRows - 1, 1)
    .getDisplayValues();

  for (let i = 0; i < products.length; i += 1) {
    if (!String(products[i][0] || '').trim()) return i + 2;
  }

  sheet.insertRowAfter(maxRows);
  return maxRows + 1;
}

function shoppingList_() {
  const sheet = shoppingSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, version: 4, items: [] };

  const columns = shoppingColumns_(sheet);
  const width = sheet.getLastColumn();
  const values = sheet.getRange(2, 1, lastRow - 1, width).getValues();

  const valueAt = (row, columnNumber) =>
    columnNumber ? String(row[columnNumber - 1] || '').trim() : '';

  const items = values
    .map(row => ({
      store: valueAt(row, columns.store),
      category: valueAt(row, columns.category),
      product: valueAt(row, columns.product),
      thaiProductName: valueAt(row, columns.thaiProductName),
      note: valueAt(row, columns.note),
      price: valueAt(row, columns.price),
      source: valueAt(row, columns.source),
      bought: noteBool_(row[columns.bought - 1])
    }))
    .filter(item => item.product);

  return { ok: true, version: 4, items: items };
}

function shoppingSetBought_(p) {
  const product = String(p.product || '').trim();
  if (!product) return { ok: false, error: 'Missing product' };

  const sheet = shoppingSheet_();
  const columns = shoppingColumns_(sheet);
  const targetRow = shoppingFindRowByProduct_(sheet, columns, product);

  if (!targetRow) return { ok: false, error: 'Shopping item not found' };

  const bought = noteBool_(p.bought);
  sheet.getRange(targetRow, columns.bought).setValue(bought);
  SpreadsheetApp.flush();

  return { ok: true, product: product, bought: bought };
}

function shoppingUpsert_(p) {
  const originalProduct = String(p.originalProduct || '').trim();
  const product = String(p.product || '').trim();

  if (!product) return { ok: false, error: 'Product is required' };

  const sheet = shoppingSheet_();
  const columns = shoppingColumns_(sheet);
  const width = sheet.getLastColumn();

  let targetRow = 0;
  if (originalProduct) {
    targetRow = shoppingFindRowByProduct_(sheet, columns, originalProduct);
    if (!targetRow) return { ok: false, error: 'Shopping item no longer exists' };
  }

  const duplicateRow = shoppingFindRowByProduct_(sheet, columns, product);
  if (duplicateRow && duplicateRow !== targetRow) {
    return { ok: false, error: 'A shopping item with that Product already exists' };
  }

  let values;
  if (targetRow) {
    values = sheet.getRange(targetRow, 1, 1, width).getValues()[0];
  } else {
    targetRow = shoppingFirstBlankProductRow_(sheet, columns);
    values = sheet.getRange(targetRow, 1, 1, width).getValues()[0];
    values[columns.bought - 1] = false;
  }

  if (columns.store) values[columns.store - 1] = String(p.store || '').trim();
  if (columns.category) values[columns.category - 1] = String(p.category || '').trim();
  values[columns.product - 1] = product;
  if (columns.thaiProductName) values[columns.thaiProductName - 1] = String(p.thaiProductName || '').trim();
  if (columns.note) values[columns.note - 1] = String(p.note || '').trim();
  if (columns.price) values[columns.price - 1] = String(p.price || '').trim();
  if (columns.source) values[columns.source - 1] = String(p.source || '').trim();
  if (Object.prototype.hasOwnProperty.call(p, 'bought')) {
    values[columns.bought - 1] = noteBool_(p.bought);
  }

  sheet.getRange(targetRow, 1, 1, width).setValues([values]);
  SpreadsheetApp.flush();

  return {
    ok: true,
    created: !originalProduct,
    originalProduct: originalProduct,
    product: product
  };
}

function shoppingDelete_(p) {
  const product = String(p.product || '').trim();
  if (!product) return { ok: false, error: 'Missing product' };

  const sheet = shoppingSheet_();
  const columns = shoppingColumns_(sheet);
  const targetRow = shoppingFindRowByProduct_(sheet, columns, product);

  if (!targetRow) return { ok: true, product: product, alreadyMissing: true };

  sheet.deleteRow(targetRow);
  SpreadsheetApp.flush();
  return { ok: true, product: product, deleted: true };
}

function onEdit(e) {
  if (!e || !e.range) return;

  // FLIGHT_LEGS validation/cleanup runs before recalculation.
  flightHardeningOnEdit_(e);
  flightLegsOnEdit_(e);

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
