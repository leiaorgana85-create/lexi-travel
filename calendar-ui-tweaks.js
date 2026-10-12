(() => {
  const paneHead = document.querySelector('#dayPane .day-pane-head');
  const summary = paneHead?.querySelector('.day-pane-summary');
  const title = document.getElementById('paneDayTitle');
  const addBtn = document.getElementById('calendarAddEventBtn');
  const syncStatus = document.getElementById('calendarSyncStatus');
  const paneActions = paneHead?.querySelector('.calendar-pane-actions');

  if (!paneHead || !summary || !title || !addBtn || !syncStatus || !paneActions) return;

  // The + belongs with the selected date: [+] Thursday, Oct 15  Busan, South Korea.
  summary.insertBefore(addBtn, title);

  let clearTimer = null;

  function refreshStatus() {
    const text = String(syncStatus.textContent || '').trim();

    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }

    // Do not permanently display a success state; saving/errors remain visible.
    if (/^synced$/i.test(text)) {
      clearTimer = setTimeout(() => {
        syncStatus.textContent = '';
        paneActions.hidden = true;
      }, 650);
      return;
    }

    paneActions.hidden = !text;
  }

  const observer = new MutationObserver(refreshStatus);
  observer.observe(syncStatus, { childList: true, characterData: true, subtree: true });
  refreshStatus();
})();
