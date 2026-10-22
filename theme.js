(() => {
  const STORAGE_KEY = 'lexiTravelTheme';
  const DARK_THEME_COLOR = '#12151b';
  const LIGHT_THEME_COLOR = '#ffffff';
  const SHOPPING_CACHE_KEY = 'lexiTravelShoppingCacheV1';
  const VISIT_CACHE_KEY = 'lexiTravelVisitCacheV1';
  const NOTES_CACHE_KEY = 'lexiTravelNotesCacheV1';
  const PROJECTED_NOTES_CACHE_KEY = 'lexiTravelProjectedNotesCacheV1';
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

  function preserveProjectedNotesForImmediateDisplay() {
    try {
      const cached = JSON.parse(localStorage.getItem(PROJECTED_NOTES_CACHE_KEY) || 'null');
      if (!cached || !Array.isArray(cached.notes) || !cached.notes.length) return;
      if (!cached.sourceSavedAt) cached.sourceSavedAt = Number(cached.savedAt || 0) || Date.now();
      cached.savedAt = Date.now();
      localStorage.setItem(PROJECTED_NOTES_CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      // A broken display cache must never block app startup.
    }
  }

  function installLowLatencyReads() {
    if (window.lexiTravelLowLatencyInstalled) return;
    if (typeof API_URL === 'undefined' || typeof KEY_STORAGE === 'undefined') return;

    window.lexiTravelLowLatencyInstalled = true;

    const baseFetch = window.fetch.bind(window);
    const memoryCache = new Map();
    const inflight = new Map();
    let notesRequested = false;

    const originalRequestNotes = window.lexiTravelRequestNotesNextLoad;
    if (typeof originalRequestNotes === 'function') {
      window.lexiTravelRequestNotesNextLoad = () => {
        notesRequested = true;
      };
    }

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

    function isReadOnlyNote(note) {
      return /\bread[- ]?only\b/i.test(String(note?.Category || ''));
    }

    function writeNoteCaches(notes) {
      try {
        const all = Array.isArray(notes) ? notes : [];
        const writable = all.filter(note => !isReadOnlyNote(note));
        const projected = all.filter(isReadOnlyNote);
        localStorage.setItem(NOTES_CACHE_KEY, JSON.stringify(writable));
        if (projected.length) {
          localStorage.setItem(PROJECTED_NOTES_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            sourceSavedAt: Date.now(),
            notes: projected
          }));
        }
      } catch (error) {
        // Notes remain available from the live request if cache storage fails.
      }
    }

    function storeRead(key, data) {
      const entry = { savedAt: Date.now(), data };
      memoryCache.set(key, entry);
      if (key === 'shoppinglist') writeListCache(SHOPPING_CACHE_KEY, data?.items);
      if (key === 'visitlist') writeListCache(VISIT_CACHE_KEY, data?.items);
      if (key === 'notes-data') writeNoteCaches(data?.notes);
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

    async function readThrough(cacheKey, input, init, beforeNetwork) {
      const cached = memoryCache.get(cacheKey);
      if (cacheFresh(cached)) {
        return jsonResponse({ data: cached.data, status: 200, statusText: 'OK' });
      }

      if (inflight.has(cacheKey)) {
        return jsonResponse(await inflight.get(cacheKey));
      }

      if (typeof beforeNetwork === 'function') beforeNetwork();

      const request = networkJson(input, init)
        .then(result => {
          if (result.status >= 200 && result.status < 300 && result.data?.ok === true) {
            storeRead(cacheKey, result.data);
          }
          return result;
        })
        .finally(() => inflight.delete(cacheKey));

      inflight.set(cacheKey, request);
      return jsonResponse(await request);
    }

    function invalidateForAction(action) {
      if (action.startsWith('shopping') && action !== 'shoppinglist') memoryCache.delete('shoppinglist');
      if (action.startsWith('visit') && action !== 'visitlist') memoryCache.delete('visitlist');
      if (action.startsWith('note') && action !== 'notecapabilities') memoryCache.delete('notes-data');
    }

    window.fetch = async function lexiTravelLowLatencyFetch(input, init = {}) {
      if (!apiRequest(input)) return baseFetch(input, init);

      const method = requestMethod(input, init);
      const params = requestParams(input, init);
      const action = String(params.get('action') || (method === 'GET' ? 'data' : '')).trim().toLowerCase();

      invalidateForAction(action);

      if (method === 'POST' && (action === 'shoppinglist' || action === 'visitlist')) {
        return readThrough(action, input, init);
      }

      if (method === 'GET' && action === 'data' && notesRequested) {
        notesRequested = false;
        return readThrough('notes-data', input, init, originalRequestNotes);
      }

      return baseFetch(input, init);
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

    function notesRead() {
      const apiKey = key();
      if (!apiKey || typeof window.lexiTravelRequestNotesNextLoad !== 'function') return Promise.resolve(false);
      window.lexiTravelRequestNotesNextLoad();
      const url = new URL(API_URL);
      url.searchParams.set('key', apiKey);
      url.searchParams.set('action', 'data');
      url.searchParams.set('_', Date.now().toString());
      return window.fetch(url.toString(), {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow'
      }).then(response => response.ok).catch(() => false);
    }

    function warmAll() {
      if (!key()) return;
      Promise.allSettled([
        postRead('shoppingList'),
        postRead('visitList'),
        notesRead()
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

  preserveProjectedNotesForImmediateDisplay();
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
