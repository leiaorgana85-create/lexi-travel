(() => {
  const NOTE_ID = 'bangkok-shopping-list';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesList = document.getElementById('notesList');
  const noteBody = document.getElementById('noteBody');
  const noteSaveStatus = document.getElementById('noteSaveStatus');
  const noteSaveBtn = document.getElementById('noteSaveBtn');

  if (!notesTab || !notesList || !noteBody) return;

  let boughtByProduct = new Map();
  let loadPromise = null;
  let loaded = false;
  let decorateFrame = 0;

  function selectedNoteId() {
    return notesList.querySelector('.note-list-item.active')?.dataset.noteId || '';
  }

  function isEditing() {
    return Boolean(noteSaveBtn && !noteSaveBtn.hidden);
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

  function productFromItemCell(cell) {
    const text = String(cell?.textContent || '').trim();
    const parts = text.split(' · ').map(part => part.trim()).filter(Boolean);
    if (parts.length < 3) return '';
    return parts.slice(1, -1).join(' · ');
  }

  function applyBoughtState(row, checkbox, bought) {
    checkbox.checked = Boolean(bought);
    row.classList.toggle('shopping-bought', Boolean(bought));
  }

  async function setBought(product, bought, row, checkbox) {
    const previous = !bought;
    checkbox.disabled = true;
    applyBoughtState(row, checkbox, bought);
    boughtByProduct.set(product, bought);

    try {
      await postShopping('shoppingSetBought', {
        product,
        bought: String(Boolean(bought)).toLowerCase()
      });
      if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping list synced to Google Sheets';
    } catch (error) {
      boughtByProduct.set(product, previous);
      applyBoughtState(row, checkbox, previous);
      if (noteSaveStatus) noteSaveStatus.textContent = `Shopping checkbox sync failed: ${error.message}`;
    } finally {
      checkbox.disabled = false;
    }
  }

  function decorateTable(table) {
    if (table.dataset.shoppingDecorated === 'true') {
      table.querySelectorAll('tbody tr').forEach(row => {
        const checkbox = row.querySelector('.shopping-buy-check');
        const product = row.dataset.shoppingProduct || '';
        if (checkbox && product) applyBoughtState(row, checkbox, boughtByProduct.get(product));
      });
      return;
    }

    const headerRow = table.querySelector('thead tr');
    if (!headerRow) return;

    const buyHead = document.createElement('th');
    buyHead.className = 'shopping-buy-col';
    buyHead.setAttribute('aria-label', 'Bought');
    buyHead.textContent = '';
    headerRow.insertBefore(buyHead, headerRow.firstChild);

    table.querySelectorAll('tbody tr').forEach(row => {
      const itemCell = row.querySelector('td');
      if (!itemCell) return;
      const product = productFromItemCell(itemCell);
      if (!product) return;

      row.dataset.shoppingProduct = product;

      const buyCell = document.createElement('td');
      buyCell.className = 'shopping-buy-col';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'shopping-buy-check';
      checkbox.setAttribute('aria-label', `Mark ${product} bought`);
      applyBoughtState(row, checkbox, boughtByProduct.get(product));
      checkbox.addEventListener('change', () => {
        setBought(product, checkbox.checked, row, checkbox);
      });

      buyCell.append(checkbox);
      row.insertBefore(buyCell, row.firstChild);
    });

    table.dataset.shoppingDecorated = 'true';
  }

  function decorate() {
    if (selectedNoteId() !== NOTE_ID || isEditing()) return;
    noteBody.classList.add('shopping-list-note');
    noteBody.querySelectorAll('.note-schedule .note-table').forEach(decorateTable);
  }

  function scheduleDecorate() {
    if (decorateFrame) return;
    decorateFrame = requestAnimationFrame(() => {
      decorateFrame = 0;
      decorate();
    });
  }

  async function loadBought(force = false) {
    if (selectedNoteId() !== NOTE_ID) return;
    if (!force && loaded) {
      decorate();
      return;
    }
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const data = await postShopping('shoppingList');
        boughtByProduct = new Map(
          (Array.isArray(data.items) ? data.items : [])
            .map(item => [String(item.product || ''), boolValue(item.bought)])
            .filter(([product]) => product)
        );
        loaded = true;
        decorate();
      } catch (error) {
        loaded = false;
        decorate();
        if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping checkboxes need the latest backend deployment';
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  const observer = new MutationObserver(() => {
    scheduleDecorate();
    if (selectedNoteId() === NOTE_ID && !loaded) loadBought();
  });
  observer.observe(noteBody, { childList: true, subtree: true });
  observer.observe(notesList, { attributes: true, subtree: true, attributeFilter: ['class'] });

  notesTab.addEventListener('click', () => setTimeout(() => loadBought(true), 0));
  notesList.addEventListener('click', () => setTimeout(() => loadBought(true), 0));

  scheduleDecorate();
})();
