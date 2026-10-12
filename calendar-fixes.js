(() => {
  function compactClock(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s*AM\b/i, 'a')
      .replace(/\s*PM\b/i, 'p');
  }

  function compactAppointmentClock(value) {
    return String(value || '')
      .trim()
      .replace(/^~\s*/, '')
      .replace(/\s*AM\b/i, 'am')
      .replace(/\s*PM\b/i, 'pm');
  }

  function appendLine(label, text, className) {
    const line = document.createElement('span');
    line.className = className;
    line.textContent = text;
    label.append(line);
    return line;
  }

  function appendTravelTimeLine(label, departure, arrival) {
    appendLine(
      label,
      `${compactClock(departure)}-${compactClock(arrival)}`,
      'day-event-flight-time-line'
    );
  }

  function applyLocationTone(cell, dateKey) {
    const codeEl = cell.querySelector('.day-location-code');
    if (!codeEl) return;

    codeEl.classList.remove('city-pus', 'city-bkk', 'city-other');
    const location = typeof locationForDate === 'function' ? locationForDate(dateKey) : null;
    const code = String(location?.Label || codeEl.textContent || '').trim().toUpperCase();

    if (code === 'PUS') codeEl.classList.add('city-pus');
    else if (code === 'BKK') codeEl.classList.add('city-bkk');
    else codeEl.classList.add('city-other');
  }

  function refreshCalendarEventLabels() {
    document.querySelectorAll('.day-cell').forEach(cell => {
      const dateKey = cell.getAttribute('aria-label');
      if (!dateKey || typeof eventsForDate !== 'function') return;

      applyLocationTone(cell, dateKey);

      const events = eventsForDate(dateKey).slice(0, 2);
      const labels = cell.querySelectorAll('.day-event');

      labels.forEach((label, index) => {
        const event = events[index];
        if (!event) return;

        const title = String(event.Title || event.Category || 'Event').trim();
        const time = String(event.Time || '').trim();
        const details = String(event.Details || '').trim();
        const category = String(event.Category || '').toLowerCase();
        label.textContent = '';
        label.classList.remove('travel-route');

        const routeMatch = title.match(/^\s*([A-Za-z]{3})\s*[→>-]+\s*([A-Za-z]{3})\s*$/);
        const timeParts = time.split(/\s*→\s*/);

        if ((category.includes('flight') || category.includes('travel')) && routeMatch) {
          const origin = routeMatch[1].toUpperCase();
          const destination = routeMatch[2].toUpperCase();
          label.classList.add('travel-route');

          if (timeParts.length === 2) {
            appendTravelTimeLine(label, timeParts[0], timeParts[1]);
          } else if (time) {
            appendLine(label, compactClock(time), 'day-event-flight-time-line');
          }

          appendLine(label, `${origin}→${destination}`, 'day-event-flight-line');

          if (details) {
            appendLine(label, details, 'day-event-generic-line');
          }
          return;
        }

        if (category.includes('appointment')) {
          if (time) {
            appendLine(label, compactAppointmentClock(time), 'day-event-generic-line');
          }
          appendLine(label, title, 'day-event-generic-line');
          return;
        }

        const generic = time ? `${compactClock(time)} ${title}` : title;
        appendLine(label, generic, 'day-event-generic-line');
      });
    });
  }

  const observer = new MutationObserver(refreshCalendarEventLabels);
  observer.observe(document.getElementById('calendarGrid'), { childList: true });
  refreshCalendarEventLabels();
})();

(() => {
  const list = document.getElementById('countryList');
  const status = document.getElementById('countryStatus');
  if (!list || !status || typeof renderCountries !== 'function') return;

  function keyFromUtcDate(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }

  function addDaysKey(dateKey, days) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return keyFromUtcDate(new Date(Date.UTC(year, month - 1, day + days)));
  }

  function formatStayDate(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }

  function enabled(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function countryDateSet(country, year) {
    const dates = new Set();
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const countryName = String(country.Country || '').trim().toLowerCase();

    for (const location of appData.locations || []) {
      if (String(location.Country || '').trim().toLowerCase() !== countryName) continue;

      const rawStart = normalizeDateString(location['Start Date']);
      const rawEnd = normalizeDateString(location['End Date']) || rawStart;
      if (!rawStart || !rawEnd) continue;

      const start = rawStart < yearStart ? yearStart : rawStart;
      const end = rawEnd > yearEnd ? yearEnd : rawEnd;
      if (start > end) continue;

      for (let key = start; key <= end; key = addDaysKey(key, 1)) {
        dates.add(key);
      }
    }

    const code = String(country.Code || '').trim().toUpperCase();
    for (const override of appData.dayOverrides || []) {
      if (String(override['Country Code'] || '').trim().toUpperCase() !== code) continue;
      const key = normalizeDateString(override.Date);
      if (!key || !key.startsWith(`${year}-`)) continue;

      const value = String(override['Count Override'] ?? '').trim().toUpperCase();
      if (['0', 'FALSE', 'NO', 'N'].includes(value)) dates.delete(key);
      else dates.add(key);
    }

    return [...dates].sort();
  }

  function compressDateKeys(keys) {
    if (!keys.length) return [];
    const ranges = [];
    let start = keys[0];
    let end = keys[0];

    for (let i = 1; i < keys.length; i += 1) {
      if (keys[i] === addDaysKey(end, 1)) {
        end = keys[i];
      } else {
        ranges.push({ start, end });
        start = keys[i];
        end = keys[i];
      }
    }
    ranges.push({ start, end });
    return ranges;
  }

  function daysInRange(start, end) {
    let count = 0;
    for (let key = start; key <= end; key = addDaysKey(key, 1)) count += 1;
    return count;
  }

  function renderCountryDays(countries) {
    const year = new Date().getFullYear();
    list.innerHTML = '';

    for (const country of countries) {
      if (!enabled(country.Enabled)) continue;

      const dates = countryDateSet(country, year);
      const ranges = compressDateKeys(dates);
      const used = dates.length;
      const limit = Number(country['Calendar Year Limit'] || 0);
      const remaining = limit ? limit - used : null;

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
      total.className = `country-days-total${remaining !== null && remaining < 0 ? ' over' : ''}`;
      if (limit) {
        total.textContent = remaining >= 0
          ? `${used}/${limit} · ${remaining} left`
          : `${used}/${limit} · ${Math.abs(remaining)} over`;
      } else {
        total.textContent = `${used} days`;
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
          const rangeDays = daysInRange(range.start, range.end);
          row.textContent = range.start === range.end
            ? `${formatStayDate(range.start)} · ${rangeDays} day`
            : `${formatStayDate(range.start)}–${formatStayDate(range.end)} · ${rangeDays} days`;
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
      status.textContent = `${year} · stayed + planned`;
      status.classList.add('country-year-status');
    });
  }

  renderCountries = renderCountryDays;
  if (Array.isArray(appData.countries) && appData.countries.length) {
    renderCountryDays(appData.countries);
  }
})();
