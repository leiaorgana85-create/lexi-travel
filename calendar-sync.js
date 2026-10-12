(() => {
  const CACHE_STORAGE = 'lexiTravelCalendarCacheV1';
  const DRAFT_STORAGE = 'lexiTravelEventDraftsV1';

  const calendarTab = document.querySelector('.tab[data-view="calendarView"]');
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarStatus = document.getElementById('calendarStatus');
  const dayPane = document.getElementById('dayPane');
  const paneHead = dayPane?.querySelector('.day-pane-head');
  const paneDetails = document.getElementById('paneDayDetails');

  if (!calendarTab || !calendarGrid || !dayPane || !paneHead || !paneDetails) return;

  let writeCapability = null;
  let capabilityPromise = null;
  let backgroundRefreshPromise = null;
  let lastBackgroundRefreshAt = 0;
  let suppressFastClick = false;
  let editorOpen = false;

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Local cache failure must not block the calendar.
    }
  }

  function readDrafts() {
    const value = readJson(DRAFT_STORAGE, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function writeDrafts(drafts) {
    writeJson(DRAFT_STORAGE, drafts);
  }

  function readCache() {
    const value = readJson(CACHE_STORAGE, {});
    return value && typeof value === 'object' ? value : {};
  }

  function writeCache() {
    writeJson(CACHE_STORAGE, {
      locations: Array.isArray(appData.locations) ? appData.locations : [],
      events: Array.isArray(appData.events) ? appData.events : []
    });
  }

  const EVENT_FIELDS = ['Date', 'Title', 'Time', 'Category', 'Details', 'Link', 'Status'];

  function eventMatchesDraft(event, draft) {
    return EVENT_FIELDS.every(field => String(event?.[field] ?? '') === String(draft?.[field] ?? ''));
  }

  function mergeEventDrafts() {
    const drafts = readDrafts();
    const seen = new Set();
    let draftsChanged = false;

    const merged = (appData.events || []).flatMap(event => {
      const id = String(event.ID || '');
      if (id) seen.add(id);
      const draft = id ? drafts[id] : null;

      if (!draft) return [event];
      if (draft._localDeleted) return [];

      if (draft._syncedAt && eventMatchesDraft(event, draft)) {
        delete drafts[id];
        draftsChanged = true;
        return [event];
      }

      return [{ ...event, ...draft }];
    });

    for (const [id, draft] of Object.entries(drafts)) {
      if (seen.has(String(id)) || draft?._localDeleted || !draft?._localNew) continue;
      merged.push({ ID: id, ...draft });
    }

    appData.events = merged;
    if (draftsChanged) writeDrafts(drafts);
  }

  const cached = readCache();
  if (!(appData.locations || []).length && Array.isArray(cached.locations)) {
    appData.locations = cached.locations;
  }
  if (!(appData.events || []).length && Array.isArray(cached.events)) {
    appData.events = cached.events;
  }
  mergeEventDrafts();
  if ((appData.locations || []).length || (appData.events || []).length) {
    renderCalendar();
  }

  const actualLoadAllData = loadAllData;
  const wrappedLoadAllData = async function (...args) {
    const result = await actualLoadAllData(...args);
    writeCache();
    mergeEventDrafts();
    return result;
  };
  loadAllData = wrappedLoadAllData;

  function localRefresh(dateKey = selectedDateKey()) {
    mergeEventDrafts();
    writeCache();
    renderCalendar();
    requestAnimationFrame(() => {
      if (dateKey && typeof openDay === 'function') openDay(dateKey);
    });
  }

  function selectedDateKey() {
    return calendarGrid.querySelector('.day-cell.selected-day')?.getAttribute('aria-label') ||
      calendarGrid.querySelector('.day-cell:not(.other-month)')?.getAttribute('aria-label') || '';
  }

  function refreshInBackground(loader) {
    if (backgroundRefreshPromise) return;
    if (Date.now() - lastBackgroundRefreshAt < 10000) return;

    lastBackgroundRefreshAt = Date.now();
    backgroundRefreshPromise = (async () => {
      try {
        await loader();
        writeCache();
        mergeEventDrafts();
        localRefresh(selectedDateKey());
      } catch (error) {
        // Cached/local calendar remains usable if Google is slow or unavailable.
      } finally {
        backgroundRefreshPromise = null;
      }
    })();
  }

  calendarTab.addEventListener('click', () => {
    if (suppressFastClick) return;

    const cache = readCache();
    if (!(appData.locations || []).length && Array.isArray(cache.locations)) appData.locations = cache.locations;
    if (!(appData.events || []).length && Array.isArray(cache.events)) appData.events = cache.events;
    mergeEventDrafts();
    renderCalendar();

    const loader = loadAllData;
    suppressFastClick = true;
    loadAllData = async () => true;

    setTimeout(() => {
      loadAllData = loader;
      suppressFastClick = false;
      if (localStorage.getItem(KEY_STORAGE)) refreshInBackground(loader);
    }, 0);
  }, true);

  const cacheObserver = new MutationObserver(() => {
    if ((appData.locations || []).length || (appData.events || []).length) writeCache();
  });
  cacheObserver.observe(calendarGrid, { childList: true });

  const paneActions = document.createElement('div');
  paneActions.className = 'calendar-pane-actions';

  const syncStatus = document.createElement('span');
  syncStatus.id = 'calendarSyncStatus';
  syncStatus.className = 'calendar-sync-status';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.id = 'calendarAddEventBtn';
  addBtn.className = 'calendar-add-btn';
  addBtn.textContent = '+';
  addBtn.setAttribute('aria-label', 'Add event');
  addBtn.title = 'Add event';

  paneActions.append(syncStatus, addBtn);
  paneHead.append(paneActions);

  function field(labelText, input) {
    const label = document.createElement('label');
    label.className = 'calendar-editor-field';
    const caption = document.createElement('span');
    caption.textContent = labelText;
    label.append(caption, input);
    return label;
  }

  function makeInput(name, value = '', type = 'text', placeholder = '') {
    const input = document.createElement('input');
    input.name = name;
    input.type = type;
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    return input;
  }

  function makeTextarea(name, value = '', placeholder = '') {
    const input = document.createElement('textarea');
    input.name = name;
    input.value = value;
    input.placeholder = placeholder;
    input.rows = 3;
    return input;
  }

  function eventById(id) {
    return (appData.events || []).find(event => String(event.ID || '') === String(id)) || null;
  }

  function closeEditor(dateKey) {
    editorOpen = false;
    dayPane.classList.remove('calendar-editing');
    if (dateKey && typeof openDay === 'function') openDay(dateKey);
  }

  function openEditor(event = null, dateKey = selectedDateKey()) {
    if (!dateKey) return;
    editorOpen = true;
    dayPane.classList.add('calendar-editing');

    const form = document.createElement('form');
    form.className = 'calendar-event-editor';
    form.noValidate = true;

    const title = document.createElement('div');
    title.className = 'calendar-editor-title';
    title.textContent = event ? 'Edit event' : 'New event';
    form.append(title);

    const titleInput = makeInput('title', event?.Title || '', 'text', 'Appointment or event');
    titleInput.required = true;
    form.append(field('Title', titleInput));

    const pair1 = document.createElement('div');
    pair1.className = 'calendar-editor-pair';
    const dateInput = makeInput('date', event?.Date || dateKey, 'date');
    dateInput.required = true;
    const timeInput = makeInput('time', event?.Time || '', 'text', '10:30 AM');
    pair1.append(field('Date', dateInput), field('Time', timeInput));
    form.append(pair1);

    const pair2 = document.createElement('div');
    pair2.className = 'calendar-editor-pair';
    const categoryInput = makeInput('category', event?.Category || 'Appointment', 'text', 'Appointment');
    const statusInput = makeInput('status', event?.Status || '', 'text', 'Planned / Booked');
    pair2.append(field('Category', categoryInput), field('Status', statusInput));
    form.append(pair2);

    const detailsInput = makeTextarea('details', event?.Details || '', 'Notes / details');
    form.append(field('Details', detailsInput));

    const linkInput = makeInput('link', event?.Link || '', 'url', 'https://…');
    form.append(field('Link', linkInput));

    const actions = document.createElement('div');
    actions.className = 'calendar-editor-actions';

    if (event) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'calendar-editor-btn danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => deleteEvent(event));
      actions.append(deleteBtn);
    }

    const spacer = document.createElement('span');
    spacer.className = 'calendar-editor-spacer';
    actions.append(spacer);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'calendar-editor-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => closeEditor(dateKey));

    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'calendar-editor-btn primary';
    saveBtn.textContent = 'Save';

    actions.append(cancelBtn, saveBtn);
    form.append(actions);

    form.addEventListener('submit', submitEventEditor);

    paneDetails.innerHTML = '';
    paneDetails.append(form);
    requestAnimationFrame(() => titleInput.focus());
  }

  function eventPayloadFromForm(form, id) {
    const data = new FormData(form);
    return {
      ID: id,
      Date: String(data.get('date') || '').trim(),
      Title: String(data.get('title') || '').trim(),
      Time: String(data.get('time') || '').trim(),
      Category: String(data.get('category') || '').trim(),
      Details: String(data.get('details') || '').trim(),
      Link: String(data.get('link') || '').trim(),
      Status: String(data.get('status') || '').trim()
    };
  }

  function makeEventId(dateKey) {
    const compactDate = String(dateKey || '').replace(/-/g, '');
    return `evt_${compactDate}_${Date.now().toString(36)}`;
  }

  function submitEventEditor(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement)) return;

    const originalId = form.dataset.eventId || '';
    const id = originalId || makeEventId(String(new FormData(form).get('date') || selectedDateKey()));
    const payload = eventPayloadFromForm(form, id);

    if (!payload.Date || !payload.Title) {
      syncStatus.textContent = 'Date and title are required';
      return;
    }

    const existingIndex = (appData.events || []).findIndex(item => String(item.ID || '') === String(id));
    if (existingIndex >= 0) appData.events[existingIndex] = { ...appData.events[existingIndex], ...payload };
    else appData.events.push(payload);

    const drafts = readDrafts();
    drafts[id] = {
      ...payload,
      _localNew: existingIndex < 0,
      savedAt: Date.now()
    };
    writeDrafts(drafts);

    editorOpen = false;
    dayPane.classList.remove('calendar-editing');
    localRefresh(payload.Date);
    syncEventUpsert(id);
  }

  function editEvent(id) {
    const event = eventById(id);
    if (!event) return;
    openEditor(event, event.Date || selectedDateKey());
    const form = paneDetails.querySelector('.calendar-event-editor');
    if (form) form.dataset.eventId = id;
  }

  function deleteEvent(event) {
    const id = String(event?.ID || '');
    if (!id) return;
    if (!window.confirm(`Delete “${event.Title || 'this event'}”?`)) return;

    const drafts = readDrafts();
    const wasLocalNew = Boolean(drafts[id]?._localNew || event._localNew);

    appData.events = (appData.events || []).filter(item => String(item.ID || '') !== id);

    if (wasLocalNew) delete drafts[id];
    else drafts[id] = { ...(drafts[id] || {}), ID: id, _localDeleted: true, savedAt: Date.now() };
    writeDrafts(drafts);

    editorOpen = false;
    dayPane.classList.remove('calendar-editing');
    const dateKey = event.Date || selectedDateKey();
    localRefresh(dateKey);

    if (!wasLocalNew) syncEventDelete(id);
  }

  addBtn.addEventListener('click', () => openEditor(null, selectedDateKey()));

  paneDetails.addEventListener('click', event => {
    if (editorOpen) return;
    const target = event.target instanceof Element ? event.target : null;
    const row = target?.closest('.pane-event[data-event-id]');
    if (!row) return;
    editEvent(row.dataset.eventId || '');
  });

  function postWrite(action, fields = {}) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) return Promise.reject(new Error('Not connected'));

    const body = new URLSearchParams({ key, action });
    for (const [name, value] of Object.entries(fields)) {
      body.set(name, value == null ? '' : String(value));
    }

    return fetch(API_URL, {
      method: 'POST',
      body,
      cache: 'no-store',
      redirect: 'follow'
    }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'Write failed');
      return data;
    });
  }

  async function ensureWriteCapability(force = false) {
    if (!force && writeCapability !== null) return writeCapability;
    if (!force && capabilityPromise) return capabilityPromise;

    capabilityPromise = (async () => {
      try {
        const data = await postWrite('eventCapabilities');
        writeCapability = Boolean(data.eventWrite);
      } catch (error) {
        writeCapability = false;
      } finally {
        capabilityPromise = null;
      }
      return writeCapability;
    })();

    return capabilityPromise;
  }

  async function syncEventUpsert(id) {
    syncStatus.textContent = 'Saving…';

    if (!await ensureWriteCapability()) {
      syncStatus.textContent = 'Saved on device · calendar sync unavailable';
      return;
    }

    const draft = readDrafts()[id];
    const event = eventById(id);
    const value = draft ? { ...event, ...draft } : event;
    if (!value) return;

    try {
      await postWrite('eventUpsert', {
        id,
        date: value.Date || '',
        title: value.Title || '',
        time: value.Time || '',
        category: value.Category || '',
        details: value.Details || '',
        link: value.Link || '',
        status: value.Status || ''
      });

      const drafts = readDrafts();
      if (drafts[id]) {
        drafts[id] = { ...drafts[id], _localNew: false, _syncedAt: Date.now() };
        writeDrafts(drafts);
      }
      writeCache();
      syncStatus.textContent = 'Synced';
    } catch (error) {
      syncStatus.textContent = `Saved locally · sync failed`;
    }
  }

  async function syncEventDelete(id) {
    syncStatus.textContent = 'Deleting…';

    if (!await ensureWriteCapability()) {
      syncStatus.textContent = 'Deleted locally · calendar sync unavailable';
      return;
    }

    try {
      await postWrite('eventDelete', { id });
      const drafts = readDrafts();
      delete drafts[id];
      writeDrafts(drafts);
      writeCache();
      syncStatus.textContent = 'Synced';
    } catch (error) {
      syncStatus.textContent = 'Deleted locally · sync failed';
    }
  }

  if (localStorage.getItem(KEY_STORAGE)) ensureWriteCapability(true);
})();
