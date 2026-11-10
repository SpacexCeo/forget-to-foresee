// Iris's life in the city (pure, node-tested): purse, satiety, bag, friendships and quests, saved on this
// device (`ftf.city.v1`). Every action returns {ok, reason?} and changes nothing when it is refused, like the
// season engine. No season rule lives here and nothing here reaches a season: the tournament starts everyone
// equal (docs/spec.md 4: no pay-to-win). The only bridge is one way: a finished season pays a city purse.
import { GOODS, GOOD_IDS, goodById, MEALS, mealById, BAG_SIZE, SATIETY, RESIDENT_TASTE, buyPrice, sellPrice, trend, cityDay, friendLevel, hash01, tournamentPurse } from './economy.js';

export const CITY_KEY = 'ftf.city.v1';
export const RESIDENT_IDS = Object.freeze(['moss', 'amber', 'frost', 'salt', 'ash']);
export const START_SILK = 30;
export const MAX_ACTIVE_QUESTS = 3;

/** The welcome chain: five things to try, each done by simply using the city, in any order. */
export const INTRO_STEPS = Object.freeze([
  { id: 'talk', reward: 3 },
  { id: 'eat', reward: 3 },
  { id: 'prices', reward: 3 },
  { id: 'buy', reward: 3 },
  { id: 'gate', reward: 5 },
]);

export function freshCity() {
  return {
    v: 1, silk: START_SILK, satiety: 55,
    bag: Object.fromEntries(GOOD_IDS.map((g) => [g, 0])),
    friends: Object.fromEntries(RESIDENT_IDS.map((r) => [r, { points: 0, talkDay: -1, giftDay: -1 }])),
    intro: [],                // ids of the INTRO_STEPS already done (any order)
    quests: [],               // active: {id, type, ...params, progress, day}
    doneQuests: [],           // ids finished or dropped (offers of the same day are not shown again)
    freeMealDay: -1,
    seasons: [],              // season ids already paid
    stats: { meals: 0, bought: 0, sold: 0, talks: 0, quests: 0, seasons: 0 },
  };
}

function sanitize(raw) {
  const base = freshCity();
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return base;
  const num = (v, d, lo = 0, hi = 1e9) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  base.silk = Math.floor(num(raw.silk, base.silk));
  base.satiety = num(raw.satiety, base.satiety, 0, SATIETY.max);
  for (const g of GOOD_IDS) base.bag[g] = Math.floor(num(raw.bag && raw.bag[g], 0, 0, BAG_SIZE));
  for (const r of RESIDENT_IDS) {
    const f = (raw.friends && raw.friends[r]) || {};
    base.friends[r] = { points: Math.floor(num(f.points, 0, 0, 999)), talkDay: num(f.talkDay, -1, -1), giftDay: num(f.giftDay, -1, -1) };
  }
  base.intro = Array.isArray(raw.intro) ? INTRO_STEPS.map((s) => s.id).filter((id) => raw.intro.includes(id)) : [];
  base.quests = Array.isArray(raw.quests) ? raw.quests.filter((q) => q && typeof q.id === 'string' && QUEST_TYPES.includes(q.type)).slice(0, MAX_ACTIVE_QUESTS) : [];
  base.doneQuests = Array.isArray(raw.doneQuests) ? raw.doneQuests.filter((x) => typeof x === 'string').slice(-40) : [];
  base.freeMealDay = num(raw.freeMealDay, -1, -1);
  base.seasons = Array.isArray(raw.seasons) ? raw.seasons.filter((x) => typeof x === 'string').slice(-50) : [];
  for (const k of Object.keys(base.stats)) base.stats[k] = Math.floor(num(raw.stats && raw.stats[k], 0));
  return base;
}

export const QUEST_TYPES = Object.freeze(['deliver', 'greet', 'meal', 'sell', 'report', 'season']);

/**
 * The three offers on the quest board for a day (deterministic: the same board on every device).
 * `report` (tell Frost the live NEAR price) is offered only while the price feed is live.
 */
