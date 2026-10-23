const API_URL = 'https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
const KEY_STORAGE = 'lexiTravelApiKey';

const tabs = [...document.querySelectorAll('.tab')];
const views = [...document.querySelectorAll('.view')];
const settingsBtn = document.getElementById('settingsBtn');
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput = document.getElementById('apiKey');
const saveKeyBtn = document.getElementById('saveKeyBtn');
const connectionResult = document.getElementById('connectionResult');
const countryStatus = document.getElementById('countryStatus');
const countryList = document.getElementById('countryList');
const monthTitle = document.getElementById('monthTitle');
const prevMonthBtn = document.getElementById('prevMonthBtn');
const nextMonthBtn = document.getElementById('nextMonthBtn');
const calendarGrid = document.getElementById('calendarGrid');
const calendarStatus = document.getElementById('calendarStatus');
const dayDialog = document.getElementById('dayDialog');
const closeDayBtn = document.getElementById('closeDayBtn');
const dayTitle = document.getElementById('dayTitle');
const dayLocation = document.getElementById('dayLocation');
const dayDetails = document.getElementById('dayDetails');

let appData = {
  locations: [],
  events: [],
  notes: [],
  countries: [],
  dayOverrides: []
};

const now = new Date();
let calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    const target = tab.dataset.view;

    tabs.forEach(item => item.classList.toggle('active', item === tab));
    views.forEach(view => view.classList.toggle('active', view.id === target));

    if (target === 'calendarView') loadCalendarData();
    if (target === 'countryView') loadCountryRules();
  });
}

settingsBtn.addEventListener('click', () => {
  apiKeyInput.value = localStorage.getItem(KEY_STORAGE) || '';
  connectionResult.textContent = '';
  connectionResult.classList.remove('error');
  settingsDialog.showModal();
});

saveKeyBtn.addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();

  if (!key) {
    connectionResult.textContent = 'Enter your API key.';
    connectionResult.classList.add('error');
    return;
  }

  saveKeyBtn.disabled = true;
  connectionResult.textContent = 'Testing connection…';
  connectionResult.classList.remove('error');

  try {
    const data = await fetchApi(key, 'ping');

    if (!data.ok) {
      throw new Error(data.error || 'Connection failed');
    }

    localStorage.setItem(KEY_STORAGE, key);
    connectionResult.textContent = 'Connected.';
    await loadAllData();

    setTimeout(() => settingsDialog.close(), 350);
  } catch (error) {
    connectionResult.textContent = error.message || 'Connection failed.';
    connectionResult.classList.add('error');
  } finally {
    saveKeyBtn.disabled = false;
  }
});

prevMonthBtn.addEventListener('click', () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});

closeDayBtn.addEventListener('click', () => dayDialog.close());

async function fetchApi(key, action = 'data') {
  const url = new URL(API_URL);
  url.searchParams.set('key', key);
  url.searchParams.set('action', action);
  url.searchParams.set('_', Date.now().toString());

  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-store',
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function loadAllData() {
  const key = localStorage.getItem(KEY_STORAGE);
  if (!key) return false;

  const readStartedAt = Date.now();
  const data = await fetchApi(key, 'data');
  data.__lexiReadStartedAt = readStartedAt;
  if (!data.ok) throw new Error(data.error || 'Could not load data');

  appData = {
    locations: Array.isArray(data.locations) ? data.locations : [],
    events: Array.isArray(data.events) ? data.events : [],
    notes: Array.isArray(data.notes) ? data.notes : [],
    countries: Array.isArray(data.countries) ? data.countries : [],
    dayOverrides: Array.isArray(data.dayOverrides) ? data.dayOverrides : []
  };

  renderCalendar();
  renderCountries(appData.countries);
  return data;
}

async function loadCalendarData() {
  const key = localStorage.getItem(KEY_STORAGE);

  if (!key) {
    calendarStatus.textContent = 'Connect in Settings to load travel data.';
    renderCalendar();
    return;
  }

  calendarStatus.textContent = 'Loading…';

  try {
    await loadAllData();
    calendarStatus.textContent = appData.locations.length || appData.events.length
      ? 'Connected'
      : 'Connected · no calendar entries yet';
  } catch (error) {
    calendarStatus.textContent = error.message || 'Could not load calendar.';
  }
}

async function loadCountryRules() {
  const key = localStorage.getItem(KEY_STORAGE);

  if (!key) {
    countryStatus.textContent = 'Enter your API key in Settings to load country rules.';
    countryList.innerHTML = '';
    return;
  }

  countryStatus.textContent = 'Loading…';

  try {
    await loadAllData();
    countryStatus.textContent = `Connected · ${appData.countries.length} country rules loaded`;
  } catch (error) {
    countryStatus.textContent = error.message || 'Could not load country rules.';
    countryList.innerHTML = '';
  }
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  monthTitle.textContent = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(calendarCursor);

  calendarGrid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - mondayOffset);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  for (let i = 0; i < cellCount; i += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const dateKey = toDateKey(date);
    const location = locationForDate(dateKey);
    const events = eventsForDate(dateKey);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day-cell';
    cell.setAttribute('aria-label', dateKey);

    if (date.getMonth() !== month) cell.classList.add('other-month');
    if (dateKey === toDateKey(now)) cell.classList.add('today');

    const top = document.createElement('div');
    top.className = 'day-top';

    const number = document.createElement('span');
    number.className = 'day-number';
    number.textContent = date.getDate();
    top.append(number);

    if (location) {
      const code = document.createElement('span');
      code.className = 'day-location-code';
      code.textContent = location.Label || location.City || location.Country || '';
      top.append(code);
    }

    cell.append(top);

    events.slice(0, 2).forEach(event => {
      const item = document.createElement('span');
      item.className = `day-event ${eventClass(event)}`.trim();
      item.textContent = event.Title || event.Category || 'Event';
      cell.append(item);
    });

    if (events.length > 2) {
      const more = document.createElement('div');
      more.className = 'day-more';
      more.textContent = `+${events.length - 2} more`;
      cell.append(more);
    }

    cell.addEventListener('click', () => openDay(dateKey));
    calendarGrid.append(cell);
  }
}

