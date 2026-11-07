// Pure UI logic: hologram recipe hashing, tournament enrollment, onboarding order,
// demo entitlement, safe storage and preferences.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSafeStorage, memoryStorage, STORAGE_KEYS } from '../src/ui/storage.js';
import {
  DEFAULT_RECIPE, normalizeRecipe, canonicalJson, recipeHash, randomizeRecipe, renderProfile,
  saveRecipe, loadRecipe, LAYERS, COMPONENTS, MAX_LAYERS, MAX_COMPONENTS,
} from '../src/ui/hologram/recipe.js';
import { createTournamentStore, weeklySchedule, tournamentPhase, isoWeek, splitDuration } from '../src/ui/tournament.js';
import { createOnboardingFlow, FLOW_STEPS } from '../src/ui/flow.js';
import { getGuestId, issueDemoEntitlement, getEntitlement } from '../src/ui/entitlement.js';
import { createPrefs } from '../src/ui/prefs.js';
import { createUiContext } from '../src/ui/context.js';
import { makeChooser } from './lib/policies.mjs';

/** A storage whose every call throws (private mode / blocked site data). */
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

test('recipe: canonical JSON sorts keys at every level and the hash ignores key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: 'x' } }), '{"a":{"c":"x","d":[3,{"y":2,"z":1}]},"b":1}');
  const rev = (v) => (Array.isArray(v) ? v.map(rev) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, rev(v[k])])) : v);
  const shuffled = rev(DEFAULT_RECIPE);
  assert.notEqual(JSON.stringify(shuffled), JSON.stringify(DEFAULT_RECIPE));
  assert.equal(recipeHash(shuffled), recipeHash(DEFAULT_RECIPE));
  assert.match(recipeHash(DEFAULT_RECIPE), /^[0-9a-f]{64}$/);
});

test('recipe: normalization whitelists layers/components, clamps and quantizes numbers', () => {
  const r = normalizeRecipe({
    shape: 'cube', layers: ['scanlines', 'evil-shader', 'outline', 'outline', 'grain', 'dither'], components: ['shards', 'core', 'x', 'halo', 'veil', 'orbiters'],
    particles: { count: 9999, size: 1.23456, drift: -4 }, palette: { primary: '#ABC', secondary: 'red', accent: '#D4A15F' }, light: { warmth: 0.1 + 0.2 }, gesture: 'dab',
  });
  assert.equal(r.shape, DEFAULT_RECIPE.shape);
  assert.deepEqual(r.layers, ['outline', 'scanlines', 'grain'], 'whitelist order, unique, capped');
  assert.ok(r.layers.length <= MAX_LAYERS && r.layers.every((l) => LAYERS.includes(l)));
  assert.deepEqual(r.components, ['core', 'halo', 'orbiters', 'veil']);
  assert.ok(r.components.length <= MAX_COMPONENTS && r.components.every((c) => COMPONENTS.includes(c)));
  assert.deepEqual(r.particles, { count: 400, size: 1.2, drift: 0 });
  assert.deepEqual(r.palette, { primary: '#aabbcc', secondary: DEFAULT_RECIPE.palette.secondary, accent: '#d4a15f' });
  assert.equal(r.light.warmth, 0.3, 'float noise (0.30000000000000004) is quantized away');
  assert.equal(r.gesture, DEFAULT_RECIPE.gesture);
  assert.deepEqual(normalizeRecipe(r), r, 'normalization is idempotent');
});

