(() => {
  const NOTE_ID = 'bangkok-shopping-list';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesList = document.getElementById('notesList');
  const noteBody = document.getElementById('noteBody');
  const noteSaveStatus = document.getElementById('noteSaveStatus');
  const noteEditBtn = document.getElementById('noteEditBtn');

  if (!notesTab || !notesList || !noteBody) return;

  let loading = false;

  function selectedNoteId() {
    const active = notesList.querySelector('.note-list-item.active');
    if (!active) return '';
    if (active.dataset.noteId) return active.dataset.noteId;

    const title = String(active.childNodes[0]?.textContent || active.textContent || '').trim();
    const match = (appData.notes || []).find(note => String(note.Title || '').trim() === title);
    return String(match?.ID || '');
  }

  function isShoppingNote() {
    return selectedNoteId() === NOTE_ID;
  }

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

  function itemLabel(item) {
    return [item.category, item.product, item.thaiProductName]
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(' · ');
  }

  async function setBought(item, checkbox, row) {
    const previous = !checkbox.checked;
    const bought = checkbox.checked;
    checkbox.disabled = true;
    row.classList.toggle('shopping-bought', bought);

    try {
      await postShopping('shoppingSetBought', {
        product: item.product,
        bought: String(bought).toLowerCase()
      });
      item.bought = bought;
      if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping list synced';
    } catch (error) {
      checkbox.checked = previous;
      row.classList.toggle('shopping-bought', previous);
      if (noteSaveStatus) noteSaveStatus.textContent = `Could not save checkbox: ${error.message}`;
    } finally {
      checkbox.disabled = false;
    }
  }

  function render(items) {
    if (!isShoppingNote()) return;

    noteBody.innerHTML = '';
    noteBody.classList.add('shopping-list-note');
    if (noteEditBtn) noteEditBtn.hidden = true;
    const deleteBtn = document.getElementById('noteDeleteBtn');
    if (deleteBtn) deleteBtn.hidden = true;

    const groups = new Map();
    items.forEach(item => {
      const section = sectionFor(item);
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(item);
    });

    const preferredOrder = [
      'Big C',
      'Pharmacy',
      'Watsons Terminal 21',
      'BTS Asok Station ticket office',
      'ENSO official LINE shop',
      'Phone / eSIM'
    ];

    const sections = [...groups.keys()].sort((a, b) => {
      const ai = preferredOrder.indexOf(a);
      const bi = preferredOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    sections.forEach(sectionName => {
      const section = document.createElement('section');
      section.className = 'note-schedule';

      const heading = document.createElement('h3');
      heading.className = 'note-section-title';
      heading.textContent = sectionName;
      section.append(heading);

      const table = document.createElement('table');
      table.className = 'note-table';

      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      ['', 'Item', 'Price', 'Use / note'].forEach((label, index) => {
        const th = document.createElement('th');
        th.textContent = label;
        if (index === 0) th.className = 'shopping-buy-col';
        headerRow.append(th);
      });
      thead.append(headerRow);
      table.append(thead);

      const tbody = document.createElement('tbody');
      groups.get(sectionName).forEach(item => {
        const row = document.createElement('tr');
        const bought = boolValue(item.bought);
        row.classList.toggle('shopping-bought', bought);

        const buyCell = document.createElement('td');
        buyCell.className = 'shopping-buy-col';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'shopping-buy-check';
        checkbox.checked = bought;
        checkbox.setAttribute('aria-label', `Mark ${item.product} bought`);
        checkbox.addEventListener('change', () => setBought(item, checkbox, row));
        buyCell.append(checkbox);
        row.append(buyCell);

        [itemLabel(item), item.price, item.note].forEach(value => {
          const cell = document.createElement('td');
          cell.textContent = String(value || '');
          row.append(cell);
        });

        tbody.append(row);
      });

      table.append(tbody);
      section.append(table);
      noteBody.append(section);
    });

    if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping list · tap a box when purchased';
  }

  async function showShoppingIfSelected() {
    if (!isShoppingNote() || loading) return;
    loading = true;

    try {
      const data = await postShopping('shoppingList');
      if (!isShoppingNote()) return;
      render(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      if (isShoppingNote() && noteSaveStatus) {
        noteSaveStatus.textContent = `Shopping list could not load: ${error.message}`;
      }
    } finally {
      loading = false;
    }
  }

  notesList.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('.note-list-item') : null;
    if (!target) return;
    setTimeout(showShoppingIfSelected, 0);
  });

  notesTab.addEventListener('click', () => {
    setTimeout(showShoppingIfSelected, 0);
  });

  setTimeout(showShoppingIfSelected, 0);
})();
