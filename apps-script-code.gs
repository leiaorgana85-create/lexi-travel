function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const action = String(p.action || 'data').toLowerCase();
  const savedKey =
    PropertiesService.getScriptProperties().getProperty('LEXI_API_KEY');
  const suppliedKey = p.key || '';

  if (!savedKey || suppliedKey !== savedKey) {
    return json_({
      ok: false,
      error: 'Unauthorized'
    });
  }

  if (action === 'ping') {
    return json_({
      ok: true,
      app: 'LEXI Travel',
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'data') {
    // Legacy clients omit includeNotes and continue receiving the full table.
    // Current frontend sends includeNotes=0 for Calendar/Plan refreshes and
    // includeNotes=1 only when the Notes tab explicitly requests note data.
    const includeNotes = String(p.includeNotes == null ? '1' : p.includeNotes) !== '0';

    return json_({
      ok: true,
      locations: readTable_('LOCATIONS'),
      events: readTable_('EVENTS'),
      notes: includeNotes ? readTable_('NOTES') : [],
      countries: readTable_('COUNTRIES'),
      dayOverrides: readTable_('DAY_OVERRIDES'),
      timestamp: new Date().toISOString()
    });
  }

  return json_({
    ok: false,
    error: 'Unknown action'
  });
}

function readTable_(sheetName) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Missing sheet: ' + sheetName);
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 1 || lastColumn < 1) {
    return [];
  }

  const values = sheet
    .getRange(1, 1, lastRow, lastColumn)
    .getDisplayValues();

  const headers = values[0];

  if (values.length === 1) {
    return [];
  }

  return values.slice(1)
    .filter(row => row.some(cell => cell !== ''))
    .map(row => {
      const obj = {};

      headers.forEach((header, i) => {
        obj[header] = row[i] || '';
      });

      return obj;
    });
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
