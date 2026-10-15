(() => {
  const DRAFT_STORAGE = 'lexiTravelEventDraftsV1';
  const CACHE_STORAGE = 'lexiTravelCalendarCacheV1';

  function readObject(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function isFlight(event) {
    const category = String(event?.Category || '').trim().toLowerCase();
    return category === 'flight' || category === 'travel';
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
      if (id && isFlight(event)) flightIds.add(id);
    });

    Object.entries(drafts).forEach(([id, draft]) => {
      if (isFlight(draft)) flightIds.add(String(id));
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

  clearLegacyFlightDrafts();

  if (typeof loadAllData === 'function') {
    const load = loadAllData;
    loadAllData = async function (...args) {
      clearLegacyFlightDrafts();
      const result = await load(...args);
      clearLegacyFlightDrafts();
      return result;
    };

    if (typeof KEY_STORAGE !== 'undefined' && localStorage.getItem(KEY_STORAGE)) {
      setTimeout(() => {
        loadAllData().catch(() => {});
      }, 0);
    }
  }
})();
