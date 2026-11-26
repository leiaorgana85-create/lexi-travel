const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../offline.js'), 'utf8');

function boot({ controlled, editing = false }) {
  let onReady, onControlChange, reloads = 0, applyUpdate, updateChecks = 0;
  const nodes = [];
  const localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const document = {
    hidden: false,
    activeElement: null,
    addEventListener(name, handler) {
      if (name === 'DOMContentLoaded') onReady = handler;
    },
    querySelector(selector) {
      if (selector === '.topbar') return { after(node) { nodes.push(node); } };
      if (selector.includes('.calendar-event-editor')) return editing ? {} : null;
      return null;
    },
    getElementById(id) {
      return nodes.find(node => node.id === id) || null;
    },
    createTextNode(text) {
      return { textContent: String(text) };
    },
    createElement(tag) {
      return {
        tagName: tag,
        style: {},
        hidden: false,
        setAttribute() {},
        append(...children) { this.children = (this.children || []).concat(children); },
        addEventListener(name, handler) {
          if (tag === 'button' && name === 'click') applyUpdate = handler;
        }
      };
    },
    body: { prepend(node) { nodes.push(node); } }
  };
  const serviceWorker = {
    controller: controlled ? { scriptURL: 'https://fixture.test/sw.js' } : null,
    addEventListener(name, handler) {
      if (name === 'controllerchange') onControlChange = handler;
    },
    register: async () => ({ update: async () => { updateChecks++; } })
  };
  const context = {
    URL, URLSearchParams, Response, AbortController, setTimeout, clearTimeout,
    setInterval: () => {},
    location: {
      href: 'https://fixture.test/lexi-travel/',
      reload: () => { reloads++; }
    },
    navigator: { onLine: true, serviceWorker },
    document,
    localStorage,
    fetch: async () => Response.json({ ok: true }),
    addEventListener: () => {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  assert.equal(typeof onReady, 'function');
  onReady();
  assert.equal(typeof onControlChange, 'function');
  return {
    trigger: onControlChange,
    get reloads() { return reloads; },
    get updateChecks() { return updateChecks; },
    get notice() { return document.getElementById('lexiTravelUpdateReady'); },
    apply() { assert.equal(typeof applyUpdate, 'function'); applyUpdate(); }
  };
}

(async () => {
  const firstInstall = boot({ controlled: false });
  firstInstall.trigger();
  assert.equal(firstInstall.reloads, 0, 'First service-worker installation must not force reload');

  const idle = boot({ controlled: true });
  idle.trigger();
  idle.trigger();
  assert.equal(idle.reloads, 1, 'New worker must reload old open shell exactly once');
  assert.equal(idle.notice, null, 'Idle shell upgrades without an update notice');

  const editing = boot({ controlled: true, editing: true });
  editing.trigger();
  assert.equal(editing.reloads, 0, 'Open editor must not be discarded');
  assert(editing.notice, 'Editing user must see update available');
  editing.apply();
  assert.equal(editing.reloads, 1, 'Explicit apply action must activate new shell');

  await Promise.resolve();
  assert.equal(idle.updateChecks, 1, 'Registration must check for a new worker');
  console.log('PASS: worker upgrade refreshes idle shell once, protects edits, and checks updates');
})().catch(error => { console.error(error); process.exitCode = 1; });