test('recipe: stable after save → reload → low tier → reset (spec appendix G)', () => {
  const backend = memoryStorage();
  const recipe = randomizeRecipe(makeChooser(7));
  const h = recipeHash(recipe);
  const saved = saveRecipe(createSafeStorage(backend), recipe);
  assert.equal(saved.hash, h);
  assert.equal(saved.persistent, true);
  // "Reload": a fresh storage wrapper over the same backend, as after a page refresh.
  const loaded = loadRecipe(createSafeStorage(backend));
  assert.deepEqual(loaded, normalizeRecipe(recipe));
  assert.equal(recipeHash(loaded), h);
  // Low tier changes the render profile only.
  const before = JSON.stringify(loaded);
  const low = renderProfile(loaded, 'low');
  assert.equal(low.tier, 'low');
  assert.ok(low.particles <= 48 && !low.trails && !low.layers.includes('bloom') && !low.layers.includes('chromatic'));
  assert.equal(JSON.stringify(loaded), before, 'renderProfile does not mutate the recipe');
  assert.equal(recipeHash(loaded), h);
  // Reset returns exactly the default; loading again brings the saved one back.
  const reset = normalizeRecipe(DEFAULT_RECIPE);
  assert.equal(recipeHash(reset), recipeHash(DEFAULT_RECIPE));
  assert.equal(recipeHash(loadRecipe(createSafeStorage(backend))), h);
});

test('recipe: randomize is valid and seedable; tampered or missing saves are rejected', () => {
  for (let s = 1; s <= 50; s++) {
    const r = randomizeRecipe(makeChooser(s));
    assert.deepEqual(normalizeRecipe(r), r);
    assert.equal(recipeHash(r), recipeHash(randomizeRecipe(makeChooser(s))));
  }
  const backend = memoryStorage();
  const st = createSafeStorage(backend);
  assert.equal(loadRecipe(st), null);
  saveRecipe(st, DEFAULT_RECIPE);
  const raw = JSON.parse(backend.getItem(STORAGE_KEYS.hologram));
  raw.recipe.particles.count = 10;
  backend.setItem(STORAGE_KEYS.hologram, JSON.stringify(raw));
  assert.equal(loadRecipe(createSafeStorage(backend)), null, 'hash mismatch');
  backend.setItem(STORAGE_KEYS.hologram, '{not json');
  assert.equal(loadRecipe(createSafeStorage(backend)), null);
});

test('recipe: works when storage throws; cosmetics never reach the engine', () => {
  const st = createSafeStorage(throwing);
  assert.equal(st.persistent, false);
  const res = saveRecipe(st, DEFAULT_RECIPE);
  assert.equal(res.persistent, false);
  assert.equal(recipeHash(loadRecipe(st)), recipeHash(DEFAULT_RECIPE), 'kept in memory for this visit');
  const engine = readFileSync(fileURLToPath(new URL('../src/game/engine.js', import.meta.url)), 'utf8');
  assert.ok(!/recipe|hologram|\/ui\//i.test(engine), 'engine.js knows nothing about cosmetics');
  const recipeSrc = readFileSync(fileURLToPath(new URL('../src/ui/hologram/recipe.js', import.meta.url)), 'utf8');
  assert.ok(!/engine\.js/.test(recipeSrc), 'recipe module does not import the engine');
});

test('tournament: ISO weeks and the synthetic schedule', () => {
  assert.deepEqual(isoWeek(Date.parse('2026-11-07T12:00:00Z')), { year: 2026, week: 45 });
  assert.deepEqual(isoWeek(Date.parse('2027-01-03T12:00:00Z')), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(Date.parse('2027-01-04T00:00:00Z')), { year: 2027, week: 1 });
  const s = weeklySchedule(Date.parse('2026-11-07T12:00:00Z'));
  assert.equal(s.weekId, '2026-W45');
  assert.equal(new Date(s.opensAt).toISOString(), '2026-11-02T00:00:00.000Z');
  assert.equal(new Date(s.closesAt).toISOString(), '2026-11-07T18:00:00.000Z');
  assert.equal(tournamentPhase(s, Date.parse('2026-11-07T12:00:00Z')), 'open');
  assert.equal(tournamentPhase(s, Date.parse('2026-11-07T19:00:00Z')), 'running');
  assert.equal(tournamentPhase(s, Date.parse('2026-11-08T09:00:00Z')), 'results');
  assert.deepEqual(splitDuration(26 * 3600000 + 61000), { d: 1, h: 2, m: 2 });
});

test('tournament: duplicate enrollment is idempotent and survives a coordinator restart', () => {
  const backend = memoryStorage();
  const now = Date.parse('2026-11-05T10:00:00Z');
  const a = createTournamentStore({ storage: createSafeStorage(backend), clock: () => now });
  const first = a.enroll({ playerId: 'guest-0000abcd', requestId: 'r1' });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.entry.simulation, true);
  const again = a.enroll({ playerId: 'guest-0000abcd', requestId: 'r2' });
  assert.equal(again.duplicate, true);
  assert.deepEqual(again.entry, first.entry);
  assert.equal(a.count('2026-W45'), 1);
  // Restart: a brand-new store over the same storage sees the same enrollment.
  const b = createTournamentStore({ storage: createSafeStorage(backend), clock: () => now + 3600000 });
  const third = b.enroll({ playerId: 'guest-0000abcd', requestId: 'r1' });
  assert.equal(third.duplicate, true);
  assert.equal(third.entry.entryId, first.entry.entryId);
  assert.equal(b.count('2026-W45'), 1);
  assert.equal(b.enroll({ playerId: 'guest-0000ffff' }).duplicate, false);
  assert.equal(b.count('2026-W45'), 2);
  assert.deepEqual(b.enroll({}), { ok: false, reason: 'no_player' });
});

