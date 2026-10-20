// LEXI Travel structured flight-leg calculations.
//
// Canonical flight-entry table: FLIGHT_LEGS
//   Event ID | Leg # | Flight # | From | Depart Date | Depart Time |
//   To | Arrive Date | Arrive Time | Display Route | Leg Details |
//   Trip Details | Link | Status | From TZ | To TZ | Segment Time | Layover After
//
// User workflow after the one-tab schema is installed:
//   - Edit only the green FLIGHT_LEGS fields B:N.
//   - Event ID (A) and calculation fields O:R are system-controlled.
//   - Display Route / Trip Details / Link / Status are trip-level fields; enter
//     them on Leg 1. Leg Details may be entered separately on each leg.
//   - EVENTS Flight rows are a generated projection and are not edited directly.
//
// AIRPORT_TZ is a hidden IATA -> IANA timezone reference table.
//
// Integration:
//   The consolidated onEdit(e) must call flightLegsOnEdit_(e).
//   Run rebuildAllFlightCalculations() manually only when a full rebuild is needed.

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

function flightHeaders_(sheet) {
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const names = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};
  names.forEach((name, index) => {
    const key = String(name || '').trim();
    if (key) map[key] = index + 1;
  });
  return map;
}

function flightRequiredColumn_(headers, name) {
  const column = Number(headers[name] || 0);
  if (!column) throw new Error('Missing FLIGHT_LEGS column: ' + name);
  return column;
}

