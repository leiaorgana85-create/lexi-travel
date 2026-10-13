// LEXI Travel structured flight-leg calculations.
//
// Source tables:
//   FLIGHT_LEGS
//   Event ID | Leg # | Flight # | From | Depart Date | Depart Time |
//   To | Arrive Date | Arrive Time | From TZ | To TZ | Segment Time | Layover After
//
//   AIRPORT_TZ (hidden system table)
//   IATA | IANA Time Zone | Airport / City
//
// Derived EVENTS fields for Flight records:
//   Date | Time | Travel Time | Flight Plan
//
// Integration:
//   Add `flightLegsOnEdit_(e);` near the top of the existing onEdit(e).
//   The helper exits immediately unless FLIGHT_LEGS or AIRPORT_TZ was edited.
//
// After first installation/deployment, run `rebuildAllFlightCalculations()` once.

function flightLegsSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('FLIGHT_LEGS');
  if (!sheet) throw new Error('Missing sheet: FLIGHT_LEGS');
  return sheet;
}

function airportTzSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('AIRPORT_TZ');
  if (!sheet) throw new Error('Missing sheet: AIRPORT_TZ');
  return sheet;
}

function flightPad2_(value) {
  return String(value).padStart(2, '0');
}

function flightNormalizeTime_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function flightParseLocalParts_(dateText, timeText) {
  const dateMatch = String(dateText || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) throw new Error('Invalid flight date: ' + dateText);

  const time = flightNormalizeTime_(timeText);
  const timeMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!timeMatch) throw new Error('Invalid flight time: ' + timeText);

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const meridiem = String(timeMatch[3] || '').toUpperCase();

  if (minute < 0 || minute > 59) throw new Error('Invalid flight time: ' + timeText);

  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error('Invalid flight time: ' + timeText);
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  } else if (hour < 0 || hour > 23) {
    throw new Error('Invalid flight time: ' + timeText);
  }

  return {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: hour,
    minute: minute
  };
}

function flightPseudoUtcMs_(parts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
    0
  );
}

function flightRenderedPseudoUtcMs_(date, timeZone) {
  const rendered = Utilities.formatDate(date, timeZone, 'yyyy-MM-dd HH:mm');
  const match = rendered.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/);
  if (!match) throw new Error('Could not resolve timezone ' + timeZone);

  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
    0
  );
}

function flightLocalToUtcMs_(dateText, timeText, timeZone) {
  const parts = flightParseLocalParts_(dateText, timeText);
  const targetPseudo = flightPseudoUtcMs_(parts);
  const targetText = [
    String(parts.year).padStart(4, '0'),
    flightPad2_(parts.month),
    flightPad2_(parts.day)
  ].join('-') + ' ' + flightPad2_(parts.hour) + ':' + flightPad2_(parts.minute);

  let guess = targetPseudo;

  // Iteratively solve for the UTC instant which renders as the requested
  // local wall-clock time in the IANA timezone. This follows date-specific
  // DST/offset rules instead of assuming a fixed UTC offset.
  for (let i = 0; i < 8; i += 1) {
    const renderedPseudo = flightRenderedPseudoUtcMs_(new Date(guess), timeZone);
    const delta = targetPseudo - renderedPseudo;
    if (delta === 0) break;
    guess += delta;
  }

  const verified = Utilities.formatDate(new Date(guess), timeZone, 'yyyy-MM-dd HH:mm');
  if (verified !== targetText) {
    throw new Error(
      'Local time does not resolve cleanly in ' + timeZone + ': ' + targetText +
      ' (possible DST gap or invalid time)'
    );
  }

  // Detect the rare fall-back DST hour where the same local wall time occurs twice.
  const oneHour = 60 * 60 * 1000;
  const previous = Utilities.formatDate(new Date(guess - oneHour), timeZone, 'yyyy-MM-dd HH:mm');
  const next = Utilities.formatDate(new Date(guess + oneHour), timeZone, 'yyyy-MM-dd HH:mm');
  if (previous === targetText || next === targetText) {
    throw new Error(
      'Ambiguous DST local time in ' + timeZone + ': ' + targetText +
      '. Review this leg manually before using the calculated duration.'
    );
  }

  return guess;
}

