// Evermind, the open city (src/city): layout, the closed economy, Iris's city state, the live price feed's
// parsing and honesty (never a number the network did not give), the five locales and the build chunk rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALL_RADIUS, PLAZA_RADIUS, PLACES, STALLS, RESIDENTS, SOLIDS, HOUSES, TOWN_TREES, LAMPS, CITY_SPAWN, CITY_ORIGIN, FOREST, forestTrees, horizonHills, insideWalls, placeAt, residentAt } from '../../src/city/layout.js';
import { GOODS, MEALS, BAG_SIZE, SATIETY, DAY_MS, cityDay, msToNextDay, priceFactor, buyPrice, sellPrice, trend, marketTable, friendLevel, toNextLevel, tournamentPurse, RESIDENT_TASTE } from '../../src/city/economy.js';
import { CityState, CITY_KEY, START_SILK, INTRO_STEPS, RESIDENT_IDS, questOffers, questProgress, freshCity } from '../../src/city/state.js';
import { parseNearPrice, parseNearFromDex, parseMemes, parseShards, formatUsd, formatChange, createPriceFeed, MEME_TOKENS, STALE_MS } from '../../src/city/prices.js';
import { cityUrl } from '../../src/city/url.js';
import { CITY_MESSAGES } from '../../src/city/locales/index.js';
import { argNames, parse } from '../../src/ui/i18n/index.js';
import { createPlayI18n } from '../../src/play/i18n.js';
import { memoryStorage, createSafeStorage } from '../../src/ui/storage.js';
import { chunkFor } from '../../build/chunks.js';

const DAY0 = 2000000; // a fixed city day for the state tests
const at = (day, ms = 1000) => day * DAY_MS + ms;
function newCity(day = DAY0, storage = createSafeStorage(memoryStorage())) {
  const clock = { now: at(day) };
  const city = new CityState({ storage, now: () => clock.now });
  return { city, clock, storage };
}

/* ---------- layout ---------- */

test('layout: every place, envoy, stall, house, lamp and tree stands inside the wall, and the spawn is on the plaza', () => {
  for (const p of [...PLACES, ...STALLS, ...RESIDENTS, ...HOUSES]) assert.ok(insideWalls(p.position[0], p.position[2], 1), p.id + ' inside the wall');
  for (const p of [...LAMPS, ...TOWN_TREES]) assert.ok(insideWalls(p[0], p[2], 1));
  assert.ok(Math.hypot(CITY_SPAWN.position[0], CITY_SPAWN.position[2]) < PLAZA_RADIUS);
  assert.ok(Math.hypot(...CITY_ORIGIN) > 1000, 'far from the island: beyond the camera far plane');
  assert.notDeepEqual(CITY_ORIGIN, [0, 300, 0], 'not where the Shell interior lives');
});

test('layout: each envoy stands within reach of their place and outside every solid box; nobody blocks the spawn', () => {
  const inBox = (x, z, [cx, cz, w, d, , yaw], pad = 0.5) => {
    const dx = x - cx, dz = z - cz, c = Math.cos(-yaw), s = Math.sin(-yaw);
    const lx = dx * c + dz * s, lz = -dx * s + dz * c; // into the box's frame (rotation about Y by yaw)
    return Math.abs(lx) < w / 2 + pad && Math.abs(lz) < d / 2 + pad;
  };
  for (const r of RESIDENTS) {
    const place = PLACES.find((p) => p.id === r.place);
    assert.ok(place, r.id + ' has a place');
    assert.ok(Math.hypot(r.position[0] - place.position[0], r.position[2] - place.position[2]) < place.radius + 3, r.id + ' near ' + place.id);
    for (const s of SOLIDS) assert.ok(!inBox(r.position[0], r.position[2], s.box), r.id + ' not inside ' + s.id);
    assert.ok(Math.hypot(r.position[0] - CITY_SPAWN.position[0], r.position[2] - CITY_SPAWN.position[2]) > 4);
  }
  assert.deepEqual(RESIDENTS.map((r) => r.id).sort(), [...RESIDENT_IDS].sort());
  // houses keep clear of the places Iris uses
  for (const h of HOUSES) for (const p of PLACES) assert.ok(Math.hypot(h.position[0] - p.position[0], h.position[2] - p.position[2]) > 6.5, h.id + ' clear of ' + p.id);
});

