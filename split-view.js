(() => {
  const paneTitle = document.getElementById('paneDayTitle');
  const paneLocation = document.getElementById('paneDayLocation');
  const paneDetails = document.getElementById('paneDayDetails');
  const grid = document.getElementById('calendarGrid');

  if (!paneTitle || !paneLocation || !paneDetails || !grid) return;

  let selectedDateKey = typeof toDateKey === 'function' ? toDateKey(new Date()) : '';

  function compactDetailText(value) {
    return String(value || '')
      .trim()
      .replace(/\s*→\s*/g, '->')
      .replace(/\s+AM\b/g, 'AM')
      .replace(/\s+PM\b/g, 'PM');
  }

  function addPaneLine(event) {
    const title = compactDetailText(event.Title || event.Category || 'Event');
    const time = compactDetailText(event.Time || '');
    const category = String(event.Category || '').trim();
    const details = String(event.Details || '').trim();
    const className = /flight|travel/i.test(`${category} ${title}`) ? 'travel' : '';

    const row = document.createElement('div');
    row.className = `pane-event${className ? ` ${className}` : ''}`;
    if (event.ID) row.dataset.eventId = event.ID;

    const summary = document.createElement('div');
    summary.className = 'pane-event-summary';
    summary.textContent = [title, time, category].filter(Boolean).join(' ');
    row.append(summary);

    if (details) {
      const detailsEl = document.createElement('div');
      detailsEl.className = 'pane-event-details';
      detailsEl.textContent = details;
      row.append(detailsEl);
    }

    paneDetails.append(row);
  }

  function appendLocationNote(text) {
    const note = document.createElement('div');
    note.className = 'pane-location-note';

    String(text || '').split(/\n+/).map(line => line.trim()).filter(Boolean).forEach(line => {
      const item = document.createElement('div');
      item.className = 'pane-location-note-line';

      if (/^https?:\/\//i.test(line)) {
        const link = document.createElement('a');
        link.href = line;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = line;
        item.append(link);
      } else {
        item.textContent = line;
      }

      note.append(item);
    });

    paneDetails.append(note);
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
      ? [location.City || location.Label || location.Country, location.Country].filter(Boolean).join(', ')
      : '';

    paneDetails.innerHTML = '';

    for (const event of events) {
      addPaneLine(event);
    }

    if (location && location.Notes) {
      appendLocationNote(location.Notes);
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
