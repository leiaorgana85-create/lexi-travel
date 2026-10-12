(() => {
  function refreshCalendarEventLabels() {
    document.querySelectorAll('.day-cell').forEach(cell => {
      const dateKey = cell.getAttribute('aria-label');
      if (!dateKey || typeof eventsForDate !== 'function') return;

      const events = eventsForDate(dateKey).slice(0, 2);
      const labels = cell.querySelectorAll('.day-event');

      labels.forEach((label, index) => {
        const event = events[index];
        if (!event) return;

        const title = event.Title || event.Category || 'Event';
        const time = String(event.Time || '').trim();

        label.textContent = '';

        if (time) {
          const timeLine = document.createElement('span');
          timeLine.className = 'day-event-time';
          timeLine.textContent = time;
          label.append(timeLine);
        }

        const titleLine = document.createElement('span');
        titleLine.className = 'day-event-title';
        titleLine.textContent = title;
        label.append(titleLine);
      });
    });
  }

  const observer = new MutationObserver(refreshCalendarEventLabels);
  observer.observe(document.getElementById('calendarGrid'), { childList: true });
  refreshCalendarEventLabels();
})();