export function questOffers(day, { priceLive = true } = {}) {
  const pick = (salt, n) => Math.floor(hash01('q:' + day + ':' + salt) * n);
  const good = GOODS[pick('good', GOODS.length)];
  const to = RESIDENT_IDS[pick('to', RESIDENT_IDS.length)];
  const n = good.base >= 20 ? 1 : 1 + pick('n', 2);
  const pool = [
    { type: 'greet', n: 3, reward: 6 },
    { type: 'meal', reward: 6 },
    { type: 'sell', silk: 12 + pick('silk', 3) * 4, reward: 8 },
    { type: 'season', reward: 20 },
  ];
  if (priceLive) pool.push({ type: 'report', to: 'frost', reward: 7 });
  const first = pick('a', pool.length);
  let second = pick('b', pool.length - 1);
  if (second >= first) second++;
  const offers = [
    { type: 'deliver', good: good.id, n, to, reward: Math.round(good.base * n * 1.6) + 4 },
    pool[first], pool[second],
  ];
  return offers.map((o, i) => ({ ...o, id: day + ':' + i, day, progress: 0 }));
}

/** How far a quest is: {have, need}. */
export function questProgress(q, city) {
  switch (q.type) {
    case 'deliver': return { have: Math.min(q.n, city.bag[q.good] || 0), need: q.n };
    case 'greet': return { have: Math.min(q.n, q.progress || 0), need: q.n };
    case 'sell': return { have: Math.min(q.silk, q.progress || 0), need: q.silk };
    default: return { have: Math.min(1, q.progress || 0), need: 1 };
  }
}

export class CityState {
  /** @param {{storage?: {getJSON: Function, setJSON: Function}, now?: () => number}} o */
  constructor({ storage = null, now = () => Date.now() } = {}) {
    this.storage = storage; this.now = now;
    this.data = sanitize(storage ? storage.getJSON(CITY_KEY, null) : null);
    this.listeners = new Set();
    /** Rewards and news since the last drain, for the HUD's toasts: {kind, ...}. */
    this.news = [];
  }

