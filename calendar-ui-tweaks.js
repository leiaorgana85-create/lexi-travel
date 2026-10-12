(() => {
  const paneHead = document.querySelector('#dayPane .day-pane-head');
  const summary = paneHead?.querySelector('.day-pane-summary');
  const paneDetails = document.getElementById('paneDayDetails');
  const title = document.getElementById('paneDayTitle');
  const addBtn = document.getElementById('calendarAddEventBtn');
  const syncStatus = document.getElementById('calendarSyncStatus');
  const paneActions = paneHead?.querySelector('.calendar-pane-actions');

  if (!paneHead || !summary || !paneDetails || !title || !addBtn || !syncStatus || !paneActions) return;

  // Keep primary day actions on the same top row.
  summary.insertBefore(addBtn, title);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.id = 'calendarEditEventBtn';
  editBtn.className = 'calendar-top-edit-btn';
  editBtn.textContent = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit event');
  editBtn.hidden = true;
  summary.insertBefore(editBtn, title.nextSibling);

  let clearTimer = null;
  let chooseTimer = null;

  function eventRows() {
    return [...paneDetails.querySelectorAll('.pane-event[data-event-id]')];
  }

  function clearChooseMode() {
    if (chooseTimer) {
      clearTimeout(chooseTimer);
      chooseTimer = null;
    }
    paneDetails.querySelectorAll('.calendar-edit-choice').forEach(row => {
      row.classList.remove('calendar-edit-choice');
    });
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit event');
  }

  function refreshEditButton() {
    const editorOpen = Boolean(paneDetails.querySelector('.calendar-event-editor'));
    const rows = eventRows();

    if (editorOpen || !rows.length) {
      clearChooseMode();
      editBtn.hidden = true;
      return;
    }

    editBtn.hidden = false;
  }

  editBtn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    const rows = eventRows();
    if (!rows.length) return;

    if (rows.length === 1) {
      clearChooseMode();
      rows[0].click();
      return;
    }

    clearChooseMode();
    rows.forEach(row => row.classList.add('calendar-edit-choice'));
    editBtn.textContent = 'Choose';
    editBtn.setAttribute('aria-label', 'Choose an event to edit');

    chooseTimer = setTimeout(() => {
      clearChooseMode();
    }, 5000);
  });

  paneDetails.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.pane-event[data-event-id]')) {
      clearChooseMode();
    }
  }, true);

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

  const statusObserver = new MutationObserver(refreshStatus);
  statusObserver.observe(syncStatus, { childList: true, characterData: true, subtree: true });

  const paneObserver = new MutationObserver(refreshEditButton);
  paneObserver.observe(paneDetails, { childList: true, subtree: true });

  refreshStatus();
  refreshEditButton();
})();
