(() => {
  const todayBtn = document.getElementById('todayBtn');
  const calendarTab = document.querySelector('.tab[data-view="calendarView"]');
  if (!todayBtn || !calendarTab || typeof renderCalendar !== 'function') return;

  async function goToToday() {
    const today = new Date();
    const todayKey = toDateKey(today);

    calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
    tabs.forEach(tab => tab.classList.toggle('active', tab === calendarTab));
    views.forEach(view => view.classList.toggle('active', view.id === 'calendarView'));

    // Render immediately so the jump works even if the network is unavailable.
    renderCalendar();

    try {
      await loadCalendarData();
    } catch (error) {
      // loadCalendarData already reports connection errors in the Calendar status.
    }

    requestAnimationFrame(() => {
      const todayCell = calendarGrid.querySelector(`.day-cell[aria-label="${todayKey}"]`);
      if (todayCell) todayCell.click();
    });
  }

  todayBtn.addEventListener('click', goToToday);
})();
