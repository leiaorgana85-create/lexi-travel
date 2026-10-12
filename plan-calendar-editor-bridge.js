(() => {
  const PLAN_STORAGE_KEY = 'lexiTravelMonthlyPlanV1';

  function normalizeCategory(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '');
  }

  function isToDoCategory(value) {
    return normalizeCategory(value) === 'todo';
  }

  function readPlan() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writePlan(data) {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
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

  function planText(title, time) {
    const cleanTitle = String(title || '').trim();
    const cleanTime = String(time || '').trim();
    return cleanTime ? `${cleanTime} · ${cleanTitle}` : cleanTitle;
  }

  function makePlanId() {
    return `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  async function postPlan(item, month, sortOrder) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) throw new Error('Not connected');

    const body = new URLSearchParams({
      key,
      action: 'planUpsert',
      id: item.id,
      month,
      text: item.text,
      dueDate: item.dueDate,
      completed: 'false',
      sortOrder: String(sortOrder)
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

  document.addEventListener('submit', event => {
    const form = event.target instanceof Element
      ? event.target.closest('.calendar-event-editor')
      : null;

    if (!(form instanceof HTMLFormElement)) return;

    const values = new FormData(form);
    const category = String(values.get('category') || '').trim();
    if (!isToDoCategory(category)) return;

    // Existing EVENTS rows remain normal calendar events. This route is for new
    // To Dos created from Calendar so there is only one underlying Plan record.
    if (form.dataset.eventId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const title = String(values.get('title') || '').trim();
    const date = String(values.get('date') || '').trim();
    const time = String(values.get('time') || '').trim();
    const status = document.getElementById('calendarSyncStatus');

    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      if (status) status.textContent = 'Date and title are required';
      return;
    }

    const month = date.slice(0, 7);
    const all = readPlan();
    const items = Array.isArray(all[month]) ? all[month] : [];
    const item = {
      id: makePlanId(),
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

    postPlan(item, month, items.length)
      .then(() => {
        markSynced(month, item.id);
        if (status) status.textContent = 'Synced';
      })
      .catch(() => {
        if (status) status.textContent = 'Saved locally · sync failed';
      });
  }, true);
})();