test('layout: placeAt and residentAt pick the nearest thing in reach, and nothing in the open', () => {
  assert.equal(placeAt(25, -2).id, 'market');
  assert.equal(placeAt(0, -38).id, 'gate');
  assert.equal(placeAt(-10, -12), null);
  const moss = RESIDENTS.find((r) => r.id === 'moss');
  assert.equal(residentAt(moss.position[0] + 1, moss.position[2]).id, 'moss');
  assert.equal(residentAt(0, 7), null);
});

test('scenery: the forest is the same on every device, starts outside the wall and leaves the south road open', () => {
  const a = forestTrees(400), b = forestTrees(400);
  assert.deepEqual(a, b);
  assert.equal(a.length, 400);
  for (const t of a) {
    const r = Math.hypot(t.x, t.z);
    assert.ok(r >= FOREST.inner && r <= FOREST.outer, 'tree radius ' + r);
    assert.ok(r > WALL_RADIUS + 5, 'no tree can be reached');
    assert.ok(!(t.z > 0 && Math.abs(t.x) < 5), 'the road stays open');
  }
  assert.ok(horizonHills().every((h) => Math.hypot(h.x, h.z) >= FOREST.hills && h.height > 20));
});

/* ---------- economy ---------- */

test('economy: prices are deterministic, bounded, and a same-day round trip always loses', () => {
  for (const g of GOODS) for (let d = DAY0; d < DAY0 + 60; d++) {
    const f = priceFactor(g.id, d), buy = buyPrice(g.id, d), sell = sellPrice(g.id, d);
    assert.ok(f >= 0.7 && f <= 1.4, `${g.id} factor ${f}`);
    assert.equal(buy, buyPrice(g.id, d));
    assert.ok(Number.isInteger(buy) && Number.isInteger(sell) && sell >= 1);
    assert.ok(sell < buy, `${g.id} day ${d}: sell ${sell} < buy ${buy}`);
    assert.ok([-1, 0, 1].includes(trend(g.id, d)));
  }
  assert.equal(buyPrice('nothing', DAY0), null);
  assert.ok(buyPrice('amber', DAY0, 0.1) <= buyPrice('amber', DAY0));
  assert.equal(marketTable(DAY0).length, GOODS.length);
});

test('economy: trading across days can pay (the market is worth reading)', () => {
  let best = 0;
  for (const g of GOODS) for (let d = DAY0; d < DAY0 + 40; d++) for (let k = 1; k <= 4; k++) best = Math.max(best, sellPrice(g.id, d + k) - buyPrice(g.id, d));
  assert.ok(best > 0, 'some good bought on one day sells higher within four days');
});

test('economy: city days come from the wall clock; friendship levels and the tournament purse', () => {
  assert.equal(cityDay(at(DAY0)), DAY0);
  assert.equal(cityDay(at(DAY0, DAY_MS - 1)), DAY0);
  assert.equal(msToNextDay(at(DAY0, 0)), DAY_MS);
  assert.deepEqual([0, 2, 3, 8, 15, 16, 28, 99].map(friendLevel), [0, 0, 1, 2, 2, 3, 4, 4]);
  assert.equal(toNextLevel(0), 3); assert.equal(toNextLevel(28), 0);
  assert.equal(tournamentPurse({ silk: 100, outcome: 'gift' }), 30);
  assert.equal(tournamentPurse({ silk: 100, outcome: 'gone' }), 20);
  assert.equal(tournamentPurse({ silk: 0, outcome: 'weapon' }), 4);
  assert.equal(tournamentPurse({ silk: 100, outcome: 'gift' }, 0.1), 33);
  assert.equal(tournamentPurse({ silk: -5, outcome: 'proof_failed' }), 0);
  for (const id of RESIDENT_IDS) assert.ok(GOODS.some((g) => g.id === RESIDENT_TASTE[id].loves));
});

/* ---------- Iris's city state ---------- */

