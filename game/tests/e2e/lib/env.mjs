// End-to-end harness (Task K, QA): a Vite dev server for `game/` (or FTF_E2E_URL for a deployed build), headless
// Chromium through Playwright on whatever GL the machine has (SwiftShader in the cloud container), and a small
// driver around the client's own debug handle `window.__ftf`. Real-time input is impractical at software-rendering
// frame rates, so the driver presses keys through `__ftf.play.handleKey(code)` (the function main.js calls for every
// play key) and clicks through `element.click()`; both are the same code paths a player triggers.
//
// Playwright is not a dependency of the game: it is resolved from `PLAYWRIGHT_PATH`, from NODE_PATH, or from the
// global installs this container ships (/opt/node-tools). `npm run e2e` fails with a clear message otherwise.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GAME_ROOT = path.resolve(here, '../../..');

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node-tools/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js', '/usr/local/lib/node_modules/playwright/index.js'].filter(Boolean);
  const require = createRequire(import.meta.url);
  for (const c of candidates) {
    try { return require(c); } catch { /* next */ }
  }
  throw new Error('playwright not found: install it globally (npm i -g playwright) or set PLAYWRIGHT_PATH to its index.js');
}

let serverPromise = null;
/** Base URL of the build under test: FTF_E2E_URL, else a Vite dev server started once per process. */
export function baseUrl() {
  if (process.env.FTF_E2E_URL) return Promise.resolve({ url: process.env.FTF_E2E_URL.replace(/\/$/, '') + '/', close: async () => {} });
  if (!serverPromise) {
    serverPromise = (async () => {
      const { createServer } = await import(path.join(GAME_ROOT, 'node_modules/vite/dist/node/index.js'));
      const server = await createServer({ root: GAME_ROOT, configFile: path.join(GAME_ROOT, 'vite.config.js'), logLevel: 'error', server: { port: 0, strictPort: false, host: '127.0.0.1' } });
      await server.listen();
      const url = server.resolvedUrls.local[0];
      return { url, close: () => server.close() };
    })();
  }
  return serverPromise;
}

let browserPromise = null;
export function browser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const pw = await loadPlaywright();
      const b = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
      return { pw, b };
    })();
  }
  return browserPromise;
}

/** Closes the shared browser and server (call from the last `after`). */
export async function shutdown() {
  if (browserPromise) { const { b } = await browserPromise; await b.close(); browserPromise = null; }
  if (serverPromise) { const s = await serverPromise; await s.close(); serverPromise = null; }
}

const isVisible = `(e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0' && !e.closest('[hidden]'); }`;

/**
 * Opens the game at `query` (e.g. '?demo=judge&play=direct') and waits for the play layer.
 * @param {string} query
 * @param {{viewport?: {width:number,height:number}, device?: string, reducedMotion?: boolean, ready?: boolean, timeout?: number}} [o]
 */
