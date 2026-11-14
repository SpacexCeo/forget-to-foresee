// The entry gate (owner 14.11): after loading, one "Enter the world" button, then the language and the account panel,
// nothing in between; a returning player goes straight in; automated and capture links never see it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { entryPlan, isSkipLink, preferredLocale, runEntryGate, ENTRY_LOCALES } from '../../src/ui/entry-gate.js';
import { DEFAULT_FLAGS } from '../../src/features.js';
import { readFileSync } from 'node:fs';

test('entry gate: a fresh player gets the button and both steps; a returning one only the button', () => {
  assert.deepEqual(entryPlan({}), { gate: true, steps: true });
  assert.deepEqual(entryPlan({ seen: true }), { gate: true, steps: false });
});

test('entry gate: automated browsers, capture links and the flag off skip it; ?entry=1 forces it, ?entry=0 skips it', () => {
  assert.equal(entryPlan({ webdriver: true }).gate, false);
  assert.equal(entryPlan({ skipLink: true }).gate, false);
  assert.equal(entryPlan({ flag: false }).gate, false);
  assert.deepEqual(entryPlan({ entry: '1', webdriver: true, seen: true }), { gate: true, steps: true });
  assert.equal(entryPlan({ entry: '0' }).gate, false);
  for (const q of ['demo=judge', 'capture=1', 'cinematic=a', 'film=x', 'replay=r1', 'shoal=arena', 'view=close']) assert.equal(isSkipLink(new URLSearchParams(q)), true, q);
  assert.equal(isSkipLink(new URLSearchParams('lang=ru')), false);
});

test('entry gate: the preselected language is the saved one, else the browser one the game speaks, else English', () => {
  assert.equal(preferredLocale('it', ['ru-RU']), 'it');
  assert.equal(preferredLocale(null, ['de-DE', 'uk-UA']), 'uk');
  assert.equal(preferredLocale(null, ['de-DE']), 'en');
  assert.deepEqual(ENTRY_LOCALES.map(([c]) => c), ['en', 'ru', 'uk', 'it', 'zh']);
});

test('entry gate: the flag is off in the build defaults and on in the live features.json', () => {
  assert.equal(DEFAULT_FLAGS.entryGate, false);
  const live = JSON.parse(readFileSync(new URL('../../public/features.json', import.meta.url), 'utf8'));
  assert.equal((live.flags || live).entryGate, true);
});

// ---- a tiny DOM: enough for the gate's buttons
function node(tag) {
  const n = {
    tagName: tag.toUpperCase(), children: [], parent: null, attrs: {}, className: '', listeners: {}, _text: '', lang: '', type: '', id: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, contains(c) { return this.set.has(c); } },
    append(...cs) { for (const c of cs) { c.parent = n; n.children.push(c); } },
    remove() { if (n.parent) n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; },
    setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k]; },
    addEventListener(t, f) { (n.listeners[t] ||= []).push(f); },
    click() { for (const f of n.listeners.click || []) f({}); },
    focus() {},
    get firstChild() { return n.children[0] || null; },
    set textContent(v) { n._text = v; n.children = []; }, get textContent() { return n._text + n.children.map((c) => c.textContent).join(''); },
    querySelector(sel) { const cls = sel.replace(/^\./, ''); const walk = (x) => { for (const c of x.children) { if (c.className.split(' ').includes(cls)) return c; const r = walk(c); if (r) return r; } return null; }; return walk(n); },
    all(cls) { const out = []; const walk = (x) => { for (const c of x.children) { if (c.className.split(' ').includes(cls)) out.push(c); walk(c); } }; walk(n); return out; },
  };
  return n;
}
function fakeDoc() {
  const boot = node('div'); boot.id = 'boot';
  const bottom = node('div'); bottom.className = 'boot-bottom'; boot.append(bottom);
  const head = node('head');
  return { boot, head, getElementById: (id) => (id === 'boot' ? boot : head.children.find((c) => c.id === id) || null), createElement: (t) => node(t) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const T = (k) => ({ 'entry.enter': 'Enter the world', 'entry.lang': 'Choose your language', 'entry.ready': 'Ready' })[k] || k;

test('entry gate: the one button, then five languages, then the account panel in the chosen language', async () => {
  const doc = fakeDoc(); const log = [];
  const run = runEntryGate({ doc, t: T, steps: true, locale: 'uk', setLocale: (l) => log.push('locale:' + l), signIn: async () => { log.push('account'); return { status: 'guest' }; } });
  await tick();
  const btns = doc.boot.all('entry-btn');
  assert.equal(btns.length, 1, 'one button');
  assert.equal(btns[0].textContent, 'Enter the world');
  assert.equal(doc.boot.all('entry-lang').length, 0, 'nothing else before the press');
  btns[0].click(); await tick();
  const langs = doc.boot.all('entry-lang');
  assert.deepEqual(langs.map((b) => b.lang), ['en', 'ru', 'uk', 'it', 'zh']);
  assert.equal(langs.find((b) => b.lang === 'uk').getAttribute('aria-checked'), 'true');
  assert.deepEqual(log, [], 'the account waits for the language');
  langs.find((b) => b.lang === 'ru').click();
  const r = await run;
  assert.deepEqual(log, ['locale:ru', 'account']);
  assert.equal(r.locale, 'ru');
  assert.equal(doc.boot.all('entry-gate').length, 0, 'the gate is gone when the screen lifts');
});

test('entry gate: a returning player goes in from the button alone', async () => {
  const doc = fakeDoc(); const log = [];
  const run = runEntryGate({ doc, t: T, steps: false, locale: 'en', setLocale: () => log.push('locale'), signIn: async () => log.push('account') });
  await tick();
  doc.boot.all('entry-btn')[0].click();
  await run;
  assert.deepEqual(log, []);
});

test('entry gate: a failing account panel still lets the player in as a guest', async () => {
  const doc = fakeDoc();
  const run = runEntryGate({ doc, t: T, steps: true, locale: 'en', setLocale: () => {}, signIn: async () => { throw new Error('wallet chunk'); } });
  await tick(); doc.boot.all('entry-btn')[0].click(); await tick(); doc.boot.all('entry-lang')[0].click();
  assert.deepEqual((await run).account, { status: 'guest' });
});

test('entry gate: every locale has the gate and the account panel strings', async () => {
  const keys = ['entry.enter', 'entry.lang', 'entry.ready'];
  const acct = Object.keys((await import('../../src/play/locales/en-account.js')).default);
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = (await import(`../../src/play/locales/${l}.js`)).default;
    for (const k of [...keys, ...acct]) assert.ok(typeof m[k] === 'string' && m[k].length, `${l}: ${k}`);
  }
});
