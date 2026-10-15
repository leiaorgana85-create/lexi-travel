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

  const CATEGORY_OPTIONS = ['Appointment', 'Event', 'Holiday', 'Time Off', 'To Do'];
  const ICONS = {
    add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    delete: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'
  };

  function setIcon(button, name, label) {
    button.innerHTML = ICONS[name] || '';
    button.setAttribute('aria-label', label);
    button.title = label;
  }

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

  function hideLinkField() {
    const input = paneDetails.querySelector('.calendar-event-editor input[name="link"]');
    if (!(input instanceof HTMLInputElement)) return;

    const form = input.closest('form');
    const wrapper = input.closest('.calendar-editor-field');
    if (!(form instanceof HTMLFormElement) || !wrapper) return;

    input.type = 'hidden';
    input.removeAttribute('placeholder');
    form.append(input);
    wrapper.remove();
  }

  function enforceCalendarRules() {
    protectFlightRows();
    upgradeCategoryField();
    hideLinkField();
  }

  const topActions = document.createElement('div');
  topActions.className = 'calendar-top-actions';
  topActions.setAttribute('aria-label', 'Calendar actions');

  addBtn.classList.add('calendar-top-action-btn');
  setIcon(addBtn, 'add', 'Add event');

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.id = 'calendarEditEventBtn';
  editBtn.className = 'calendar-top-action-btn';
  setIcon(editBtn, 'edit', 'Edit event or to-do');
  editBtn.hidden = true;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.id = 'calendarDeleteEventBtn';
  deleteBtn.className = 'calendar-top-action-btn danger';
  setIcon(deleteBtn, 'delete', 'Delete event or to-do');
  deleteBtn.hidden = true;

  topActions.append(addBtn, editBtn, deleteBtn);
  summary.append(topActions);

  let clearTimer = null;
  let choosingAction = '';

  function editableRows() {
    return [...paneDetails.querySelectorAll(
      '.pane-event[data-event-id], .pane-plan-todo[data-plan-id]'
    )];
  }

  function editRow(row) {
    const planId = row?.dataset?.planId || '';
    if (planId) {
      const planEdit = row.querySelector('.pane-event-edit');
      if (planEdit instanceof HTMLElement) planEdit.click();
      return;
    }

    const id = row?.dataset?.eventId || '';
    if (id && typeof window.lexiCalendarEditEvent === 'function') {
      window.lexiCalendarEditEvent(id);
    }
  }

  function deleteRow(row) {
    const planId = row?.dataset?.planId || '';
    const eventId = row?.dataset?.eventId || '';

    if (planId) {
      const planEdit = row.querySelector('.pane-event-edit');
      if (planEdit instanceof HTMLElement) planEdit.click();
    } else if (eventId && typeof window.lexiCalendarEditEvent === 'function') {
      window.lexiCalendarEditEvent(eventId);
    } else {
      return;
    }

    requestAnimationFrame(() => {
      const editor = paneDetails.querySelector('.calendar-event-editor');
      const editorDelete = editor?.querySelector('.calendar-editor-btn.danger');
      if (!(editorDelete instanceof HTMLButtonElement)) return;

      editorDelete.click();

      // The existing delete handlers own confirmation, local state and backend sync.
      // If deletion is cancelled (or still syncing), return to the selected-day pane.
      setTimeout(() => {
        if (!editor?.isConnected) return;
        const cancel = [...editor.querySelectorAll('.calendar-editor-btn')]
          .find(button => String(button.textContent || '').trim() === 'Cancel');
        if (cancel instanceof HTMLButtonElement) cancel.click();
      }, 0);
    });
  }

  function clearChooseMode() {
    choosingAction = '';
    paneDetails.querySelectorAll('.calendar-edit-choice').forEach(row => {
      row.classList.remove('calendar-edit-choice');
    });
    editBtn.classList.remove('active');
    deleteBtn.classList.remove('active');
    setIcon(editBtn, 'edit', 'Edit event or to-do');
    setIcon(deleteBtn, 'delete', 'Delete event or to-do');
  }

  function chooseAction(action) {
    const rows = editableRows();
    if (!rows.length) return;

    if (rows.length === 1) {
      clearChooseMode();
      if (action === 'delete') deleteRow(rows[0]);
      else editRow(rows[0]);
      return;
    }

    clearChooseMode();
    choosingAction = action;
    rows.forEach(row => row.classList.add('calendar-edit-choice'));

    const button = action === 'delete' ? deleteBtn : editBtn;
    button.classList.add('active');
    button.setAttribute('aria-label', `Choose an item to ${action}`);
    button.title = `Choose an item to ${action}`;
  }

  function refreshActionButtons() {
    enforceCalendarRules();

    const editorOpen = Boolean(paneDetails.querySelector('.calendar-event-editor'));
    const rows = editableRows();

    if (editorOpen) {
      clearChooseMode();
      topActions.hidden = true;
      return;
    }

    topActions.hidden = false;
    editBtn.hidden = !rows.length;
    deleteBtn.hidden = !rows.length;
    if (!rows.length) clearChooseMode();
  }

  editBtn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    chooseAction('edit');
  });

  deleteBtn.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    chooseAction('delete');
  });

  paneDetails.addEventListener('click', event => {
    if (!choosingAction) return;

    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest('.pane-event[data-event-id], .pane-plan-todo[data-plan-id]');
    if (!row) return;

    const action = choosingAction;
    clearChooseMode();
    event.preventDefault();
    event.stopPropagation();

    if (action === 'delete') deleteRow(row);
    else editRow(row);
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

  const paneObserver = new MutationObserver(refreshActionButtons);
  paneObserver.observe(paneDetails, { childList: true, subtree: true });

  refreshStatus();
  refreshActionButtons();
})();