test('tournament: enrollment closes at the barrier and results stay sealed until the results barrier', () => {
  const st = createSafeStorage(memoryStorage());
  const store = createTournamentStore({ storage: st });
  const open = Date.parse('2026-11-07T17:59:00Z');
  assert.equal(store.enroll({ playerId: 'guest-00000001', now: open }).ok, true);
  assert.deepEqual(store.enroll({ playerId: 'guest-00000002', now: Date.parse('2026-11-07T18:00:00Z') }), { ok: false, reason: 'closed' });
  assert.equal(store.results({ playerId: 'guest-00000001', now: open }), null);
  assert.equal(store.results({ playerId: 'guest-00000001', now: Date.parse('2026-11-07T19:59:59Z') }), null, 'no reveal before the barrier');
  const res = store.results({ playerId: 'guest-00000001', now: Date.parse('2026-11-07T20:00:00Z') });
  assert.equal(res.simulation, true);
  assert.equal(res.rows.length, 6);
  assert.deepEqual(res.rows.map((r) => r.rank), [1, 2, 3, 4, 5, 6]);
  assert.equal(res.rows.filter((r) => r.kind === 'you').length, 1);
  assert.equal(res.rows.filter((r) => r.trophy).length, 1);
  for (const r of res.rows) assert.deepEqual(Object.keys(r).sort(), ['kind', 'letter', 'outcome', 'rank', 'score', 'trophy']);
  assert.deepEqual(store.results({ playerId: 'guest-00000001', now: Date.parse('2026-11-08T10:00:00Z') }), res, 'deterministic');
  const raw = JSON.stringify(JSON.parse(st.getItem(STORAGE_KEYS.tournament)));
  assert.ok(!/prize|near|silk|amount/i.test(raw), 'no money fields are stored');
});

test('onboarding: lobby → entitlement → tutorial → customization → first contact, never swapped', () => {
  const flow = createOnboardingFlow(createSafeStorage(memoryStorage()));
  assert.equal(flow.step, 'lobby');
  assert.equal(flow.goto('customization'), false, 'customization before tutorial is refused');
  assert.equal(flow.goto('tutorial'), false, 'tutorial before entitlement is refused');
  assert.equal(flow.goto('firstContact'), false);
  assert.equal(flow.enter(), true);
  assert.equal(flow.step, 'entitlement');
  assert.equal(flow.complete('tutorial'), false, 'only the current step can complete');
  flow.complete('entitlement');
  assert.equal(flow.step, 'tutorial');
  assert.equal(flow.goto('customization'), false);
  flow.complete('tutorial');
  assert.equal(flow.step, 'customization');
  assert.equal(flow.goto('tutorial'), true, 'going back to revisit is allowed');
  assert.equal(flow.goto('firstContact'), false);
  flow.goto('customization');
  flow.complete('customization');
  assert.equal(flow.step, 'firstContact');
  assert.deepEqual(FLOW_STEPS, ['lobby', 'entitlement', 'tutorial', 'customization', 'firstContact']);
});