function openDay(dateKey) {
  const location = locationForDate(dateKey);
  const events = eventsForDate(dateKey);
  const date = parseDateKey(dateKey);

  dayTitle.textContent = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);

  dayLocation.textContent = location
    ? [location.Label || location.City || location.Country, location.Country].filter(Boolean).join(' · ')
    : '';

  dayDetails.innerHTML = '';

  if (location && location.Notes) {
    addDetailLine(location.Notes);
  }

  for (const event of events) {
    const title = event.Title || event.Category || 'Event';
    const metaParts = [event.Time, event.Category, event.Status].filter(Boolean);
    const detailText = event.Details || '';

    const line = document.createElement('div');
    line.className = 'detail-line';

    const strong = document.createElement('strong');
    strong.textContent = title;
    line.append(strong);

    if (metaParts.length) {
      const meta = document.createElement('div');
      meta.className = 'detail-meta';
      meta.textContent = metaParts.join(' | ');
      line.append(meta);
    }

    if (detailText) {
      const detail = document.createElement('div');
      detail.className = 'detail-meta';
      detail.textContent = detailText;
      line.append(detail);
    }

    dayDetails.append(line);
  }

  if (!location && events.length === 0) {
    addDetailLine('No entries for this day.', true);
  }

  dayDialog.showModal();
}

function addDetailLine(text, muted = false) {
  const line = document.createElement('div');
  line.className = `detail-line${muted ? ' muted' : ''}`;
  line.textContent = text;
  dayDetails.append(line);
}

function locationForDate(dateKey) {
  return appData.locations.find(location => {
    const start = normalizeDateString(location['Start Date']);
    const end = normalizeDateString(location['End Date']) || start;
    return start && dateKey >= start && dateKey <= end;
  });
}

function eventsForDate(dateKey) {
  return appData.events.filter(event => normalizeDateString(event.Date) === dateKey);
}

