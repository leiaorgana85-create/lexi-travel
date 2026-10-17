(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
  const KEY_STORAGE = 'lexiTravelApiKey';
  const GOOGLE_LINK_MARKER = 'lexiTravelGoogleLinkedV1';
  const GOOGLE_CLIENT_ID = '543436064136-27a477uk691qocpaft25q925lg88hl98.apps.googleusercontent.com';

  let bridgeFrame = null;
  let bridgeTarget = null;
  let bridgeOrigin = '';
  let bridgeReady = null;
  let bridgeReadyResolve = null;
  let nextId = 1;
  let pendingRelinkCredential = '';
  const pending = new Map();

  const currentKey = () => {
    try { return String(localStorage.getItem(KEY_STORAGE) || '').trim(); }
    catch (_) { return ''; }
  };

  const isLinkedLocally = () => {
    try { return localStorage.getItem(GOOGLE_LINK_MARKER) === '1'; }
    catch (_) { return false; }
  };

  function allowedBridgeOrigin(origin) {
    try {
      const host = new URL(origin).hostname;
      return host === 'script.google.com' || host === 'script.googleusercontent.com' || host.endsWith('.googleusercontent.com');
    } catch (_) {
      return false;
    }
  }

  function ensureBridge() {
    if (bridgeFrame?.isConnected) return bridgeFrame;
    const frame = document.createElement('iframe');
    frame.title = 'Lexi Travel secure Google auth bridge';
    frame.src = `${API_URL}?authBridge=1&_=${Date.now()}`;
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:-10000px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    bridgeFrame = frame;
    return frame;
  }

  function waitBridge() {
    if (bridgeTarget && bridgeOrigin) return Promise.resolve();
    if (bridgeReady) return bridgeReady;
    ensureBridge();
    bridgeReady = new Promise((resolve, reject) => {
      bridgeReadyResolve = resolve;
      setTimeout(() => {
        if (bridgeTarget && bridgeOrigin) return;
        bridgeReady = null;
        bridgeReadyResolve = null;
        reject(new Error('Could not connect to Lexi Travel authorization.'));
      }, 30000);
    });
    return bridgeReady;
  }

  window.addEventListener('message', event => {
    const d = event.data || {};
    if (d.type === 'lexi-travel-google-auth-ready') {
      if (!bridgeFrame?.contentWindow || event.source !== bridgeFrame.contentWindow) return;
      if (!allowedBridgeOrigin(event.origin)) return;
      bridgeTarget = event.source;
      bridgeOrigin = event.origin;
      bridgeReadyResolve?.();
      bridgeReady = Promise.resolve();
      bridgeReadyResolve = null;
      return;
    }
    if (d.type !== 'lexi-travel-google-auth-result') return;
    if (!bridgeTarget || event.source !== bridgeTarget || event.origin !== bridgeOrigin) return;
    const item = pending.get(String(d.id || ''));
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(String(d.id));
    d.ok ? item.resolve(d.result) : item.reject(new Error(d.error || 'Google authorization failed.'));
  });

  async function bootstrapWithGoogle(credential, allowRelink = false) {
    await waitBridge();
    return new Promise((resolve, reject) => {
      const id = `travel-auth-${Date.now()}-${nextId++}`;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('Google authorization timed out.'));
      }, 45000);
      pending.set(id, { resolve, reject, timer });
      bridgeTarget.postMessage({
        type: 'lexi-travel-google-auth',
        id,
        credential,
        currentKey: currentKey(),
        allowRelink: Boolean(allowRelink)
      }, bridgeOrigin);
    });
  }

  async function loadGoogleIdentity() {
    if (window.google?.accounts?.id) return;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lexi-google-identity]');
      if (existing) {
        existing.addEventListener('load', resolve, { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.lexiGoogleIdentity = '1';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Could not load Google sign-in.'));
      document.head.appendChild(script);
    });
  }

  function applyResult(result, overlay) {
    const key = String(result?.key || '').trim();
    if (!result?.ok || !key) throw new Error('Lexi Travel access was not returned.');
    localStorage.setItem(KEY_STORAGE, key);
    localStorage.setItem(GOOGLE_LINK_MARKER, '1');
    pendingRelinkCredential = '';
    overlay.style.display = 'none';
    window.location.reload();
  }

  function ensureOverlay() {
    let overlay = document.getElementById('lexiTravelGoogleGate');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'lexiTravelGoogleGate';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(15,17,21,.72);backdrop-filter:blur(6px)';
    overlay.innerHTML = `<div style="width:min(380px,100%);background:var(--card,#fff);color:var(--text,#111);border:1px solid var(--line,#ddd);border-radius:16px;padding:20px;box-shadow:0 18px 60px rgba(0,0,0,.28);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><h2 style="margin:0 0 8px;font-size:20px">Connect Google</h2><p id="lexiTravelGoogleCopy" style="margin:0 0 15px;color:var(--muted,#666);font-size:13px;line-height:1.45"></p><div id="lexiTravelGoogleButton" style="min-height:44px;display:flex;justify-content:center"></div><div id="lexiTravelGoogleError" style="min-height:20px;margin-top:9px;color:#c62828;font-size:12px"></div><button id="lexiTravelGoogleRelink" type="button" hidden style="width:100%;min-height:38px;margin:4px 0 6px;border:1px solid var(--line,#ccc);border-radius:9px;background:transparent;color:inherit">Relink this Google account</button><button id="lexiTravelGoogleLater" type="button" style="width:100%;min-height:38px;margin-top:4px;border:1px solid var(--line,#ccc);border-radius:9px;background:transparent;color:inherit">Use API key instead</button></div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#lexiTravelGoogleLater').addEventListener('click', () => {
      pendingRelinkCredential = '';
      overlay.style.display = 'none';
      document.getElementById('settingsDialog')?.showModal?.();
    });

    const relink = overlay.querySelector('#lexiTravelGoogleRelink');
    relink.addEventListener('click', async () => {
      const credential = pendingRelinkCredential;
      const error = overlay.querySelector('#lexiTravelGoogleError');
      if (!credential || !currentKey()) return;
      relink.disabled = true;
      error.textContent = '';
      try {
        const result = await bootstrapWithGoogle(credential, true);
        applyResult(result, overlay);
      } catch (e) {
        error.textContent = e?.message || 'Could not relink Google.';
      } finally {
        relink.disabled = false;
      }
    });
    return overlay;
  }

  async function showGoogleGate() {
    const overlay = ensureOverlay();
    const hasKey = Boolean(currentKey());
    const relink = overlay.querySelector('#lexiTravelGoogleRelink');
    pendingRelinkCredential = '';
    relink.hidden = true;
    overlay.querySelector('#lexiTravelGoogleCopy').textContent = hasKey
      ? 'Connect your Google account once so future Home Screen installs can restore access without typing the API key.'
      : 'Use your linked Google account to restore Lexi Travel access on this install.';
    overlay.style.display = 'flex';

    const holder = overlay.querySelector('#lexiTravelGoogleButton');
    const error = overlay.querySelector('#lexiTravelGoogleError');
    error.textContent = '';
    holder.innerHTML = '';

    try {
      await loadGoogleIdentity();
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async response => {
          const credential = String(response?.credential || '');
          error.textContent = '';
          relink.hidden = true;
          pendingRelinkCredential = '';
          try {
            const result = await bootstrapWithGoogle(credential, false);
            applyResult(result, overlay);
          } catch (e) {
            const message = e?.message || 'Could not connect Google.';
            error.textContent = message;
            if (/not linked to Lexi Travel/i.test(message) && currentKey()) {
              pendingRelinkCredential = credential;
              relink.hidden = false;
            }
          }
        }
      });
      google.accounts.id.renderButton(holder, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 300
      });
    } catch (e) {
      error.textContent = e?.message || 'Could not load Google sign-in.';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    ensureBridge();
    if (!currentKey() || !isLinkedLocally()) {
      setTimeout(showGoogleGate, 350);
    }
  });
})();
