(() => {
  function compactTime(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s+(AM|PM)\b/gi, '$1');
  }

  function appendLine(label, text, className) {
    const line = document.createElement('span');
    line.className = className;
    line.textContent = text;
    label.append(line);
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

        const routeMatch = title.match(/^\s*([A-Za-z]{3})\s*[→>-]+\s*([A-Za-z]{3})\s*$/);
        const timeParts = time.split(/\s*→\s*/);

        if (category.includes('flight') && routeMatch) {
          const origin = routeMatch[1].toUpperCase();
          const destination = routeMatch[2].toUpperCase();
          label.classList.add('travel-route');
          appendLine(label, `${origin}→${destination}`, 'day-event-flight-line');

          if (timeParts[0]) {
            appendLine(label, compactTime(timeParts[0]), 'day-event-flight-line');
          }

          if (timeParts[1]) {
            appendLine(label, compactTime(timeParts[1]), 'day-event-flight-line');
          }
          return;
        }

        label.classList.remove('travel-route');

        if (time) {
          appendLine(label, compactTime(time), 'day-event-time');
        }

        appendLine(label, title, 'day-event-title');
      });
    });
  }

  const observer = new MutationObserver(refreshCalendarEventLabels);
  observer.observe(document.getElementById('calendarGrid'), { childList: true });
  refreshCalendarEventLabels();
})();
