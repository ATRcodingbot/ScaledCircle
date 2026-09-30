// Run with: node --test apps/mobile/test/analytics_web_test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../web/analytics.js'), 'utf8');
const choiceKey = 'scaledcircle.analytics.choice.v1';
const disableKey = 'ga-disable-G-9VY50190LG';

function harness({ hostname = 'scaledcircle.com', protocol = 'https:', storedChoice = null,
  hash = '#/businesses?workspace=secret&utm_medium=ig', cookieText = '',
  settingsPage = false, privacy = {}, storageBlocked = false, pathname = '/',
  search = '?token=secret&utm_source=facebook', windowDoNotTrack } = {}) {
  const store = new Map(storedChoice ? [[choiceKey, storedChoice]] : []);
  const elements = new Map();
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 1;
  let scriptLoads = 0;
  let reloads = 0;
  let injectedElements = 0;
  const cookies = [];

  function element() {
    const handlers = new Map();
    return {
      disabled: false,
      textContent: '',
      addEventListener(name, callback) { handlers.set(name, callback); },
      click() { if (!this.disabled) handlers.get('click')(); },
    };
  }
  if (settingsPage) {
    for (const id of ['sc-analytics-status', 'sc-analytics-enable', 'sc-analytics-disable']) {
      elements.set(id, element());
    }
  }
  const document = {
    readyState: 'complete',
    referrer: 'https://facebook.com/some/private/path?token=secret',
    createElement: element,
    getElementById(id) { return elements.get(id); },
    head: { appendChild(tag) { if (tag.src) scriptLoads++; } },
    body: { appendChild(node) { injectedElements++; elements.set(node.id, node); } },
    get cookie() { return cookieText; },
    set cookie(value) { cookies.push(value); },
  };
  const location = {
    protocol, hostname, pathname: settingsPage ? '/analytics-settings.html' : pathname,
    hash: settingsPage ? '' : hash, search,
    reload() { reloads++; },
  };
  const history = {
    pushState(_state, _title, url) { location.hash = url; },
    replaceState(_state, _title, url) { location.hash = url; },
  };
  const context = {
    document, location, history, navigator: privacy, doNotTrack: windowDoNotTrack, localStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error('Storage blocked');
        return store.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error('Storage blocked');
        store.set(key, value);
      },
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
    injectedElements: () => injectedElements,
    flush() { for (const [id, callback] of timers) { timers.delete(id); callback(); } },
    events: () => (context.dataLayer || []).filter((entry) => entry[0] === 'event'),
    cookies,
  };
}

test('ordinary visit counts once without injecting UI or storing a consent choice', () => {
  const site = harness();
  assert.equal(site.scriptLoads(), 1);
  assert.equal(site.events().length, 1);
  assert.equal(site.injectedElements(), 0);
  assert.equal(site.store.has(choiceKey), false);
  const commands = site.context.dataLayer;
  const consent = commands.find((entry) => entry[0] === 'consent')[2];
  assert.equal(consent.analytics_storage, undefined);
  assert.equal(consent.ad_storage, 'denied');
  assert.equal(consent.ad_personalization, 'denied');
  const config = commands.find((entry) => entry[0] === 'config')[2];
  assert.equal(config.allow_google_signals, false);
  assert.equal(config.allow_ad_personalization_signals, false);
});

test('page counts sanitize initial data and distinct SPA routes without duplicates', () => {
  const site = harness();
  const first = site.events()[0][2];
  assert.equal(first.page_location, 'https://scaledcircle.com/businesses?utm_source=facebook&utm_medium=ig');
  assert.equal(first.page_referrer, 'https://facebook.com');
  assert.ok(!JSON.stringify(site.context.dataLayer).includes('secret'));
  site.context.history.pushState(null, '', '#/campaign/private-id?invite=secret');
  site.listeners.get('hashchange')();
  site.flush();
  assert.equal(site.events().length, 2);
  assert.equal(site.events()[1][2].page_location, 'https://scaledcircle.com/app');
  assert.ok(!JSON.stringify(site.events()[1][2]).includes('private-id'));
  site.context.history.replaceState(null, '', '#/job-room/another-private-id');
  site.flush();
  assert.equal(site.events().length, 2);
  site.context.history.pushState(null, '', '#/pricing?utm_term=name%40example.com');
  site.flush();
  assert.equal(site.events().length, 3);
  assert.equal(site.events()[2][2].page_location, 'https://scaledcircle.com/pricing?utm_source=facebook');
});

