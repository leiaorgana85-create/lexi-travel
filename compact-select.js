(() => {
  if (window.lexiRefreshCompactSelect) return;
  const controls = new WeakMap();
  let active = null;
  let sequence = 0;
  let typeText = '';
  let typeAt = 0;

  function sync(select) {
    const button = controls.get(select);
    if (!button) return;
    const label = select.getAttribute('aria-label') || select.labels?.[0]?.textContent?.trim() || select.name || 'Choose';
    const text = select.options[select.selectedIndex]?.textContent || 'Choose';
    if (button.textContent !== text) button.textContent = text;
    if (button.disabled !== select.disabled) button.disabled = select.disabled;
    button.setAttribute('aria-label', `${label}: ${text}`);
    if (active?.select === select) paint();
  }

  function close(restoreFocus = false) {
    if (!active) return;
    const {button, menu} = active;
    active = null;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    menu.remove();
    if (restoreFocus && button.isConnected) button.focus({preventScroll: true});
  }

  function position() {
    if (!active) return;
    const {button, menu} = active;
    if (!button.isConnected || button.closest('.view:not(.active)')) return close();
    const box = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop || 0;
    const left = viewport?.offsetLeft || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    if (box.bottom < top || box.top > top + height) return close();
    const menuWidth = Math.min(Math.max(box.width, 132), 260, width - 16);
    menu.style.width = `${menuWidth}px`;
    menu.style.left = `${Math.max(left + 8, Math.min(box.left, left + width - menuWidth - 8))}px`;
    const below = top + height - box.bottom - 12;
    const above = box.top - top - 12;
    const useAbove = below < 160 && above > below;
    menu.style.maxHeight = `${Math.max(36, Math.min(224, useAbove ? above : below))}px`;
    menu.style.top = `${useAbove ? Math.max(top + 8, box.top - menu.offsetHeight - 4) : box.bottom + 4}px`;
  }

  function paint() {
    if (!active) return;
    const {select, button, menu, index} = active;
    [...menu.children].forEach((row, i) => {
      row.setAttribute('aria-selected', String(select.selectedIndex === i));
      row.classList.toggle('lexi-select-current', i === index);
    });
    button.setAttribute('aria-activedescendant', `${menu.id}-${index}`);
  }

  function enabled(option) {
    return Boolean(option && !option.disabled && !option.closest?.('optgroup[disabled]'));
  }

  function choose(index) {
    if (!active || !enabled(active.select.options[index])) return;
    const {select} = active;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    sync(select);
    close(true);
    if (changed) {
      select.dispatchEvent(new Event('input', {bubbles: true}));
      select.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }

  function open(select, button) {
    close();
    if (select.disabled || !select.options.length) return;
    const menu = document.createElement('div');
    menu.id = button.getAttribute('aria-controls');
    menu.className = 'lexi-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', select.getAttribute('aria-label') || select.name || 'Choices');
    [...select.options].forEach((option, index) => {
      const row = document.createElement('div');
      row.id = `${menu.id}-${index}`;
      row.className = 'lexi-select-option';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-disabled', String(!enabled(option)));
      row.textContent = option.textContent;
      row.addEventListener('pointerdown', event => event.preventDefault());
      row.addEventListener('click', event => { event.stopPropagation(); choose(index); });
      menu.append(row);
    });
    (button.closest('dialog[open]') || document.body).append(menu);
    const firstEnabled = [...select.options].findIndex(enabled);
    if (firstEnabled < 0) { menu.remove(); return; }
    active = {select, button, menu, index: enabled(select.options[select.selectedIndex]) ? select.selectedIndex : firstEnabled};
    button.setAttribute('aria-expanded', 'true');
    typeText = '';
    paint();
    position();
  }

  function keydown(event, select, button) {
    const key = event.key;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault();
      if (active?.button !== button) { open(select, button); return; }
      if (key === 'Enter' || key === ' ') { choose(active.index); return; }
      const indexes = [...select.options].map((option, i) => enabled(option) ? i : -1).filter(i => i >= 0);
      const at = indexes.indexOf(active.index);
      if (key === 'Home') active.index = indexes[0];
      else if (key === 'End') active.index = indexes[indexes.length - 1];
      else active.index = indexes[Math.max(0, Math.min(indexes.length - 1, at + (key === 'ArrowDown' ? 1 : -1)))];
      paint();
      active.menu.children[active.index]?.scrollIntoView?.({block: 'nearest'});
    } else if (key === 'Escape' && active?.button === button) {
      event.preventDefault(); close(true);
    } else if (key === 'Tab') close();
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (active?.button !== button) open(select, button);
      if (!active) return;
      typeText = Date.now() - typeAt < 600 ? typeText + key.toLowerCase() : key.toLowerCase();
      typeAt = Date.now();
      const index = [...select.options].findIndex(option => enabled(option) && option.textContent.toLowerCase().startsWith(typeText));
      if (index >= 0) { active.index = index; paint(); }
    }
  }

  function upgrade(select) {
    if (select.multiple || select.size > 1) return;
    if (controls.has(select)) { sync(select); return; }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `lexi-select-button${select.classList.contains('visit-plan-select') ? ' lexi-select-visit' : ''}`;
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `lexi-select-menu-${++sequence}`);
    controls.set(select, button);
    select.classList.add('lexi-select-native');
    select.hidden = true;
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    select.after(button);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (active?.button === button) close(); else open(select, button);
    });
    button.addEventListener('keydown', event => keydown(event, select, button));
    button.addEventListener('blur', () => close());
    sync(select);
  }

  function scan() {
    document.querySelectorAll('select').forEach(upgrade);
    if (active && (!active.button.isConnected || !active.select.isConnected)) close();
  }
  window.lexiRefreshCompactSelect = sync;
  document.addEventListener('change', event => {
    if (event.target instanceof HTMLSelectElement) sync(event.target);
  });
  document.addEventListener('reset', () => setTimeout(scan, 0));
  document.addEventListener('pointerdown', event => {
    if (active && !active.button.contains(event.target) && !active.menu.contains(event.target)) close();
  }, true);
  document.addEventListener('click', event => {
    if (active && !active.button.contains(event.target) && !active.menu.contains(event.target)) close();
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  new MutationObserver(scan).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected']});
  scan();
})();
