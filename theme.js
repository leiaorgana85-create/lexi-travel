(() => {
  const STORAGE_KEY = 'lexiTravelTheme';
  const DARK_THEME_COLOR = '#12151b';
  const LIGHT_THEME_COLOR = '#ffffff';
  const SHOPPING_CACHE_KEY = 'lexiTravelShoppingCacheV1';
  const VISIT_CACHE_KEY = 'lexiTravelVisitCacheV1';
  const READ_CACHE_TTL_MS = 60 * 1000;

  function readTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
    } catch (error) {
      return 'light';
    }
  }

  function writeTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      // Theme still applies for this page even if storage is unavailable.
    }
  }

  function updateControls(theme) {
    document.querySelectorAll('[data-theme-option]').forEach(button => {
      const selected = button.dataset.themeOption === theme;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function applyTheme(theme, persist = false) {
    const nextTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', nextTheme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
    }

    updateControls(nextTheme);
    if (persist) writeTheme(nextTheme);
  }

  function installLowLatencyReads() {
    if (window.lexiTravelLowLatencyInstalled) return;
    if (typeof API_URL === 'undefined' || typeof KEY_STORAGE === 'undefined') return;

    window.lexiTravelLowLatencyInstalled = true;

    const baseFetch = window.fetch.bind(window);
    const memoryCache = new Map();
    const inflight = new Map();
    const generations = new Map();
    const pendingWrites = new Map();

    function apiRequest(input) {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return false;
      try {
        const request = new URL(raw, window.location.href);
        const api = new URL(String(API_URL), window.location.href);
        return request.origin === api.origin && request.pathname === api.pathname;
      } catch (error) {
        return false;
      }
    }

    function requestMethod(input, init) {
      return String(init?.method || input?.method || 'GET').toUpperCase();
    }

    function requestParams(input, init) {
      if (requestMethod(input, init) === 'GET') {
        try {
          const raw = typeof input === 'string' ? input : input?.url;
          return new URL(raw, window.location.href).searchParams;
        } catch (error) {
          return new URLSearchParams();
        }
      }
      const body = init?.body;
      if (body instanceof URLSearchParams) return new URLSearchParams(body.toString());
      if (typeof body === 'string') return new URLSearchParams(body);
      return new URLSearchParams();
    }

    function jsonResponse(result) {
      return new Response(JSON.stringify(result.data), {
        status: result.status,
        statusText: result.statusText || '',
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    function cacheFresh(entry) {
      return Boolean(entry && Date.now() - entry.savedAt < READ_CACHE_TTL_MS);
    }

    function writeListCache(storageKey, items) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          savedAt: Date.now(),
          items: Array.isArray(items) ? items : []
        }));
      } catch (error) {
        // Display cache failure must not block network data.
      }
    }

    function storeRead(key, data) {
      const entry = { savedAt: Date.now(), data };
      memoryCache.set(key, entry);
      if (key === 'shoppinglist') writeListCache(SHOPPING_CACHE_KEY, data?.items);
      if (key === 'visitlist') writeListCache(VISIT_CACHE_KEY, data?.items);
      return entry;
    }

    async function networkJson(input, init) {
      const response = await baseFetch(input, init);
      let data;
      try {
        data = await response.json();
      } catch (error) {
        throw new Error(`Invalid JSON response (${response.status})`);
      }
      return {
        data,
        status: response.status,
        statusText: response.statusText
      };
    }

    async function readThrough(cacheKey, input, init) {
      const writes = pendingWrites.get(cacheKey);
      if (writes?.size) await Promise.allSettled([...writes]);
      const generation = generations.get(cacheKey) || 0;
      const cached = memoryCache.get(cacheKey);
      if (cacheFresh(cached)) {
        return jsonResponse({ data: cached.data, status: 200, statusText: 'OK' });
      }
      const existing = inflight.get(cacheKey);
      if (existing?.generation === generation) return jsonResponse(await existing.promise);
      const entry = { generation, promise: null };
      const request = networkJson(input, init).then(async result => {
        if ((generations.get(cacheKey) || 0) !== generation) {
          const fresh = await readThrough(cacheKey, input, init);
          return { data: await fresh.json(), status: fresh.status, statusText: fresh.statusText };
        }
        if (result.status >= 200 && result.status < 300 && result.data?.ok === true) {
          storeRead(cacheKey, result.data);
        }
        return result;
      }).finally(() => {
        if (inflight.get(cacheKey) === entry) inflight.delete(cacheKey);
      });
      entry.promise = request;
      inflight.set(cacheKey, entry);
      return jsonResponse(await request);
    }

    function invalidate(cacheKey) {
      generations.set(cacheKey, (generations.get(cacheKey) || 0) + 1);
      memoryCache.delete(cacheKey);
    }

    window.fetch = async function lexiTravelLowLatencyFetch(input, init = {}) {
      if (!apiRequest(input)) return baseFetch(input, init);
      const method = requestMethod(input, init);
      const params = requestParams(input, init);
      const action = String(params.get('action') || (method === 'GET' ? 'data' : '')).trim().toLowerCase();
      // Core data/Notes are never replayed from this display-list cache.
      if (method === 'POST' && (action === 'shoppinglist' || action === 'visitlist')) {
        return readThrough(action, input, init);
      }
      const cacheKey = action.startsWith('shopping') && action !== 'shoppingcapabilities'
        ? 'shoppinglist' : action.startsWith('visit') && action !== 'visitcapabilities'
          ? 'visitlist' : '';
      if (method !== 'POST' || !cacheKey) return baseFetch(input, init);
      invalidate(cacheKey);
      const writes = pendingWrites.get(cacheKey) || new Set();
      pendingWrites.set(cacheKey, writes);
      const pending = baseFetch(input, init);
      writes.add(pending);
      try {
        return await pending;
      } finally {
        writes.delete(pending);
        invalidate(cacheKey);
      }
    };

    function key() {
      try {
        return localStorage.getItem(KEY_STORAGE) || '';
      } catch (error) {
        return '';
      }
    }

    function postRead(action) {
      const apiKey = key();
      if (!apiKey) return Promise.resolve(false);
      const body = new URLSearchParams({ key: apiKey, action });
      return window.fetch(API_URL, {
        method: 'POST',
        body,
        cache: 'no-store',
        redirect: 'follow'
      }).then(response => response.ok).catch(() => false);
    }

    function warmAll() {
      if (!key()) return;
      Promise.allSettled([
        postRead('shoppingList'),
        postRead('visitList')
      ]);
    }

    warmAll();

    window.addEventListener('pageshow', event => {
      if (event.persisted) warmAll();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) warmAll();
    });

    const saveKeyBtn = document.getElementById('saveKeyBtn');
    saveKeyBtn?.addEventListener('click', () => {
      window.setTimeout(warmAll, 500);
    });
  }

  applyTheme(readTheme());

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(readTheme());
    installLowLatencyReads();

    document.querySelectorAll('[data-theme-option]').forEach(button => {
      button.addEventListener('click', () => {
        applyTheme(button.dataset.themeOption, true);
      });
    });
  });
})();