test('named Business registration deep link counts only a sanitized form page view', () => {
  const site = harness({ hash: '#/create-account?role=business', search: '' });
  assert.equal(site.scriptLoads(), 1);
  assert.equal(site.injectedElements(), 0);
  assert.equal(site.events().length, 1);
  const [command, eventName, page] = site.events()[0];
  assert.equal(command, 'event');
  assert.equal(eventName, 'page_view');
  assert.equal(page.page_location, 'https://scaledcircle.com/create-account');
  assert.equal(page.page_title, 'Scaled Circle — Create account');
  assert.equal(page.page_referrer, 'https://facebook.com');
  assert.ok(site.context.dataLayer
    .filter((entry) => entry[0] === 'config')
    .every((entry) => entry[1] === 'G-9VY50190LG' && entry[2].send_page_view === false));
  assert.ok(!JSON.stringify(site.context.dataLayer).includes('sign_up'));
  assert.ok(!JSON.stringify(site.context.dataLayer).includes('purchase'));
});

test('public navigation to registration counts once despite duplicate browser notifications', () => {
  const site = harness({ hash: '#/businesses', search: '' });
  site.context.history.pushState(null, '', '#/create-account?role=business');
  site.listeners.get('hashchange')();
  site.listeners.get('popstate')();
  site.flush();
  assert.equal(site.events().length, 2);
  assert.equal(site.events()[1][2].page_location, 'https://scaledcircle.com/create-account');
  assert.equal(site.events()[1][2].page_referrer, 'https://scaledcircle.com/businesses');

  // Repeated route synchronization/rebuilds must not become extra form entries.
  for (let i = 0; i < 3; i++) {
    site.context.history.replaceState(null, '', '#/create-account?role=business');
    site.listeners.get('hashchange')();
    site.flush();
  }
  site.context.history.pushState(null, '', '#/create-account?role=scaler&plan=scale');
  site.flush();
  assert.equal(site.events().length, 2);
  assert.equal(site.scriptLoads(), 1);

  // A real Back/forward transition is a new page view, still not account creation.
  site.context.history.pushState(null, '', '#/businesses');
  site.flush();
  site.context.history.pushState(null, '', '#/create-account?role=business');
  site.flush();
  assert.deepEqual(Array.from(site.events(), (event) => event[2].page_location), [
    'https://scaledcircle.com/businesses', 'https://scaledcircle.com/create-account',
    'https://scaledcircle.com/businesses', 'https://scaledcircle.com/create-account',
  ]);
});

test('registration document reload emits one page view per document, not a conversion', () => {
  const options = { hash: '#/create-account?role=business', search: '' };
  // A fresh JS document models a real reload; it is intentionally another visit.
  for (const site of [harness(options), harness(options)]) {
    site.listeners.get('hashchange')();
    site.listeners.get('popstate')();
    site.flush();
    assert.equal(site.scriptLoads(), 1);
    assert.equal(site.events().length, 1);
    assert.equal(site.events()[0][1], 'page_view');
    assert.equal(site.events()[0][2].page_location, 'https://scaledcircle.com/create-account');
  }
});

