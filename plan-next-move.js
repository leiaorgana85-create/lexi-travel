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
      const title = String(event?.Title || '').trim();
      const category = eventCategory(event);
      const text = `${category} ${title}`.toLowerCase();
      let score = 0;
      if (category.includes('flight')) score += 5;
      if (category.includes('travel')) score += 4;
      if (text.includes('flight')) score += 3;
      if (origin && title.toUpperCase().includes(origin)) score += 2;
      if (destination && title.toUpperCase().includes(destination)) score += 2;
      return { event, score };
    }).sort((a, b) => b.score - a.score);

    return ranked[0]?.score > 0 ? ranked[0].event : null;
  }

  function formatMoveDate(key) {
    const date = parseKey(key);
    if (!date) return '';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric'
    }).format(date);
  }

  function compactTime(value) {
    return String(value || '')
      .trim()
      .replace(/\s*AM\b/gi, 'a')
      .replace(/\s*PM\b/gi, 'p')
      .replace(/\s*→\s*/g, ' → ');
  }

  function flightSummary(event, move) {
    if (!event) return 'Not added';

    const time = compactTime(event.Time || '');
    const title = String(event.Title || '').trim();
    const status = String(event.Status || '').trim();
    const origin = locationCode(move.origin).toUpperCase();
    const destination = locationCode(move.destination).toUpperCase();
    const routeOnly = new RegExp(`^\\s*${origin}\\s*[→>-]+\\s*${destination}\\s*$`, 'i').test(title);

    let summary = '';
    if (time && routeOnly) summary = time;
    else if (time && title) summary = `${time} · ${title}`;
    else summary = title || 'Added';

    if (status && !/^planned$/i.test(status)) return `${status} · ${summary}`;
    return summary;
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

  function detailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'plan-next-move-detail-row';

    const labelEl = document.createElement('span');
    labelEl.className = 'plan-next-move-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = 'plan-next-move-value';
    valueEl.textContent = value;

    row.append(labelEl, valueEl);
    return row;
  }

  function moveItem(move) {
    const item = document.createElement('div');
    item.className = 'plan-next-move-item';

    const top = document.createElement('div');
    top.className = 'plan-next-move-top';

    const date = document.createElement('div');
    date.className = 'plan-next-move-date';
    date.textContent = formatMoveDate(move.date);

    const route = document.createElement('div');
    route.className = 'plan-next-move-route';

    const origin = document.createElement('span');
    origin.textContent = locationCode(move.origin) || '—';

    const arrow = document.createElement('span');
    arrow.className = 'plan-next-move-arrow';
    arrow.textContent = '→';
    arrow.setAttribute('aria-hidden', 'true');

    const destination = document.createElement('span');
    destination.textContent = locationCode(move.destination) || '—';

    route.append(origin, arrow, destination);
    top.append(date, route);

    const details = document.createElement('div');
    details.className = 'plan-next-move-details';
    details.append(
      detailRow('Flight', flightSummary(flightForMove(move), move)),
      detailRow('Stay', accommodationSummary(move.destination))
    );

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