function flightMetadataEnabled_(headers) {
  return Boolean(
    headers['Display Route'] && headers['Leg Details'] && headers['Trip Details'] &&
    headers['Link'] && headers['Status']
  );
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

function flightReadRowObject_(sheet, headers, rowNumber) {
  const lastColumn = Math.max(1, sheet.getLastColumn());
  const values = sheet.getRange(rowNumber, 1, 1, lastColumn).getDisplayValues()[0];
  const value = name => {
    const column = Number(headers[name] || 0);
    return column ? String(values[column - 1] || '').trim() : '';
  };

  return {
    rowNumber: rowNumber,
    eventId: value('Event ID'),
    legNumber: Number(value('Leg #') || 0),
    flightNumber: value('Flight #').toUpperCase(),
    from: value('From').toUpperCase(),
    departDate: value('Depart Date'),
    departTime: value('Depart Time'),
    to: value('To').toUpperCase(),
    arriveDate: value('Arrive Date'),
    arriveTime: value('Arrive Time'),
    displayRoute: value('Display Route'),
    legDetails: value('Leg Details'),
    tripDetails: value('Trip Details'),
    link: value('Link'),
    status: value('Status')
  };
}

function flightAllLegRows_() {
  const sheet = flightLegsSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = flightHeaders_(sheet);
  [
    'Event ID', 'Leg #', 'Flight #', 'From', 'Depart Date', 'Depart Time',
    'To', 'Arrive Date', 'Arrive Time', 'From TZ', 'To TZ',
    'Segment Time', 'Layover After'
  ].forEach(name => flightRequiredColumn_(headers, name));

  const rows = [];
  for (let row = 2; row <= lastRow; row += 1) {
    const item = flightReadRowObject_(sheet, headers, row);
    if (item.eventId) rows.push(item);
  }
  return rows;
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

function flightReadManualRow_(sheet, rowNumber) {
  const headers = flightHeaders_(sheet);
  return flightReadRowObject_(sheet, headers, rowNumber);
}

function flightManualRowHasData_(row) {
  return Boolean(
    row.legNumber || row.flightNumber || row.from || row.departDate ||
    row.departTime || row.to || row.arriveDate || row.arriveTime
  );
}

function flightManualRowComplete_(row) {
  return Boolean(
    row.legNumber && row.flightNumber && row.from && row.departDate &&
    row.departTime && row.to && row.arriveDate && row.arriveTime
  );
}

function flightAutoRoute_(rows) {
  if (!rows.length) return '';
  return rows[0].from + '→' + rows[rows.length - 1].to;
}

function flightNewEventId_(leg) {
  const date = String(leg.departDate || '').replace(/-/g, '') || 'undated';
  const from = String(leg.from || 'trip').toLowerCase();
  const token = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toLowerCase();
  return 'evt_flight_' + date + '_' + from + '_' + token;
}

function flightCreateEvent_(eventId, leg) {
  const sheet = eventsSheet_();
  const eventRow = Math.max(2, sheet.getLastRow() + 1);
  const title = String(leg.displayRoute || '').trim() || (leg.from + '→' + leg.to);

  sheet.getRange(eventRow, 1, 1, 10).setValues([[
    eventId,
    '',
    title,
    '',
    'Flight',
    '',
    '',
    '',
    '',
    ''
  ]]);
  return eventRow;
}

function flightPreviousEnteredLeg_(sheet, rowNumber) {
  for (let row = rowNumber - 1; row >= 2; row -= 1) {
    const manual = flightReadManualRow_(sheet, row);
    if (!flightManualRowHasData_(manual)) continue;
    return manual;
  }
  return null;
}

function flightEnsureEventLinkForRow_(sheet, rowNumber) {
  const headers = flightHeaders_(sheet);
  const eventIdColumn = flightRequiredColumn_(headers, 'Event ID');
  const existingEventId = String(sheet.getRange(rowNumber, eventIdColumn).getDisplayValue() || '').trim();
  if (existingEventId) return existingEventId;

  const leg = flightReadRowObject_(sheet, headers, rowNumber);
  if (!flightManualRowHasData_(leg) || !flightManualRowComplete_(leg)) return '';

  if (!Number.isInteger(leg.legNumber) || leg.legNumber < 1) {
    throw new Error('Leg # must be 1, 2, 3, etc. on FLIGHT_LEGS row ' + rowNumber);
  }

  if (leg.legNumber === 1) {
    const eventId = flightNewEventId_(leg);
    sheet.getRange(rowNumber, eventIdColumn).setValue(eventId);
    flightCreateEvent_(eventId, leg);
    return eventId;
  }

  const previous = flightPreviousEnteredLeg_(sheet, rowNumber);
  if (!previous || !previous.eventId || previous.legNumber !== leg.legNumber - 1) {
    throw new Error(
      'Leg ' + leg.legNumber + ' must be entered below Leg ' + (leg.legNumber - 1) +
      ' of the same trip.'
    );
  }

  if (previous.to !== leg.from) {
    throw new Error(
      'Connection mismatch on FLIGHT_LEGS row ' + rowNumber + ': prior leg arrives ' +
      previous.to + ' but this leg departs ' + leg.from + '.'
    );
  }

  const eventId = previous.eventId;
  if (!flightEventRow_(eventId)) {
    throw new Error('Missing EVENTS row for flight Event ID: ' + eventId);
  }

  sheet.getRange(rowNumber, eventIdColumn).setValue(eventId);

  // Backward-compatible behavior before the one-tab metadata columns are added.
  if (!flightMetadataEnabled_(headers)) {
    const existingRows = flightLegRowsForEvent_(eventId);
    const priorAutoTitle = flightAutoRoute_(existingRows);
    const eventRow = flightEventRow_(eventId);
    const titleCell = eventsSheet_().getRange(eventRow, 3);
    const currentTitle = String(titleCell.getDisplayValue() || '').trim();
    const nextAutoTitle = (existingRows.length ? existingRows[0].from : leg.from) + '→' + leg.to;
    if (!currentTitle || currentTitle === priorAutoTitle) titleCell.setValue(nextAutoTitle);
  }

  return eventId;
}

function flightBuildDetails_(calculated) {
  if (!calculated.length) return '';
  const lines = [];
  const tripDetails = String(calculated[0].tripDetails || '').trim();
  if (tripDetails) lines.push(tripDetails);

  calculated.forEach(leg => {
    const details = String(leg.legDetails || '').trim();
    if (details) lines.push(leg.flightNumber + ': ' + details);
  });

  return lines.join('\n');
}

function rebuildFlightEvent_(eventId) {
  const legsSheet = flightLegsSheet_();
  const eventSheet = eventsSheet_();
  const headers = flightHeaders_(legsSheet);
  const timezones = flightAirportTimezones_();
  const rows = flightLegRowsForEvent_(eventId);

  if (!rows.length) return;

  const fromTzColumn = flightRequiredColumn_(headers, 'From TZ');
  const toTzColumn = flightRequiredColumn_(headers, 'To TZ');
  const segmentColumn = flightRequiredColumn_(headers, 'Segment Time');
  const layoverColumn = flightRequiredColumn_(headers, 'Layover After');
  const departDateColumn = flightRequiredColumn_(headers, 'Depart Date');

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
    legsSheet.getRange(current.rowNumber, fromTzColumn).setValue(current.fromTz);
    legsSheet.getRange(current.rowNumber, toTzColumn).setValue(current.toTz);
    legsSheet.getRange(current.rowNumber, segmentColumn).setValue(flightDurationLabel_(current.segmentMs));
    legsSheet.getRange(current.rowNumber, layoverColumn).setValue(
      layoverMs === null ? '' : flightDurationLabel_(layoverMs)
    );
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
      planLines.push(leg.to + ' layover · ' + flightDurationLabel_(leg.layoverMs));
    }
  });

  const eventRow = flightEventRow_(eventId);
  if (!eventRow) throw new Error('Missing EVENTS row for flight Event ID: ' + eventId);

  const firstDepartDateValue = legsSheet.getRange(first.rowNumber, departDateColumn).getValue();
  const overallTime = flightCompactTime_(first.departTime) + ' → ' + flightCompactTime_(last.arriveTime);
  const travelTime = flightDurationLabel_(totalMs);
  const flightPlan = planLines.join('\n');

  if (flightMetadataEnabled_(headers)) {
    const title = String(first.displayRoute || '').trim() || flightAutoRoute_(calculated);
    const details = flightBuildDetails_(calculated);
    const link = String(first.link || '').trim();
    const status = String(first.status || '').trim();

    // In one-tab mode, every Flight field in EVENTS is a generated projection.
    eventSheet.getRange(eventRow, 2, 1, 9).setValues([[
      firstDepartDateValue,
      title,
      overallTime,
      'Flight',
      details,
      link,
      status,
      travelTime,
      flightPlan
    ]]);
  } else {
    // Backward-compatible output while the older 13-column sheet is still present.
    eventSheet.getRange(eventRow, 2).setValue(firstDepartDateValue);
    eventSheet.getRange(eventRow, 4).setValue(overallTime);
    eventSheet.getRange(eventRow, 5).setValue('Flight');
    eventSheet.getRange(eventRow, 9, 1, 2).setValues([[travelTime, flightPlan]]);
  }

  SpreadsheetApp.flush();
}

function rebuildAllFlightCalculations_() {
  const eventIds = [...new Set(flightAllLegRows_().map(row => row.eventId).filter(Boolean))];
  eventIds.forEach(eventId => rebuildFlightEvent_(eventId));
  return eventIds.length;
}

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
      const eventId = flightEnsureEventLinkForRow_(sheet, row);
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
