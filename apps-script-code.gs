const LEXI_GOOGLE_CLIENT_ID = '543436064136-27a477uk691qocpaft25q925lg88hl98.apps.googleusercontent.com';
const LEXI_TRAVEL_GOOGLE_SUB_PROPERTY = 'LEXI_TRAVEL_GOOGLE_SUB_V1';
const LEXI_INSTALL_HASH_PROPERTY = 'LEXI_INSTALL_TOKEN_HASH_V1';
const LEXI_INSTALL_EXPIRES_PROPERTY = 'LEXI_INSTALL_TOKEN_EXPIRES_V1';

function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};

  if (String(p.authBridge || '') === '1') {
    return travelAuthBridgeHtml_();
  }

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

function authGoogleBootstrap(credential, currentKey, allowRelink) {
  const identity = verifyLexiGoogleCredential_(credential);
  const props = PropertiesService.getScriptProperties();
  const savedKey = props.getProperty('LEXI_API_KEY');
  if (!savedKey) throw new Error('Travel API key is not configured.');

  const linkedSub = String(props.getProperty(LEXI_TRAVEL_GOOGLE_SUB_PROPERTY) || '').trim();
  let linkedNow = false;
  let relinked = false;

  if (!linkedSub) {
    if (String(currentKey || '').trim() !== savedKey) {
      throw new Error('First Google link requires the current Travel API key on this device.');
    }
    props.setProperty(LEXI_TRAVEL_GOOGLE_SUB_PROPERTY, identity.sub);
    linkedNow = true;
  } else if (identity.sub !== linkedSub) {
    if (!allowRelink) {
      throw new Error('This Google account is not linked to Lexi Travel.');
    }
    if (String(currentKey || '').trim() !== savedKey) {
      throw new Error('Relinking Google requires the current Travel API key on this device.');
    }
    props.setProperty(LEXI_TRAVEL_GOOGLE_SUB_PROPERTY, identity.sub);
    relinked = true;
  }

  // Retire the temporary cookie-transfer experiment if any stale server state exists.
  props.deleteProperty(LEXI_INSTALL_HASH_PROPERTY);
  props.deleteProperty(LEXI_INSTALL_EXPIRES_PROPERTY);

  return { ok: true, key: savedKey, linkedNow: linkedNow, relinked: relinked };
}

function verifyLexiGoogleCredential_(credential) {
  const token = String(credential || '').trim();
  if (!token) throw new Error('Google sign-in credential is missing.');

  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('Google sign-in could not be verified.');
  }

  let data;
  try {
    data = JSON.parse(response.getContentText());
  } catch (_) {
    throw new Error('Google sign-in response was invalid.');
  }

  const issuer = String(data.iss || '');
  if (String(data.aud || '') !== LEXI_GOOGLE_CLIENT_ID) {
    throw new Error('Google sign-in audience mismatch.');
  }
  if (issuer !== 'accounts.google.com' && issuer !== 'https://accounts.google.com') {
    throw new Error('Google sign-in issuer mismatch.');
  }
  if (String(data.email_verified || '').toLowerCase() !== 'true') {
    throw new Error('Google account email is not verified.');
  }
  if (!data.sub || Number(data.exp || 0) * 1000 <= Date.now()) {
    throw new Error('Google sign-in credential expired.');
  }

  return { sub: String(data.sub) };
}

function travelAuthBridgeHtml_() {
  const html = `<!doctype html><html><body><script>
(() => {
  'use strict';
  const PARENT_ORIGIN = 'https://leiaorgana85-create.github.io';
  const post = (id, ok, result, error) => {
    window.top.postMessage({ type:'lexi-travel-google-auth-result', id, ok, result, error }, PARENT_ORIGIN);
  };
  window.addEventListener('message', event => {
    if (event.origin !== PARENT_ORIGIN || event.source !== window.top) return;
    const d = event.data || {};
    if (d.type !== 'lexi-travel-google-auth' || !d.id) return;
    google.script.run
      .withSuccessHandler(result => post(String(d.id), true, result, ''))
      .withFailureHandler(error => post(String(d.id), false, null, error && error.message ? error.message : String(error)))
      .authGoogleBootstrap(String(d.credential || ''), String(d.currentKey || ''), Boolean(d.allowRelink));
  });
  window.top.postMessage({ type:'lexi-travel-google-auth-ready' }, PARENT_ORIGIN);
})();
<\/script></body></html>`;

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
