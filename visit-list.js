(() => {
  const visitTab = document.querySelector('.tab[data-view="visitView"]');
  const visitView = document.getElementById('visitView');
  const visitBody = document.getElementById('visitListBody');
  const visitStatus = document.getElementById('visitStatus');
  const CACHE_KEY = 'lexiTravelVisitCacheV1';

  if (!visitTab || !visitView || !visitBody || !visitStatus) return;

  let loading = false;
  let cachedItems = readCache();
  const writeChains = new Map();
  const stateVersions = new Map();
  const pendingStates = new Map();
  const confirmedStates = new Map();

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return parsed && Array.isArray(parsed.items) ? parsed.items : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(items) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        items: Array.isArray(items) ? items : []
      }));
    } catch (error) {
      // Cache failure should never block Visit.
    }
  }

  function boolValue(value) {
    return value === true || String(value || '').trim().toLowerCase() === 'true';
  }

  function itemKey(item) {
    return String(item?.place || '').trim();
  }

  function displayArea(item) {
    const area = String(item?.area || '').trim();
    const place = String(item?.place || '').trim();
    if (/^Terminal 21(?:\s|—|-|$)/i.test(area) || /\(Terminal 21\)/i.test(place)) {
      return 'Terminal 21';
    }
    if (/Exchange Tower/i.test(area) || /Exchange Tower/i.test(place)) {
      return 'Exchange Tower';
    }
    return area || 'Other';
  }

  function mapsUrl(item) {
    const rawPlace = String(item?.place || '').trim();
    const source = String(item?.source || '').trim();
    if (/^LINE:/i.test(rawPlace)) {
      const firstUrl = source.match(/https?:\/\/[^\s|]+/i)?.[0] || '';
      return firstUrl;
    }
    const place = rawPlace
      .replace(/\s+—.*$/, '')
      .trim();
    const area = String(item?.area || '').trim();
    if (!place) return '';
    const query = [place, area, 'Bangkok'].filter(Boolean).join(' ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  function enqueueWrite(key, task) {
    const previous = writeChains.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(task);
    writeChains.set(key, next);
    next.finally(() => {
      if (writeChains.get(key) === next) writeChains.delete(key);
    });
    return next;
  }

  async function postVisit(action, fields = {}) {
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
    if (!data.ok) throw new Error(data.error || 'Visit list sync failed');
    return data;
  }

  function preferredSections(groups) {
    const preferred = ['Terminal 21', 'Exchange Tower', 'Nearby Ashton / Asoke', 'Separate trip'];
    return [...groups.keys()].sort((a, b) => {
      const ai = preferred.indexOf(a);
      const bi = preferred.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }

  function setMessage(message, isError = false) {
    visitBody.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = `shopping-message${isError ? ' error' : ''}`;
    empty.textContent = message;
    visitBody.append(empty);
  }

  function applyPendingState(item) {
    const key = itemKey(item);
    if (!key) return item;
    if (pendingStates.has(key)) item.visited = pendingStates.get(key);
    else confirmedStates.set(key, boolValue(item.visited));
    return item;
  }

  function render(items) {
    visitBody.innerHTML = '';

    if (!items.length) {
      setMessage('No visit items found.');
      visitStatus.textContent = '';
      return;
    }

    const groups = new Map();
    items.forEach(item => {
      applyPendingState(item);
      const area = displayArea(item);
      if (!groups.has(area)) groups.set(area, []);
      groups.get(area).push(item);
    });

    preferredSections(groups).forEach(area => {
      const section = document.createElement('section');
      section.className = 'shopping-section';

      const heading = document.createElement('h3');
      heading.className = 'shopping-section-title';
      heading.textContent = area;
      section.append(heading);

      const list = document.createElement('div');
      list.className = 'shopping-items';

      groups.get(area).forEach(item => {
        const row = document.createElement('label');
        row.className = 'shopping-item';
        const visited = boolValue(item.visited);
        row.classList.toggle('shopping-bought', visited);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'shopping-buy-check';
        checkbox.checked = visited;
        checkbox.setAttribute('aria-label', `Mark ${item.place} visited`);

        const content = document.createElement('span');
        content.className = 'shopping-item-content';

        const mapHref = mapsUrl(item);
        const name = document.createElement(mapHref ? 'a' : 'span');
        name.className = 'shopping-item-name';
        name.textContent = String(item.place || '');
        if (mapHref) {
          name.href = mapHref;
          name.target = '_blank';
          name.rel = 'noopener noreferrer';
          name.style.color = 'inherit';
          name.style.textDecoration = 'underline';
          name.style.textUnderlineOffset = '2px';
          name.addEventListener('click', event => event.stopPropagation());
        }
        content.append(name);

        const purpose = String(item.purpose || '').trim();
        if (purpose) {
          const meta = document.createElement('span');
          meta.className = 'shopping-item-meta';
          meta.textContent = purpose;
          content.append(meta);
        }

        const price = String(item.price || '').trim();
        if (price) {
          const detail = document.createElement('span');
          detail.className = 'shopping-item-detail';
          detail.textContent = price;
          content.append(detail);
        }

        checkbox.addEventListener('change', () => {
          const key = itemKey(item);
          const visitedNow = checkbox.checked;
          const version = (stateVersions.get(key) || 0) + 1;
          stateVersions.set(key, version);
          pendingStates.set(key, visitedNow);

          item.visited = visitedNow;
          row.classList.toggle('shopping-bought', visitedNow);
          if (cachedItems) writeCache(cachedItems);
          visitStatus.textContent = 'Saving…';

          enqueueWrite(key, async () => {
            try {
              await postVisit('visitSetVisited', {
                place: item.place,
                visited: String(visitedNow).toLowerCase()
              });

              confirmedStates.set(key, visitedNow);
              if (stateVersions.get(key) === version) {
                pendingStates.delete(key);
                visitStatus.textContent = 'Saved';
              }
            } catch (error) {
              if (stateVersions.get(key) !== version) return;

              pendingStates.delete(key);
              const confirmed = confirmedStates.has(key)
                ? confirmedStates.get(key)
                : !visitedNow;
              item.visited = confirmed;
              checkbox.checked = confirmed;
              row.classList.toggle('shopping-bought', confirmed);
              if (cachedItems) writeCache(cachedItems);
              visitStatus.textContent = `Could not save: ${error.message}`;
            }
          });
        });

        row.append(checkbox, content);
        list.append(row);
      });

      section.append(list);
      visitBody.append(section);
    });

    visitStatus.textContent = 'Tap again to undo';
  }

  async function loadVisit({ showCached = true, allowInactive = false } = {}) {
    const active = visitView.classList.contains('active');
    if ((!active && !allowInactive) || loading) return;

    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) {
      if (active) {
        visitStatus.textContent = '';
        setMessage('Open Settings and save the Lexi Travel API key once.', true);
      }
      return;
    }

    if (active) {
      if (showCached && cachedItems) {
        render(cachedItems);
      } else {
        visitStatus.textContent = 'Loading…';
        setMessage('Loading visit list…');
      }
    }

    loading = true;
    try {
      const data = await postVisit('visitList');
      cachedItems = (Array.isArray(data.items) ? data.items : []).map(applyPendingState);
      writeCache(cachedItems);
      if (visitView.classList.contains('active')) render(cachedItems);
    } catch (error) {
      if (visitView.classList.contains('active')) {
        if (cachedItems) {
          render(cachedItems);
          visitStatus.textContent = 'Showing saved list · refresh failed';
        } else {
          visitStatus.textContent = '';
          setMessage(`Visit list could not load: ${error.message}`, true);
        }
      }
    } finally {
      loading = false;
    }
  }

  visitTab.addEventListener('click', () => {
    setTimeout(() => loadVisit({ showCached: true }), 0);
  });

  if (cachedItems && visitView.classList.contains('active')) render(cachedItems);
  if (visitView.classList.contains('active')) {
    loadVisit({ showCached: true });
  } else if (localStorage.getItem(KEY_STORAGE)) {
    setTimeout(() => loadVisit({ showCached: false, allowInactive: true }), 1800);
  }
})();