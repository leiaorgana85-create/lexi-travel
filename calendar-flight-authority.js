(() => {
  const DRAFT_STORAGE = 'lexiTravelEventDraftsV1';
  const CACHE_STORAGE = 'lexiTravelCalendarCacheV1';
  const paneDetails = document.getElementById('paneDayDetails');

  function readObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function isGeneratedFlightId(id) {
    return /^evt_flight_/i.test(String(id || '').trim());
  }

  function isGeneratedFlight(event, fallbackId = '') {
    return isGeneratedFlightId(event?.ID || fallbackId);
  }

  function clearLegacyFlightDrafts() {
    const drafts = readObject(DRAFT_STORAGE);
    const cache = readObject(CACHE_STORAGE);
    const flightIds = new Set();

    const currentEvents = typeof appData !== 'undefined' && Array.isArray(appData.events)
      ? appData.events
      : [];
    const cachedEvents = Array.isArray(cache.events) ? cache.events : [];

    [...currentEvents, ...cachedEvents].forEach(event => {
      const id = String(event?.ID || '').trim();
      if (id && isGeneratedFlight(event, id)) flightIds.add(id);
    });

    Object.entries(drafts).forEach(([id, draft]) => {
      if (isGeneratedFlight(draft, id)) flightIds.add(String(id));
    });

    let changed = false;
    flightIds.forEach(id => {
      if (!Object.prototype.hasOwnProperty.call(drafts, id)) return;
      delete drafts[id];
      changed = true;
    });

    if (changed) localStorage.setItem(DRAFT_STORAGE, JSON.stringify(drafts));
    return changed;
  }

  function applyFlightReadOnlyUi() {
    if (!paneDetails) return;

    paneDetails.querySelectorAll('.pane-event[data-event-id]').forEach(row => {
      const id = String(row.dataset.eventId || '');
      if (!isGeneratedFlightId(id)) return;

      row.classList.add('flight-readonly');
      row.querySelectorAll('.pane-event-edit').forEach(button => button.remove());
    });
  }

  clearLegacyFlightDrafts();
  applyFlightReadOnlyUi();

  if (paneDetails) {
    const observer = new MutationObserver(applyFlightReadOnlyUi);
    observer.observe(paneDetails, { childList: true, subtree: true });

    paneDetails.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      const row = target?.closest('.pane-event[data-event-id]');
      if (!row || !isGeneratedFlightId(row.dataset.eventId)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  if (typeof window.lexiCalendarEditEvent === 'function') {
    const editEvent = window.lexiCalendarEditEvent;
    window.lexiCalendarEditEvent = id => {
      if (isGeneratedFlightId(id)) return;
      return editEvent(id);
    };
  }

  if (typeof loadAllData === 'function') {
    const load = loadAllData;
    loadAllData = async function (...args) {
      clearLegacyFlightDrafts();
      const result = await load(...args);
      clearLegacyFlightDrafts();
      requestAnimationFrame(applyFlightReadOnlyUi);
      return result;
    };

    if (typeof KEY_STORAGE !== 'undefined' && localStorage.getItem(KEY_STORAGE)) {
      setTimeout(() => {
        loadAllData().catch(() => {});
      }, 0);
    }
  }
})();