export async function openGame(query, o = {}) {
  const [{ url }, { pw, b }] = await Promise.all([baseUrl(), browser()]);
  const ctxOpts = o.device ? { ...pw.devices[o.device] } : { viewport: o.viewport || { width: 1280, height: 800 }, deviceScaleFactor: 1 };
  if (o.reducedMotion) ctxOpts.reducedMotion = 'reduce';
  const context = await b.newContext(ctxOpts);
  const page = await context.newPage();
  page.setDefaultTimeout(o.timeout || 180000);
  const log = { errors: [], warnings: [], pageErrors: [], failed: [] };
  page.on('console', (m) => { const t = m.type(); const txt = m.text(); if (t === 'error') log.errors.push(txt); else if (t === 'warning' && !/GPU stall|ReadPixels/.test(txt)) log.warnings.push(txt); });
  page.on('pageerror', (e) => log.pageErrors.push(String((e && e.stack) || e)));
  page.on('requestfailed', (r) => log.failed.push(r.url() + ' ' + ((r.failure() || {}).errorText || '')));
  page.on('response', (r) => { if (r.status() >= 400) log.failed.push(r.url() + ' HTTP ' + r.status()); });
  await page.goto(url + query, { waitUntil: 'domcontentloaded' });
  if (o.ready !== false) await waitReady(page, o.timeout);
  const g = {
    page, context, log,
    /** Presses a play key the way main.js does. */
    key: (code) => page.evaluate((c) => window.__ftf.play.handleKey(c), code),
    /** element.click() on the first match; returns 'ok' | 'missing …' | 'disabled …'. */
    click: (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return 'missing ' + s; if (e.disabled) return 'disabled ' + s; e.click(); return 'ok'; }, sel),
    /** Compact view of the room observation. */
    obs: () => page.evaluate(() => { const s = window.__ftf.play.session; const o = s.obs; return { tick: o.season.tick, phase: o.season.phase, ticks: o.season.ticks, silk: o.iris.silk, attention: o.iris.attention, tension: o.season.tension, zone: o.you.zone, shell: o.you.shell, prophecies: o.prophecies.map((p) => ({ index: p.index, vision: !!p.vision, publishedAt: p.publishedAt, implied: p.impliedAnchor })), anchors: o.iris.anchors, memories: o.memories.length, forgotten: o.iris.forgotten.length, outcome: o.season.outcome, heir: o.season.heir, version: o.version, offers: (o.offers || []).map((x) => x.kind + ':' + x.from), log: (o.log || []).slice(0, 4).map((e) => e.key), chronicle: o.chronicle.length, goal: s.goal && s.goal.key, goalArgs: s.goal && s.goal.args, options: (s.options || []).map((x) => x.id), defaultIndex: s.defaultIndex }; }),
    hub: () => page.evaluate(() => { const h = window.__ftf.play.hub; return h ? { busy: h.busy, advancing: h.advancing, card: h.card && h.card.kind, lastStake: h.lastStake, draft: h.draft } : null; }),
    /** innerText of every match, whitespace collapsed. */
    text: (sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.innerText.replace(/\s+/g, ' ').trim()), sel),
    /** Visible matches with their boxes. */
    boxes: (sel) => page.evaluate(({ s, vis }) => { const v = eval(vis); return [...document.querySelectorAll(s)].filter(v).map((e) => ({ sel: s, cls: e.className && String(e.className), rect: e.getBoundingClientRect().toJSON(), text: e.innerText.replace(/\s+/g, ' ').slice(0, 80) })); }, { s: sel, vis: isVisible }),
    visible: (sel) => page.evaluate(({ s, vis }) => [...document.querySelectorAll(s)].filter(eval(vis)).length, { s: sel, vis: isVisible }),
    shot: (name) => page.screenshot({ path: path.join(GAME_ROOT, 'tests/e2e/.shots', name + '.png'), timeout: 120000, animations: 'disabled', caret: 'hide' }).catch(() => {}),
    wait: (ms) => page.waitForTimeout(ms),
    until: (fn, timeout = 90000) => page.waitForFunction(fn, null, { timeout, polling: 200 }),
    /** Waits until the Shell hub is neither busy nor advancing. */
    hubIdle: (timeout = 150000) => page.waitForFunction(() => { const h = window.__ftf.play.hub; return !h || (!h.busy && !h.advancing); }, null, { timeout, polling: 150 }),
    /** Waits for the command bus to drain. */
    busIdle: (timeout = 60000) => page.waitForFunction(() => { const s = window.__ftf.play.session; return s.bus.pending === 0 && !s.syncing; }, null, { timeout, polling: 150 }),
    /** Moves the client avatar to a world position and syncs the room avatar there (replaces a slow software-rendered walk). */
    teleport: async (pos) => {
      await page.evaluate((p) => { const c = window.__ftf; c.player.pos = p.slice(); c.player.prevPos = p.slice(); c.player.lastSafe = p.slice(); c.player.vy = 0; const s = c.play.session; if (s.trail) s.trail.reset(p); }, pos);
      await page.waitForTimeout(600);
      await g.busIdle();
      return page.evaluate(() => window.__ftf.play.session.syncPosition({ force: true }));
    },
    /** Commands the client sent (type, args, ok) since the page became ready. */
    results: () => page.evaluate(() => window.__qa.results),
    close: () => context.close(),
  };
  return g;
}

export async function waitReady(page, timeout = 180000) {
  await page.waitForFunction(() => window.__ftf && window.__ftf.play && window.__ftf.play.session && window.__ftf.play.session.obs, null, { timeout, polling: 250 });
  await page.evaluate(() => {
    window.__qa = { results: [], cmds: [] };
    const s = window.__ftf.play.session;
    s.on('result', (r) => window.__qa.results.push({ ok: r.ok, reason: r.reason, silent: !!r.silent }));
    const bus = s.bus; const orig = bus.send.bind(bus);
    bus.send = (t, a, o) => { const rec = { at: Math.round(performance.now()), type: t, args: a, tick: s.obs && s.obs.season.tick }; window.__qa.cmds.push(rec); const p = orig(t, a, o); p.then((r) => { rec.ok = r.ok; rec.reason = r.reason; rec.done = Math.round(performance.now()); }); return p; };
  });
}

/** True when two DOMRect-like boxes overlap by more than `slack` px in both axes. */
export function intersects(a, b, slack = 2) {
  return a.left < b.right - slack && b.left < a.right - slack && a.top < b.bottom - slack && b.top < a.bottom - slack;
}

/** Console errors and uncaught exceptions as one string (empty when clean). */
export function consoleProblems(g) {
  return [...g.log.errors, ...g.log.pageErrors].join('\n');
}
