(() => {
  const CACHE_KEY = 'lexiTravelCountryRulesCacheV1';
  const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  if (typeof loadAllData !== 'function' || typeof loadCountryRules !== 'function') return;

  const originalLoadAllData = loadAllData;
  const originalLoadCountryRules = loadCountryRules;

  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.countries)) return [];
      if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS) return [];
      return parsed.countries;
    } catch (error) {
      return [];
    }
  }

  function writeCache(countries) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        savedAt: Date.now(),
        countries: Array.isArray(countries) ? countries : []
      }));
    } catch (error) {
      // Cache failure should never block Plan.
    }
  }

  function showRules(countries, source = 'live') {
    const list = Array.isArray(countries) ? countries : [];
    renderCountries(list);
    countryStatus.textContent = source === 'cache'
      ? `Saved · ${list.length} country rules`
      : `Connected · ${list.length} country rules loaded`;
  }

  loadAllData = async function (...args) {
    const result = await originalLoadAllData(...args);
    writeCache(appData.countries || []);
    if (document.getElementById('countryView')?.classList.contains('active')) {
      showRules(appData.countries || [], 'live');
    }
    return result;
  };

  loadCountryRules = async function () {
    const key = localStorage.getItem(KEY_STORAGE);

    if (!key) {
      countryStatus.textContent = 'Enter your API key in Settings to load country rules.';
      countryList.innerHTML = '';
      return;
    }

    if (Array.isArray(appData.countries) && appData.countries.length) {
      showRules(appData.countries, 'live');
      return;
    }

    const cached = readCache();
    if (cached.length) {
      appData.countries = cached;
      showRules(cached, 'cache');
      return;
    }

    await originalLoadCountryRules();
  };

  const cached = readCache();
  if ((!Array.isArray(appData.countries) || !appData.countries.length) && cached.length) {
    appData.countries = cached;
    renderCountries(cached);
  }
})();