test('state: a refused action changes nothing; buying and selling move silk and the bag', () => {
  const { city, clock } = newCity();
  const before = JSON.stringify(city.data);
  assert.deepEqual(city.sell('bread'), { ok: false, reason: 'no_item' });
  assert.deepEqual(city.buy('nope'), { ok: false, reason: 'unknown_good' });
  assert.deepEqual(city.gift('moss', 'tea'), { ok: false, reason: 'no_item' });
  assert.equal(JSON.stringify(city.data), before);
  const price = buyPrice('bread', DAY0);
  assert.equal(city.buy('bread').ok, true);
  assert.equal(city.data.silk, START_SILK - price + INTRO_STEPS.find((s) => s.id === 'buy').reward);
  assert.equal(city.data.bag.bread, 1);
  city.data.silk = 0;
  assert.equal(city.buy('amber').reason, 'no_silk');
  city.data.silk = 10000;
  for (let i = city.bagCount; i < BAG_SIZE; i++) assert.equal(city.buy('bread').ok, true);
  assert.equal(city.buy('bread').reason, 'bag_full');
  clock.now = at(DAY0 + 1);
  const got = sellPrice('bread', DAY0 + 1);
  assert.deepEqual(city.sell('bread', 2), { ok: true, got: got * 2 });
  assert.equal(city.bagCount, BAG_SIZE - 2);
});

test('state: eating fills Iris, hunger comes with time, a snack comes from the bag', () => {
  const { city } = newCity();
  const s0 = city.data.satiety;
  assert.equal(city.eat('stew').ok, true);
  assert.equal(city.data.satiety, Math.min(100, s0 + MEALS[0].food));
  city.data.satiety = 100;
  assert.equal(city.eat('feast').reason, 'full');
  city.tick(60 * 30); // half an hour in the city
  assert.ok(city.data.satiety < 1 && city.hungry);
  assert.ok(city.drainNews().some((n) => n.kind === 'hungry'));
  assert.equal(city.snack('bread').reason, 'no_item');
  city.buy('bread');
  assert.equal(city.snack('bread').ok, true);
  assert.ok(city.data.satiety > 10);
  assert.equal(city.snack('ink').reason, 'not_food');
  city.data.silk = 0;
  assert.equal(city.eat('feast').reason, 'no_silk');
});

test('state: the welcome chain accepts its steps in any order and pays each once', () => {
  const { city } = newCity();
  assert.equal(city.introStep.id, 'talk');
  city.eat('stew'); // out of order
  assert.deepEqual(city.data.intro, ['eat']);
  assert.equal(city.introStep.id, 'talk');
  city.eat('stew');
  assert.deepEqual(city.data.intro, ['eat'], 'paid once');
  city.talk('moss'); city.note('prices'); city.buy('tea'); city.note('gate');
  assert.equal(city.introStep, null);
  const news = city.drainNews().filter((n) => n.kind === 'intro');
  assert.equal(news.length, INTRO_STEPS.length);
  assert.ok(news[news.length - 1].finished);
});

test('state: friendship grows by one chat a day and one gift a day; a loved gift counts three; a friend earns a perk', () => {
  const { city, clock } = newCity();
  assert.equal(city.talk('moss').first, true);
  assert.equal(city.talk('moss').first, false);
  assert.equal(city.data.friends.moss.points, 1);
  city.data.silk = 500;
  city.buy('tea', 3); city.buy('ink');
  assert.deepEqual(city.gift('moss', 'tea'), { ok: true, loved: true });
  assert.equal(city.gift('moss', 'tea').reason, 'gift_today');
  assert.equal(city.data.friends.moss.points, 4);
  assert.equal(city.level('moss'), 1);
  assert.equal(city.freeMeal, false);
  clock.now = at(DAY0 + 1);
  city.talk('moss'); city.gift('moss', 'tea');
  assert.equal(city.level('moss'), 2);
  assert.ok(city.drainNews().some((n) => n.kind === 'friend' && n.resident === 'moss' && n.level === 2));
  // Moss's perk: one free stew a day
  assert.equal(city.freeMeal, true);
  city.data.intro = INTRO_STEPS.map((s) => s.id); // the welcome chain's own reward is out of the way
  const silk = city.data.silk;
  city.data.satiety = 10;
  assert.deepEqual(city.eat('stew'), { ok: true, free: true, satiety: 50 });
  assert.equal(city.data.silk, silk);
  assert.equal(city.freeMeal, false);
  assert.equal(city.gift('moss', 'ink').reason, 'gift_today');
  assert.equal(city.gift('amber', 'ink').loved, false);
});