function flightDurationLabel_(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '';

  const totalMinutes = Math.round(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return hours + 'h ' + minutes + 'm';
  if (hours) return hours + 'h';
  return minutes + 'm';
}

function flightCompactTime_(value) {
  return String(value || '')
    .trim()
    .replace(/\s*AM\b/gi, ' AM')
    .replace(/\s*PM\b/gi, ' PM');
}

function flightAirportTimezones_() {
  const sheet = airportTzSheet_();
  const lastRow = sheet.getLastRow();
  const map = {};

  if (lastRow < 2) return map;

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  rows.forEach(row => {
    const iata = String(row[0] || '').trim().toUpperCase();
    const tz = String(row[1] || '').trim();
    if (iata && tz) map[iata] = tz;
  });

  return map;
}

function flightAllLegRows_() {
  const sheet = flightLegsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, 13).getDisplayValues();
  return values.map((row, index) => ({
    rowNumber: index + 2,
    eventId: String(row[0] || '').trim(),
    legNumber: Number(row[1] || 0),
    flightNumber: String(row[2] || '').trim().toUpperCase(),
    from: String(row[3] || '').trim().toUpperCase(),
    departDate: String(row[4] || '').trim(),
    departTime: String(row[5] || '').trim(),
    to: String(row[6] || '').trim().toUpperCase(),
    arriveDate: String(row[7] || '').trim(),
    arriveTime: String(row[8] || '').trim()
  })).filter(row => row.eventId);
}

function flightLegRowsForEvent_(eventId) {
  return flightAllLegRows_()
    .filter(row => row.eventId === String(eventId))
    .sort((a, b) => {
      const legCompare = a.legNumber - b.legNumber;
      return legCompare || a.rowNumber - b.rowNumber;
    });
}

function flightEventRow_(eventId) {
  const sheet = eventsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i += 1) {
    if (String(ids[i][0] || '').trim() === String(eventId)) return i + 2;
  }
  return 0;
}

