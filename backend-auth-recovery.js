(() => {
  'use strict';

  const script = document.currentScript;
  const backendUrl = String(script?.dataset.backendUrl || '').trim();
  const anchorId = String(script?.dataset.insertAfter || '').trim();
  const retryButtonId = String(script?.dataset.retryButton || '').trim();
  const appLabel = String(script?.dataset.appLabel || 'Lexi app').trim();
  if (!backendUrl || !anchorId || !retryButtonId) return;

  const backend = new URL(backendUrl, window.location.href);
  const nativeFetch = window.fetch.bind(window);
  let pendingReturn = false;
  let recovery = null;
  let help = null;
  let authorizeButton = null;

  function ensureRecoveryUi() {
    if (recovery) return recovery;
    const anchor = document.getElementById(anchorId);
    if (!anchor) return null;

    recovery = document.createElement('div');
    recovery.id = 'backendAuthRecovery';
    recovery.hidden = true;
    recovery.style.marginTop = '8px';

    help = document.createElement('p');
    help.className = 'help';
    help.style.margin = '0 0 8px';
    help.textContent = `Backend access failed. If Google asks you to approve ${appLabel}, authorize it and return here.`;

    authorizeButton = document.createElement('button');
    authorizeButton.id = 'authorizeBackendBtn';
    authorizeButton.className = 'primary-btn';
    authorizeButton.type = 'button';
    authorizeButton.textContent = 'Authorize backend';
    authorizeButton.addEventListener('click', () => {
      pendingReturn = true;
      window.open(backendUrl, '_blank', 'noopener');
    });

    recovery.append(help, authorizeButton);
    anchor.insertAdjacentElement('afterend', recovery);
    return recovery;
  }

  function showRecovery() {
    const ui = ensureRecoveryUi();
    if (ui) ui.hidden = false;
  }

  function clearRecovery() {
    if (recovery) recovery.hidden = true;
  }

  function isBackendRequest(input) {
    try {
      const raw = typeof input === 'string' ? input : input?.url;
      if (!raw) return false;
      const request = new URL(raw, window.location.href);
      return request.origin === backend.origin && request.pathname === backend.pathname;
    } catch (_) {
      return false;
    }
  }

  window.fetch = async function lexiBackendAwareFetch(input, init) {
    if (!isBackendRequest(input)) return nativeFetch(input, init);

    try {
      const response = await nativeFetch(input, init);
      const type = String(response.headers?.get('content-type') || '').toLowerCase();
      const permissionFailure = response.status === 401 || response.status === 403;
      const htmlInsteadOfApi = response.ok && type.includes('text/html');
      if (permissionFailure || htmlInsteadOfApi) showRecovery();
      else if (response.ok && type.includes('application/json')) clearRecovery();
      return response;
    } catch (error) {
      if (navigator.onLine !== false) showRecovery();
      throw error;
    }
  };

  function retryAfterReturn() {
    if (!pendingReturn || document.visibilityState === 'hidden') return;
    pendingReturn = false;
    window.setTimeout(() => document.getElementById(retryButtonId)?.click(), 250);
  }

  window.addEventListener('pageshow', retryAfterReturn);
  window.addEventListener('focus', retryAfterReturn);
  document.addEventListener('visibilitychange', retryAfterReturn);
})();
