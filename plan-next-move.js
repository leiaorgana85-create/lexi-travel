(() => {
  const card = document.getElementById('planNextMoveCard');
  const emptyEl = document.getElementById('planNextMoveEmpty');
  const planTab = document.querySelector('.tab[data-view="countryView"]');

  if (!card || !emptyEl) return;

  function dateKey(value) {
    if (typeof normalizeDateString === 'function') return normalizeDateString(value);
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function parseKey(key) {
    const match = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function keyForDate(date) {
    if (typeof toDateKey === 'function') return toDateKey(date);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function addDays(key, amount) {
    const date = parseKey(key);
    if (!date) return '';
    date.setDate(date.getDate() + amount);
    return keyForDate(date);
  }

  function locationStart(location) {
    return dateKey(location?.['Start Date']);
  }

  function locationEnd(location) {
    return dateKey(location?.['End Date']) || locationStart(location);
  }

  function locationCode(location) {
    return String(location?.Label || location?.City || location?.Country || '').trim();
  }

  function locationIdentity(location) {
    return [location?.City, location?.Country, location?.Label]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .join('|');
  }

  function locationOnDate(key, locations) {
    return locations
      .filter(location => {
        const start = locationStart(location);
        const end = locationEnd(location);
        return start && end && start <= key && key <= end;
      })
      .sort((a, b) => locationStart(b).localeCompare(locationStart(a)))[0] || null;
  }

  function previousLocationBefore(key, locations) {
    const previousDay = addDays(key, -1);
    const activePreviousDay = locationOnDate(previousDay, locations);
    if (activePreviousDay) return activePreviousDay;

    return locations
      .filter(location => {
        const start = locationStart(location);
        return start && start < key;
      })
      .sort((a, b) => locationStart(b).localeCompare(locationStart(a)))[0] || null;
  }

  function eventCategory(event) {
    return String(event?.Category || '').trim().toLowerCase();
  }

  function routeFromEvent(event) {
    const category = eventCategory(event);
    if (!category.includes('flight') && !category.includes('travel')) return null;

    const title = String(event?.Title || '').trim().toUpperCase();
    const match = title.match(/([A-Z]{3})\s*(?:→|->|–>|—>|>)\s*([A-Z]{3})/);
    if (!match) return null;
    return { origin: match[1], destination: match[2] };
  }

  function moveIdentity(date, origin, destination) {
    return `${date}|${locationCode(origin).toUpperCase()}|${locationCode(destination).toUpperCase()}`;
  }

  function upcomingMoves() {
    const today = keyForDate(new Date());
    const locations = (Array.isArray(appData?.locations) ? appData.locations : [])
      .filter(location => locationStart(location))
      .slice()
      .sort((a, b) => locationStart(a).localeCompare(locationStart(b)));

    const moves = [];
    const seen = new Set();

    for (const destination of locations) {
      const start = locationStart(destination);
      if (!start || start < today) continue;

      const origin = previousLocationBefore(start, locations);
      if (!origin || locationIdentity(origin) === locationIdentity(destination)) continue;

      const identity = moveIdentity(start, origin, destination);
      if (seen.has(identity)) continue;
      seen.add(identity);
      moves.push({ origin, destination, date: start });
    }

    const flightEvents = (Array.isArray(appData?.events) ? appData.events : [])
      .map(event => ({ event, date: dateKey(event?.Date), route: routeFromEvent(event) }))
      .filter(item => item.date && item.date >= today && item.route)
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const { event, date, route } of flightEvents) {
      const origin = { Label: route.origin };
      const destination = { Label: route.destination };
      const identity = moveIdentity(date, origin, destination);
      if (seen.has(identity)) continue;

      seen.add(identity);
      moves.push({ origin, destination, date, flightEvent: event });
    }

    return moves.sort((a, b) => a.date.localeCompare(b.date));
  }

  function flightForMove(move) {
    if (move.flightEvent) return move.flightEvent;

    const origin = locationCode(move.origin).toUpperCase();
    const destination = locationCode(move.destination).toUpperCase();
    const events = (Array.isArray(appData?.events) ? appData.events : [])
      .filter(event => dateKey(event?.Date) === move.date);

    const ranked = events.map(event => {
      const title = String(event?.Title || '').trim().toUpperCase();
      const category = eventCategory(event);
      let score = 0;
      if (category.includes('flight')) score += 5;
      if (category.includes('travel')) score += 4;
      if (origin && title.includes(origin)) score += 2;
      if (destination && title.includes(destination)) score += 2;
      return { event, score };
    }).sort((a, b) => b.score - a.score);

    return ranked[0]?.score > 0 ? ranked[0].event : null;
  }

  function formatMoveDate(key) {
    const date = parseKey(key);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }

  function compactText(value) {
    return String(value || '')
      .trim()
      .replace(/\s*AM\b/gi, 'a')
      .replace(/\s*PM\b/gi, 'p');
  }

  function compactRange(value) {
    return compactText(value)
      .replace(/\s*(?:→|–|—|-)\s*/g, '–');
  }

  function travelTime(event) {
    const explicit = String(event?.['Travel Time'] || event?.TravelTime || '').trim();
    if (explicit) return explicit;

    const details = String(event?.Details || '');
    const total = details.match(/(?:Total\s+travel|Nonstop)\s+([0-9]+h(?:\s*[0-9]+m)?)/i);
    return total ? total[1].replace(/(\d)h(?=\d)/, '$1h ') : '';
  }

  function legacyFlightPlan(event) {
    const details = String(event?.Details || '');
    const tokens = details.split('·').map(value => value.trim()).filter(Boolean);
    const lines = [];

    for (const token of tokens) {
      if (/^Layover\b/i.test(token)) {
        const match = token.match(/^Layover\s+([A-Z]{3})\s+(.+)$/i);
        if (match) lines.push(`${match[1].toUpperCase()} layover · ${match[2]}`);
        continue;
      }

      const leg = token.match(/^([A-Z0-9]{2,3}\s?\d{2,4})\s+([A-Z]{3})\s*(?:→|->|–>|—>|>)\s*([A-Z]{3})(.*)$/i);
      if (leg) {
        const suffix = compactText(leg[4].trim()).replace(/\s*\([^)]*\)\s*$/, '').trim();
        lines.push(`${leg[1].replace(/\s+/g, '')} · ${leg[2].toUpperCase()} → ${leg[3].toUpperCase()}${suffix ? ` · ${suffix}` : ''}`);
      }
    }

    if (lines.length) return lines;

    const flightNumber = details.match(/\b([A-Z]{2}\s?\d{2,4})\b/i)?.[1]?.replace(/\s+/g, '').toUpperCase() || '';
    if (/\bNonstop\b/i.test(details) && flightNumber) return [`${flightNumber} · Nonstop`];
    return [];
  }

  function flightPlanLines(event) {
    const explicit = String(event?.['Flight Plan'] || event?.FlightPlan || '').trim();
    const lines = explicit
      ? explicit.split(/\n+/).map(line => compactText(line)).filter(Boolean)
      : legacyFlightPlan(event);

    return lines;
  }

  function accommodationSummary(location) {
    const lines = String(location?.Notes || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !/^https?:\/\//i.test(line));

    const preferred = lines.find(line => /^(airbnb|hotel|accommodation|stay)\s*:/i.test(line)) || lines[0] || '';
    return preferred.replace(/^(airbnb|hotel|accommodation|stay)\s*:\s*/i, '').trim() || 'Not added';
  }

  function appendDurationText(element, value) {
    const parts = String(value || '').split(/(\(?(?:\d+h(?:\s+\d+m)?|\d+m)\)?)/gi);
    parts.forEach(part => {
      if (!part) return;
      if (/^\(?(?:\d+h(?:\s+\d+m)?|\d+m)\)?$/i.test(part)) {
        const span = document.createElement('span');
        span.className = 'plan-next-move-duration';
        span.textContent = part;
        element.append(span);
      } else {
        element.append(document.createTextNode(part));
      }
    });
  }

  function detailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'plan-next-move-detail-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'plan-next-move-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'plan-next-move-value';
    appendDurationText(valueEl, value);

    row.append(labelEl, valueEl);
    return row;
  }

  function moveItem(move) {
    const item = document.createElement('div');
    item.className = 'plan-next-move-item';

    const flight = flightForMove(move);
    const top = document.createElement('div');
    top.className = 'plan-next-move-top';

    const date = document.createElement('div');
    date.className = 'plan-next-move-date';
    date.textContent = formatMoveDate(move.date);

    const route = document.createElement('div');
    route.className = 'plan-next-move-route';
    route.textContent = `${locationCode(move.origin) || '—'} → ${locationCode(move.destination) || '—'}`;

    const trip = document.createElement('div');
    trip.className = 'plan-next-move-trip';
    const overallTime = compactRange(flight?.Time || '');
    const duration = travelTime(flight);
    if (overallTime) trip.append(document.createTextNode(overallTime));
    if (duration) {
      if (overallTime) trip.append(document.createTextNode(' '));
      const durationEl = document.createElement('span');
      durationEl.className = 'plan-next-move-duration';
      durationEl.textContent = `(${duration})`;
      trip.append(durationEl);
    }

    top.append(date, route, trip);

    const details = document.createElement('div');
    details.className = 'plan-next-move-details';

    const planLines = flightPlanLines(flight);
    if (planLines.length) {
      details.append(detailRow('Flight', planLines[0]));
      planLines.slice(1).forEach(line => details.append(detailRow('', line)));
    } else {
      details.append(detailRow('Flight', flight ? 'Added' : 'Not added'));
    }

    details.append(detailRow('Stay', accommodationSummary(move.destination)));

    item.append(top, details);
    return item;
  }

  function render() {
    const moves = upcomingMoves();
    card.innerHTML = '';

    if (!moves.length) {
      card.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = 'No upcoming move planned.';
      return;
    }

    moves.forEach(move => card.append(moveItem(move)));
    emptyEl.hidden = true;
    card.hidden = false;
  }

  if (typeof loadAllData === 'function') {
    const existingLoadAllData = loadAllData;
    loadAllData = async function (...args) {
      const result = await existingLoadAllData(...args);
      render();
      return result;
    };
  }

  planTab?.addEventListener('click', () => requestAnimationFrame(render));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });

  render();
})();
