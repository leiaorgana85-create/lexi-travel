(() => {
  const grid = document.getElementById('calendarGrid');
  const paneDetails = document.getElementById('paneDayDetails');
  if (!grid) return;

  let refreshFrame = 0;

  function itemsForDate(dateKey) {
    if (typeof window.lexiPlanItemsForDate !== 'function') return [];
    const items = window.lexiPlanItemsForDate(dateKey);
    return Array.isArray(items) ? items : [];
  }

  function markerText(items) {
    const first = items[0];
    const state = first?.done ? '✓' : '☐';
    const title = String(first?.text || 'To Do').trim();
    return items.length > 1
      ? `${state} ${title} +${items.length - 1}`
      : `${state} ${title}`;
  }

  function renderCell(cell) {
    const dateKey = cell.getAttribute('aria-label');
    if (!dateKey) return;

    const items = itemsForDate(dateKey);
    const existing = cell.querySelector('.day-plan-todo');
    const hasItems = items.length > 0;
    cell.classList.toggle('has-plan-todo', hasItems);

    if (!hasItems) {
      if (existing) existing.remove();
      return;
    }

    const marker = existing || document.createElement('span');
    marker.className = `day-plan-todo${items[0]?.done ? ' done' : ''}`;
    marker.textContent = markerText(items);
    marker.setAttribute('aria-label', `${items.length} to-do${items.length === 1 ? '' : 's'} due ${dateKey}`);

    if (!existing) cell.append(marker);
  }

  function refreshCells() {
    grid.querySelectorAll('.day-cell').forEach(renderCell);
  }

  function selectedDateKey() {
    const selected = grid.querySelector('.day-cell.selected-day');
    return selected?.getAttribute('aria-label') || '';
  }

  function renderPane() {
    if (!paneDetails || paneDetails.querySelector('.calendar-event-editor')) return;

    paneDetails.querySelectorAll('.pane-plan-todo').forEach(node => node.remove());

    const dateKey = selectedDateKey();
    if (!dateKey) return;

    const items = itemsForDate(dateKey);
    if (!items.length) return;

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = `pane-event pane-plan-todo${item.done ? ' done' : ''}`;

      const summary = document.createElement('div');
      summary.className = 'pane-event-summary';
      summary.textContent = `${item.done ? '✓' : '☐'} To Do · ${item.text || 'To Do'}`;

      row.append(summary);
      paneDetails.append(row);
    });
  }

  function refreshAll() {
    refreshCells();
    renderPane();
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refreshAll();
    });
  }

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(grid, { childList: true });

  grid.addEventListener('click', event => {
    if (event.target.closest('.day-cell')) {
      requestAnimationFrame(renderPane);
    }
  });

  document.addEventListener('lexi-plan-change', scheduleRefresh);
  window.addEventListener('focus', scheduleRefresh);

  scheduleRefresh();
})();