function rebuildFlightEvent_(eventId) {
  const legsSheet = flightLegsSheet_();
  const eventSheet = eventsSheet_();
  const timezones = flightAirportTimezones_();
  const rows = flightLegRowsForEvent_(eventId);

  if (!rows.length) return;

  const calculated = rows.map(row => {
    if (!row.legNumber || !row.flightNumber || !row.from || !row.to ||
        !row.departDate || !row.departTime || !row.arriveDate || !row.arriveTime) {
      throw new Error('Incomplete FLIGHT_LEGS row ' + row.rowNumber + ' for ' + eventId);
    }

    const fromTz = timezones[row.from];
    const toTz = timezones[row.to];
    if (!fromTz) throw new Error('Missing airport timezone mapping: ' + row.from);
    if (!toTz) throw new Error('Missing airport timezone mapping: ' + row.to);

    const departUtc = flightLocalToUtcMs_(row.departDate, row.departTime, fromTz);
    const arriveUtc = flightLocalToUtcMs_(row.arriveDate, row.arriveTime, toTz);
    const segmentMs = arriveUtc - departUtc;

    if (segmentMs <= 0) {
      throw new Error(
        'Arrival must be after departure for ' + row.flightNumber +
        ' (' + row.from + '→' + row.to + ')'
      );
    }

    return Object.assign({}, row, {
      fromTz: fromTz,
      toTz: toTz,
      departUtc: departUtc,
      arriveUtc: arriveUtc,
      segmentMs: segmentMs
    });
  });

  for (let i = 0; i < calculated.length; i += 1) {
    const current = calculated[i];
    const next = calculated[i + 1];
    let layoverMs = null;

    if (next) {
      layoverMs = next.departUtc - current.arriveUtc;
      if (layoverMs < 0) {
        throw new Error(
          'Next flight departs before prior flight arrives: ' +
          current.flightNumber + ' → ' + next.flightNumber
        );
      }
    }

    current.layoverMs = layoverMs;

    legsSheet.getRange(current.rowNumber, 10, 1, 4).setValues([[
      current.fromTz,
      current.toTz,
      flightDurationLabel_(current.segmentMs),
      layoverMs === null ? '' : flightDurationLabel_(layoverMs)
    ]]);
  }

  const first = calculated[0];
  const last = calculated[calculated.length - 1];
  const totalMs = last.arriveUtc - first.departUtc;

  if (totalMs <= 0) throw new Error('Invalid total flight duration for ' + eventId);

  const planLines = [];
  calculated.forEach(leg => {
    planLines.push(
      leg.flightNumber + ' · ' + leg.from + ' → ' + leg.to + ' · ' +
      flightCompactTime_(leg.departTime) + '–' + flightCompactTime_(leg.arriveTime) + ' · ' +
      flightDurationLabel_(leg.segmentMs)
    );

    if (leg.layoverMs !== null) {
      planLines.push(
        leg.to + ' layover · ' + flightDurationLabel_(leg.layoverMs)
      );
    }
  });

  const eventRow = flightEventRow_(eventId);
  if (!eventRow) throw new Error('Missing EVENTS row for flight Event ID: ' + eventId);

  // For Flight rows, overall calendar date/time are derived from the first
  // departure and final arrival. Title remains manual because app-facing city
  // labels may intentionally differ from IATA airport codes (e.g. DNG vs DAD).
  const firstDepartDateValue = legsSheet.getRange(first.rowNumber, 5).getValue();
  const overallTime = flightCompactTime_(first.departTime) + ' → ' + flightCompactTime_(last.arriveTime);
  eventSheet.getRange(eventRow, 2).setValue(firstDepartDateValue); // Date
  eventSheet.getRange(eventRow, 4).setValue(overallTime); // Time

  // I = Travel Time, J = Flight Plan.
  eventSheet.getRange(eventRow, 9, 1, 2).setValues([[
    flightDurationLabel_(totalMs),
    planLines.join('\n')
  ]]);

  SpreadsheetApp.flush();
}

function rebuildAllFlightCalculations_() {
  const eventIds = [...new Set(flightAllLegRows_().map(row => row.eventId).filter(Boolean))];
  eventIds.forEach(eventId => rebuildFlightEvent_(eventId));
  return eventIds.length;
}

// Public wrapper so the one-time rebuild appears in the Apps Script Run menu.
function rebuildAllFlightCalculations() {
  return rebuildAllFlightCalculations_();
}

function flightLegsOnEdit_(e) {
  if (!e || !e.range) return;

  const sheetName = e.range.getSheet().getName();
  if (sheetName !== 'FLIGHT_LEGS' && sheetName !== 'AIRPORT_TZ') return;

  try {
    if (sheetName === 'AIRPORT_TZ') {
      rebuildAllFlightCalculations_();
      return;
    }

    const sheet = e.range.getSheet();
    const firstRow = Math.max(2, e.range.getRow());
    const lastRow = e.range.getRow() + e.range.getNumRows() - 1;
    const eventIds = new Set();

    for (let row = firstRow; row <= lastRow; row += 1) {
      const eventId = String(sheet.getRange(row, 1).getDisplayValue() || '').trim();
      if (eventId) eventIds.add(eventId);
    }

    eventIds.forEach(eventId => rebuildFlightEvent_(eventId));
  } catch (error) {
    SpreadsheetApp.getActiveSpreadsheet().toast(
      error && error.message ? error.message : String(error),
      'Flight calculation error',
      8
    );
    throw error;
  }
}
