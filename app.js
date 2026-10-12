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

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    const target = tab.dataset.view;

    tabs.forEach(item => item.classList.toggle('active', item === tab));
    views.forEach(view => view.classList.toggle('active', view.id === target));

    if (target === 'countryView') {
      loadCountryRules();
    }
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
    await loadCountryRules();

    setTimeout(() => settingsDialog.close(), 350);
  } catch (error) {
    connectionResult.textContent = error.message || 'Connection failed.';
    connectionResult.classList.add('error');
  } finally {
    saveKeyBtn.disabled = false;
  }
});

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

async function loadCountryRules() {
  const key = localStorage.getItem(KEY_STORAGE);

  if (!key) {
    countryStatus.textContent = 'Enter your API key in Settings to load country rules.';
    countryList.innerHTML = '';
    return;
  }

  countryStatus.textContent = 'Loading…';

  try {
    const data = await fetchApi(key, 'data');

    if (!data.ok) {
      throw new Error(data.error || 'Could not load data');
    }

    const countries = Array.isArray(data.countries) ? data.countries : [];
    renderCountries(countries);
    countryStatus.textContent = `Connected · ${countries.length} country rules loaded`;
  } catch (error) {
    countryStatus.textContent = error.message || 'Could not load country rules.';
    countryList.innerHTML = '';
  }
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

if (localStorage.getItem(KEY_STORAGE)) {
  loadCountryRules();
}
