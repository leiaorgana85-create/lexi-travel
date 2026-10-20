(() => {
  'use strict';

  const RETRY_STORAGE_KEY = 'lexiTravelDeleteRetryV1';
  const DELETE_ACTIONS = new Set(['eventdelete', 'plandelete']);
  const UPSERT_SUPERSEDES = {
    eventupsert: 'eventdelete',
    planupsert: 'plandelete'
  };
  const nativeFetch = window.fetch.bind(window);
  let retryTimer = 0;
  let retryPromise = null;
  let notesRequested = false;

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return '';
  }

  function requestMethod(input, init) {
    return String(init?.method || input?.method || 'GET').toUpperCase();
  }

  function isTravelApiRequest(input) {
    if (typeof API_URL === 'undefined') return false;
    try {
      const request = new URL(requestUrl(input), window.location.href);
      const api = new URL(String(API_URL || ''), window.location.href);
      return request.origin === api.origin && request.pathname === api.pathname;
    } catch (_) {
      return false;
    }
  }

  function requestParams(input, init) {
    if (requestMethod(input, init) === 'GET') {
      try {
        return new URL(requestUrl(input), window.location.href).searchParams;
      } catch (_) {
        return new URLSearchParams();
      }
    }

    const body = init && init.body;
    if (body instanceof URLSearchParams) return new URLSearchParams(body.toString());
    if (typeof body === 'string') return new URLSearchParams(body);
    return new URLSearchParams();
  }

  function readQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RETRY_STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeQueue(queue) {
    try { localStorage.setItem(RETRY_STORAGE_KEY, JSON.stringify(queue)); } catch (_) {}
  }

  function queueKey(action, id) {
    return `${String(action || '').toLowerCase()}:${String(id || '')}`;
  }

  function pendingIds(action) {
    const wanted = String(action || '').toLowerCase();
    const ids = new Set();
    for (const entry of Object.values(readQueue())) {
      if (String(entry?.action || '').toLowerCase() !== wanted) continue;
      const id = String(entry?.id || '').trim();
      if (id) ids.add(id);
    }
    return ids;
  }

  function enqueueDelete(action, id) {
    const cleanAction = String(action || '').trim();
    const cleanId = String(id || '').trim();
    if (!cleanAction || !cleanId) return;
    const queue = readQueue();
    queue[queueKey(cleanAction, cleanId)] = { action: cleanAction, id: cleanId, queuedAt: Date.now() };
    writeQueue(queue);
    scheduleRetry();
  }

  function clearQueuedDelete(action, id) {
    const queue = readQueue();
    const key = queueKey(action, id);
    if (!Object.prototype.hasOwnProperty.call(queue, key)) return false;
    delete queue[key];
    writeQueue(queue);
    return true;
  }

  function syntheticSuccess(action, id) {
    return new Response(JSON.stringify({
      ok: true,
      id: String(id || ''),
      queued: true,
      deleteRetryQueued: true,
      action: String(action || '')
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  function deterministicDeleteFailure(data) {
    const error = String(data?.error || '').toLowerCase();
    if (!error) return false;
    return error.includes('unauthorized') ||
      error.includes('missing event id') ||
      error.includes('missing plan item id') ||
      error.includes('generated flight events are read-only') ||
      error.includes('unknown write action');
  }

  function responseFromJson(response, data) {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.delete('etag');
    headers.set('Content-Type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(data), {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  function currentNotes() {
    try {
      return typeof appData !== 'undefined' && Array.isArray(appData.notes) ? appData.notes.slice() : [];
    } catch (_) {
      return [];
    }
  }

  async function applyNotesSplit(response, action, wantsNotes) {
    if (String(action || 'data').toLowerCase() !== 'data' || wantsNotes || !response.ok) return response;
    try {
      const data = await response.clone().json();
      if (!data || typeof data !== 'object' || !data.ok) return response;
      data.notes = currentNotes();
      return responseFromJson(response, data);
    } catch (_) {
      return response;
    }
  }

  async function filterPendingDeletes(response, action) {
    if (!response.ok) return response;
    const eventIds = pendingIds('eventdelete');
    const planIds = pendingIds('plandelete');
    const normalizedAction = String(action || '').toLowerCase();
    const needsEventFilter = normalizedAction === 'data' && eventIds.size > 0;
    const needsPlanFilter = normalizedAction === 'planlist' && planIds.size > 0;
    if (!needsEventFilter && !needsPlanFilter) return response;

    let data;
    try { data = await response.clone().json(); } catch (_) { return response; }

    let changed = false;
    if (needsEventFilter && Array.isArray(data?.events)) {
      const next = data.events.filter(item => !eventIds.has(String(item?.ID || '')));
      changed = next.length !== data.events.length;
      data.events = next;
    }
    if (needsPlanFilter && Array.isArray(data?.items)) {
      const next = data.items.filter(item => !planIds.has(String(item?.ID || '')));
      changed = changed || next.length !== data.items.length;
      data.items = next;
    }
    return changed ? responseFromJson(response, data) : response;
  }

  async function guardedDeleteFetch(input, init, action, id) {
    let response;
    try {
      response = await nativeFetch(input, init);
    } catch (_) {
      enqueueDelete(action, id);
      return syntheticSuccess(action, id);
    }

    if (!response.ok) {
      if (response.status >= 500) {
        enqueueDelete(action, id);
        return syntheticSuccess(action, id);
      }
      return response;
    }

    let data;
    try {
      data = JSON.parse(await response.text());
    } catch (_) {
      enqueueDelete(action, id);
      return syntheticSuccess(action, id);
    }

    if (data?.ok === true) {
      clearQueuedDelete(action, id);
      return responseFromJson(response, data);
    }
    if (deterministicDeleteFailure(data)) return responseFromJson(response, data);

    enqueueDelete(action, id);
    return syntheticSuccess(action, id);
  }

  async function regularTravelFetch(input, init, action, id, wantsNotes) {
    let requestInput = input;
    if (requestMethod(input, init) === 'GET' && String(action || 'data').toLowerCase() === 'data') {
      const url = new URL(requestUrl(input), window.location.href);
      url.searchParams.set('includeNotes', wantsNotes ? '1' : '0');
      requestInput = url.toString();
    }

    let response = await nativeFetch(requestInput, init);

    const supersededDelete = UPSERT_SUPERSEDES[String(action || '').toLowerCase()];
    if (supersededDelete && id && response.ok) {
      try {
        const data = await response.clone().json();
        if (data?.ok === true) clearQueuedDelete(supersededDelete, id);
      } catch (_) {}
    }

    response = await applyNotesSplit(response, action, wantsNotes);
    return filterPendingDeletes(response, action);
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.tab[data-view="notesView"]')) notesRequested = true;
  }, true);

  window.fetch = async function lexiTravelApiFetch(input, init = {}) {
    if (!isTravelApiRequest(input)) return nativeFetch(input, init);

    const method = requestMethod(input, init);
    const params = requestParams(input, init);
    const action = String(params.get('action') || (method === 'GET' ? 'data' : '')).trim();
    const id = String(params.get('id') || '').trim();
    const wantsNotes = notesRequested && method === 'GET' && action.toLowerCase() === 'data';

    try {
      if (method === 'POST' && DELETE_ACTIONS.has(action.toLowerCase()) && id) {
        return await guardedDeleteFetch(input, init, action, id);
      }
      return await regularTravelFetch(input, init, action, id, wantsNotes);
    } finally {
      if (wantsNotes) notesRequested = false;
    }
  };

  async function retryQueuedDeletes() {
    if (retryPromise) return retryPromise;
    if (typeof API_URL === 'undefined' || typeof KEY_STORAGE === 'undefined') return false;
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) return false;

    retryPromise = (async () => {
      const queue = readQueue();
      let changed = false;

      for (const [entryKey, entry] of Object.entries(queue)) {
        const action = String(entry?.action || '').trim();
        const id = String(entry?.id || '').trim();
        if (!DELETE_ACTIONS.has(action.toLowerCase()) || !id) {
          delete queue[entryKey];
          changed = true;
          continue;
        }

        try {
          const body = new URLSearchParams({ key, action, id });
          const response = await nativeFetch(API_URL, {
            method: 'POST',
            body,
            cache: 'no-store',
            redirect: 'follow'
          });
          if (!response.ok) continue;
          const data = await response.json();
          if (data?.ok === true || deterministicDeleteFailure(data)) {
            delete queue[entryKey];
            changed = true;
          }
        } catch (_) {}
      }

      if (changed) writeQueue(queue);
      return changed;
    })().finally(() => { retryPromise = null; });

    return retryPromise;
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = window.setTimeout(() => {
      retryTimer = 0;
      retryQueuedDeletes();
    }, 1500);
  }

  window.lexiTravelRetryPendingDeletes = retryQueuedDeletes;
  window.addEventListener('online', retryQueuedDeletes);
  window.addEventListener('pageshow', retryQueuedDeletes);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) retryQueuedDeletes();
  });
  scheduleRetry();
})();
