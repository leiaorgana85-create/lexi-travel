(() => {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbxeJRgEegJlc7kmtstRJtF0X-b4-0QBk-9dqBpCooDOs4NfPomi4_Kptb0CDSIAqqDw/exec';
  const KEY_STORAGE = 'lexiTravelApiKey';
  const INSTALL_COOKIE = 'lexi_travel_install_v1';
  const COOKIE_PATH = '/lexi-travel/';
  const INSTALL_TTL_SECONDS = 600;

  const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function readCookie() {
    try {
      const prefix = `${INSTALL_COOKIE}=`;
      const row = document.cookie.split('; ').find(v => v.startsWith(prefix));
      return row ? decodeURIComponent(row.slice(prefix.length)).trim() : '';
    } catch (_) {
      return '';
    }
  }

  function setCookie(token) {
    try {
      document.cookie = `${INSTALL_COOKIE}=${encodeURIComponent(token)}; Max-Age=${INSTALL_TTL_SECONDS}; Path=${COOKIE_PATH}; SameSite=Strict; Secure`;
    } catch (_) {}
  }

  function clearCookie() {
    try {
      document.cookie = `${INSTALL_COOKIE}=; Max-Age=0; Path=${COOKIE_PATH}; SameSite=Strict; Secure`;
    } catch (_) {}
  }

  async function request(action, params = {}) {
    const url = new URL(API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('_', String(Date.now()));
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const response = await fetch(url.toString(), { method: 'GET', cache: 'no-store', redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function redeemCopiedInstallToken() {
    let current = '';
    try { current = String(localStorage.getItem(KEY_STORAGE) || '').trim(); } catch (_) {}
    if (current) return false;

    const token = readCookie();
    if (!token) return false;

    try {
      const data = await request('authredeem', { token });
      const sessionToken = String(data?.sessionToken || '').trim();
      if (!data?.ok || !sessionToken) throw new Error(data?.error || 'Install authorization failed');
      localStorage.setItem(KEY_STORAGE, sessionToken);
      clearCookie();
      window.location.replace(window.location.href);
      return true;
    } catch (_) {
      clearCookie();
      return false;
    }
  }

  async function prepareSafariInstallToken() {
    if (isStandalone() || readCookie()) return;
    let credential = '';
    try { credential = String(localStorage.getItem(KEY_STORAGE) || '').trim(); } catch (_) {}
    if (!credential) return;

    try {
      const data = await request('authmint', { key: credential });
      if (data?.ok && data?.token) setCookie(String(data.token));
    } catch (_) {
      // Backend may not have the transfer endpoint yet. Existing auth keeps working.
    }
  }

  function watchConnectionButton() {
    const button = document.getElementById('saveKeyBtn');
    const input = document.getElementById('apiKey');
    if (!button || !input) return;

    button.addEventListener('click', () => {
      if (isStandalone()) return;
      const expected = String(input.value || '').trim();
      if (!expected) return;
      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        let saved = '';
        try { saved = String(localStorage.getItem(KEY_STORAGE) || '').trim(); } catch (_) {}
        if (saved === expected) {
          window.clearInterval(timer);
          prepareSafariInstallToken();
        } else if (attempts >= 40) {
          window.clearInterval(timer);
        }
      }, 250);
    }, true);
  }

  redeemCopiedInstallToken().then(redeemed => {
    if (!redeemed) prepareSafariInstallToken();
  });

  window.addEventListener('pageshow', prepareSafariInstallToken);
  window.addEventListener('DOMContentLoaded', watchConnectionButton);
})();