test('state: the quest board offers three quests a day; a delivery is handed in to its envoy and pays more when fed', () => {
  const offers = questOffers(DAY0);
  assert.equal(offers.length, 3);
  assert.deepEqual(offers, questOffers(DAY0));
  assert.equal(offers[0].type, 'deliver');
  assert.ok(new Set(offers.map((o) => o.type)).size === 3, 'three different kinds');
  assert.ok(!questOffers(DAY0, { priceLive: false }).some((o) => o.type === 'report'), 'no price report while the feed is dark');
  const { city } = newCity();
  const q = city.offers()[0];
  assert.equal(city.accept(q.id).ok, true);
  assert.equal(city.offers().some((o) => o.id === q.id), false, 'a taken quest leaves the board');
  assert.equal(city.accept(q.id).reason, 'no_quest');
  assert.deepEqual(city.handIns(q.to), []);
  assert.equal(city.handIn(q.id, q.to).reason, 'not_ready');
  city.data.silk = 1000; city.data.satiety = 100;
  city.buy(q.good, q.n);
  assert.deepEqual(questProgress(city.data.quests[0], city.data), { have: q.n, need: q.n });
  const silk = city.data.silk;
  assert.equal(city.handIn(q.id, 'nobody').reason, 'not_ready');
  assert.equal(city.handIn(q.id, q.to).ok, true);
  assert.equal(city.data.silk, silk + Math.ceil(q.reward * (1 + SATIETY.fedBonus)));
  assert.equal(city.data.bag[q.good], 0);
  assert.equal(city.data.friends[q.to].points, 2);
  assert.equal(city.data.quests.length, 0);
  assert.equal(city.offers().some((o) => o.id === q.id), false, 'a finished quest is not offered again that day');
});

test('state: greet, sell, meal, season and report quests track their own events; three at a time', () => {
  const { city } = newCity();
  const mk = (type, extra) => ({ id: 'x:' + type, type, reward: 5, day: DAY0, progress: 0, ...extra });
  city.data.quests = [mk('greet', { n: 2 }), mk('sell', { silk: 5 }), mk('meal')];
  assert.equal(city.accept(city.offers()[0].id).reason, 'quests_full');
  city.talk('moss'); city.talk('moss');
  assert.equal(city.data.quests.find((q) => q.type === 'greet').progress, 1, 'the same envoy counts once');
  city.talk('ash');
  assert.ok(!city.data.quests.some((q) => q.type === 'greet'));
  city.eat('stew');
  assert.ok(!city.data.quests.some((q) => q.type === 'meal'));
  city.data.silk = 500; city.buy('amber', 2); city.sell('amber', 2);
  assert.equal(city.data.quests.length, 0);
  city.data.quests = [mk('report', { to: 'frost' }), mk('season')];
  assert.deepEqual(city.handIns('frost', { priceLive: false }), []);
  assert.equal(city.handIn('x:report', 'frost', { priceLive: true }).ok, true);
  assert.equal(city.creditSeason({ seasonId: 'abc', silk: 50, outcome: 'gift' }).purse, 20);
  assert.equal(city.data.quests.length, 0);
  assert.equal(city.creditSeason({ seasonId: 'abc', silk: 50, outcome: 'gift' }).reason, 'already_paid');
  assert.equal(city.drop('nope').reason, 'no_quest');
});

test('state: Salt’s rumour is about a real good; a friend always hears the truth', () => {
  const { city, clock } = newCity();
  let lies = 0;
  for (let d = DAY0; d < DAY0 + 80; d++) {
    clock.now = at(d);
    const r = city.rumour();
    assert.ok(GOODS.some((g) => g.id === r.good));
    const truth = trend(r.good, d) >= 0 ? 'rise' : 'fall';
    if (r.claim !== truth) lies++;
  }
  assert.ok(lies > 10 && lies < 60, 'a stranger hears some lies: ' + lies);
  city.data.friends.salt.points = 8;
  for (let d = DAY0; d < DAY0 + 40; d++) { clock.now = at(d); const r = city.rumour(); assert.equal(r.claim, trend(r.good, d) >= 0 ? 'rise' : 'fall'); assert.equal(r.sure, true); }
});

