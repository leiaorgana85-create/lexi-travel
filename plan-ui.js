(() => {
  const STORAGE_KEY = 'lexiTravelMonthlyPlanV1';
  const DELETE_STORAGE_KEY = 'lexiTravelMonthlyPlanDeletedV1';
  const CALENDAR_CACHE_STORAGE_KEY = 'lexiTravelCalendarCacheV1';
  const EVENT_DRAFT_STORAGE_KEY = 'lexiTravelEventDraftsV1';
  const planView = document.getElementById('countryView');
  const planTab = document.querySelector('.tab[data-view="countryView"]');
  const monthLabel = document.getElementById('planMonthLabel');
  const prevBtn = document.getElementById('planPrevMonthBtn');
  const nextBtn = document.getElementById('planNextMonthBtn');
  const list = document.getElementById('planChecklist');
  const addBtn = document.getElementById('planAddBtn');
  const addRow = document.getElementById('planAddRow');
  const input = document.getElementById('planAddInput');
  const dateInput = document.getElementById('planAddDate');
  const saveBtn = document.getElementById('planAddSaveBtn');
  const cancelBtn = document.getElementById('planAddCancelBtn');
  const convertWrap = document.getElementById('planConvertWrap');
  const convertTime = document.getElementById('planConvertTime');
  const convertBtn = document.getElementById('planConvertAppointmentBtn');
  const convertStatus = document.getElementById('planConvertStatus');

  if (!planView || !monthLabel || !prevBtn || !nextBtn || !list || !addBtn || !addRow || !input || !dateInput || !saveBtn || !cancelBtn || !convertWrap || !convertTime || !convertBtn || !convertStatus) return;

  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  let syncCapability = null;
  let capabilityPromise = null;
  let editingId = '';
  let editingMonth = '';
  const refreshPromises = new Map();
  const syncStateByMonth = new Map();

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthTitle(date) {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
  }

  function normalizeDueDate(value) {
    const text = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function dateFromMonthKey(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, 1);
  }

  function formatDueDate(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }

  function splitAppointmentText(value) {
    const clean = String(value || '').trim();
    const match = clean.match(/^(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm|a|p)?)\s*·\s*(.+)$/);
    if (!match) return { title: clean, time: '' };
    return { title: match[2].trim(), time: match[1].trim() };
  }

  function sortedItems(items) {
    return items.slice().sort((a, b) => {
      const aDate = normalizeDueDate(a?.dueDate);
      const bDate = normalizeDueDate(b?.dueDate);

      if (aDate && bDate) {
        const dateOrder = aDate.localeCompare(bDate);
        if (dateOrder) return dateOrder;
        return String(a?.text || '').localeCompare(String(b?.text || ''));
      }

      if (aDate) return -1;
      if (bDate) return 1;
      return 0;
    });
  }

  function announceChange() {
    document.dispatchEvent(new CustomEvent('lexi-plan-change'));
  }

  function readObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeObject(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readAll() {
    return readObject(STORAGE_KEY);
  }

  function writeAll(data) {
    writeObject(STORAGE_KEY, data);
  }

  function readDeleted() {
    return readObject(DELETE_STORAGE_KEY);
  }

  function writeDeleted(data) {
    writeObject(DELETE_STORAGE_KEY, data);
  }

  function itemsForMonth(key) {
    const data = readAll();
    const items = data[key];
    return Array.isArray(items) ? items : [];
  }

  function itemsForCurrentMonth() {
    return itemsForMonth(monthKey(cursor));
  }

  function writeMonth(key, items) {
    const data = readAll();
    data[key] = items;
    writeAll(data);
    announceChange();
  }

  function writeCurrentMonth(items) {
    writeMonth(monthKey(cursor), items);
  }

  function setSyncState(month, state) {
    syncStateByMonth.set(month, state);
    if (month === monthKey(cursor)) render();
  }

  function currentIndex(items, id) {
    const index = items.findIndex(item => String(item.id) === String(id));
    return index >= 0 ? index : items.length;
  }

  function publicItem(item, month) {
    return {
      id: String(item?.id || ''),
      month: String(month || ''),
      text: String(item?.text || ''),
      dueDate: normalizeDueDate(item?.dueDate),
      done: Boolean(item?.done)
    };
  }

  window.lexiPlanItemsForDate = dateKey => {
    const date = String(dateKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const month = date.slice(0, 7);
    return sortedItems(itemsForMonth(month))
      .filter(item => normalizeDueDate(item.dueDate) === date)
      .map(item => publicItem(item, month));
  };

  async function postAction(action, fields = {}) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) throw new Error('Not connected');

    const body = new URLSearchParams({
      key,
      action,
      ...Object.fromEntries(
        Object.entries(fields).map(([name, value]) => [name, value == null ? '' : String(value)])
      )
    });

    const response = await fetch(API_URL, {
      method: 'POST',
      body,
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Plan sync failed');
    return data;
  }

  async function ensureSyncCapability(force = false) {
    if (!localStorage.getItem(KEY_STORAGE)) return false;
    if (!force && syncCapability !== null) return syncCapability;
    if (!force && capabilityPromise) return capabilityPromise;

    capabilityPromise = (async () => {
      try {
        const data = await postAction('planCapabilities');
        syncCapability = Boolean(data.planWrite);
        return syncCapability;
      } catch (error) {
        // A transient network/API failure must remain retryable. Do not cache it as
        // a durable "no Plan support" result or later refreshes can look empty.
        syncCapability = null;
        return false;
      } finally {
        capabilityPromise = null;
      }
    })();

    return capabilityPromise;
  }

  function remoteItemToLocal(item) {
    return {
      id: String(item.ID || ''),
      text: String(item.Text || ''),
      dueDate: normalizeDueDate(item['Due Date']),
      done: item.Completed === true || String(item.Completed || '').toLowerCase() === 'true',
      _dirty: false
    };
  }

  async function syncUpsert(month, id) {
    if (!await ensureSyncCapability()) {
      setSyncState(month, 'write-error');
      return false;
    }

    const items = itemsForMonth(month);
    const item = items.find(candidate => String(candidate.id) === String(id));
    if (!item) return false;

    const snapshot = {
      text: String(item.text || ''),
      dueDate: normalizeDueDate(item.dueDate),
      done: Boolean(item.done)
    };

    try {
      await postAction('planUpsert', {
        id: item.id,
        month,
        text: item.text,
        dueDate: snapshot.dueDate,
        completed: String(Boolean(item.done)).toLowerCase(),
        sortOrder: currentIndex(items, id) + 1
      });

      const latest = itemsForMonth(month);
      const next = latest.map(candidate => {
        if (String(candidate.id) !== String(id)) return candidate;
        if (
          String(candidate.text || '') !== snapshot.text ||
          normalizeDueDate(candidate.dueDate) !== snapshot.dueDate ||
          Boolean(candidate.done) !== snapshot.done
        ) return candidate;
        return { ...candidate, _dirty: false };
      });
      writeMonth(month, next);
      return true;
    } catch (error) {
      syncCapability = null;
      setSyncState(month, 'write-error');
      return false;
    }
  }

  async function syncDelete(id) {
    if (!await ensureSyncCapability()) return false;

    try {
      await postAction('planDelete', { id });
      const deleted = readDeleted();
      if (deleted[id]) {
        delete deleted[id];
        writeDeleted(deleted);
      }
      return true;
    } catch (error) {
      syncCapability = null;
      return false;
    }
  }

  async function refreshMonthFromSheets(month, forceCapability = false) {
    if (refreshPromises.has(month)) return refreshPromises.get(month);

    const promise = (async () => {
      if (!localStorage.getItem(KEY_STORAGE)) {
        setSyncState(month, 'not-connected');
        return false;
      }

      setSyncState(month, 'syncing');

      if (!await ensureSyncCapability(forceCapability)) {
        setSyncState(month, 'error');
        return false;
      }

      try {
        const data = await postAction('planList', { month });
        const remoteItems = Array.isArray(data.items) ? data.items.map(remoteItemToLocal) : [];
        const localItems = itemsForMonth(month);
        const localById = new Map(localItems.map(item => [String(item.id), item]));
        const remoteIds = new Set(remoteItems.map(item => String(item.id)));
        const deleted = readDeleted();

        const merged = remoteItems
          .map(remote => {
            const local = localById.get(String(remote.id));
            return local && local._dirty ? local : remote;
          })
          .filter(item => !deleted[item.id]);

        const pendingUpserts = [];
        for (const local of localItems) {
          const id = String(local.id || '');
          if (!id || deleted[id]) continue;
          if (!remoteIds.has(id) && local._dirty) {
            merged.push(local);
            pendingUpserts.push(id);
          } else if (local._dirty) {
            pendingUpserts.push(id);
          }
        }

        writeMonth(month, merged);
        setSyncState(month, 'ok');

        const pendingDeletes = Object.entries(deleted)
          .filter(([, deletedMonth]) => String(deletedMonth) === month)
          .map(([id]) => id);

        const writeResults = await Promise.all([
          ...pendingUpserts.map(id => syncUpsert(month, id)),
          ...pendingDeletes.map(id => syncDelete(id))
        ]);

        if (!writeResults.every(Boolean)) {
          setSyncState(month, 'write-error');
        } else {
          setSyncState(month, 'ok');
        }

        return true;
      } catch (error) {
        syncCapability = null;
        setSyncState(month, 'error');
        return false;
      } finally {
        refreshPromises.delete(month);
      }
    })();

    refreshPromises.set(month, promise);
    return promise;
  }

  window.lexiPlanRefreshMonth = month => {
    const key = String(month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(key)) return Promise.resolve(false);
    return refreshMonthFromSheets(key);
  };

  function updateItem(id, patch) {
    const month = monthKey(cursor);
    const items = itemsForCurrentMonth().map(item =>
      String(item.id) === String(id) ? { ...item, ...patch, _dirty: true } : item
    );
    writeCurrentMonth(items);
    render();
    syncUpsert(month, id);
  }

  function removeItem(id) {
    const month = monthKey(cursor);
    const items = itemsForCurrentMonth().filter(item => String(item.id) !== String(id));
    writeCurrentMonth(items);

    const deleted = readDeleted();
    deleted[id] = month;
    writeDeleted(deleted);

    if (editingId === String(id)) closeAdd();
    render();
    syncDelete(id).then(ok => {
      if (!ok) setSyncState(month, 'write-error');
    });
  }

  function addItem(text, dueDateValue) {
    const clean = String(text || '').trim();
    if (!clean) return;

    const dueDate = normalizeDueDate(dueDateValue);
    const targetMonth = dueDate ? dueDate.slice(0, 7) : monthKey(cursor);
    const items = itemsForMonth(targetMonth);
    const item = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: clean,
      dueDate,
      done: false,
      _dirty: true
    };

    items.push(item);
    writeMonth(targetMonth, items);

    if (targetMonth !== monthKey(cursor)) {
      const targetDate = dateFromMonthKey(targetMonth);
      if (targetDate) cursor = targetDate;
    }

    render();
    syncUpsert(targetMonth, item.id);
  }

  function editItem(id, originalMonth, text, dueDateValue) {
    const clean = String(text || '').trim();
    if (!clean) return;

    const dueDate = normalizeDueDate(dueDateValue);
    const targetMonth = dueDate ? dueDate.slice(0, 7) : originalMonth;
    const sourceItems = itemsForMonth(originalMonth);
    const existing = sourceItems.find(item => String(item.id) === String(id));
    if (!existing) return;

    const nextItem = {
      ...existing,
      text: clean,
      dueDate,
      _dirty: true
    };

    if (targetMonth === originalMonth) {
      writeMonth(originalMonth, sourceItems.map(item =>
        String(item.id) === String(id) ? nextItem : item
      ));
    } else {
      writeMonth(originalMonth, sourceItems.filter(item => String(item.id) !== String(id)));
      const targetItems = itemsForMonth(targetMonth)
        .filter(item => String(item.id) !== String(id));
      targetItems.push(nextItem);
      writeMonth(targetMonth, targetItems);

      const targetDate = dateFromMonthKey(targetMonth);
      if (targetDate) cursor = targetDate;
    }

    render();
    syncUpsert(targetMonth, id);
  }

  function cacheAppointment(event) {
    try {
      if (typeof appData !== 'undefined' && Array.isArray(appData.events)) {
        appData.events = appData.events.filter(item => String(item.ID || '') !== String(event.ID));
        appData.events.push(event);
      }
    } catch (error) {
      // Calendar will still refresh from Google if the in-memory cache is unavailable.
    }

    const cache = readObject(CALENDAR_CACHE_STORAGE_KEY);
    const cachedEvents = Array.isArray(cache.events) ? cache.events : [];
    cache.events = cachedEvents.filter(item => String(item.ID || '') !== String(event.ID));
    cache.events.push(event);
    writeObject(CALENDAR_CACHE_STORAGE_KEY, cache);

    const drafts = readObject(EVENT_DRAFT_STORAGE_KEY);
    if (Object.prototype.hasOwnProperty.call(drafts, event.ID)) {
      delete drafts[event.ID];
      writeObject(EVENT_DRAFT_STORAGE_KEY, drafts);
    }
  }

  async function convertEditingItemToAppointment() {
    const id = String(editingId || '');
    const originalMonth = editingMonth || monthKey(cursor);
    const clean = String(input.value || '').trim();
    const dueDate = normalizeDueDate(dateInput.value);
    const parsed = splitAppointmentText(clean);
    const time = String(convertTime.value || parsed.time || '').trim();
    const title = parsed.title || clean;

    convertStatus.textContent = '';

    if (!id || !clean) {
      input.focus();
      return;
    }

    if (!dueDate) {
      convertStatus.textContent = 'Add a date first';
      dateInput.focus();
      return;
    }

    if (!time) {
      convertStatus.textContent = 'Add a time first';
      convertTime.focus();
      return;
    }

    const appointment = {
      ID: id,
      Date: dueDate,
      Title: title,
      Time: time,
      Category: 'Appointment',
      Details: '',
      Link: '',
      Status: 'Booked'
    };

    convertBtn.disabled = true;
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    convertStatus.textContent = 'Converting…';

    try {
      await postAction('eventUpsert', {
        id,
        date: appointment.Date,
        title: appointment.Title,
        time: appointment.Time,
        category: appointment.Category,
        details: appointment.Details,
        link: appointment.Link,
        status: appointment.Status
      });

      try {
        await postAction('planDelete', { id });
      } catch (error) {
        let rollbackFailed = false;
        try {
          await postAction('eventDelete', { id });
        } catch (rollbackError) {
          rollbackFailed = true;
        }
        if (rollbackFailed) throw new Error('Conversion incomplete');
        throw error;
      }

      writeMonth(
        originalMonth,
        itemsForMonth(originalMonth).filter(item => String(item.id) !== id)
      );

      const deleted = readDeleted();
      if (deleted[id]) {
        delete deleted[id];
        writeDeleted(deleted);
      }

      cacheAppointment(appointment);
      closeAdd();
      render();
    } catch (error) {
      convertStatus.textContent = error?.message === 'Conversion incomplete'
        ? 'Conversion incomplete · check Calendar'
        : 'Conversion failed';
    } finally {
      convertBtn.disabled = false;
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  }

  function appendStatusMessage(text) {
    const message = document.createElement('div');
    message.className = 'plan-empty';
    message.textContent = text;
    list.append(message);
  }

  function render() {
    const currentMonth = monthKey(cursor);
    const syncState = syncStateByMonth.get(currentMonth) || 'idle';
    const connected = Boolean(localStorage.getItem(KEY_STORAGE));

    monthLabel.textContent = monthTitle(cursor);
    const items = sortedItems(itemsForCurrentMonth());
    list.innerHTML = '';

    if (!items.length) {
      if (!connected || syncState === 'not-connected') {
        appendStatusMessage('Connect in Settings to load this month.');
      } else if (syncState === 'error') {
        appendStatusMessage('Couldn’t load this month.');
      } else if (syncState === 'write-error') {
        appendStatusMessage('Some changes couldn’t sync. Saved locally.');
      } else if (syncState === 'ok') {
        appendStatusMessage('No items for this month.');
      } else {
        appendStatusMessage('Loading this month…');
      }
      return;
    }

    if (!connected || syncState === 'not-connected') {
      appendStatusMessage('Not connected. Showing saved items.');
    } else if (syncState === 'error') {
      appendStatusMessage('Couldn’t load this month. Showing saved items.');
    } else if (syncState === 'write-error') {
      appendStatusMessage('Some changes couldn’t sync. Saved locally.');
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `plan-check-row${item.done ? ' done' : ''}`;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'plan-check';
      check.checked = Boolean(item.done);
      check.setAttribute('aria-label', `Mark ${item.text || 'item'} complete`);
      check.addEventListener('change', () => updateItem(item.id, { done: check.checked }));

      const main = document.createElement('div');
      main.className = 'plan-check-main';

      const dueDate = normalizeDueDate(item.dueDate);
      if (dueDate) {
        const date = document.createElement('span');
        date.className = 'plan-check-date';
        date.textContent = formatDueDate(dueDate);
        main.append(date);
      }

      const text = document.createElement('span');
      text.className = 'plan-check-text';
      text.textContent = item.text || '';
      main.append(text);

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'plan-edit-btn';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${item.text || 'item'}`);
      edit.addEventListener('click', () => openEdit(item));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'plan-remove-btn';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${item.text || 'item'}`);
      remove.addEventListener('click', () => removeItem(item.id));

      row.append(check, main, edit, remove);
      list.append(row);
    });
  }

  function openAdd() {
    editingId = '';
    editingMonth = '';
    addRow.hidden = false;
    addBtn.hidden = true;
    input.value = '';
    dateInput.value = '';
    saveBtn.textContent = 'Add';
    convertWrap.hidden = true;
    convertTime.value = '';
    convertStatus.textContent = '';
    requestAnimationFrame(() => input.focus());
  }

  function openEdit(item) {
    editingId = String(item?.id || '');
    editingMonth = monthKey(cursor);
    addRow.hidden = false;
    addBtn.hidden = true;
    input.value = String(item?.text || '');
    dateInput.value = normalizeDueDate(item?.dueDate);
    saveBtn.textContent = 'Save';
    const parsed = splitAppointmentText(item?.text || '');
    convertTime.value = parsed.time;
    convertStatus.textContent = '';
    convertWrap.hidden = false;
    requestAnimationFrame(() => input.focus());
  }

  function closeAdd() {
    editingId = '';
    editingMonth = '';
    addRow.hidden = true;
    addBtn.hidden = false;
    input.value = '';
    dateInput.value = '';
    saveBtn.textContent = 'Add';
    convertWrap.hidden = true;
    convertTime.value = '';
    convertStatus.textContent = '';
  }

  function saveAdd() {
    const value = input.value;
    if (!String(value || '').trim()) return;

    if (editingId) {
      editItem(editingId, editingMonth || monthKey(cursor), value, dateInput.value);
    } else {
      addItem(value, dateInput.value);
    }

    closeAdd();
  }

  function moveMonth(delta) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    closeAdd();
    render();
    refreshMonthFromSheets(monthKey(cursor));
  }

  prevBtn.addEventListener('click', () => moveMonth(-1));
  nextBtn.addEventListener('click', () => moveMonth(1));

  addBtn.addEventListener('click', openAdd);
  saveBtn.addEventListener('click', saveAdd);
  cancelBtn.addEventListener('click', closeAdd);
  convertBtn.addEventListener('click', convertEditingItemToAppointment);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveAdd();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAdd();
    }
  });

  planTab?.addEventListener('click', () => {
    setTimeout(() => refreshMonthFromSheets(monthKey(cursor), true), 0);
  });

  window.addEventListener('focus', () => {
    if (planView.classList.contains('active')) {
      refreshMonthFromSheets(monthKey(cursor));
    }
  });

  render();
  setTimeout(() => refreshMonthFromSheets(monthKey(cursor)), 0);
})();
