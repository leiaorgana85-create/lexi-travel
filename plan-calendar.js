(() => {
  const STORAGE_KEY = 'lexiTravelMonthlyPlanV1';
  const DELETE_STORAGE_KEY = 'lexiTravelMonthlyPlanDeletedV1';
  const grid = document.getElementById('calendarGrid');
  const paneDetails = document.getElementById('paneDayDetails');
  if (!grid) return;

  let refreshFrame = 0;

  function readObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeObject(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function readPlan() {
    return readObject(STORAGE_KEY);
  }

  function writePlan(data) {
    writeObject(STORAGE_KEY, data);
    document.dispatchEvent(new CustomEvent('lexi-plan-change'));
  }

  function readDeleted() {
    return readObject(DELETE_STORAGE_KEY);
  }

  function writeDeleted(data) {
    writeObject(DELETE_STORAGE_KEY, data);
  }

  function itemsForDate(dateKey) {
    if (typeof window.lexiPlanItemsForDate !== 'function') return [];
    const items = window.lexiPlanItemsForDate(dateKey);
    return Array.isArray(items) ? items : [];
  }

  function markerText(items) {
    const title = String(items[0]?.text || 'To Do').trim();
    return items.length > 1
      ? `${title} +${items.length - 1}`
      : title;
  }

  function renderCell(cell) {
    const dateKey = cell.getAttribute('aria-label');
    if (!dateKey) return;

    const items = itemsForDate(dateKey);
    const existing = cell.querySelector('.day-plan-todo');
    const hasItems = items.length > 0;
    cell.classList.toggle('has-plan-todo', hasItems);

    if (!hasItems) {
      if (existing) existing.remove();
      return;
    }

    const marker = existing || document.createElement('span');
    marker.className = `day-plan-todo${items[0]?.done ? ' done' : ''}`;
    marker.textContent = markerText(items);
    marker.setAttribute('aria-label', `${items.length} to-do${items.length === 1 ? '' : 's'} due ${dateKey}`);

    if (!existing) cell.append(marker);
  }

  function refreshCells() {
    grid.querySelectorAll('.day-cell').forEach(renderCell);
  }

  function selectedDateKey() {
    const selected = grid.querySelector('.day-cell.selected-day');
    return selected?.getAttribute('aria-label') || '';
  }

  function closeTodoEditor(dateKey) {
    if (dateKey && typeof openDay === 'function') openDay(dateKey);
    requestAnimationFrame(renderPane);
  }

  async function postPlanUpsert(item, month) {
    if (typeof KEY_STORAGE === 'undefined' || typeof API_URL === 'undefined') return false;
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) return false;

    const body = new URLSearchParams({
      key,
      action: 'planUpsert',
      id: String(item.id || ''),
      month: String(month || ''),
      text: String(item.text || ''),
      dueDate: String(item.dueDate || ''),
      completed: String(Boolean(item.done)).toLowerCase()
    });

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body,
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return Boolean(data?.ok);
    } catch (error) {
      return false;
    }
  }

  async function postPlanDelete(id) {
    if (typeof KEY_STORAGE === 'undefined' || typeof API_URL === 'undefined') return false;
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) return false;

    const body = new URLSearchParams({
      key,
      action: 'planDelete',
      id: String(id || '')
    });

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body,
        cache: 'no-store',
        redirect: 'follow'
      });
      if (!response.ok) return false;
      const data = await response.json();
      return Boolean(data?.ok);
    } catch (error) {
      return false;
    }
  }

  function findStoredItem(item) {
    const data = readPlan();
    const month = String(item?.month || item?.dueDate || '').slice(0, 7);
    const items = Array.isArray(data[month]) ? data[month] : [];
    const stored = items.find(candidate => String(candidate?.id || '') === String(item?.id || ''));
    return { data, month, items, stored };
  }

  function markSynced(month, id, snapshot) {
    const data = readPlan();
    const items = Array.isArray(data[month]) ? data[month] : [];
    let changed = false;

    data[month] = items.map(item => {
      if (String(item?.id || '') !== String(id)) return item;
      if (
        String(item?.text || '') !== snapshot.text ||
        String(item?.dueDate || '') !== snapshot.dueDate ||
        Boolean(item?.done) !== snapshot.done
      ) return item;
      changed = true;
      return { ...item, _dirty: false };
    });

    if (changed) writePlan(data);
  }

  async function saveTodoEdit(item, text, dueDate) {
    const cleanText = String(text || '').trim();
    const cleanDate = String(dueDate || '').trim();
    if (!cleanText || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) return false;

    const found = findStoredItem(item);
    if (!found.stored) return false;

    const targetMonth = cleanDate.slice(0, 7);
    const updated = {
      ...found.stored,
      text: cleanText,
      dueDate: cleanDate,
      _dirty: true
    };

    found.data[found.month] = found.items.filter(candidate =>
      String(candidate?.id || '') !== String(item.id)
    );

    const targetItems = targetMonth === found.month
      ? found.data[found.month]
      : (Array.isArray(found.data[targetMonth]) ? found.data[targetMonth] : []);

    targetItems.push(updated);
    found.data[targetMonth] = targetItems;
    writePlan(found.data);

    const snapshot = {
      text: cleanText,
      dueDate: cleanDate,
      done: Boolean(updated.done)
    };

    if (await postPlanUpsert(updated, targetMonth)) {
      markSynced(targetMonth, item.id, snapshot);
    }

    return true;
  }

  async function deleteTodo(item, dateKey) {
    const id = String(item?.id || '');
    if (!id) return false;
    if (!window.confirm(`Delete “${item?.text || 'this to-do'}”?`)) return false;

    const found = findStoredItem(item);
    if (!found.stored) return false;

    found.data[found.month] = found.items.filter(candidate =>
      String(candidate?.id || '') !== id
    );
    writePlan(found.data);

    const deleted = readDeleted();
    deleted[id] = found.month;
    writeDeleted(deleted);

    if (await postPlanDelete(id)) {
      const latestDeleted = readDeleted();
      if (latestDeleted[id]) {
        delete latestDeleted[id];
        writeDeleted(latestDeleted);
      }
    }

    closeTodoEditor(dateKey);
    return true;
  }

  function openTodoEditor(item) {
    if (!paneDetails) return;

    const dateKey = selectedDateKey();
    const form = document.createElement('form');
    form.className = 'calendar-event-editor calendar-plan-editor';
    form.noValidate = true;

    const heading = document.createElement('div');
    heading.className = 'calendar-editor-title';
    heading.textContent = 'Edit to-do';

    const textLabel = document.createElement('label');
    textLabel.className = 'calendar-editor-field';
    const textCaption = document.createElement('span');
    textCaption.textContent = 'To Do';
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = String(item?.text || '');
    textInput.required = true;
    textInput.autocomplete = 'off';
    textLabel.append(textCaption, textInput);

    const dateLabel = document.createElement('label');
    dateLabel.className = 'calendar-editor-field';
    const dateCaption = document.createElement('span');
    dateCaption.textContent = 'Date';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = String(item?.dueDate || dateKey || '');
    dateInput.required = true;
    dateLabel.append(dateCaption, dateInput);

    const actions = document.createElement('div');
    actions.className = 'calendar-editor-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'calendar-editor-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      deleteBtn.disabled = true;
      const deleted = await deleteTodo(item, dateKey);
      if (!deleted) deleteBtn.disabled = false;
    });

    const spacer = document.createElement('span');
    spacer.className = 'calendar-editor-spacer';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'calendar-editor-btn';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => closeTodoEditor(dateKey));

    const save = document.createElement('button');
    save.type = 'submit';
    save.className = 'calendar-editor-btn primary';
    save.textContent = 'Save';

    actions.append(deleteBtn, spacer, cancel, save);
    form.append(heading, textLabel, dateLabel, actions);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      const saved = await saveTodoEdit(item, textInput.value, dateInput.value);
      save.disabled = false;
      if (!saved) {
        textInput.focus();
        return;
      }
      closeTodoEditor(dateKey);
    });

    paneDetails.innerHTML = '';
    paneDetails.append(form);
    requestAnimationFrame(() => textInput.focus());
  }

  function renderPane() {
    if (!paneDetails || paneDetails.querySelector('.calendar-event-editor')) return;

    paneDetails.querySelectorAll('.pane-plan-todo').forEach(node => node.remove());

    const dateKey = selectedDateKey();
    const empty = paneDetails.querySelector('.pane-empty');

    if (!dateKey) {
      if (empty) empty.style.display = '';
      return;
    }

    const items = itemsForDate(dateKey);
    if (empty) empty.style.display = items.length ? 'none' : '';
    if (!items.length) return;

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `pane-event pane-plan-todo${item.done ? ' done' : ''}`;
      row.dataset.planId = String(item.id || '');

      const summary = document.createElement('div');
      summary.className = 'pane-event-summary';

      const text = document.createElement('span');
      text.className = 'pane-event-summary-text';
      text.textContent = item.text || 'To Do';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'pane-event-edit';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${item.text || 'to-do'}`);
      edit.addEventListener('click', event => {
        event.stopPropagation();
        openTodoEditor(item);
      });

      summary.append(text, edit);
      row.append(summary);
      paneDetails.append(row);
    });
  }

  function refreshAll() {
    refreshCells();
    renderPane();
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refreshAll();
    });
  }

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(grid, { childList: true });

  grid.addEventListener('click', event => {
    if (event.target.closest('.day-cell')) {
      requestAnimationFrame(renderPane);
    }
  });

  document.addEventListener('lexi-plan-change', scheduleRefresh);
  window.addEventListener('focus', scheduleRefresh);

  scheduleRefresh();
})();