test('state: saved on the device, restored on the next visit, and a damaged save falls back to a fresh city', () => {
  const { city, storage } = newCity();
  city.talk('ash'); city.buy('tea');
  const again = new CityState({ storage, now: () => at(DAY0) });
  assert.deepEqual(again.data, city.data);
  storage.setItem(CITY_KEY, '{"v":1,"silk":"lots","bag":{"tea":999},"quests":[{"id":3}],"intro":["eat","hack"],"friends":{"moss":{"points":-4}}}');
  const fixed = new CityState({ storage, now: () => at(DAY0) }).data;
  assert.equal(fixed.silk, START_SILK);
  assert.equal(fixed.bag.tea, BAG_SIZE);
  assert.deepEqual(fixed.quests, []);
  assert.deepEqual(fixed.intro, ['eat']);
  assert.equal(fixed.friends.moss.points, 0);
  storage.setItem(CITY_KEY, 'not json');
  assert.deepEqual(new CityState({ storage, now: () => at(DAY0) }).data, freshCity());
  assert.doesNotThrow(() => new CityState({}).buy('bread'), 'works without storage');
});

/* ---------- live prices ---------- */

const DEX_PAIR = (address, symbol, usd, liq, extra = {}) => ({ chainId: 'near', url: 'https://dexscreener.com/near/x', baseToken: { address, symbol }, priceUsd: String(usd), priceChange: { h24: 1.5 }, liquidity: { usd: liq }, volume: { h24: 10 }, ...extra });

test('prices: parsers accept the real payload shapes and refuse anything else', () => {
  assert.deepEqual(parseNearPrice({ near: { usd: 3.61, usd_24h_change: 2.65 } }), { usd: 3.61, change24h: 2.65 });
  for (const bad of [null, {}, { near: {} }, { near: { usd: 'x' } }, { near: { usd: 0 } }, { status: { error_code: 429 } }]) assert.equal(parseNearPrice(bad), null);
  assert.deepEqual(parseNearFromDex([DEX_PAIR('wrap.near', 'wNEAR', 3.6, 500), DEX_PAIR('wrap.near', 'wNEAR', 3.7, 900), DEX_PAIR('other.near', 'X', 9, 99999)]), { usd: 3.7, change24h: 1.5 });
  assert.equal(parseNearFromDex({ pairs: [] }), null);
  const memes = parseMemes([
    DEX_PAIR(MEME_TOKENS[1], 'SHITZU', 0.0014, 100), DEX_PAIR(MEME_TOKENS[1], 'SHITZU', 0.0015, 900),
    DEX_PAIR(MEME_TOKENS[0], 'BLACKDRAGON', '0.000000006418', 50), DEX_PAIR('scam.near', 'SCAM', 1, 1e9),
    DEX_PAIR(MEME_TOKENS[2], 'LONK', 1, 5, { chainId: 'solana' }), DEX_PAIR(MEME_TOKENS[3], 'NEKO', 0, 5),
    DEX_PAIR(MEME_TOKENS[4], 'GEAR', 0.01, 5, { url: 'javascript:alert(1)' }),
  ]);
  assert.deepEqual(memes.map((m) => m.symbol), ['BLACKDRAGON', 'SHITZU', 'GEAR'], 'known tokens only, in our order');
  assert.equal(memes[1].usd, 0.0015, 'the deepest pool wins');
  assert.equal(memes[2].url, null, 'only dexscreener links are kept');
  assert.equal(parseMemes({}), null); assert.equal(parseMemes([]), null);
  const shards = parseShards([
    { token_id: 's-1', owner_id: 'a.testnet', metadata: { title: 'Memory shard #1 · Call · season s', extra: JSON.stringify({ kind: 'call', price: 4, winner_clan: 'salt' }) } },
    { token_id: 's-2', owner_id: 'a.testnet', metadata: { title: 'Memory shard #2', extra: 'not json' } },
    { token_id: 's-3', owner_id: 'b.testnet', metadata: { title: 'Memory shard #3', extra: JSON.stringify({ kind: 'gift', price: 13 }) } },
    { nope: true },
  ]);
  assert.deepEqual(shards.map((s) => [s.tokenId, s.priceSilk]), [['s-3', 13], ['s-1', 4], ['s-2', null]]);
  assert.equal(parseShards(null), null);
});

