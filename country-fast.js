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