test('registration strips role, plan, return route, referral and PII from every analytics command', () => {
  const privateQuery = new URLSearchParams({
    role: 'business', plan: 'scale', returnTo: '/business/customer/private-customer-id',
    next: '/campaign/private-campaign-id', referral: 'private-referral-code',
    ref: 'private-referrer-id', email: 'fixture@example.invalid', name: 'Fixture Customer',
    phone: '2025550199', address: '123 Fixture Street', latitude: '39.1688',
    longitude: '-76.6093', workspaceId: 'private-workspace-id',
    notes: 'private form text', token: 'private-auth-token',
  }).toString();
  for (const queryPlacement of ['hash', 'search']) {
    const site = harness({
      hash: '#/create-account' + (queryPlacement === 'hash' ? '?' + privateQuery : ''),
      search: queryPlacement === 'search' ? '?' + privateQuery : '',
    });
    assert.equal(site.events()[0][2].page_location, 'https://scaledcircle.com/create-account');
    const serialized = JSON.stringify(site.context.dataLayer);
    for (const [key, value] of new URLSearchParams(privateQuery)) {
      assert.ok(!serialized.includes(key + '='), 'must not forward private query keys');
      assert.ok(!serialized.includes('"' + key + '":'), 'must not add private event fields');
      // Short role/plan values may occur inside the public site/brand name.
      if (key === 'role' || key === 'plan') continue;
      assert.ok(!serialized.includes(value), `must not emit ${queryPlacement} query value`);
      assert.ok(!serialized.includes(encodeURIComponent(value)), 'must not emit encoded query value');
    }
    site.context.history.pushState(null, '', '#/pricing');
    site.flush();
    assert.equal(site.events()[1][2].page_referrer, 'https://scaledcircle.com/create-account');
  }
});

test('registration retains permitted campaign attribution without forwarding private parameters', () => {
  const site = harness({
    hash: '#/create-account?role=business&plan=growth&ref=private-code&utm_medium=qa&utm_term=fixture%40example.invalid',
    search: '?utm_source=deployment_check&utm_campaign=direct_registration_qa&email=fixture%40example.invalid',
  });
  assert.equal(site.events()[0][2].page_location,
    'https://scaledcircle.com/create-account?utm_source=deployment_check&utm_medium=qa&utm_campaign=direct_registration_qa');
  const serialized = JSON.stringify(site.context.dataLayer);
  for (const excluded of ['role=', 'plan=', 'private-code', 'fixture', 'email=']) {
    assert.ok(!serialized.includes(excluded));
  }
});

test('registration entry and route updates honor saved opt-out, GPC and both DNT sources', () => {
  const cases = [
    { storedChoice: 'denied' },
    { storedChoice: 'granted', privacy: { globalPrivacyControl: true } },
    { storedChoice: 'granted', privacy: { doNotTrack: '1' } },
    { storedChoice: 'granted', privacy: { doNotTrack: 'yes' } },
    { storedChoice: 'granted', windowDoNotTrack: '1' },
  ];
  for (const options of cases) {
    const site = harness({ ...options, hash: '#/create-account?role=business', search: '' });
    site.context.history.replaceState(null, '', '#/create-account?role=business&plan=scale');
    site.listeners.get('hashchange')();
    site.flush();
    site.context.history.pushState(null, '', '#/login');
    site.flush();
    assert.equal(site.scriptLoads(), 0);
    assert.equal(site.events().length, 0);
    assert.equal(site.injectedElements(), 0);
    assert.equal(site.context[disableKey], true);
  }
});

test('previous opt-outs prevent tag loading and clear only analytics cookies', () => {
  const site = harness({ storedChoice: 'denied', cookieText: '_ga=visitor; _ga_9VY50190LG=session; session=needed' });
  assert.equal(site.scriptLoads(), 0);
  assert.equal(site.context[disableKey], true);
  site.context.history.pushState(null, '', '#/pricing');
  site.flush();
  assert.equal(site.events().length, 0);
  assert.ok(site.cookies.some((entry) => entry.startsWith('_ga=; Max-Age=0;')));
  assert.ok(site.cookies.some((entry) => entry.startsWith('_ga_9VY50190LG=; Max-Age=0;')));
  assert.ok(!site.cookies.some((entry) => entry.startsWith('session=')));
});

