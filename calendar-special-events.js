(() => {
  const grid = document.getElementById('calendarGrid');
  if (!grid || typeof eventsForDate !== 'function') return;

  let refreshFrame = 0;

  function categoryOf(event) {
    return String(event?.Category || '').trim().toLowerCase();
  }

  function isSpecialEvent(event) {
    const category = categoryOf(event);
    return category === 'holiday' || category === 'event' || category === 'birthday';
  }

  function compactClock(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s*AM\b/i, 'a')
      .replace(/\s*PM\b/i, 'p');
  }

  function compactAppointmentClock(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s*AM\b/i, 'am')
      .replace(/\s*PM\b/i, 'pm');
  }

  function appendLine(label, text, className) {
    const line = document.createElement('span');
    line.className = className;
    line.textContent = text;
    label.append(line);
  }

  function setEventTone(label, event) {
    label.className = 'day-event';
    const text = `${event?.Category || ''} ${event?.Title || ''}`.toLowerCase();
    if (text.includes('flight') || text.includes('travel')) label.classList.add('travel');
    else if (text.includes('off')) label.classList.add('off');
  }

  function renderRegularLabel(label, event) {
    setEventTone(label, event);
    label.textContent = '';

    const title = String(event?.Title || event?.Category || 'Event').trim();
    const time = String(event?.Time || '').trim();
    const details = String(event?.Details || '').trim();
    const category = categoryOf(event);
    const routeMatch = title.match(/^\s*([A-Za-z]{3})\s*[→>-]+\s*([A-Za-z]{3})\s*$/);
    const timeParts = time.split(/\s*→\s*/);

    if ((category.includes('flight') || category.includes('travel')) && routeMatch) {
      label.classList.add('travel-route');

      if (timeParts.length === 2) {
        appendLine(
          label,
          `${compactClock(timeParts[0])}-${compactClock(timeParts[1])}`,
          'day-event-flight-time-line'
        );
      } else if (time) {
        appendLine(label, compactClock(time), 'day-event-flight-time-line');
      }

      appendLine(
        label,
        `${routeMatch[1].toUpperCase()}→${routeMatch[2].toUpperCase()}`,
        'day-event-flight-line'
      );

      if (details) appendLine(label, details, 'day-event-generic-line');
      return;
    }

    if (category.includes('appointment')) {
      if (time) appendLine(label, compactAppointmentClock(time), 'day-event-generic-line');
      appendLine(label, title, 'day-event-generic-line');
      return;
    }

    appendLine(
      label,
      time ? `${compactClock(time)} ${title}` : title,
      'day-event-generic-line'
    );
  }

  function renderRegularEvents(cell, events) {
    const visible = events.slice(0, 2);
    let labels = [...cell.querySelectorAll('.day-event')];

    while (labels.length < visible.length) {
      const label = document.createElement('span');
      label.className = 'day-event';
      cell.append(label);
      labels.push(label);
    }

    labels.forEach((label, index) => {
      if (index >= visible.length) {
        label.remove();
        return;
      }
      renderRegularLabel(label, visible[index]);
    });

    cell.querySelectorAll('.day-more').forEach(node => node.remove());
    if (events.length > visible.length) {
      const more = document.createElement('div');
      more.className = 'day-more';
      more.textContent = `+${events.length - visible.length} more`;
      cell.append(more);
    }
  }

  function renderSpecialEvent(cell, events) {
    const existing = cell.querySelector('.day-special-event');
    const hasSpecial = events.length > 0;
    cell.classList.toggle('has-special-event', hasSpecial);

    if (!hasSpecial) {
      if (existing) existing.remove();
      return;
    }

    const first = events[0];
    const title = String(first.Title || first.Category || 'Event').trim();
    const text = events.length > 1 ? `${title} +${events.length - 1}` : title;
    const tone = categoryOf(first) === 'holiday' ? 'holiday' : 'event';

    const marker = existing || document.createElement('span');
    marker.className = `day-special-event ${tone}`;
    marker.textContent = text;

    if (!existing) cell.append(marker);
  }

  function refresh() {
    grid.querySelectorAll('.day-cell').forEach(cell => {
      const dateKey = cell.getAttribute('aria-label');
      if (!dateKey) return;

      const allEvents = eventsForDate(dateKey);
      const specialEvents = allEvents.filter(isSpecialEvent);
      const regularEvents = allEvents.filter(event => !isSpecialEvent(event));

      // Rebuild only the timed/regular event rows. Holiday/Event/Birthday never
      // occupy row 2; they are rendered separately at the bottom of the cell.
      renderRegularEvents(cell, regularEvents);
      renderSpecialEvent(cell, specialEvents);
    });
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  // Wait until the normal calendar-label observer has finished, then enforce the
  // bottom-row layout. Observing only direct grid children avoids self-triggering.
  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(grid, { childList: true });

  scheduleRefresh();
})();
