(() => {
  const STORAGE_KEY = 'lexiTravelMonthlyPlanV1';
  const DELETE_STORAGE_KEY = 'lexiTravelMonthlyPlanDeletedV1';
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

  if (!planView || !monthLabel || !prevBtn || !nextBtn || !list || !addBtn || !addRow || !input || !dateInput || !saveBtn || !cancelBtn) return;

  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);
  let syncCapability = null;
  let capabilityPromise = null;
  let editingId = '';
  let editingMonth = '';
  const refreshPromises = new Map();

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

  function readAll() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function readDeleted() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DELETE_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeDeleted(data) {
    localStorage.setItem(DELETE_STORAGE_KEY, JSON.stringify(data));
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
      } catch (error) {
        syncCapability = false;
      } finally {
        capabilityPromise = null;
      }
      return syncCapability;
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
    if (!await ensureSyncCapability()) return false;

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
      if (!await ensureSyncCapability(forceCapability)) return false;

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
          if (!remoteIds.has(id)) {
            merged.push(local);
            pendingUpserts.push(id);
          } else if (local._dirty) {
            pendingUpserts.push(id);
          }
        }

        writeMonth(month, merged);
        if (month === monthKey(cursor)) render();

        const pendingDeletes = Object.entries(deleted)
          .filter(([, deletedMonth]) => String(deletedMonth) === month)
          .map(([id]) => id);

        await Promise.all([
          ...pendingUpserts.map(id => syncUpsert(month, id)),
          ...pendingDeletes.map(id => syncDelete(id))
        ]);

        return true;
      } catch (error) {
        syncCapability = null;
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
    syncDelete(id);
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

  function render() {
    monthLabel.textContent = monthTitle(cursor);
    const items = sortedItems(itemsForCurrentMonth());
    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'plan-empty';
      empty.textContent = 'No items for this month.';
      list.append(empty);
      return;
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
