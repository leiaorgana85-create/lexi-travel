(() => {
  const grid = document.getElementById('calendarGrid');
  if (!grid || typeof eventsForDate !== 'function') return;

  function compactClock(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s*AM\b/i, 'a')
      .replace(/\s*PM\b/i, 'p');
  }

  function travelRoute(event) {
    const title = String(event?.Title || '').trim();
    const category = String(event?.Category || '').toLowerCase();
    if (!category.includes('flight') && !category.includes('travel')) return '';

    const match = title.match(/^\s*([A-Za-z]{3})\s*[→>-]+\s*([A-Za-z]{3})\s*$/);
    return match ? `${match[1].toUpperCase()}→${match[2].toUpperCase()}` : title;
  }

  function normalSummary(event) {
    const title = String(event?.Title || event?.Category || 'Event').trim();
    const time = compactClock(event?.Time || '');
    return time ? `${time} ${title}` : title;
  }

  function travelTime(event) {
    const time = String(event?.Time || '').trim();
    if (!time) return '';

    const parts = time.split(/\s*→\s*/);
    if (parts.length === 2) {
      return `${compactClock(parts[0])}-${compactClock(parts[1])}`;
    }

    return compactClock(time);
  }

  function makeRow(text, className = '') {
    const row = document.createElement('span');
    row.className = `calendar-content-row${className ? ` ${className}` : ''}`;
    row.textContent = text;
    return row;
  }

  function singleEventRows(event) {
    const rows = [];
    const route = travelRoute(event);

    if (route) {
      rows.push(makeRow(route, 'travel-route-row'));

      const time = travelTime(event);
      if (time) rows.push(makeRow(time, 'travel-time-row'));

      const details = String(event?.Details || '').trim();
      if (details && rows.length < 3) {
        rows.push(makeRow(details, 'calendar-detail-row'));
      } else if (event?.Status && rows.length < 3) {
        rows.push(makeRow(String(event.Status), 'calendar-meta-row'));
      }

      return rows.slice(0, 3);
    }

    rows.push(makeRow(normalSummary(event), 'calendar-primary-row'));

    const details = String(event?.Details || '').trim();
    if (details) rows.push(makeRow(details, 'calendar-detail-row'));

    const meta = [event?.Category, event?.Status]
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(' · ');

    if (meta && rows.length < 3) rows.push(makeRow(meta, 'calendar-meta-row'));

    return rows.slice(0, 3);
  }

  function multiEventRows(events) {
    const rows = [];
    const visible = events.length > 3 ? events.slice(0, 2) : events.slice(0, 3);

    visible.forEach(event => {
      const route = travelRoute(event);
      rows.push(makeRow(route || normalSummary(event), route ? 'travel-route-row' : 'calendar-primary-row'));
    });

    if (events.length > visible.length) {
      rows.push(makeRow(`+${events.length - visible.length} more`, 'calendar-more-row'));
    }

    return rows.slice(0, 3);
  }

  function renderCell(cell) {
    const dateKey = cell.getAttribute('aria-label');
    if (!dateKey) return;

    cell.querySelectorAll('.day-event, .day-more, .calendar-content-rows').forEach(node => node.remove());

    const events = eventsForDate(dateKey);
    if (!events.length) return;

    const content = document.createElement('div');
    content.className = 'calendar-content-rows';

    const rows = events.length === 1 ? singleEventRows(events[0]) : multiEventRows(events);
    rows.forEach(row => content.append(row));
    cell.append(content);
  }

  function refresh() {
    grid.querySelectorAll('.day-cell').forEach(renderCell);
  }

  const observer = new MutationObserver(refresh);
  observer.observe(grid, { childList: true });
  refresh();
})();
