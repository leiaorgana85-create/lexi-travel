(() => {
  function compactClock(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s*AM\b/i, 'a')
      .replace(/\s*PM\b/i, 'p');
  }

  function appendLine(label, text, className) {
    const line = document.createElement('span');
    line.className = className;
    line.textContent = text;
    label.append(line);
    return line;
  }

  function appendTravelTimeLine(label, departure, arrival) {
    const line = appendLine(
      label,
      `${compactClock(departure)}-${compactClock(arrival)}`,
      'day-event-flight-time-line'
    );

    // Keep both flight times on one readable row in narrow iPhone calendar cells.
    // Horizontal condensation affects only this line, not the route or other events.
    line.style.display = 'block';
    line.style.width = '100%';
    line.style.overflow = 'hidden';
    line.style.whiteSpace = 'nowrap';
    line.style.textAlign = 'center';
    line.style.fontSize = '8px';
    line.style.fontWeight = '500';
    line.style.lineHeight = '1.08';
    line.style.letterSpacing = '-0.28px';
    line.style.transform = 'scaleX(0.86)';
    line.style.transformOrigin = 'center center';
  }

  function refreshCalendarEventLabels() {
    document.querySelectorAll('.day-cell').forEach(cell => {
      const dateKey = cell.getAttribute('aria-label');
      if (!dateKey || typeof eventsForDate !== 'function') return;

      const events = eventsForDate(dateKey).slice(0, 2);
      const labels = cell.querySelectorAll('.day-event');

      labels.forEach((label, index) => {
        const event = events[index];
        if (!event) return;

        const title = String(event.Title || event.Category || 'Event').trim();
        const time = String(event.Time || '').trim();
        const category = String(event.Category || '').toLowerCase();
        label.textContent = '';
        label.classList.remove('travel-route');

        const routeMatch = title.match(/^\s*([A-Za-z]{3})\s*[→>-]+\s*([A-Za-z]{3})\s*$/);
        const timeParts = time.split(/\s*→\s*/);

        if ((category.includes('flight') || category.includes('travel')) && routeMatch) {
          const origin = routeMatch[1].toUpperCase();
          const destination = routeMatch[2].toUpperCase();
          label.classList.add('travel-route');
          appendLine(label, `${origin}→${destination}`, 'day-event-flight-line');

          if (timeParts.length === 2) {
            appendTravelTimeLine(label, timeParts[0], timeParts[1]);
          } else if (time) {
            const line = appendLine(label, compactClock(time), 'day-event-flight-time-line');
            line.style.display = 'block';
            line.style.width = '100%';
            line.style.overflow = 'hidden';
            line.style.whiteSpace = 'nowrap';
            line.style.textAlign = 'center';
            line.style.fontSize = '8px';
            line.style.fontWeight = '500';
            line.style.letterSpacing = '-0.28px';
          }
          return;
        }

        const generic = time ? `${compactClock(time)} ${title}` : title;
        appendLine(label, generic, 'day-event-generic-line');
      });
    });
  }

  const observer = new MutationObserver(refreshCalendarEventLabels);
  observer.observe(document.getElementById('calendarGrid'), { childList: true });
  refreshCalendarEventLabels();
})();