// Country Days hardening: the main renderer historically enforced only the
// calendar-year limit. Install the enhanced renderer after all synchronous
// scripts finish so numeric Rolling 12 Limit values are also measured.
setTimeout(() => {
  const list = document.getElementById('countryList');
  const status = document.getElementById('countryStatus');
  if (!list || !status || typeof normalizeDateString !== 'function') return;

  function keyFromUtcDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function addDaysKey(dateKey, days) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return keyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
  }

  function dateKeyMs(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function formatStayDate(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }

  function enabled(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function allCountryDates(country) {
    const dates = new Set();
    const countryName = String(country.Country || '').trim().toLowerCase();

    for (const location of appData.locations || []) {
      if (String(location.Country || '').trim().toLowerCase() !== countryName) continue;

      const start = normalizeDateString(location['Start Date']);
      const end = normalizeDateString(location['End Date']) || start;
      if (!start || !end || start > end) continue;

      for (let key = start; key <= end; key = addDaysKey(key, 1)) {
        dates.add(key);
      }
    }

    const code = String(country.Code || '').trim().toUpperCase();
    for (const override of appData.dayOverrides || []) {
      if (String(override['Country Code'] || '').trim().toUpperCase() !== code) continue;
      const key = normalizeDateString(override.Date);
      if (!key) continue;

      const value = String(override['Count Override'] ?? '').trim().toUpperCase();
      if (['0', 'FALSE', 'NO', 'N'].includes(value)) dates.delete(key);
      else dates.add(key);
    }

    return [...dates].sort();
  }

  function rolling12Peak(dates) {
    if (!dates.length) return 0;
    let left = 0;
    let peak = 0;

    for (let right = 0; right < dates.length; right += 1) {
      const rightMs = dateKeyMs(dates[right]);
      while (left <= right && rightMs - dateKeyMs(dates[left]) > 364 * 86400000) {
        left += 1;
      }
      peak = Math.max(peak, right - left + 1);
    }

    return peak;
  }

  function countryStayRanges(country, year) {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const countryName = String(country.Country || '').trim().toLowerCase();
    const rawRanges = [];

    for (const location of appData.locations || []) {
      if (String(location.Country || '').trim().toLowerCase() !== countryName) continue;
      const start = normalizeDateString(location['Start Date']);
      const end = normalizeDateString(location['End Date']) || start;
      if (!start || !end || end < yearStart || start > yearEnd) continue;
      rawRanges.push({ start, end });
    }

    rawRanges.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
    const merged = [];

    for (const range of rawRanges) {
      const last = merged[merged.length - 1];
      if (!last || range.start > addDaysKey(last.end, 1)) {
        merged.push({ ...range });
      } else if (range.end > last.end) {
        last.end = range.end;
      }
    }

    return merged;
  }

  function renderCountryDaysEnhanced(countries) {
    const year = new Date().getFullYear();
    list.innerHTML = '';

    for (const country of countries || []) {
      if (!enabled(country.Enabled)) continue;

      const allDates = allCountryDates(country);
      const yearDates = allDates.filter(key => key.startsWith(`${year}-`));
      const ranges = countryStayRanges(country, year);
      const used = yearDates.length;
      const calendarLimit = Number(country['Calendar Year Limit'] || 0);
      const calendarRemaining = calendarLimit ? calendarLimit - used : null;
      const rollingLimit = Number(country['Rolling 12 Limit'] || 0);
      const rollingUsed = rollingLimit ? rolling12Peak(allDates) : null;
      const over = Boolean(
        (calendarLimit && used > calendarLimit) ||
        (rollingLimit && rollingUsed > rollingLimit)
      );

      const card = document.createElement('article');
      card.className = 'country-card country-days-card';

      const head = document.createElement('div');
      head.className = 'country-days-head';

      const nameWrap = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'country-name';
      name.textContent = country.Country || country.Code || 'Country';
      const code = document.createElement('div');
      code.className = 'country-code';
      code.textContent = `${country.Code || ''} · ${year}`;
      nameWrap.append(name, code);

      const total = document.createElement('div');
      total.className = `country-days-total${over ? ' over' : ''}`;

      const calendarLine = document.createElement('div');
      if (calendarLimit) {
        calendarLine.textContent = calendarRemaining >= 0
          ? `${used}/${calendarLimit} · ${calendarRemaining} left`
          : `${used}/${calendarLimit} · ${Math.abs(calendarRemaining)} over`;
      } else {
        calendarLine.textContent = `${used} days`;
      }
      total.append(calendarLine);

      if (rollingLimit) {
        const rollingLine = document.createElement('div');
        rollingLine.className = 'country-code';
        rollingLine.textContent = `Rolling 12m peak ${rollingUsed}/${rollingLimit}`;
        total.append(rollingLine);
      }

      head.append(nameWrap, total);
      card.append(head);

      const stays = document.createElement('div');
      stays.className = 'country-stay-list';

      if (!ranges.length) {
        const empty = document.createElement('div');
        empty.className = 'country-stay-row empty';
        empty.textContent = `No stays in ${year}`;
        stays.append(empty);
      } else {
        for (const range of ranges) {
          const row = document.createElement('div');
          row.className = 'country-stay-row';
          const rangeDaysThisYear = yearDates.filter(key => key >= range.start && key <= range.end).length;
          const crossesYear = !range.start.startsWith(`${year}-`) || !range.end.startsWith(`${year}-`);

          if (range.start === range.end) {
            row.textContent = `${formatStayDate(range.start)} · ${rangeDaysThisYear} day`;
          } else if (crossesYear) {
            row.textContent = `${formatStayDate(range.start)}–${formatStayDate(range.end)} · ${rangeDaysThisYear} days in ${year}`;
          } else {
            row.textContent = `${formatStayDate(range.start)}–${formatStayDate(range.end)} · ${rangeDaysThisYear} days`;
          }
          stays.append(row);
        }
      }
      card.append(stays);

      if (country['Rule Notes']) {
        const rule = document.createElement('div');
        rule.className = 'country-rule';
        rule.textContent = country['Rule Notes'];
        card.append(rule);
      }

      list.append(card);
    }

    requestAnimationFrame(() => {
      status.textContent = `${year} · stayed + planned · rolling 12m peak where configured`;
      status.classList.add('country-year-status');
    });
  }

  renderCountries = renderCountryDaysEnhanced;
  if (Array.isArray(appData.countries) && appData.countries.length) {
    renderCountryDaysEnhanced(appData.countries);
  }
}, 0);