test('onboarding: progress persists, resumes at the first unfinished step, and repairs tampered order', () => {
  const backend = memoryStorage();
  const f1 = createOnboardingFlow(createSafeStorage(backend));
  f1.enter(); f1.complete('entitlement');
  const f2 = createOnboardingFlow(createSafeStorage(backend));
  f2.enter();
  assert.equal(f2.step, 'tutorial');
  backend.setItem(STORAGE_KEYS.flow, JSON.stringify({ done: { entitlement: false, tutorial: true, customization: true } }));
  const f3 = createOnboardingFlow(createSafeStorage(backend));
  assert.deepEqual(f3.done, { entitlement: false, tutorial: false, customization: false });
  assert.equal(f3.canEnter('customization'), false);
});

test('demo entitlement: synthetic, free, testnet, idempotent; guest id is stable', () => {
  const st = createSafeStorage(memoryStorage());
  const id = getGuestId(st);
  assert.match(id, /^guest-[0-9a-f]{8}$/);
  assert.equal(getGuestId(st), id);
  assert.equal(getEntitlement(st), null);
  const e = issueDemoEntitlement(st, id, Date.parse('2026-11-07T00:00:00Z'));
  assert.deepEqual({ kind: e.kind, network: e.network, paid: e.paid, priceNear: e.priceNear }, { kind: 'synthetic-demo', network: 'testnet', paid: false, priceNear: 0 });
  assert.deepEqual(issueDemoEntitlement(st, id), e);
});

test('prefs: validated, persisted, and resolved against the system', () => {
  const backend = memoryStorage();
  const p = createPrefs(createSafeStorage(backend), { systemReducedMotion: () => true, systemLowTier: () => false });
  assert.equal(p.reducedMotion(), true, 'follows the system by default');
  assert.equal(p.tier(), 'high');
  p.set({ motion: 'full', quality: 'low', subtitleSize: 'xl', locale: 'ru' });
  assert.equal(p.reducedMotion(), false);
  assert.equal(p.tier(), 'low');
  assert.equal(p.get().subtitleSize, 'm', 'invalid values are ignored');
  const p2 = createPrefs(createSafeStorage(backend), { systemReducedMotion: () => false });
  assert.equal(p2.get().locale, 'ru');
  assert.equal(p2.get().motion, 'full');
  const broken = createPrefs(createSafeStorage(throwing));
  broken.set({ subtitles: false });
  assert.equal(broken.get().subtitles, false, 'works without storage');
});

test('player-facing context preserves the saved locale and offers five languages', () => {
  const storage = createSafeStorage(memoryStorage());
  const guest = getGuestId(storage);
  saveRecipe(storage, DEFAULT_RECIPE);
  storage.setJSON(STORAGE_KEYS.prefs, { locale: 'ru', quality: 'low' });
  const before = storage.getItem(STORAGE_KEYS.hologram);
  const ctx = createUiContext({ storage });
  assert.equal(ctx.i18n.locale, 'ru');
  assert.deepEqual(ctx.i18n.locales, ['en', 'uk', 'ru', 'it', 'zh']);
  assert.equal(ctx.i18n.setLocale('ru'), false);
  assert.equal(ctx.prefs.tier(), 'low');
  assert.equal(ctx.guestId, guest);
  assert.equal(storage.getItem(STORAGE_KEYS.hologram), before);
  assert.equal(storage.getJSON(STORAGE_KEYS.prefs).locale, 'ru');
});
