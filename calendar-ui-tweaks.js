(() => {
  const paneHead = document.querySelector('#dayPane .day-pane-head');
  const summary = paneHead?.querySelector('.day-pane-summary');
  const paneDetails = document.getElementById('paneDayDetails');
  const title = document.getElementById('paneDayTitle');
  const location = document.getElementById('paneDayLocation');
  const addBtn = document.getElementById('calendarAddEventBtn');
  const syncStatus = document.getElementById('calendarSyncStatus');
  const paneActions = paneHead?.querySelector('.calendar-pane-actions');

  if (!paneHead || !summary || !paneDetails || !title || !location || !addBtn || !syncStatus || !paneActions) return;

  const CATEGORY_OPTIONS = ['Appointment', 'Event', 'Holiday', 'To Do'];

  function eventById(id) {
    return (Array.isArray(appData?.events) ? appData.events : [])
      .find(item => String(item?.ID || '') === String(id || '')) || null;
  }

  function isFlightEvent(event) {
    const category = String(event?.Category || '').trim().toLowerCase();
    return category === 'flight' || category === 'travel';
  }

  function protectFlightRows() {
    paneDetails.querySelectorAll('.pane-event[data-event-id]').forEach(row => {
      const id = row.dataset.eventId || '';
      const flight = eventById(id);
      if (!isFlightEvent(flight)) return;

      row.classList.add('calendar-flight-readonly');
      row.removeAttribute('data-event-id');
      row.querySelector('.pane-event-edit')?.remove();
    });
  }

  function upgradeCategoryField() {
    const input = paneDetails.querySelector('.calendar-event-editor input[name="category"]');
    if (!(input instanceof HTMLInputElement)) return;

    const select = document.createElement('select');
    select.name = 'category';
    select.setAttribute('aria-label', 'Category');

    CATEGORY_OPTIONS.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });

    const current = String(input.value || '').trim();
    select.value = CATEGORY_OPTIONS.includes(current) ? current : 'Appointment';
    input.replaceWith(select);
  }

  function enforceCalendarRules() {
    protectFlightRows();
    upgradeCategoryField();
  }

  // Keep + before the date, and Edit at the far right after the location.
  summary.insertBefore(addBtn, title);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.id = 'calendarEditEventBtn';
  editBtn.className = 'calendar-top-edit-btn';
  editBtn.textContent = 'Edit';
  editBtn.setAttribute('aria-label', 'Edit event');
  editBtn.hidden = true;
  summary.append(editBtn);

  let clearTimer = null;
  let choosingEvent = false;

  function eventRows() {
    return [...paneDetails.querySelectorAll('.pane-event[data-event-id]')];
  }

  function clearChooseMode() {
    choosingEvent = false;
    paneDetails.querySelectorAll('.calendar-edit-choice').forEach(row => {
      row.classList.remove('calendar-edit-choice');
    });
    editBtn.textContent = 'Edit';
    editBtn.setAttribute('aria-label', 'Edit event');
  }

  function refreshEditButton() {
    enforceCalendarRules();

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
      const id = rows[0].dataset.eventId || '';
      if (id && typeof window.lexiCalendarEditEvent === 'function') {
        window.lexiCalendarEditEvent(id);
      }
      return;
    }

    choosingEvent = true;
    rows.forEach(row => row.classList.add('calendar-edit-choice'));
    editBtn.textContent = 'Choose';
    editBtn.setAttribute('aria-label', 'Choose an event to edit');
  });

  paneDetails.addEventListener('click', event => {
    if (!choosingEvent) return;

    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest('.pane-event[data-event-id]');
    if (!row) return;

    const id = row.dataset.eventId || '';
    clearChooseMode();

    if (id && typeof window.lexiCalendarEditEvent === 'function') {
      event.preventDefault();
      event.stopPropagation();
      window.lexiCalendarEditEvent(id);
    }
  }, true);

  function refreshStatus() {
    const text = String(syncStatus.textContent || '').trim();

    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }

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
