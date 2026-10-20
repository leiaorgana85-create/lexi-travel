// LEXI Travel flight integrity hardening.
// Install as FlightHardening.gs in the same bound Apps Script project as
// FlightLegs.gs, and call flightHardeningOnEdit_(e) immediately before
// flightLegsOnEdit_(e) from the consolidated onEdit(e).
//
// Purpose:
//   1. Re-validate already-linked trips after later edits, so leg numbering and
//      connection continuity cannot be bypassed merely because Event ID exists.
//   2. Support safe removal by clearing the editable B:N fields on a FLIGHT_LEGS
//      row. The system Event ID / derived cells are cleared automatically and the
//      generated EVENTS Flight row is deleted when the trip has no legs left.

function flightHardeningClearSystemCells_(sheet, headers, rowNumber) {
  const names = ['Event ID', 'From TZ', 'To TZ', 'Segment Time', 'Layover After'];
  names.forEach(name => {
    const column = Number(headers[name] || 0);
    if (column) sheet.getRange(rowNumber, column).clearContent();
  });
}

function flightHardeningDeleteGeneratedEvent_(eventId) {
  const row = flightEventRow_(eventId);
  if (!row) return;

  const sheet = eventsSheet_();
  const category = String(sheet.getRange(row, 5).getDisplayValue() || '').trim().toLowerCase();
  if (category !== 'flight') {
    throw new Error('Refusing to delete non-Flight EVENTS row for Event ID: ' + eventId);
  }

  sheet.deleteRow(row);
}

function flightHardeningValidateTrip_(eventId) {
  const rows = flightLegRowsForEvent_(eventId);
  if (!rows.length) return;

  rows.forEach((row, index) => {
    const expectedLeg = index + 1;
    if (!Number.isInteger(row.legNumber) || row.legNumber !== expectedLeg) {
      throw new Error(
        'Flight ' + eventId + ' must use consecutive Leg # values 1, 2, 3, etc. ' +
        'Expected ' + expectedLeg + ' on FLIGHT_LEGS row ' + row.rowNumber + '.'
      );
    }

    if (index > 0) {
      const previous = rows[index - 1];
      if (previous.to !== row.from) {
        throw new Error(
          'Connection mismatch on FLIGHT_LEGS row ' + row.rowNumber + ': prior leg arrives ' +
          previous.to + ' but this leg departs ' + row.from + '.'
        );
      }
    }
  });
}

function flightHardeningOnEdit_(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== 'FLIGHT_LEGS') return;

  const headers = flightHeaders_(sheet);
  const firstRow = Math.max(2, e.range.getRow());
  const lastRow = e.range.getRow() + e.range.getNumRows() - 1;
  const affectedEventIds = new Set();
  const rebuildAfterClear = new Set();

  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const row = flightReadRowObject_(sheet, headers, rowNumber);
    const eventId = String(row.eventId || '').trim();
    if (!eventId) continue;

    if (!flightManualRowHasData_(row)) {
      flightHardeningClearSystemCells_(sheet, headers, rowNumber);

      const remaining = flightLegRowsForEvent_(eventId);
      if (!remaining.length) {
        flightHardeningDeleteGeneratedEvent_(eventId);
      } else {
        affectedEventIds.add(eventId);
        rebuildAfterClear.add(eventId);
      }
      continue;
    }

    affectedEventIds.add(eventId);
  }

  affectedEventIds.forEach(eventId => flightHardeningValidateTrip_(eventId));
  rebuildAfterClear.forEach(eventId => rebuildFlightEvent_(eventId));
}
