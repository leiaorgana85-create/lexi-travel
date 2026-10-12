(() => {
  const PLAN_STORAGE_KEY = 'lexiTravelMonthlyPlanV1';
  const DELETE_STORAGE_KEY = 'lexiTravelMonthlyPlanDeletedV1';
  const DUMMY_IDS = new Set([
    'plan-1791841355922-9grk5',
    'plan-1791844892762-kch6d',
    'plan-1791844934512-1t4z6',
    'plan-1791846172068-jg6ui'
  ]);

  function readObject(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      return {};
    }
  }

  const plan = readObject(PLAN_STORAGE_KEY);
  let changed = false;

  for (const [month, items] of Object.entries(plan)) {
    if (!Array.isArray(items)) continue;
    const filtered = items.filter(item => !DUMMY_IDS.has(String(item?.id || '')));
    if (filtered.length !== items.length) {
      plan[month] = filtered;
      changed = true;
    }
  }

  if (changed) {
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
  }

  const deleted = readObject(DELETE_STORAGE_KEY);
  let deletedChanged = false;
  for (const id of DUMMY_IDS) {
    if (Object.prototype.hasOwnProperty.call(deleted, id)) {
      delete deleted[id];
      deletedChanged = true;
    }
  }
  if (deletedChanged) {
    localStorage.setItem(DELETE_STORAGE_KEY, JSON.stringify(deleted));
  }
})();
