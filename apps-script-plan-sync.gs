// LEXI Travel monthly Plan checklist helpers.
// Add this as PlanSync.gs in the same Apps Script project as Code.gs / NotesSync.gs.

function planItemsSheet_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName('PLAN_ITEMS');

  if (!sheet) {
    throw new Error('Missing sheet: PLAN_ITEMS');
  }

  return sheet;
}

function planBool_(value) {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function planFindRow_(sheet, id) {
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

function planNormalizeMonth_(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  const match = text.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function planNormalizeDueDate_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function planList_(p) {
  const month = planNormalizeMonth_((p && p.month) || '');
  const sheet = planItemsSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { ok: true, items: [] };
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 8);
  const rows = range.getValues();
  const displayRows = range.getDisplayValues();

  const items = rows
    .map((row, index) => ({ row: row, display: displayRows[index] }))
    .filter(item => {
      const archived = planBool_(item.row[7]);
      const rowMonth = planNormalizeMonth_(item.display[1]);
      return !archived && (!month || rowMonth === month);
    })
    .map(item => ({
      ID: String(item.row[0] || ''),
      Month: planNormalizeMonth_(item.display[1]),
      Text: String(item.row[2] || ''),
      'Due Date': planNormalizeDueDate_(item.display[3]),
      Completed: planBool_(item.row[4]),
      'Sort Order': Number(item.row[5] || 9999),
      'Updated At': item.row[6] instanceof Date ? item.row[6].toISOString() : String(item.row[6] || ''),
      Archived: false
    }))
    .sort((a, b) => {
      const order = Number(a['Sort Order'] || 9999) - Number(b['Sort Order'] || 9999);
      if (order) return order;
      return String(a.Text || '').localeCompare(String(b.Text || ''));
    });

  return { ok: true, items: items };
}

function planUpsert_(p) {
  const id = String(p.id || '').trim();
  const requestedMonth = planNormalizeMonth_(p.month);
  const text = String(p.text || '').trim();
  const dueDate = planNormalizeDueDate_(p.dueDate);
  const month = dueDate ? dueDate.slice(0, 7) : requestedMonth;
  const completed = planBool_(p.completed);
  const requestedSortOrder = Number(p.sortOrder || 0);

  if (!id) return { ok: false, error: 'Missing plan item ID' };
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: 'Invalid plan month' };
  if (p.dueDate && !dueDate) return { ok: false, error: 'Invalid due date' };
  if (!text) return { ok: false, error: 'Missing plan item text' };

  const sheet = planItemsSheet_();
  const row = planFindRow_(sheet, id);
  const now = new Date();

  let sortOrder = requestedSortOrder > 0 ? requestedSortOrder : 9999;

  if (row) {
    const existing = sheet.getRange(row, 1, 1, 8).getValues()[0];
    if (!(requestedSortOrder > 0)) {
      sortOrder = Number(existing[5] || 9999);
    }

    sheet.getRange(row, 2).setNumberFormat('@');
    sheet.getRange(row, 1, 1, 8).setValues([[
      id,
      month,
      text,
      dueDate,
      completed,
      sortOrder,
      now,
      false
    ]]);
  } else {
    sheet.appendRow([
      id,
      month,
      text,
      dueDate,
      completed,
      sortOrder,
      now,
      false
    ]);
    const newRow = sheet.getLastRow();
    sheet.getRange(newRow, 2).setNumberFormat('@').setValue(month);
  }

  SpreadsheetApp.flush();
  return {
    ok: true,
    id: id,
    month: month,
    dueDate: dueDate,
    updatedAt: now.toISOString()
  };
}

function planDelete_(p) {
  const id = String(p.id || '').trim();
  if (!id) return { ok: false, error: 'Missing plan item ID' };

  const sheet = planItemsSheet_();
  const row = planFindRow_(sheet, id);

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

function planSheetOnEdit_(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'PLAN_ITEMS') return;

  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getRow() + e.range.getNumRows() - 1;

  for (let row = firstRow; row <= lastRow; row += 1) {
    const visibleValues = sheet.getRange(row, 2, 1, 4).getDisplayValues()[0];
    const hasContent = visibleValues.some(value => String(value || '').trim() !== '');
    if (!hasContent) continue;

    const idCell = sheet.getRange(row, 1);
    if (!String(idCell.getValue() || '').trim()) {
      idCell.setValue('sheet-plan-' + Utilities.getUuid());
    }

    const monthCell = sheet.getRange(row, 2);
    const dueDate = planNormalizeDueDate_(sheet.getRange(row, 4).getDisplayValue());
    const month = dueDate ? dueDate.slice(0, 7) : planNormalizeMonth_(monthCell.getDisplayValue());
    monthCell.setNumberFormat('@');
    if (month) monthCell.setValue(month);

    const sortCell = sheet.getRange(row, 6);
    if (!String(sortCell.getValue() || '').trim()) {
      sortCell.setValue(row - 1);
    }

    sheet.getRange(row, 7).setValue(new Date());

    const archivedCell = sheet.getRange(row, 8);
    if (String(archivedCell.getValue() || '').trim() === '') {
      archivedCell.setValue(false);
    }
  }
}