function normalizeDateString(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : toDateKey(parsed);
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function eventClass(event) {
  const text = `${event.Category || ''} ${event.Title || ''}`.toLowerCase();
  if (text.includes('flight') || text.includes('travel')) return 'travel';
  if (text.includes('off')) return 'off';
  return '';
}

function renderCountries(countries) {
  countryList.innerHTML = '';

  for (const country of countries) {
    if (String(country.Enabled).toUpperCase() === 'FALSE') continue;

    const card = document.createElement('article');
    card.className = 'country-card';

    const calendarLimit = country['Calendar Year Limit'] || '—';
    const rollingLimit = country['Rolling 12 Limit'];
    const limitText = rollingLimit
      ? `${calendarLimit} / yr · ${rollingLimit} rolling 12m`
      : `${calendarLimit} / yr`;

    const row = document.createElement('div');
    row.className = 'country-row';

    const nameWrap = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'country-name';
    name.textContent = country.Country || country.Code || 'Country';

    const code = document.createElement('div');
    code.className = 'country-code';
    code.textContent = country.Code || '';

    nameWrap.append(name, code);

    const limit = document.createElement('div');
    limit.className = 'country-limit';
    limit.textContent = limitText;

    row.append(nameWrap, limit);

    const rule = document.createElement('div');
    rule.className = 'country-rule';
    rule.textContent = country['Rule Notes'] || '';

    card.append(row, rule);
    countryList.append(card);
  }
}

renderCalendar();

if (localStorage.getItem(KEY_STORAGE)) {
  loadCalendarData();
}

(() => {
  const DRAFT_STORAGE = 'lexiTravelNoteDraftsV1';
  const notesTab = document.querySelector('.tab[data-view="notesView"]');
  const notesLayout = document.getElementById('notesLayout');
  const notesList = document.getElementById('notesList');
  const notesListBtn = document.getElementById('notesListBtn');
  const notesCloseBtn = document.getElementById('notesCloseBtn');
  const noteTitle = document.getElementById('noteTitle');
  const noteTitleInput = document.getElementById('noteTitleInput');
  const noteBody = document.getElementById('noteBody');
  const noteEditBtn = document.getElementById('noteEditBtn');
  const noteSaveBtn = document.getElementById('noteSaveBtn');
  const noteCancelBtn = document.getElementById('noteCancelBtn');
  const noteSaveStatus = document.getElementById('noteSaveStatus');

  if (!notesTab || !notesLayout || !notesList || !noteTitle || !noteBody) return;

  let selectedNoteId = '';
  let editing = false;

  function readDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFT_STORAGE) || '{}') || {};
    } catch (error) {
      return {};
    }
  }

  function writeDrafts(drafts) {
    localStorage.setItem(DRAFT_STORAGE, JSON.stringify(drafts));
  }

  function isTrue(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  }

  function visibleNotes() {
    return appData.notes
      .filter(note => !isTrue(note.Archived))
      .slice()
      .sort((a, b) => {
        const pinned = Number(isTrue(b.Pinned)) - Number(isTrue(a.Pinned));
        if (pinned) return pinned;
        const order = Number(a['Sort Order'] || 9999) - Number(b['Sort Order'] || 9999);
        if (order) return order;
        return String(a.Title || '').localeCompare(String(b.Title || ''));
      });
  }

  function effectiveNote(note) {
    if (!note) return null;
    const draft = readDrafts()[note.ID];
    return draft ? { ...note, ...draft } : note;
  }

  function parseBody(body) {
    const text = String(body || '').trim();
    if (!text) return { version: 1, blocks: [] };

    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.blocks)) return parsed;
    } catch (error) {
      // Plain-text notes remain supported.
    }

    return { version: 1, blocks: [{ type: 'paragraph', text }] };
  }

  function currentBaseNote() {
    return visibleNotes().find(note => String(note.ID) === String(selectedNoteId)) || null;
  }

  function renderList() {
    const notes = visibleNotes();
    notesList.innerHTML = '';

    if (!notes.length) {
      const empty = document.createElement('div');
      empty.className = 'note-empty';
      empty.textContent = localStorage.getItem(KEY_STORAGE)
        ? 'No notes yet.'
        : 'Connect in Settings to load notes.';
      notesList.append(empty);
      return;
    }

    if (!selectedNoteId || !notes.some(note => String(note.ID) === String(selectedNoteId))) {
      selectedNoteId = String(notes[0].ID || '');
    }

    for (const baseNote of notes) {
      const note = effectiveNote(baseNote);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'note-list-item';
      button.classList.toggle('active', String(baseNote.ID) === String(selectedNoteId));
      button.textContent = note.Title || 'Untitled Note';

      if (note.Category) {
        const meta = document.createElement('span');
        meta.className = 'note-list-meta';
        meta.textContent = note.Category;
        button.append(meta);
      }

      button.addEventListener('click', () => {
        selectedNoteId = String(baseNote.ID || '');
        editing = false;
        notesLayout.classList.remove('list-open');
        renderNotes();
      });

      notesList.append(button);
    }
  }

  function renderScheduleBlock(block, blockIndex) {
    const section = document.createElement('section');
    section.className = 'note-schedule';

    const heading = document.createElement('h3');
    heading.className = `note-section-title${editing ? ' note-editable' : ''}`;
    heading.textContent = block.heading || '';
    heading.dataset.blockHeading = String(blockIndex);
    if (editing) heading.contentEditable = 'true';
    section.append(heading);

    const wrap = document.createElement('div');
    wrap.className = 'note-table-wrap';

    const table = document.createElement('table');
    table.className = 'note-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    (block.columns || []).forEach(column => {
      const th = document.createElement('th');
      th.textContent = column;
      headerRow.append(th);
    });
    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    (block.rows || []).forEach((rowValues, rowIndex) => {
      const row = document.createElement('tr');
      rowValues.forEach((value, columnIndex) => {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (editing) {
          cell.contentEditable = 'true';
          cell.className = 'note-editable note-edit-cell';
          cell.dataset.blockIndex = String(blockIndex);
          cell.dataset.rowIndex = String(rowIndex);
          cell.dataset.columnIndex = String(columnIndex);
        }
        row.append(cell);
      });
      tbody.append(row);
    });
    table.append(tbody);
    wrap.append(table);
    section.append(wrap);
    noteBody.append(section);
  }

  function renderParagraphBlock(block, blockIndex) {
    const paragraph = document.createElement('div');
    paragraph.className = `note-paragraph${editing ? ' note-editable' : ''}`;
    paragraph.textContent = block.text || '';
    paragraph.dataset.paragraphBlock = String(blockIndex);
    if (editing) paragraph.contentEditable = 'true';
    noteBody.append(paragraph);
  }

  function renderBody(note) {
    noteBody.innerHTML = '';
    const model = parseBody(note.Body);

    if (!model.blocks.length) {
      const empty = document.createElement('div');
      empty.className = 'note-empty';
      empty.textContent = 'This note is empty.';
      noteBody.append(empty);
      return;
    }

    model.blocks.forEach((block, index) => {
      if (block.type === 'schedule') renderScheduleBlock(block, index);
      else renderParagraphBlock(block, index);
    });
  }

  function setEditControls() {
    if (noteEditBtn) noteEditBtn.hidden = editing;
    if (noteSaveBtn) noteSaveBtn.hidden = !editing;
    if (noteCancelBtn) noteCancelBtn.hidden = !editing;
    if (noteTitleInput) noteTitleInput.hidden = !editing;
    noteTitle.hidden = editing;
  }

  function renderNotes() {
    renderList();
    const baseNote = currentBaseNote();

    if (!baseNote) {
      noteTitle.textContent = 'Notes';
      if (noteTitleInput) noteTitleInput.value = '';
      noteBody.innerHTML = '<div class="note-empty">No note selected.</div>';
      if (noteEditBtn) noteEditBtn.hidden = true;
      if (noteSaveBtn) noteSaveBtn.hidden = true;
      if (noteCancelBtn) noteCancelBtn.hidden = true;
      if (noteSaveStatus) noteSaveStatus.textContent = '';
      return;
    }

    const note = effectiveNote(baseNote);
    noteTitle.textContent = note.Title || 'Untitled Note';
    if (noteTitleInput) noteTitleInput.value = note.Title || '';
    setEditControls();
    renderBody(note);

    if (noteSaveStatus) {
      const draft = readDrafts()[baseNote.ID];
      noteSaveStatus.textContent = draft
        ? 'Edited copy saved on this device · Google Sheets sync not enabled yet'
        : 'From Google Sheets';
    }
  }

  async function loadNotes() {
    if (!localStorage.getItem(KEY_STORAGE)) {
      appData.notes = [];
      renderNotes();
      return;
    }

    if (noteSaveStatus) noteSaveStatus.textContent = 'Loading…';
    try {
      await loadAllData();
      renderNotes();
    } catch (error) {
      if (noteSaveStatus) noteSaveStatus.textContent = error.message || 'Could not load notes.';
    }
  }

  function startEditing() {
    if (!currentBaseNote()) return;
    editing = true;
    renderNotes();
    if (noteTitleInput) {
      noteTitleInput.focus();
      noteTitleInput.select();
    }
  }

  function cancelEditing() {
    editing = false;
    renderNotes();
  }

  function saveDraft() {
    const baseNote = currentBaseNote();
    if (!baseNote) return;

    const note = effectiveNote(baseNote);
    const model = parseBody(note.Body);

    model.blocks.forEach((block, blockIndex) => {
      if (block.type === 'schedule') {
        const heading = noteBody.querySelector(`[data-block-heading="${blockIndex}"]`);
        if (heading) block.heading = heading.textContent.trim();

        (block.rows || []).forEach((row, rowIndex) => {
          row.forEach((value, columnIndex) => {
            const cell = noteBody.querySelector(
              `[data-block-index="${blockIndex}"][data-row-index="${rowIndex}"][data-column-index="${columnIndex}"]`
            );
            if (cell) row[columnIndex] = cell.textContent.trim();
          });
        });
      } else {
        const paragraph = noteBody.querySelector(`[data-paragraph-block="${blockIndex}"]`);
        if (paragraph) block.text = paragraph.textContent.trim();
      }
    });

    const drafts = readDrafts();
    drafts[baseNote.ID] = {
      Title: noteTitleInput ? noteTitleInput.value.trim() || 'Untitled Note' : note.Title,
      Body: JSON.stringify(model),
      savedAt: Date.now()
    };
    writeDrafts(drafts);

    editing = false;
    renderNotes();
  }

  notesTab.addEventListener('click', loadNotes);
  notesListBtn?.addEventListener('click', () => notesLayout.classList.add('list-open'));
  notesCloseBtn?.addEventListener('click', () => notesLayout.classList.remove('list-open'));
  noteEditBtn?.addEventListener('click', startEditing);
  noteCancelBtn?.addEventListener('click', cancelEditing);
  noteSaveBtn?.addEventListener('click', saveDraft);
})();
