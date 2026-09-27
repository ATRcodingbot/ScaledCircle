// Run with: node --test apps/mobile/test/analytics_web_test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../web/analytics.js'), 'utf8');
const choiceKey = 'scaledcircle.analytics.choice.v1';

function harness({ hostname = 'scaledcircle.com', storedChoice = null, hash = '#/businesses?workspace=secret&utm_medium=ig', cookieText = '' } = {}) {
  const store = new Map(storedChoice ? [[choiceKey, storedChoice]] : []);
  const elements = new Map();
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let scriptLoads = 0;
  let reloads = 0;
  const cookies = [];

  function element() {
    const handlers = new Map();
    const children = new Map();
    return {
      hidden: false,
      attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { handlers.set(name, callback); },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
      click() { handlers.get('click')(); },
    };
  }
  const document = {
    readyState: 'complete',
    referrer: 'https://facebook.com/some/private/path?token=secret',
    createElement: element,
    getElementById(id) { return elements.get(id); },
    head: { appendChild(tag) { if (tag.src) scriptLoads++; } },
    body: { appendChild(node) { elements.set(node.id, node); } },
    get cookie() { return cookieText; },
    set cookie(value) { cookies.push(value); },
  };
  const location = {
    protocol: 'https:', hostname, pathname: '/', hash,
    search: '?token=secret&utm_source=facebook',
    reload() { reloads++; },
  };
  const history = {
    pushState(_state, _title, url) { location.hash = url; },
    replaceState(_state, _title, url) { location.hash = url; },
  };
  const context = {
    document, location, history, localStorage: {
      getItem(key) { return store.get(key) ?? null; },
      setItem(key, value) { store.set(key, value); },
    },
    URL, URLSearchParams, Date,
    setTimeout(callback) { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(name, callback) { listeners.set(name, callback); },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'analytics.js' });
  return {
    context, location, store, elements, listeners,
    scriptLoads: () => scriptLoads, reloads: () => reloads,
    flush() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
    events: () => (context.dataLayer || []).filter((entry) => entry[0] === 'event'),
    cookies,
  };
}

test('no analytics tag or events before consent; declining stays silent', () => {
  const site = harness();
  assert.equal(site.scriptLoads(), 0);
  assert.equal(site.events().length, 0);
  site.elements.get('sc-analytics-choice').querySelector('.sc-decline').click();
  assert.equal(site.store.get(choiceKey), 'denied');
  site.context.history.pushState(null, '', '#/scalers');
  site.flush();
  assert.equal(site.scriptLoads(), 0);
  assert.equal(site.events().length, 0);
});

test('opt-in sends one sanitized initial page and distinct SPA routes', () => {
  const site = harness();
  site.elements.get('sc-analytics-choice').querySelector('.sc-allow').click();
  assert.equal(site.scriptLoads(), 1);
  assert.equal(site.events().length, 1);
  const first = site.events()[0][2];
  assert.equal(first.page_location, 'https://scaledcircle.com/businesses?utm_source=facebook&utm_medium=ig');
  assert.equal(first.page_referrer, 'https://facebook.com');
  assert.ok(!JSON.stringify(first).includes('secret'));
  site.context.history.pushState(null, '', '#/campaign/private-id?invite=secret');
  site.flush();
  assert.equal(site.events().length, 2);
  assert.equal(site.events()[1][2].page_location, 'https://scaledcircle.com/app');
  assert.ok(!JSON.stringify(site.events()[1][2]).includes('private-id'));
  site.context.history.pushState(null, '', '#/job-room/another-private-id');
  site.flush();
  assert.equal(site.events().length, 2);
  site.context.history.pushState(null, '', '#/pricing');
  site.flush();
  assert.equal(site.events().length, 3);
  assert.equal(site.events()[2][2].page_location, 'https://scaledcircle.com/pricing?utm_source=facebook');
});

test('revoking consent disables collection and preserves the current page', () => {
  const site = harness({ storedChoice: 'granted', cookieText: '_ga=visitor; _ga_9VY50190LG=session; session=needed' });
  assert.equal(site.scriptLoads(), 1);
  site.elements.get('sc-analytics-settings').click();
  site.elements.get('sc-analytics-choice').querySelector('.sc-decline').click();
  assert.equal(site.store.get(choiceKey), 'denied');
  assert.equal(site.reloads(), 0);
  assert.equal(site.context['ga-disable-G-9VY50190LG'], true);
  assert.ok(site.cookies.some((entry) => entry.startsWith('_ga=; Max-Age=0;')));
  assert.ok(site.cookies.some((entry) => entry.startsWith('_ga_9VY50190LG=; Max-Age=0;')));
  assert.ok(!site.cookies.some((entry) => entry.startsWith('session=')));
  site.context.history.pushState(null, '', '#/pricing');
  site.flush();
  assert.equal(site.events().length, 1);
  const subsequentLoad = harness({ storedChoice: 'denied' });
  assert.equal(subsequentLoad.scriptLoads(), 0);
});

test('consent can be restored without loading a second tag or refreshing', () => {
  const site = harness({ storedChoice: 'granted' });
  const panel = site.elements.get('sc-analytics-choice');
  site.elements.get('sc-analytics-settings').click();
  panel.querySelector('.sc-decline').click();
  site.elements.get('sc-analytics-settings').click();
  panel.querySelector('.sc-allow').click();
  assert.equal(site.context['ga-disable-G-9VY50190LG'], false);
  assert.equal(site.scriptLoads(), 1);
  assert.equal(site.reloads(), 0);
  assert.equal(site.events().length, 2);
});

test('revocation in another tab disables collection without interrupting work', () => {
  const site = harness({ storedChoice: 'granted' });
  site.listeners.get('storage')({ key: choiceKey, newValue: 'denied' });
  site.context.history.pushState(null, '', '#/pricing');
  site.flush();
  assert.equal(site.context['ga-disable-G-9VY50190LG'], true);
  assert.equal(site.events().length, 1);
  assert.equal(site.reloads(), 0);
});

test('staging and alternate hosting origins do not load analytics UI or tag', () => {
  const staging = harness({ hostname: 'scaledcircle-staging.web.app', storedChoice: 'granted' });
  assert.equal(staging.scriptLoads(), 0);
  assert.equal(staging.elements.size, 0);
  assert.equal(staging.events().length, 0);
});