test('prices: formatting keeps enough digits for a memecoin and marks the direction with a sign', () => {
  assert.equal(formatUsd(3.612), '$3.61');
  assert.equal(formatUsd(123.4), '$123');
  assert.equal(formatUsd(0.01272), '$0.0127');
  assert.equal(formatUsd(0.000000006418), '$0.000000006418');
  assert.equal(formatUsd(NaN), '—');
  assert.equal(formatChange(2.66), '+2.7%'); assert.equal(formatChange(-0.27), '−0.3%'); assert.equal(formatChange(12.4), '+12%'); assert.equal(formatChange(undefined), '');
});

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key] : null;
    if (!r || r === 'fail') throw new Error('network');
    if (r === 429) return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (typeof r === 'function' ? r(init) : r) };
  };
  fn.calls = calls;
  return fn;
}
const rpcTokens = (tokens) => () => ({ result: { result: [...Buffer.from(JSON.stringify(tokens))], block_height: 1 } });
const noTimers = { setIntervalFn: () => 1, clearIntervalFn: () => {} };

test('feed: live only with numbers from the network; one dead source never blanks the others; nothing is invented offline', async () => {
  let now = 1000;
  const fetch = fakeFetch({
    coingecko: { near: { usd: 3.5, usd_24h_change: -1 } },
    'tokens/v1/near/blackdragon': 'fail',
    'rpc': rpcTokens([{ token_id: 't-1', owner_id: 'o.testnet', metadata: { title: 'Memory shard #1 · Call', extra: '{"price":7}' } }]),
  });
  const feed = createPriceFeed({ fetch, now: () => now, deployment: { shardContractId: 'ftf-shards.testnet', rpcUrls: ['https://rpc.example/'] }, ...noTimers });
  assert.deepEqual(Object.values(feed.view()).map((b) => b.status), ['idle', 'idle', 'idle']);
  const seen = [];
  feed.subscribe((v) => seen.push(v.near.status));
  await feed.refresh();
  const v = feed.view();
  assert.equal(v.near.status, 'live'); assert.deepEqual(v.near.data, { usd: 3.5, change24h: -1 });
  assert.equal(v.memes.status, 'offline'); assert.equal(v.memes.data, null);
  assert.equal(v.nfts.status, 'live'); assert.equal(v.nfts.data[0].priceSilk, 7);
  assert.ok(seen.includes('loading') && seen.includes('live'));
  assert.equal(feed.nearLive, true);
  assert.equal(feed.sources.near, 'CoinGecko');
  // public GETs carry no credentials and no referrer
  const get = fetch.calls.find((c) => c.url.includes('coingecko'));
  assert.equal(get.init.credentials, 'omit'); assert.equal(get.init.referrerPolicy, 'no-referrer'); assert.equal(get.init.headers, undefined);
  now += STALE_MS + 1;
  assert.equal(feed.view().near.status, 'stale'); assert.equal(feed.nearLive, false);
});

test('feed: when the first NEAR source refuses, the second one answers and is named; with no network every board is offline', async () => {
  const fetch = fakeFetch({ coingecko: 429, 'near/wrap.near': [DEX_PAIR('wrap.near', 'wNEAR', 3.6, 500)] });
  const feed = createPriceFeed({ fetch, now: () => 5, deployment: { shardContractId: null }, ...noTimers });
  await feed.refresh();
  assert.equal(feed.view().near.data.usd, 3.6);
  assert.match(feed.sources.near, /DexScreener/);
  assert.equal(feed.view().nfts.status, 'offline');
  const dark = createPriceFeed({ fetch: fakeFetch({}), now: () => 5, deployment: { shardContractId: 'x.testnet', rpcUrls: ['https://rpc.example/'] }, ...noTimers });
  await dark.refresh();
  assert.deepEqual(Object.values(dark.view()).map((b) => [b.status, b.data]), [['offline', null], ['offline', null], ['offline', null]]);
  const none = createPriceFeed({ fetch: null, ...noTimers });
  await none.refresh();
  assert.equal(none.view().near.status, 'offline');
});

/* ---------- the way back, locales, build ---------- */

test('cityUrl: the way back from a season lands in the city and drops everything that names a season', () => {
  const u = new URL(cityUrl('https://example.org/forget-to-foresee/?demo=judge&mode=walk&lang=uk&seed=abc&tier=low#play'));
  assert.equal(u.pathname, '/forget-to-foresee/');
  assert.deepEqual(Object.fromEntries(u.searchParams), { lang: 'uk', tier: 'low', play: 'direct', start: 'city' });
  assert.equal(u.hash, '');
});

