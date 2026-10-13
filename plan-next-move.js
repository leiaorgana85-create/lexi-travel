(() => {
  const section = document.getElementById('planNextMoveSection');
  const card = document.getElementById('planNextMoveCard');
  const originEl = document.getElementById('planNextMoveOrigin');
  const destinationEl = document.getElementById('planNextMoveDestination');
  const dateEl = document.getElementById('planNextMoveDate');
  const flightEl = document.getElementById('planNextMoveFlight');
  const stayEl = document.getElementById('planNextMoveStay');
  const emptyEl = document.getElementById('planNextMoveEmpty');
  const planTab = document.querySelector('.tab[data-view="countryView"]');

  if (!section || !card || !originEl || !destinationEl || !dateEl || !flightEl || !stayEl || !emptyEl) return;

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

  function nextMove() {
    const today = keyForDate(new Date());
    const locations = (Array.isArray(appData?.locations) ? appData.locations : [])
      .filter(location => locationStart(location))
      .slice()
      .sort((a, b) => locationStart(a).localeCompare(locationStart(b)));

    for (const destination of locations) {
      const start = locationStart(destination);
      if (!start || start < today) continue;

      const origin = previousLocationBefore(start, locations);
      if (!origin) continue;
      if (locationIdentity(origin) === locationIdentity(destination)) continue;

      return { origin, destination, date: start };
    }

    return null;
  }

  function eventCategory(event) {
    return String(event?.Category || '').trim().toLowerCase();
  }

  function flightForMove(move) {
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
      weekday: 'short',
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
    const origin = locationCode(move.origin).toUpperCase();
    const destination = locationCode(move.destination).toUpperCase();
    const routeOnly = new RegExp(`^\\s*${origin}\\s*[→>-]+\\s*${destination}\\s*$`, 'i').test(title);

    if (time && routeOnly) return time;
    if (time && title) return `${time} · ${title}`;
    return title || 'Added';
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

  function render() {
    const move = nextMove();

    if (!move) {
      card.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = 'No upcoming move planned.';
      return;
    }

    const flight = flightForMove(move);

    originEl.textContent = locationCode(move.origin) || '—';
    destinationEl.textContent = locationCode(move.destination) || '—';
    dateEl.textContent = formatMoveDate(move.date);
    flightEl.textContent = flightSummary(flight, move);
    stayEl.textContent = accommodationSummary(move.destination);

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
