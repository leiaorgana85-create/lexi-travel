(() => {
  const paneTitle = document.getElementById('paneDayTitle');
  const paneLocation = document.getElementById('paneDayLocation');
  const paneDetails = document.getElementById('paneDayDetails');
  const grid = document.getElementById('calendarGrid');

  if (!paneTitle || !paneLocation || !paneDetails || !grid) return;

  let selectedDateKey = typeof toDateKey === 'function' ? toDateKey(new Date()) : '';

  function addPaneLine(title, meta, details, className = '') {
    const row = document.createElement('div');
    row.className = `pane-event${className ? ` ${className}` : ''}`;

    const strong = document.createElement('div');
    strong.className = 'pane-event-title';
    strong.textContent = title;
    row.append(strong);

    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'pane-event-meta';
      metaEl.textContent = meta;
      row.append(metaEl);
    }

    if (details) {
      const detailsEl = document.createElement('div');
      detailsEl.className = 'pane-event-details';
      detailsEl.textContent = details;
      row.append(detailsEl);
    }

    paneDetails.append(row);
  }

  function renderPane(dateKey) {
    if (!dateKey || typeof locationForDate !== 'function' || typeof eventsForDate !== 'function') return;

    selectedDateKey = dateKey;
    const location = locationForDate(dateKey);
    const events = eventsForDate(dateKey);
    const date = parseDateKey(dateKey);

    paneTitle.textContent = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    }).format(date);

    paneLocation.textContent = location
      ? [location.Label || location.City || location.Country, location.Country].filter(Boolean).join(' · ')
      : '';

    paneDetails.innerHTML = '';

    if (location && location.Notes) {
      const note = document.createElement('div');
      note.className = 'pane-location-note';
      note.textContent = location.Notes;
      paneDetails.append(note);
    }

    for (const event of events) {
      const title = event.Title || event.Category || 'Event';
      const category = String(event.Category || '').trim();
      const meta = [event.Time, category, event.Status].filter(Boolean).join(' · ');
      const details = event.Details || '';
      const className = /flight|travel/i.test(`${category} ${title}`) ? 'travel' : '';
      addPaneLine(title, meta, details, className);
    }

    if (!location && events.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'pane-empty';
      empty.textContent = 'No entries for this day.';
      paneDetails.append(empty);
    }

    document.querySelectorAll('.day-cell').forEach(cell => {
      cell.classList.toggle('selected-day', cell.getAttribute('aria-label') === dateKey);
    });
  }

  openDay = renderPane;

  function syncSelectionAfterRender() {
    requestAnimationFrame(() => {
      let target = grid.querySelector(`.day-cell[aria-label="${selectedDateKey}"]`);
      if (!target) target = grid.querySelector('.day-cell:not(.other-month)');
      if (target) renderPane(target.getAttribute('aria-label'));
    });
  }

  const observer = new MutationObserver(syncSelectionAfterRender);
  observer.observe(grid, { childList: true });
  syncSelectionAfterRender();
})();
