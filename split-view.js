(() => {
  const paneTitle = document.getElementById('paneDayTitle');
  const paneLocation = document.getElementById('paneDayLocation');
  const paneDetails = document.getElementById('paneDayDetails');
  const grid = document.getElementById('calendarGrid');
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');

  if (!paneTitle || !paneLocation || !paneDetails || !grid) return;

  let selectedDateKey = typeof toDateKey === 'function' ? toDateKey(new Date()) : '';
  let lastRenderedMonthKey = '';
  let userSelectedDate = false;

  function compactDetailText(value) {
    return String(value || '')
      .trim()
      .replace(/\s*→\s*/g, '->')
      .replace(/\s+AM\b/g, 'AM')
      .replace(/\s+PM\b/g, 'PM');
  }

  function calendarEditorOpen() {
    return Boolean(paneDetails.querySelector('.calendar-event-editor'));
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

    const summaryText = document.createElement('span');
    summaryText.className = 'pane-event-summary-text';
    summaryText.textContent = [title, time, category].filter(Boolean).join(' ');
    summary.append(summaryText);

    if (event.ID) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'pane-event-edit';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${title || 'event'}`);
      summary.append(edit);
    }

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

    const lines = String(text || '')
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean);

    const urlIndex = lines.findIndex(line => /^https?:\/\//i.test(line));
    const titleIndex = lines.findIndex(line => !/^https?:\/\//i.test(line));
    const used = new Set();

    if (urlIndex >= 0 && titleIndex >= 0) {
      const first = document.createElement('div');
      first.className = 'pane-location-note-line';
      first.append(document.createTextNode(lines[titleIndex]));
      first.append(document.createTextNode(' · '));

      const link = document.createElement('a');
      link.href = lines[urlIndex];
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Map';
      first.append(link);
      note.append(first);

      used.add(titleIndex);
      used.add(urlIndex);
    }

    lines.forEach((line, index) => {
      if (used.has(index)) return;

      const item = document.createElement('div');
      item.className = 'pane-location-note-line';

      if (/^https?:\/\//i.test(line)) {
        const link = document.createElement('a');
        link.href = line;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = 'Map';
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

  function displayedMonthKey() {
    const firstInMonth = grid.querySelector('.day-cell:not(.other-month)');
    return String(firstInMonth?.getAttribute('aria-label') || '').slice(0, 7);
  }

  function syncSelectionAfterRender() {
    requestAnimationFrame(() => {
      // renderCalendar() rebuilds the grid after Google refreshes. Do not let that
      // observer wipe out a form the user is actively editing.
      if (calendarEditorOpen()) return;

      const monthKey = displayedMonthKey();
      const todayKey = typeof toDateKey === 'function' ? toDateKey(new Date()) : '';
      const todayMonthKey = todayKey.slice(0, 7);
      const monthChanged = Boolean(monthKey && monthKey !== lastRenderedMonthKey);

      let target = null;

      // Until the user deliberately taps a date, today owns the selection whenever
      // the current month is displayed. This prevents other refresh layers from
      // racing in and selecting the first day of the month.
      if (!userSelectedDate && monthKey === todayMonthKey) {
        target = grid.querySelector(`.day-cell:not(.other-month)[aria-label="${todayKey}"]`);
      }

      if (!target && selectedDateKey) {
        target = grid.querySelector(`.day-cell:not(.other-month)[aria-label="${selectedDateKey}"]`);
      }

      if (!target && monthKey === todayMonthKey) {
        target = grid.querySelector(`.day-cell:not(.other-month)[aria-label="${todayKey}"]`);
      }

      if (!target) target = grid.querySelector('.day-cell:not(.other-month)');

      lastRenderedMonthKey = monthKey;
      if (target) renderPane(target.getAttribute('aria-label'));
    });
  }

  grid.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('.day-cell') : null;
    if (target) userSelectedDate = true;
  }, true);

  [prevMonthBtn, nextMonthBtn].filter(Boolean).forEach(button => {
    button.addEventListener('click', () => {
      userSelectedDate = false;
    }, true);
  });

  const observer = new MutationObserver(syncSelectionAfterRender);
  observer.observe(grid, { childList: true });
  syncSelectionAfterRender();
})();
