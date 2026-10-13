(() => {
  const shoppingTab = document.querySelector('.tab[data-view="shoppingView"]');
  const shoppingView = document.getElementById('shoppingView');
  const shoppingBody = document.getElementById('shoppingListBody');
  const shoppingStatus = document.getElementById('shoppingStatus');

  if (!shoppingTab || !shoppingView || !shoppingBody || !shoppingStatus) return;

  let loading = false;
  let cachedItems = null;

  function boolValue(value) {
    return value === true || String(value || '').trim().toLowerCase() === 'true';
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
    if (store === 'Big C') return 'Big C';
    if (store === 'Watsons Terminal 21') return 'Watsons Terminal 21';
    if (lower.includes('bts asok')) return 'BTS Asok Station ticket office';
    if (lower.includes('enso')) return 'ENSO official LINE shop';
    if (
      lower.includes('pharmacy') ||
      lower.includes('pharmanet') ||
      lower.includes('fascino') ||
      lower.includes('blez') ||
      lower.includes('pure pharmacy') ||
      lower.startsWith('big c /')
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

  function render(items) {
    shoppingBody.innerHTML = '';

    if (!items.length) {
      setMessage('No shopping items found.');
      shoppingStatus.textContent = '';
      return;
    }

    const groups = new Map();
    items.forEach(item => {
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

        checkbox.addEventListener('change', async () => {
          const previous = !checkbox.checked;
          const boughtNow = checkbox.checked;
          checkbox.disabled = true;
          row.classList.toggle('shopping-bought', boughtNow);
          shoppingStatus.textContent = 'Saving…';

          try {
            await postShopping('shoppingSetBought', {
              product: item.product,
              bought: String(boughtNow).toLowerCase()
            });
            item.bought = boughtNow;
            shoppingStatus.textContent = 'Saved';
          } catch (error) {
            checkbox.checked = previous;
            row.classList.toggle('shopping-bought', previous);
            shoppingStatus.textContent = `Could not save: ${error.message}`;
          } finally {
            checkbox.disabled = false;
          }
        });

        row.append(checkbox, content);
        list.append(row);
      });

      section.append(list);
      shoppingBody.append(section);
    });

    shoppingStatus.textContent = 'Tap a box when purchased';
  }

  async function loadShopping({ showCached = true } = {}) {
    if (!shoppingView.classList.contains('active') || loading) return;

    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) {
      shoppingStatus.textContent = '';
      setMessage('Open Settings and save the Lexi Travel API key once.', true);
      return;
    }

    if (showCached && cachedItems) render(cachedItems);
    else {
      shoppingStatus.textContent = 'Loading…';
      setMessage('Loading shopping list…');
    }

    loading = true;
    try {
      const data = await postShopping('shoppingList');
      cachedItems = Array.isArray(data.items) ? data.items : [];
      if (shoppingView.classList.contains('active')) render(cachedItems);
    } catch (error) {
      if (shoppingView.classList.contains('active')) {
        shoppingStatus.textContent = '';
        setMessage(`Shopping list could not load: ${error.message}`, true);
      }
    } finally {
      loading = false;
    }
  }

  shoppingTab.addEventListener('click', () => {
    setTimeout(() => loadShopping({ showCached: true }), 0);
  });

  if (shoppingView.classList.contains('active')) loadShopping({ showCached: false });
})();