test('city strings: five locales with the same keys and placeholders, every message parses, none is an English copy', () => {
  const en = CITY_MESSAGES.en, keys = Object.keys(en);
  assert.ok(keys.length > 150);
  // the same text in every language: proper names, symbols and pure number templates
  const SAME = new Set(['city.near', 'city.ex.near', 'city.quests.progress', 'city.res.amber.name']);
  const SAME_IT = new Set(['city.name', 'city.help.title', 'city.res.moss.name', 'city.res.frost.name', 'city.res.salt.name', 'city.res.ash.name', 'city.ex.board.memes']);
  for (const [locale, msgs] of Object.entries(CITY_MESSAGES)) {
    assert.deepEqual(Object.keys(msgs).filter((k) => !(k in en)), [], locale + ' has keys English lacks');
    assert.deepEqual(keys.filter((k) => !Object.prototype.hasOwnProperty.call(msgs, k)), [], locale + ' misses keys');
    for (const k of keys) {
      assert.doesNotThrow(() => parse(msgs[k]), `${locale}:${k} parses`);
      assert.deepEqual([...argNames(msgs[k])].sort(), [...argNames(en[k])].sort(), `${locale}:${k} placeholders`);
      if (locale === 'en' || SAME.has(k) || (locale === 'it' && SAME_IT.has(k))) continue;
      assert.notEqual(msgs[k], en[k], `${locale}:${k} is an English copy`);
      const bare = msgs[k].replace(/<[^>]+>|\{[^}]*\}|NEAR|NFT|testnet|mainnet|Shift/g, '');
      if (locale === 'zh') assert.ok(/[一-鿿]/.test(msgs[k]) || !/[A-Za-z]{3,}/.test(bare), `zh:${k} has no CJK`);
      if (locale === 'ru' || locale === 'uk') assert.ok(/[а-яіїєґ]/i.test(msgs[k]) || !/[A-Za-z]{3,}/.test(bare), `${locale}:${k} has no Cyrillic`);
    }
  }
  assert.ok(!keys.some((k) => /[а-яё]/i.test(en[k])), 'English base has no Cyrillic');
});

test('city strings: rendered through the play i18n in every language with no missing key', () => {
  for (const locale of Object.keys(CITY_MESSAGES)) {
    const i18n = createPlayI18n(locale, { onMissing: (k) => assert.fail(`missing ${locale}:${k}`) });
    assert.ok(i18n.t('city.quest.deliver', { n: 2, good: i18n.t('city.good.ink'), name: i18n.t('city.res.amber.name') }).includes('2'));
    for (const claim of ['rise', 'fall']) assert.ok(i18n.t('city.ask.salt', { good: i18n.t('city.good.tea'), claim }).length > 5);
    assert.notEqual(i18n.t('city.ask.salt', { good: 'x', claim: 'rise' }), i18n.t('city.ask.salt', { good: 'x', claim: 'fall' }));
    for (const s of INTRO_STEPS) assert.ok(i18n.has('city.intro.' + s.id));
    for (const id of RESIDENT_IDS) for (const k of ['name', 'role']) assert.ok(i18n.has(`city.res.${id}.${k}`));
    for (const id of RESIDENT_IDS) for (let n = 0; n < 4; n++) assert.ok(i18n.has(`city.line.${id}.${n}`));
    for (const g of GOODS) assert.ok(i18n.has('city.good.' + g.id));
    for (const m of MEALS) assert.ok(i18n.has('city.meal.' + m.id));
    for (const r of ['no_silk', 'full', 'bag_full', 'no_item', 'gift_today', 'quests_full', 'not_ready']) assert.ok(i18n.has('city.reason.' + r));
  }
});

test('build: the city layout ships with the scenes, its strings with the locales, the layer with the play chunk', () => {
  assert.equal(chunkFor('/x/src/city/layout.js'), 'client-core');
  assert.equal(chunkFor('/x/src/scenes/city.js'), 'client-core');
  assert.equal(chunkFor('/x/src/city/locales/zh.js'), 'locales');
  assert.equal(chunkFor('/x/src/city/city.js'), 'play');
  assert.equal(chunkFor('/x/src/city/state.js'), 'play');
  assert.equal(chunkFor('/x/src/city/city.css'), undefined);
});
