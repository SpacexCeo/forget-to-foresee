// The installable game (owner 14.11): the manifest is base-relative, the shell worker never touches the network calls
// (NEAR, relayer, presence, other hosts) or the heavy assets, the install pill shows only on phones not yet installed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installHintFor, registerShell } from '../../src/ui/pwa.js';

test('pwa: the manifest opens the game where it is published, fullscreen, with its icons', () => {
  const m = JSON.parse(readFileSync(new URL('../../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.start_url, './'); assert.equal(m.scope, './'); assert.equal(m.display, 'fullscreen');
  assert.ok(m.icons.some((i) => i.sizes === '512x512') && m.icons.some((i) => i.sizes === '192x192'));
});

test('pwa: the shell worker caches only the page and hashed scripts / styles of its own origin and scope', async () => {
  const src = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
  const listeners = {};
  const self = { registration: { scope: 'https://ftf-game.xyz/' }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
  const kind = new Function('self', 'caches', src + '\nreturn shellKind;')(self, {});
  const req = (url, o = {}) => ({ url, method: o.method || 'GET', mode: o.mode || 'cors' });
  assert.equal(kind(req('https://ftf-game.xyz/', { mode: 'navigate' })), 'page');
  assert.equal(kind(req('https://ftf-game.xyz/assets/main-CMHYRff4.js')), 'asset');
  assert.equal(kind(req('https://ftf-game.xyz/assets/boot-a1b2c3d4.css')), 'asset');
  for (const u of ['https://rpc.testnet.near.org/', 'https://159-195-130-113.sslip.io/api/health', 'https://ftf-game.xyz/features.json', 'https://ftf-game.xyz/assets/models/town.glb', 'https://ftf-game.xyz/assets/video/boot-reel.mp4'])
    assert.equal(kind(req(u)), null, u);
  assert.equal(kind(req('https://ftf-game.xyz/api/x', { method: 'POST' })), null);
});

test('pwa: the install pill on phones only, never once installed or dismissed; the worker only in production', () => {
  assert.equal(installHintFor({ phone: true, prompt: true }), 'prompt');
  assert.equal(installHintFor({ phone: true, ios: true }), 'ios');
  assert.equal(installHintFor({ phone: true }), null, 'no prompt, not iOS: nothing to offer');
  assert.equal(installHintFor({ phone: false, prompt: true }), null);
  assert.equal(installHintFor({ phone: true, prompt: true, standalone: true }), null);
  assert.equal(installHintFor({ phone: true, prompt: true, dismissed: true }), null);
  const regs = []; const nav = { serviceWorker: { register: (u, o) => { regs.push([u, o.scope]); return Promise.resolve(); } } };
  assert.equal(registerShell({ base: '/forget-to-foresee/', prod: false, nav }), false);
  assert.equal(registerShell({ base: '/', prod: true, nav, params: new URLSearchParams('capture=1') }), false);
  assert.equal(registerShell({ base: '/', prod: true, nav }), true);
  assert.deepEqual(regs, [['/sw.js', '/']]);
});

test('pwa: every locale has the install lines', async () => {
  for (const l of ['en', 'ru', 'uk', 'it', 'zh']) {
    const m = (await import(`../../src/play/locales/${l}.js`)).default;
    for (const k of ['pwa.install.line', 'pwa.install', 'pwa.ios', 'pwa.close']) assert.ok(m[k], `${l}: ${k}`);
  }
});
