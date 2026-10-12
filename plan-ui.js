(() => {
  const STORAGE_KEY = 'lexiTravelMonthlyPlanV1';
  const planView = document.getElementById('countryView');
  const monthLabel = document.getElementById('planMonthLabel');
  const prevBtn = document.getElementById('planPrevMonthBtn');
  const nextBtn = document.getElementById('planNextMonthBtn');
  const list = document.getElementById('planChecklist');
  const addBtn = document.getElementById('planAddBtn');
  const addRow = document.getElementById('planAddRow');
  const input = document.getElementById('planAddInput');
  const saveBtn = document.getElementById('planAddSaveBtn');
  const cancelBtn = document.getElementById('planAddCancelBtn');

  if (!planView || !monthLabel || !prevBtn || !nextBtn || !list || !addBtn || !addRow || !input || !saveBtn || !cancelBtn) return;

  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthTitle(date) {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
  }

  function readAll() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function itemsForCurrentMonth() {
    const data = readAll();
    const items = data[monthKey(cursor)];
    return Array.isArray(items) ? items : [];
  }

  function writeCurrentMonth(items) {
    const data = readAll();
    data[monthKey(cursor)] = items;
    writeAll(data);
  }

  function updateItem(id, patch) {
    const items = itemsForCurrentMonth().map(item =>
      String(item.id) === String(id) ? { ...item, ...patch } : item
    );
    writeCurrentMonth(items);
    render();
  }

  function removeItem(id) {
    const items = itemsForCurrentMonth().filter(item => String(item.id) !== String(id));
    writeCurrentMonth(items);
    render();
  }

  function addItem(text) {
    const clean = String(text || '').trim();
    if (!clean) return;

    const items = itemsForCurrentMonth();
    items.push({
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: clean,
      done: false
    });
    writeCurrentMonth(items);
    render();
  }

  function render() {
    monthLabel.textContent = monthTitle(cursor);
    const items = itemsForCurrentMonth();
    list.innerHTML = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'plan-empty';
      empty.textContent = 'No items for this month.';
      list.append(empty);
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `plan-check-row${item.done ? ' done' : ''}`;

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'plan-check';
      check.checked = Boolean(item.done);
      check.setAttribute('aria-label', `Mark ${item.text || 'item'} complete`);
      check.addEventListener('change', () => updateItem(item.id, { done: check.checked }));

      const text = document.createElement('div');
      text.className = 'plan-check-text';
      text.textContent = item.text || '';

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'plan-remove-btn';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${item.text || 'item'}`);
      remove.addEventListener('click', () => removeItem(item.id));

      row.append(check, text, remove);
      list.append(row);
    });
  }

  function openAdd() {
    addRow.hidden = false;
    addBtn.hidden = true;
    input.value = '';
    requestAnimationFrame(() => input.focus());
  }

  function closeAdd() {
    addRow.hidden = true;
    addBtn.hidden = false;
    input.value = '';
  }

  function saveAdd() {
    const value = input.value;
    if (!String(value || '').trim()) return;
    addItem(value);
    closeAdd();
  }

  prevBtn.addEventListener('click', () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
    closeAdd();
    render();
  });

  nextBtn.addEventListener('click', () => {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    closeAdd();
    render();
  });

  addBtn.addEventListener('click', openAdd);
  saveBtn.addEventListener('click', saveAdd);
  cancelBtn.addEventListener('click', closeAdd);
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveAdd();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      closeAdd();
    }
  });

  render();
})();
