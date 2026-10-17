const LEXI_INSTALL_HASH_PROPERTY = 'LEXI_INSTALL_TOKEN_HASH_V1';
const LEXI_INSTALL_EXPIRES_PROPERTY = 'LEXI_INSTALL_TOKEN_EXPIRES_V1';
const LEXI_INSTALL_TTL_MS = 10 * 60 * 1000;

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const action = String(p.action || 'data').toLowerCase();

  if (action === 'authmint') {
    return json_(mintInstallToken_(p.key));
  }

  if (action === 'authredeem') {
    return json_(redeemInstallToken_(p.token));
  }

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

function mintInstallToken_(suppliedKey) {
  const props = PropertiesService.getScriptProperties();
  const savedKey = props.getProperty('LEXI_API_KEY');
  if (!savedKey || String(suppliedKey || '') !== savedKey) {
    return { ok: false, error: 'Unauthorized' };
  }

  const token = 'lxi1.' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expiresAt = Date.now() + LEXI_INSTALL_TTL_MS;
  props.setProperties({
    [LEXI_INSTALL_HASH_PROPERTY]: lexiInstallHash_(token),
    [LEXI_INSTALL_EXPIRES_PROPERTY]: String(expiresAt)
  }, false);

  return {
    ok: true,
    token: token,
    expiresAt: new Date(expiresAt).toISOString()
  };
}

function redeemInstallToken_(token) {
  const value = String(token || '').trim();
  if (!value) return { ok: false, error: 'Missing install token' };

  const props = PropertiesService.getScriptProperties();
  const savedHash = props.getProperty(LEXI_INSTALL_HASH_PROPERTY);
  const expiresAt = Number(props.getProperty(LEXI_INSTALL_EXPIRES_PROPERTY) || 0);

  if (!savedHash || !expiresAt || Date.now() > expiresAt) {
    props.deleteProperty(LEXI_INSTALL_HASH_PROPERTY);
    props.deleteProperty(LEXI_INSTALL_EXPIRES_PROPERTY);
    return { ok: false, error: 'Install token expired' };
  }

  if (lexiInstallHash_(value) !== savedHash) {
    return { ok: false, error: 'Invalid install token' };
  }

  const savedKey = props.getProperty('LEXI_API_KEY');
  props.deleteProperty(LEXI_INSTALL_HASH_PROPERTY);
  props.deleteProperty(LEXI_INSTALL_EXPIRES_PROPERTY);

  if (!savedKey) return { ok: false, error: 'API key is not configured' };
  return { ok: true, key: savedKey };
}

function lexiInstallHash_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text || ''),
    Utilities.Charset.UTF_8
  );
  return bytes
    .map(byte => ('0' + ((byte < 0 ? byte + 256 : byte).toString(16))).slice(-2))
    .join('');
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
