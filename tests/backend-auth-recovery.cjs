const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'backend-auth-recovery.js'), 'utf8');
const BACKEND = 'https://script.google.com/macros/s/test-deployment/exec';

function response(status, contentType) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => String(name).toLowerCase() === 'content-type' ? contentType : '' }
  };
}

function element(tag = 'div') {
  const listeners = new Map();
  return {
    tagName: tag.toUpperCase(), id: '', hidden: false, style: {}, className: '', type: '', textContent: '', children: [], inserted: null,
    append(...items) { this.children.push(...items); },
    addEventListener(type, fn) { listeners.set(type, fn); },
    insertAdjacentElement(_where, item) { this.inserted = item; },
    click() { listeners.get('click')?.({ target: this }); }
  };
}

function harness(fetchImpl) {
  const anchor = element();
  const retry = element('button');
  let retryCount = 0;
  retry.click = () => { retryCount += 1; };
  const ids = new Map([['anchor', anchor], ['retry', retry]]);
  const windowEvents = new Map();
  const documentEvents = new Map();
  const opened = [];
  const script = {
    dataset: { backendUrl: BACKEND, insertAfter: 'anchor', retryButton: 'retry', appLabel: 'Fixture app' }
  };
  const document = {
    currentScript: script,
    visibilityState: 'visible',
    createElement: tag => element(tag),
    getElementById: id => ids.get(id) || (anchor.inserted?.id === id ? anchor.inserted : null),
    addEventListener: (type, fn) => documentEvents.set(type, fn)
  };
  const window = {
    location: { href: 'https://example.test/app/' },
    fetch: fetchImpl,
    open: (...args) => { opened.push(args); return null; },
    setTimeout: fn => { fn(); return 1; },
    addEventListener: (type, fn) => windowEvents.set(type, fn)
  };
  const navigator = { onLine: true };
  window.window = window;
  window.document = document;
  window.navigator = navigator;
  vm.runInNewContext(source, { window, document, navigator, URL, console });
  return { window, document, navigator, anchor, opened, windowEvents, documentEvents, get retryCount() { return retryCount; } };
}

(async () => {
  let calls = [];
  const h = harness(async input => {
    calls.push(String(input));
    if (calls.length === 1) return response(403, 'text/html; charset=utf-8');
    return response(200, 'application/json; charset=utf-8');
  });

  await h.window.fetch(`${BACKEND}?action=data`);
  assert.equal(h.anchor.inserted?.id, 'backendAuthRecovery');
  assert.equal(h.anchor.inserted.hidden, false, '403 should reveal recovery UI');
  assert.match(h.anchor.inserted.children[0].textContent, /If Google asks you to approve Fixture app/);

  const authorize = h.anchor.inserted.children[1];
  authorize.click();
  assert.deepEqual(h.opened, [[BACKEND, '_blank', 'noopener']], 'authorization must open only the configured backend');
  h.windowEvents.get('focus')();
  assert.equal(h.retryCount, 1, 'returning from authorization should retry once');
  h.windowEvents.get('focus')();
  assert.equal(h.retryCount, 1, 'ordinary later focus must not retry again');

  await h.window.fetch(`${BACKEND}?action=data`);
  assert.equal(h.anchor.inserted.hidden, true, 'successful JSON response should clear recovery UI');

  let unrelatedCalls = 0;
  const unrelated = harness(async () => { unrelatedCalls += 1; return response(200, 'text/html'); });
  await unrelated.window.fetch('https://example.test/other');
  assert.equal(unrelatedCalls, 1);
  assert.equal(unrelated.anchor.inserted, null, 'unrelated requests must not create recovery UI');

  const html = harness(async () => response(200, 'text/html; charset=utf-8'));
  await html.window.fetch(`${BACKEND}?action=data`);
  assert.equal(html.anchor.inserted.hidden, false, 'HTML in place of API JSON should reveal recovery UI');

  const network = harness(async () => { throw new Error('network'); });
  await assert.rejects(network.window.fetch(`${BACKEND}?action=data`), /network/);
  assert.equal(network.anchor.inserted.hidden, false, 'online backend fetch failure should reveal cautious recovery UI');

  const offline = harness(async () => { throw new Error('offline'); });
  offline.navigator.onLine = false;
  await assert.rejects(offline.window.fetch(`${BACKEND}?action=data`), /offline/);
  assert.equal(offline.anchor.inserted, null, 'known offline state must not suggest authorization');

  console.log('backend authorization recovery: pass');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
