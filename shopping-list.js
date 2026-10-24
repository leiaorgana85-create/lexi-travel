(() => {
  const shoppingTab = document.querySelector('.tab[data-view="shoppingView"]');
  const shoppingView = document.getElementById('shoppingView');
  const shoppingBody = document.getElementById('shoppingListBody');
  const shoppingStatus = document.getElementById('shoppingStatus');
  const CACHE_KEY = 'lexiTravelShoppingCacheV1';

  if (!shoppingTab || !shoppingView || !shoppingBody || !shoppingStatus) return;

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
      // Cache failure should never block Shopping.
    }
  }

  function boolValue(value) {
    return value === true || String(value || '').trim().toLowerCase() === 'true';
  }

  function itemKey(item) {
    return String(item?.product || '').trim();
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

  async function postShopping(action, fields = {}) {
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
    if (!data.ok) throw new Error(data.error || 'Shopping list sync failed');
    return data;
  }

  function sectionFor(item) {
    const store = String(item.store || '').trim();
    const category = String(item.category || '').trim().toLowerCase();
    const lower = store.toLowerCase();

    if (category === 'phone / sim') return 'Phone / eSIM';
    if (store === 'Big C' || lower.startsWith('big c /')) return 'Big C';
    if (store === 'Watsons Terminal 21') return 'Watsons Terminal 21';
    if (lower.includes('bts asok')) return 'BTS Asok Station ticket office';
    if (lower.includes('enso')) return 'ENSO official LINE shop';
    if (
      lower.includes('pharmacy') ||
      lower.includes('pharmanet') ||
      lower.includes('fascino') ||
      lower.includes('blez') ||
      lower.includes('pure pharmacy')
    ) return 'Pharmacy';

    return store || 'Other';
  }

  function preferredSections(groups) {
    const preferred = [
      'Big C',
      'Pharmacy',
      'Watsons Terminal 21',
      'BTS Asok Station ticket office',
      'ENSO official LINE shop',
      'Phone / eSIM'
    ];

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
    shoppingBody.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = `shopping-message${isError ? ' error' : ''}`;
    empty.textContent = message;
    shoppingBody.append(empty);
  }

  function applyPendingState(item) {
    const key = itemKey(item);
    if (!key) return item;
    if (pendingStates.has(key)) item.bought = pendingStates.get(key);
    else confirmedStates.set(key, boolValue(item.bought));
    return item;
  }

  function render(items) {
    shoppingBody.innerHTML = '';

    if (!items.length) {
      setMessage('No shopping items found.');
      shoppingStatus.textContent = '';
      return;
    }

    const groups = new Map();
    items.forEach(item => {
      applyPendingState(item);
      const section = sectionFor(item);
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(item);
    });

    preferredSections(groups).forEach(sectionName => {
      const section = document.createElement('section');
      section.className = 'shopping-section';

      const heading = document.createElement('h3');
      heading.className = 'shopping-section-title';
      heading.textContent = sectionName;
      section.append(heading);

      const list = document.createElement('div');
      list.className = 'shopping-items';

      groups.get(sectionName).forEach(item => {
        const row = document.createElement('label');
        row.className = 'shopping-item';
        const bought = boolValue(item.bought);
        row.classList.toggle('shopping-bought', bought);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'shopping-buy-check';
        checkbox.checked = bought;
        checkbox.setAttribute('aria-label', `Mark ${item.product} bought`);

        const content = document.createElement('span');
        content.className = 'shopping-item-content';

        const name = document.createElement('span');
        name.className = 'shopping-item-name';
        name.textContent = String(item.product || '');
        content.append(name);

        const metaParts = [item.category, item.thaiProductName]
          .map(value => String(value || '').trim())
          .filter(Boolean);
        if (metaParts.length) {
          const meta = document.createElement('span');
          meta.className = 'shopping-item-meta';
          meta.textContent = metaParts.join(' · ');
          content.append(meta);
        }

        const detailParts = [item.price, item.note]
          .map(value => String(value || '').trim())
          .filter(Boolean);
        if (detailParts.length) {
          const detail = document.createElement('span');
          detail.className = 'shopping-item-detail';
          detail.textContent = detailParts.join(' · ');
          content.append(detail);
        }

        checkbox.addEventListener('change', () => {
          const key = itemKey(item);
          const boughtNow = checkbox.checked;
          const version = (stateVersions.get(key) || 0) + 1;
          stateVersions.set(key, version);
          pendingStates.set(key, boughtNow);

          item.bought = boughtNow;
          row.classList.toggle('shopping-bought', boughtNow);
          if (cachedItems) writeCache(cachedItems);
          shoppingStatus.textContent = 'Saving…';

          enqueueWrite(key, async () => {
            try {
              const result = await postShopping('shoppingSetBought', {
                product: item.product,
                bought: String(boughtNow).toLowerCase()
              });

              confirmedStates.set(key, boughtNow);
              if (stateVersions.get(key) === version) {
                pendingStates.delete(key);
                shoppingStatus.textContent = result.queued ? 'Saved on device · sync pending' : 'Saved';
              }
            } catch (error) {
              if (stateVersions.get(key) !== version) return;

              pendingStates.delete(key);
              const confirmed = confirmedStates.has(key)
                ? confirmedStates.get(key)
                : !boughtNow;
              item.bought = confirmed;
              checkbox.checked = confirmed;
              row.classList.toggle('shopping-bought', confirmed);
              if (cachedItems) writeCache(cachedItems);
              shoppingStatus.textContent = `Could not save: ${error.message}`;
            }
          });
        });

        row.append(checkbox, content);
        list.append(row);
      });

      section.append(list);
      shoppingBody.append(section);
    });

    shoppingStatus.textContent = 'Tap again to undo';
  }

  async function loadShopping({ showCached = true, allowInactive = false } = {}) {
    const active = shoppingView.classList.contains('active');
    if ((!active && !allowInactive) || loading) return;

    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) {
      if (active) {
        shoppingStatus.textContent = '';
        setMessage('Open Settings and save the Lexi Travel API key once.', true);
      }
      return;
    }

    if (active) {
      if (showCached && cachedItems) {
        render(cachedItems);
      } else {
        shoppingStatus.textContent = 'Loading…';
        setMessage('Loading shopping list…');
      }
    }

    loading = true;
    try {
      const data = await postShopping('shoppingList');
      cachedItems = (Array.isArray(data.items) ? data.items : []).map(applyPendingState);
      writeCache(cachedItems);
      if (shoppingView.classList.contains('active')) render(cachedItems);
    } catch (error) {
      if (shoppingView.classList.contains('active')) {
        if (cachedItems) {
          render(cachedItems);
          shoppingStatus.textContent = 'Showing saved list · refresh failed';
        } else {
          shoppingStatus.textContent = '';
          setMessage(`Shopping list could not load: ${error.message}`, true);
        }
      }
    } finally {
      loading = false;
    }
  }

  shoppingTab.addEventListener('click', () => {
    setTimeout(() => loadShopping({ showCached: true }), 0);
  });

  if (cachedItems && shoppingView.classList.contains('active')) render(cachedItems);
  if (shoppingView.classList.contains('active')) {
    loadShopping({ showCached: true });
  } else if (localStorage.getItem(KEY_STORAGE)) {
    setTimeout(() => loadShopping({ showCached: false, allowInactive: true }), 1800);
  }
})();