  get day() { return cityDay(this.now()); }
  get bagCount() { return GOOD_IDS.reduce((s, g) => s + this.data.bag[g], 0); }
  get fed() { return this.data.satiety >= SATIETY.fed; }
  get hungry() { return this.data.satiety < SATIETY.hungry; }
  level(resident) { return friendLevel(this.data.friends[resident] ? this.data.friends[resident].points : 0); }
  hasPerk(resident) { return this.level(resident) >= 2; }
  get discount() { return this.hasPerk('amber') ? 0.1 : 0; }
  /** The next thing the welcome chain suggests (the first step not done yet); null when all are done. */
  get introStep() { return INTRO_STEPS.find((s) => !this.data.intro.includes(s.id)) || null; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /** Writes to this device without re-rendering anything (the satiety trickle). */
  save() { if (this.storage) this.storage.setJSON(CITY_KEY, this.data); }
  commit() {
    this.save();
    for (const fn of [...this.listeners]) fn(this);
  }
  drainNews() { const n = this.news; this.news = []; return n; }

  /** Time passing in the city (seconds): Iris gets hungry. Saved at most every few seconds by the caller. */
  tick(dtSeconds) {
    const before = this.data.satiety;
    this.data.satiety = Math.max(0, before - (SATIETY.perMinute * dtSeconds) / 60);
    if (before >= SATIETY.hungry && this.data.satiety < SATIETY.hungry) { this.news.push({ kind: 'hungry' }); this.commit(); }
  }

  pay(reward, kind, extra = {}) {
    const silk = this.fed ? Math.ceil(reward * (1 + SATIETY.fedBonus)) : reward;
    this.data.silk += silk;
    this.news.push({ kind, silk, bonus: silk - reward, ...extra });
    return silk;
  }

  befriend(resident, points) {
    const f = this.data.friends[resident];
    if (!f || points <= 0) return;
    const before = friendLevel(f.points);
    f.points += points;
    const after = friendLevel(f.points);
    if (after > before) this.news.push({ kind: 'friend', resident, level: after });
  }

  /** Something happened: the welcome chain and the active quests take note. */
  note(event, detail = {}) {
    const step = INTRO_STEPS.find((s) => s.id === event);
    if (step && !this.data.intro.includes(step.id)) { this.data.intro = [...this.data.intro, step.id]; this.pay(step.reward, 'intro', { step: step.id, finished: this.data.intro.length >= INTRO_STEPS.length }); }
    for (const q of [...this.data.quests]) {
      let hit = false;
      if (q.type === 'greet' && event === 'talk' && !(q.met || []).includes(detail.resident)) { q.met = [...(q.met || []), detail.resident]; q.progress = q.met.length; hit = true; }
      if (q.type === 'meal' && event === 'eat') { q.progress = 1; hit = true; }
      if (q.type === 'sell' && event === 'sell') { q.progress = (q.progress || 0) + (detail.silk || 0); hit = true; }
      if (q.type === 'season' && event === 'season') { q.progress = 1; hit = true; }
      if (!hit) continue;
      const p = questProgress(q, this.data);
      if (p.have >= p.need) this.finishQuest(q);
    }
  }

  finishQuest(q) {
    this.data.quests = this.data.quests.filter((x) => x.id !== q.id);
    this.data.doneQuests = [...this.data.doneQuests, q.id].slice(-40);
    this.data.stats.quests++;
    this.pay(q.reward, 'quest', { quest: q });
    if (q.to) this.befriend(q.to, 2);
  }

  /* ---------- tavern ---------- */

  /** Moss treats a friend to one stew a day. */
  get freeMeal() { return this.hasPerk('moss') && this.data.freeMealDay !== this.day; }

  eat(mealId) {
    const m = mealById(mealId);
    if (!m) return { ok: false, reason: 'unknown_meal' };
    const free = m.id === 'stew' && this.freeMeal;
    if (!free && this.data.silk < m.price) return { ok: false, reason: 'no_silk' };
    if (this.data.satiety >= SATIETY.max - 1) return { ok: false, reason: 'full' };
    if (free) this.data.freeMealDay = this.day; else this.data.silk -= m.price;
    this.data.satiety = Math.min(SATIETY.max, this.data.satiety + m.food);
    this.data.stats.meals++;
    this.note('eat');
    this.commit();
    return { ok: true, free, satiety: this.data.satiety };
  }

  /** Bread and tea can be eaten from the bag. */
  snack(goodId) {
    const g = goodById(goodId);
    if (!g || !g.food) return { ok: false, reason: 'not_food' };
    if (this.data.bag[goodId] < 1) return { ok: false, reason: 'no_item' };
    if (this.data.satiety >= SATIETY.max - 1) return { ok: false, reason: 'full' };
    this.data.bag[goodId]--;
    this.data.satiety = Math.min(SATIETY.max, this.data.satiety + g.food);
    this.commit();
    return { ok: true, satiety: this.data.satiety };
  }

  /* ---------- market ---------- */

  buy(goodId, n = 1) {
    const price = buyPrice(goodId, this.day, this.discount);
    if (price == null || !(n >= 1)) return { ok: false, reason: 'unknown_good' };
    if (this.bagCount + n > BAG_SIZE) return { ok: false, reason: 'bag_full' };
    if (this.data.silk < price * n) return { ok: false, reason: 'no_silk' };
    this.data.silk -= price * n;
    this.data.bag[goodId] += n;
    this.data.stats.bought += n;
    this.note('buy', { good: goodId, n });
    this.commit();
    return { ok: true, paid: price * n };
  }

  sell(goodId, n = 1) {
    const price = sellPrice(goodId, this.day);
    if (price == null || !(n >= 1)) return { ok: false, reason: 'unknown_good' };
    if (this.data.bag[goodId] < n) return { ok: false, reason: 'no_item' };
    this.data.bag[goodId] -= n;
    this.data.silk += price * n;
    this.data.stats.sold += n;
    this.note('sell', { good: goodId, silk: price * n });
    this.commit();
    return { ok: true, got: price * n };
  }

  /* ---------- residents ---------- */

  /** A chat: the first one with each envoy every day warms the friendship. */
  talk(resident) {
    const f = this.data.friends[resident];
    if (!f) return { ok: false, reason: 'unknown_resident' };
    const first = f.talkDay !== this.day;
    if (first) { f.talkDay = this.day; this.befriend(resident, 1); }
    this.data.stats.talks++;
    this.note('talk', { resident });
    this.commit();
    return { ok: true, first, line: Math.floor(hash01(resident + ':' + this.day + ':' + this.data.stats.talks) * 4) };
  }

  /** One gift per envoy per day: +1, or +3 for the thing they love. */
  gift(resident, goodId) {
    const f = this.data.friends[resident];
    if (!f) return { ok: false, reason: 'unknown_resident' };
    if (!goodById(goodId) || this.data.bag[goodId] < 1) return { ok: false, reason: 'no_item' };
    if (f.giftDay === this.day) return { ok: false, reason: 'gift_today' };
    const loved = RESIDENT_TASTE[resident].loves === goodId;
    this.data.bag[goodId]--;
    f.giftDay = this.day;
    this.befriend(resident, loved ? 3 : 1);
    this.commit();
    return { ok: true, loved };
  }

  /**
   * Salt's market rumour for today: a good and whether it "rises" or "falls" tomorrow. She is right about
   * six times in ten; a friend always hears the truth.
   */
  rumour() {
    const day = this.day;
    const movers = GOODS.filter((g) => trend(g.id, day) !== 0);
    const g = (movers.length ? movers : GOODS)[Math.floor(hash01('rumour:' + day) * (movers.length || GOODS.length))];
    const truth = trend(g.id, day) >= 0 ? 'rise' : 'fall';
    const honest = this.hasPerk('salt') || hash01('honest:' + day) < 0.6;
    return { good: g.id, claim: honest ? truth : truth === 'rise' ? 'fall' : 'rise', sure: this.hasPerk('salt') };
  }

  /* ---------- quests ---------- */

  offers(opts) { return questOffers(this.day, opts).filter((o) => !this.data.doneQuests.includes(o.id) && !this.data.quests.some((q) => q.id === o.id)); }

  accept(questId, opts) {
    const o = this.offers(opts).find((x) => x.id === questId);
    if (!o) return { ok: false, reason: 'no_quest' };
    if (this.data.quests.length >= MAX_ACTIVE_QUESTS) return { ok: false, reason: 'quests_full' };
    this.data.quests.push(o);
    this.commit();
    return { ok: true, quest: o };
  }

  drop(questId) {
    if (!this.data.quests.some((q) => q.id === questId)) return { ok: false, reason: 'no_quest' };
    this.data.quests = this.data.quests.filter((q) => q.id !== questId);
    this.data.doneQuests = [...this.data.doneQuests, questId].slice(-40);
    this.commit();
    return { ok: true };
  }

  /** Quests this envoy can close right now: deliveries with the goods in the bag, and the price report. */
  handIns(resident, { priceLive = false } = {}) {
    return this.data.quests.filter((q) => q.to === resident && ((q.type === 'deliver' && this.data.bag[q.good] >= q.n) || (q.type === 'report' && priceLive)));
  }

  handIn(questId, resident, opts) {
    const q = this.handIns(resident, opts).find((x) => x.id === questId);
    if (!q) return { ok: false, reason: 'not_ready' };
    if (q.type === 'deliver') this.data.bag[q.good] -= q.n;
    this.finishQuest(q);
    this.commit();
    return { ok: true, quest: q };
  }

  /* ---------- the tournament ---------- */

  /** A finished season pays its purse once per season id. */
  creditSeason({ seasonId, silk, outcome }) {
    if (!seasonId || this.data.seasons.includes(seasonId)) return { ok: false, reason: 'already_paid' };
    this.data.seasons = [...this.data.seasons, seasonId].slice(-50);
    this.data.stats.seasons++;
    const purse = tournamentPurse({ silk, outcome }, this.hasPerk('ash') ? 0.1 : 0);
    this.data.silk += purse;
    this.note('season');
    this.commit();
    return { ok: true, purse };
  }
}

export { MEALS };
