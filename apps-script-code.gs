function doGet(e) {
  const savedKey =
    PropertiesService.getScriptProperties().getProperty('LEXI_API_KEY');

  const suppliedKey = e && e.parameter ? e.parameter.key : '';

  if (!savedKey || suppliedKey !== savedKey) {
    return json_({
      ok: false,
      error: 'Unauthorized'
    });
  }

  const action = (e.parameter.action || 'data').toLowerCase();

  if (action === 'ping') {
    return json_({
      ok: true,
      app: 'LEXI Travel',
      timestamp: new Date().toISOString()
    });
  }

  if (action === 'data') {
    return json_({
      ok: true,
      locations: readTable_('LOCATIONS'),
      events: readTable_('EVENTS'),
      notes: readTable_('NOTES'),
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
