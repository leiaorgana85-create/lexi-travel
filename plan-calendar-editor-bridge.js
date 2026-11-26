(() => {
  const PLAN_STORAGE_KEY = 'lexiTravelMonthlyPlanV1';
  const EVENT_DRAFT_STORAGE_KEY = 'lexiTravelEventDraftsV1';
  const CALENDAR_CACHE_STORAGE_KEY = 'lexiTravelCalendarCacheV1';

  function normalizeCategory(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '');
  }

  function isToDoCategory(value) {
    return normalizeCategory(value) === 'todo';
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readPlan() {
    const parsed = readJson(PLAN_STORAGE_KEY, {});
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function writePlan(data) {
    writeJson(PLAN_STORAGE_KEY, data);
    document.dispatchEvent(new CustomEvent('lexi-plan-change'));
  }

  function markSynced(month, id) {
    const data = readPlan();
    const items = Array.isArray(data[month]) ? data[month] : [];
    data[month] = items.map(item =>
      String(item.id) === String(id) ? { ...item, _dirty: false } : item
    );
    writePlan(data);
  }

  function removeLocalPlanItem(month, id) {
    const data = readPlan();
    const items = Array.isArray(data[month]) ? data[month] : [];
    data[month] = items.filter(item => String(item.id) !== String(id));
    writePlan(data);
  }

  function planText(title, time) {
    const cleanTitle = String(title || '').trim();
    const cleanTime = String(time || '').trim();
    return cleanTime ? `${cleanTime} · ${cleanTitle}` : cleanTitle;
  }

  function makePlanId() {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async function postAction(action, fields) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) throw new Error('Not connected');

    const body = new URLSearchParams({ key, action });
    for (const [name, value] of Object.entries(fields || {})) {
      body.set(name, value == null ? '' : String(value));
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      body,
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'Sync failed');
    return data;
  }

  function markEventDeletedLocally(id) {
    try {
      if (typeof appData !== 'undefined' && Array.isArray(appData.events)) {
        appData.events = appData.events.filter(item => String(item.ID || '') !== String(id));
      }
    } catch (error) {
      // Keep going; the local tombstone below is the important part.
    }

    const drafts = readJson(EVENT_DRAFT_STORAGE_KEY, {});
    if (drafts && typeof drafts === 'object' && !Array.isArray(drafts)) {
      drafts[id] = {
        ...(drafts[id] || {}),
        ID: id,
        _localDeleted: true,
        savedAt: Date.now()
      };
      writeJson(EVENT_DRAFT_STORAGE_KEY, drafts);
    }

    const cache = readJson(CALENDAR_CACHE_STORAGE_KEY, {});
    if (cache && typeof cache === 'object' && Array.isArray(cache.events)) {
      cache.events = cache.events.filter(item => String(item.ID || '') !== String(id));
      writeJson(CALENDAR_CACHE_STORAGE_KEY, cache);
    }
  }

  function clearEventDraft(id) {
    const drafts = readJson(EVENT_DRAFT_STORAGE_KEY, {});
    if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) return;
    delete drafts[id];
    writeJson(EVENT_DRAFT_STORAGE_KEY, drafts);
  }

  document.addEventListener('submit', event => {
    const form = event.target instanceof Element
      ? event.target.closest('.calendar-event-editor')
      : null;

    if (!(form instanceof HTMLFormElement)) return;

    const values = new FormData(form);
    const category = String(values.get('category') || '').trim();
    if (!isToDoCategory(category)) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const title = String(values.get('title') || '').trim();
    const date = String(values.get('date') || '').trim();
    const time = String(values.get('time') || '').trim();
    const existingEventId = String(form.dataset.eventId || '').trim();
    const status = document.getElementById('calendarSyncStatus');

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (status) status.textContent = 'Date and title are required';
      return;
    }

    const month = date.slice(0, 7);
    const all = readPlan();
    const items = Array.isArray(all[month]) ? all[month] : [];
    const item = {
      // A converted Event keeps its original ID so its identity remains traceable
      // across EVENTS -> PLAN_ITEMS. A brand-new Calendar To Do gets a Plan ID.
      id: existingEventId || makePlanId(),
      text: planText(title, time),
      dueDate: date,
      done: false,
      _dirty: true
    };

    items.push(item);
    all[month] = items;
    writePlan(all);

    // Use Calendar's own Cancel handler so its private editor state is closed cleanly.
    const cancelButton = [...form.querySelectorAll('button')]
      .find(button => String(button.textContent || '').trim() === 'Cancel');
    if (cancelButton) cancelButton.click();

    if (status) status.textContent = 'Saving…';

    (async () => {
      let planCreatedRemotely = false;
      try {
        // First create the durable Plan record. Do not hide/delete the Calendar
        // event until that succeeds.
        await postAction('planUpsert', {
          id: item.id,
          month,
          text: item.text,
          dueDate: item.dueDate,
          completed: 'false',
          sortOrder: String(items.length)
        });
        planCreatedRemotely = true;

        if (existingEventId) {
          try {
            await postAction('eventDelete', { id: existingEventId });
          } catch (deleteError) {
            // Roll back the new Plan record so one logical item cannot remain active
            // in both EVENTS and PLAN_ITEMS after a partial conversion failure.
            try {
              await postAction('planDelete', { id: item.id });
              removeLocalPlanItem(month, item.id);
              if (status) status.textContent = 'Conversion failed · original event kept';
              return;
            } catch (rollbackError) {
              if (status) status.textContent = 'Conversion incomplete · check Calendar and Plan';
              return;
            }
          }

          markEventDeletedLocally(existingEventId);
          clearEventDraft(existingEventId);
        }

        markSynced(month, item.id);
        if (status) status.textContent = 'Synced';
      } catch (error) {
        if (!planCreatedRemotely) removeLocalPlanItem(month, item.id);
        if (status) status.textContent = 'Conversion failed · original event kept';
      }
    })();
  }, true);
})();