test('retained public Hosting pages keep their names with trailing slashes', () => {
  for (const name of ['businesses', 'pricing', 'how-it-works', 'referrals', 'scalers']) {
    const site = harness({ pathname: '/' + name + '/', hash: '#workflow' });
    assert.equal(site.events().length, 1);
    assert.equal(site.events()[0][2].page_location,
      'https://scaledcircle.com/' + name + '?utm_source=facebook');
  }
  const privatePage = harness({ pathname: '/campaign/private-id/', hash: '' });
  assert.equal(privatePage.events()[0][2].page_location, 'https://scaledcircle.com/app');
});

test('browser privacy signals take precedence over a saved enabled preference', () => {
  for (const privacy of [{ globalPrivacyControl: true }, { doNotTrack: '1' }, { doNotTrack: 'yes' }]) {
    const site = harness({ storedChoice: 'granted', privacy });
    assert.equal(site.scriptLoads(), 0);
    assert.equal(site.events().length, 0);
    assert.equal(site.context[disableKey], true);
    const settings = harness({ settingsPage: true, storedChoice: 'granted', privacy });
    assert.match(settings.elements.get('sc-analytics-status').textContent, /privacy setting/);
    assert.equal(settings.elements.get('sc-analytics-enable').disabled, true);
  }
});

test('privacy page saves choices without loading Google or reloading the page', () => {
  const site = harness({ settingsPage: true });
  assert.equal(site.scriptLoads(), 0);
  site.elements.get('sc-analytics-disable').click();
  assert.equal(site.store.get(choiceKey), 'denied');
  assert.match(site.elements.get('sc-analytics-status').textContent, /are off/);
  assert.equal(harness({ storedChoice: site.store.get(choiceKey) }).scriptLoads(), 0);
  site.elements.get('sc-analytics-enable').click();
  assert.equal(site.store.get(choiceKey), 'granted');
  assert.equal(harness({ storedChoice: site.store.get(choiceKey) }).scriptLoads(), 1);
  assert.match(site.elements.get('sc-analytics-status').textContent, /are on/);
  assert.equal(site.scriptLoads(), 0);
  assert.equal(site.events().length, 0);
  assert.equal(site.reloads(), 0);
});

test('another tab can stop and resume collection without reloads or duplicate tags', () => {
  const site = harness();
  site.listeners.get('storage')({ key: choiceKey, newValue: 'denied' });
  site.context.history.pushState(null, '', '#/pricing');
  site.flush();
  assert.equal(site.context[disableKey], true);
  assert.equal(site.events().length, 1);
  site.listeners.get('storage')({ key: choiceKey, newValue: 'granted' });
  assert.equal(site.context[disableKey], false);
  assert.equal(site.events().length, 2);
  assert.equal(site.events()[1][2].page_location, 'https://scaledcircle.com/pricing?utm_source=facebook');
  assert.equal(site.scriptLoads(), 1);
  assert.equal(site.reloads(), 0);
});

test('blocked preference storage is reported honestly on the privacy page', () => {
  const site = harness({ settingsPage: true, storageBlocked: true });
  site.elements.get('sc-analytics-disable').click();
  assert.match(site.elements.get('sc-analytics-status').textContent, /blocked saving this preference/);
  assert.equal(site.store.has(choiceKey), false);
  assert.equal(site.scriptLoads(), 0);
});

test('staging, alternate hosts and insecure origins do not load the tag or UI', () => {
  for (const options of [{ hostname: 'scaledcircle-staging.web.app' }, { protocol: 'http:' }]) {
    const staging = harness(options);
    assert.equal(staging.scriptLoads(), 0);
    assert.equal(staging.injectedElements(), 0);
    assert.equal(staging.events().length, 0);
  }
});
