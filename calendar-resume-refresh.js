(() => {
  const calendarView = document.getElementById('calendarView');
  const paneDetails = document.getElementById('paneDayDetails');

  if (!calendarView || !paneDetails) return;

  let refreshPromise = null;
  let lastRefreshAt = 0;

  function editorOpen() {
    return Boolean(paneDetails.querySelector('.calendar-event-editor'));
  }

  function calendarVisible() {
    return calendarView.classList.contains('active');
  }

  async function refreshFromGoogle(force = false) {
    if (!localStorage.getItem(KEY_STORAGE)) return;
    if (!calendarVisible() || editorOpen()) return;
    if (refreshPromise) return;
    if (!force && Date.now() - lastRefreshAt < 2000) return;

    lastRefreshAt = Date.now();
    refreshPromise = (async () => {
      try {
        await loadAllData();
      } catch (error) {
        // Keep the cached/local calendar usable if Google is temporarily unavailable.
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  }

  // Returning from Google Sheets (or another app/tab) should pull fresh calendar rows.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshFromGoogle(true);
  });

  window.addEventListener('focus', () => {
    refreshFromGoogle(false);
  });

  // A normal reload of Lexi Travel should also reconcile with Google once the page settles.
  window.addEventListener('pageshow', () => {
    setTimeout(() => refreshFromGoogle(true), 150);
  });
})();
