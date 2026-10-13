(() => {
  const NOTE_ID = 'bangkok-shopping-list';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesList = document.getElementById('notesList');
  const noteBody = document.getElementById('noteBody');
  const noteSaveStatus = document.getElementById('noteSaveStatus');
  const noteEditBtn = document.getElementById('noteEditBtn');
  const noteSaveBtn = document.getElementById('noteSaveBtn');

  if (!notesTab || !notesList || !noteBody) return;

  let boughtByProduct = new Map();
  let shoppingItems = [];
  let loadPromise = null;
  let loaded = false;
  let sheetRenderReady = false;
  let shoppingWriteReady = false;
  let decorateFrame = 0;
  let rendering = false;
  let editingOriginalProduct = '';

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

  function setShoppingToolbar(active) {
    const deleteBtn = document.getElementById('noteDeleteBtn');

    if (active) {
      if (noteEditBtn) noteEditBtn.hidden = true;
      if (deleteBtn) deleteBtn.hidden = true;
      return;
    }

    if (!isEditing()) {
      if (noteEditBtn) noteEditBtn.hidden = false;
      if (deleteBtn && selectedNoteId()) deleteBtn.hidden = false;
    }
  }

  const dialog = document.createElement('dialog');
  dialog.className = 'shopping-item-dialog';
  dialog.innerHTML = `
    <form class="shopping-item-form">
      <div class="shopping-item-dialog-head">
        <h3 class="shopping-item-dialog-title">Edit shopping item</h3>
        <button class="shopping-dialog-close" type="button" aria-label="Close">×</button>
      </div>
      <label class="shopping-field">Store
        <input name="store" type="text" autocomplete="off">
      </label>
      <label class="shopping-field">Category
        <input name="category" type="text" autocomplete="off">
      </label>
      <label class="shopping-field">Product
        <input name="product" type="text" autocomplete="off" required>
      </label>
      <label class="shopping-field">Thai product name
        <input name="thaiProductName" type="text" autocomplete="off">
      </label>
      <label class="shopping-field">Approx. price (THB; USD)
        <input name="price" type="text" autocomplete="off">
      </label>
      <label class="shopping-field">Purpose / note
        <textarea name="note" rows="4"></textarea>
      </label>
      <label class="shopping-field">Source URL
        <input name="source" type="text" inputmode="url" autocomplete="off">
      </label>
      <div class="shopping-dialog-status" aria-live="polite"></div>
      <div class="shopping-dialog-actions">
        <button class="shopping-delete-item" type="button">Delete</button>
        <span class="shopping-dialog-spacer"></span>
        <button class="shopping-cancel-item" type="button">Cancel</button>
        <button class="shopping-save-item" type="submit">Save</button>
      </div>
    </form>
  `;
  document.body.append(dialog);

  const dialogForm = dialog.querySelector('.shopping-item-form');
  const dialogTitle = dialog.querySelector('.shopping-item-dialog-title');
  const dialogStatus = dialog.querySelector('.shopping-dialog-status');
  const dialogDeleteBtn = dialog.querySelector('.shopping-delete-item');
  const dialogSaveBtn = dialog.querySelector('.shopping-save-item');
  const dialogCancelBtn = dialog.querySelector('.shopping-cancel-item');
  const dialogCloseBtn = dialog.querySelector('.shopping-dialog-close');

  function field(name) {
    return dialogForm.elements.namedItem(name);
  }

  function closeEditor() {
    editingOriginalProduct = '';
    dialogStatus.textContent = '';
    if (dialog.open) dialog.close();
  }

  function openEditor(item = null) {
    if (!shoppingWriteReady) {
      if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping item editing needs the latest backend deployment';
      return;
    }

    editingOriginalProduct = String(item?.product || '');
    dialogTitle.textContent = item ? 'Edit shopping item' : 'Add shopping item';
    field('store').value = String(item?.store || '');
    field('category').value = String(item?.category || '');
    field('product').value = String(item?.product || '');
    field('thaiProductName').value = String(item?.thaiProductName || '');
    field('price').value = String(item?.price || '');
    field('note').value = String(item?.note || '');
    field('source').value = String(item?.source || '');
    dialogDeleteBtn.hidden = !item;
    dialogStatus.textContent = '';

    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    setTimeout(() => field('product').focus(), 0);
  }

  async function saveEditor(event) {
    event.preventDefault();

    const product = String(field('product').value || '').trim();
    if (!product) {
      dialogStatus.textContent = 'Product is required.';
      field('product').focus();
      return;
    }

    const wasEditing = Boolean(editingOriginalProduct);
    const existing = shoppingItems.find(item => String(item.product || '') === editingOriginalProduct);

    dialogSaveBtn.disabled = true;
    dialogDeleteBtn.disabled = true;
    dialogStatus.textContent = 'Saving…';

    try {
      await postShopping('shoppingUpsert', {
        originalProduct: editingOriginalProduct,
        store: field('store').value,
        category: field('category').value,
        product,
        thaiProductName: field('thaiProductName').value,
        price: field('price').value,
        note: field('note').value,
        source: field('source').value,
        bought: existing ? String(boolValue(existing.bought)).toLowerCase() : 'false'
      });

      closeEditor();
      if (noteSaveStatus) noteSaveStatus.textContent = wasEditing ? 'Shopping item updated' : 'Shopping item added';
      await loadShopping(true);
    } catch (error) {
      dialogStatus.textContent = error.message;
    } finally {
      dialogSaveBtn.disabled = false;
      dialogDeleteBtn.disabled = false;
    }
  }

  async function deleteEditor() {
    const product = editingOriginalProduct;
    if (!product) return;
    if (!window.confirm(`Delete “${product}” from the shopping list?`)) return;

    dialogSaveBtn.disabled = true;
    dialogDeleteBtn.disabled = true;
    dialogStatus.textContent = 'Deleting…';

    try {
      await postShopping('shoppingDelete', { product });
      closeEditor();
      if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping item deleted';
      await loadShopping(true);
    } catch (error) {
      dialogStatus.textContent = error.message;
    } finally {
      dialogSaveBtn.disabled = false;
      dialogDeleteBtn.disabled = false;
    }
  }

  dialogForm.addEventListener('submit', saveEditor);
  dialogDeleteBtn.addEventListener('click', deleteEditor);
  dialogCancelBtn.addEventListener('click', closeEditor);
  dialogCloseBtn.addEventListener('click', closeEditor);

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
    const previous = boughtByProduct.has(product)
      ? boughtByProduct.get(product)
      : !bought;

    checkbox.disabled = true;
    applyBoughtState(row, checkbox, bought);
    boughtByProduct.set(product, bought);

    const item = shoppingItems.find(entry => String(entry.product || '') === product);
    if (item) item.bought = bought;

    try {
      await postShopping('shoppingSetBought', {
        product,
        bought: String(Boolean(bought)).toLowerCase()
      });
      if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping list synced to Google Sheets';
    } catch (error) {
      boughtByProduct.set(product, previous);
      if (item) item.bought = previous;
      applyBoughtState(row, checkbox, previous);
      if (noteSaveStatus) noteSaveStatus.textContent = `Shopping checkbox sync failed: ${error.message}`;
    } finally {
      checkbox.disabled = false;
    }
  }

  function createCheckboxCell(item, row) {
    const buyCell = document.createElement('td');
    buyCell.className = 'shopping-buy-col';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'shopping-buy-check';
    checkbox.setAttribute('aria-label', `Mark ${item.product} bought`);
    applyBoughtState(row, checkbox, boolValue(item.bought));
    checkbox.addEventListener('change', () => {
      setBought(item.product, checkbox.checked, row, checkbox);
    });

    buyCell.append(checkbox);
    return buyCell;
  }

  function displaySection(item) {
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
    ) {
      return 'Pharmacy';
    }

    return store || 'Other';
  }

  function itemText(item) {
    return [item.category, item.product, item.thaiProductName]
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .join(' · ');
  }

  function appendTextCell(row, text) {
    const cell = document.createElement('td');
    cell.textContent = String(text || '');
    row.append(cell);
    return cell;
  }

  function addItemActions() {
    const controls = document.createElement('div');
    controls.className = 'shopping-list-actions';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'shopping-add-btn';
    addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', () => openEditor());

    controls.append(addBtn);
    noteBody.append(controls);
  }

  function addRowEditButton(cell, item) {
    if (!shoppingWriteReady) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shopping-row-edit';
    button.textContent = 'Edit';
    button.setAttribute('aria-label', `Edit ${item.product}`);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEditor(item);
    });
    cell.append(button);
  }

  function renderSheetShopping() {
    if (rendering || selectedNoteId() !== NOTE_ID || !sheetRenderReady) return;
    if (noteBody.dataset.shoppingSource === 'sheet') {
      noteBody.querySelectorAll('tbody tr[data-shopping-product]').forEach(row => {
        const product = row.dataset.shoppingProduct || '';
        const checkbox = row.querySelector('.shopping-buy-check');
        if (checkbox && product) applyBoughtState(row, checkbox, boughtByProduct.get(product));
      });
      return;
    }

    rendering = true;
    try {
      noteBody.innerHTML = '';
      noteBody.classList.add('shopping-list-note');
      noteBody.dataset.shoppingSource = 'sheet';

      const intro = document.createElement('p');
      intro.className = 'note-paragraph';
      intro.textContent = 'Shopping list is synced directly with Google Sheets.';
      noteBody.append(intro);

      if (shoppingWriteReady) addItemActions();

      const groups = new Map();
      shoppingItems.forEach(item => {
        const section = displaySection(item);
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

      const sectionNames = [...groups.keys()].sort((a, b) => {
        const ai = preferredOrder.indexOf(a);
        const bi = preferredOrder.indexOf(b);
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }
        return a.localeCompare(b);
      });

      sectionNames.forEach(sectionName => {
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
          if (index === 0) {
            th.className = 'shopping-buy-col';
            th.setAttribute('aria-label', 'Bought');
          }
          headerRow.append(th);
        });
        thead.append(headerRow);
        table.append(thead);

        const tbody = document.createElement('tbody');
        groups.get(sectionName).forEach(item => {
          const row = document.createElement('tr');
          row.dataset.shoppingProduct = item.product;
          row.append(createCheckboxCell(item, row));
          appendTextCell(row, itemText(item));
          appendTextCell(row, item.price);
          const noteCell = appendTextCell(row, item.note);
          addRowEditButton(noteCell, item);
          tbody.append(row);
        });
        table.append(tbody);
        section.append(table);
        noteBody.append(section);
      });
    } finally {
      rendering = false;
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
      const item = { product, bought: boughtByProduct.get(product) };
      row.insertBefore(createCheckboxCell(item, row), row.firstChild);
    });

    table.dataset.shoppingDecorated = 'true';
  }

  function decorateLegacy() {
    if (selectedNoteId() !== NOTE_ID || isEditing()) return;
    noteBody.classList.add('shopping-list-note');
    noteBody.querySelectorAll('.note-schedule .note-table').forEach(decorateTable);
  }

  function updateMode() {
    const active = selectedNoteId() === NOTE_ID;
    setShoppingToolbar(active);

    if (!active) {
      noteBody.classList.remove('shopping-list-note');
      delete noteBody.dataset.shoppingSource;
      return;
    }

    if (sheetRenderReady) renderSheetShopping();
    else decorateLegacy();
  }

  function scheduleDecorate() {
    if (decorateFrame || rendering) return;
    decorateFrame = requestAnimationFrame(() => {
      decorateFrame = 0;
      updateMode();
    });
  }

  async function loadShopping(force = false) {
    if (selectedNoteId() !== NOTE_ID) return;
    if (!force && loaded) {
      updateMode();
      return;
    }
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      try {
        const data = await postShopping('shoppingList');
        shoppingItems = Array.isArray(data.items) ? data.items : [];
        boughtByProduct = new Map(
          shoppingItems
            .map(item => [String(item.product || ''), boolValue(item.bought)])
            .filter(([product]) => product)
        );
        loaded = true;
        sheetRenderReady = Number(data.version || 0) >= 2;
        shoppingWriteReady = Number(data.version || 0) >= 3;

        if (sheetRenderReady) delete noteBody.dataset.shoppingSource;
        updateMode();
      } catch (error) {
        loaded = false;
        sheetRenderReady = false;
        shoppingWriteReady = false;
        decorateLegacy();
        if (noteSaveStatus) noteSaveStatus.textContent = 'Shopping list could not refresh from Google Sheets';
      } finally {
        loadPromise = null;
      }
    })();

    return loadPromise;
  }

  const observer = new MutationObserver(() => {
    scheduleDecorate();
    if (selectedNoteId() === NOTE_ID && !loaded) loadShopping();
  });
  observer.observe(noteBody, { childList: true, subtree: true });
  observer.observe(notesList, { attributes: true, subtree: true, attributeFilter: ['class'] });

  notesTab.addEventListener('click', () => setTimeout(() => loadShopping(true), 0));
  notesList.addEventListener('click', () => setTimeout(() => loadShopping(true), 0));

  scheduleDecorate();
})();
