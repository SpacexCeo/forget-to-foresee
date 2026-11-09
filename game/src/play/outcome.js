// "See what changed" (readiness audit 09.11, P2 first guided stake): what a reveal and a forget meant
// for the player, built from consecutive observations. A reveal is split into two facts: the event
// matched the season's commitment (the proof), and the reading you staked was right or wrong slot by
// slot, with what the stake did and which dictionary word moved because of this outcome. A forget gets
// its consequence and who may buy the shard.
//
// Presentation state only: the observation drops a sign's reading and Iris's anchors the moment the
// sign is revealed, so this tracker keeps the last reading, logograms, anchors, dictionary and
// memories it saw and compares them with the next observation. It reads only the per-viewer
// observation (the same one the agent API serves); no rule is evaluated and the engine is untouched.
// No DOM, no three.js: node tests drive it over real local seasons.
//
//   const tracker = createOutcomeTracker();
//   session.on('obs', () => { const { outcomes, forgets } = tracker.observe(session.obs); ... });

const POWER = [10, 20, 40, 80];
const ACTION_INDEX = { gift: 0, storm: 1, silence: 2, call: 3 };

/** The revealed meaning as slot indices [place, action, power, delay] (the dictionary's own encoding). */
export function truthSlots(meaning) {
  return [meaning.place - 1, ACTION_INDEX[meaning.action] ?? 0, Math.max(0, POWER.indexOf(meaning.power)), meaning.delay - 1];
}

/** Which slots of `reading` ({slots: meaning indices, tick}) match the revealed chronicle entry `c`. */
export function slotVerdict(reading, c) {
  if (!reading || !reading.slots) return null;
  const t = truthSlots(c.meaning);
  return [reading.slots[0] === t[0], reading.slots[1] === t[1], reading.slots[2] === t[2], reading.tick === c.tick];
}

/**
 * What the stake did on the trial of chronicle entry `c`, from the anchors Iris held just before it.
 * The rules (rules-baseline §2.4): a stake on another Shell comes back; on the event's Shell a Gift
 * pays a share plus the stake, a Storm burns it, Silence and Call give it back.
 * `staked` is the player's stake on this very sign when it points at another trial.
 */
export function stakeResult(c, anchors, { log = [], staked = null } = {}) {
  const here = (anchors || []).filter((a) => a.tick === c.tick);
  if (!here.length) return staked ? { result: 'other', tick: staked.tick, shell: staked.shell } : { result: 'none' };
  const place = c.meaning.place;
  const hit = here.find((a) => a.shell === place);
  if (!hit) return { result: 'returned', shell: here[0].shell, stake: here[0].stake ?? 10 };
  const stake = hit.stake ?? 10;
  if (c.meaning.action === 'gift') {
    const paid = (log || []).find((e) => e.key === 'log.giftPaid' && e.tick === c.tick);
    return { result: 'paid', shell: hit.shell, stake, amount: paid && paid.args ? paid.args.amount ?? null : null };
  }
  if (c.meaning.action === 'storm') return { result: 'burned', shell: hit.shell, stake };
  return { result: 'calm', shell: hit.shell, stake, action: c.meaning.action };
}

/**
 * The dictionary word this outcome moved the most toward the revealed truth: a cell of the revealed sign's
 * forms whose best guess is the true meaning and whose confidence rose between `before` and `after`
 * (obs.dictionary.cells). Words settled by someone else (Guests, Frost, a shard) are not credited to the
 * outcome. Prefers a slot the reading got wrong, then the form drawn in that slot, then the biggest rise.
 */
export function learnedFrom(c, before, after, { verdict = null, offset = null } = {}) {
  if (!before || !after) return null;
  const truth = truthSlots(c.meaning);
  const prev = new Map(before.map((x) => [x.slot + '_' + x.form, x]));
  const drawn = (slot) => (offset == null ? null : c.forms[(offset + slot) % 4]);
  const cand = [];
  for (const x of after) {
    const b = prev.get(x.slot + '_' + x.form);
    if (!b || x.known != null || !c.forms.includes(x.form)) continue;
    if (x.guess.meaning !== truth[x.slot]) continue;
    // before, the best guess was this meaning, or a four-way tie (25 %, so this meaning had it too): a rise in
    // confidence; otherwise the best guess switched to the truth ("was Shell I")
    const same = b.guess.meaning === x.guess.meaning || b.guess.confidence <= 0.2501;
    const from = same ? b.guess.confidence : null;
    if (same && !(x.guess.confidence > from + 0.001)) continue;
    cand.push({ slot: x.slot, form: x.form, meaning: x.guess.meaning, from, to: x.guess.confidence, was: same ? null : b.guess.meaning, rise: x.guess.confidence - (from ?? 0) });
  }
  if (!cand.length) return null;
  const missed = (s) => (verdict && verdict[s] === false ? 0 : 1);
  const own = (x) => (drawn(x.slot) === x.form ? 0 : 1);
  cand.sort((a, b) => missed(a.slot) - missed(b.slot) || own(a) - own(b) || b.rise - a.rise || a.slot - b.slot || a.form - b.form);
  return { ...cand[0], more: cand.length - 1 };
}

const sessionId = (obs) => (obs.session && typeof obs.session === 'object' ? obs.session.id : obs.session) ?? null;

const snapReading = (p) => ({
  slots: p.reading.slots.map((s) => s.meaning),
  confidence: p.reading.slots.map((s) => s.confidence),
  offset: p.reading.offset,
  tick: p.impliedAnchor ? p.impliedAnchor.tick : p.publishedAt + p.reading.slots[3].meaning + 1,
});

/** The forget follow-up: the memory that left, what it changes now, and who leads the shard's auction. */
export function forgetFollowup(prev, obs) {
  if (!prev || !obs.iris) return null;
  const forgotNow = (obs.iris.forgotten || []).length;
  if (forgotNow !== prev.forgotten + 1) return null;
  const ids = new Set((obs.memories || []).map((m) => m.id));
  const gone = prev.memories.filter((m) => !ids.has(m.id));
  if (gone.length !== 1) return null;
  const m = gone[0];
  const auction = (obs.auctions || []).find((a) => a.from === 'iris' && !prev.auctions.has(a.id));
  const purpose = !prev.ashKnown && obs.iris.ashKey && obs.iris.ashKey.known ? 'key' : 'vision';
  const visions = (obs.prophecies || []).filter((p) => p.vision && !prev.prophecies.has(p.index)).length;
  return {
    memory: { id: m.id, kind: m.kind, about: m.about, weight: m.weight, text: m.text, amount: m.amount, dueTick: m.dueTick, byTick: m.byTick },
    purpose,
    visions,
    auction: auction ? { id: auction.id, title: auction.title, buyer: auction.topBid ? auction.topBid.clan : null, price: auction.topBid ? auction.topBid.amount : null, closesAtTick: auction.closesAtTick } : null,
  };
}

const NOW_KINDS = new Set(['first', 'call', 'gift', 'betrayal', 'debt', 'promise']);
/** Buyer outcomes that exist as strings (forgot.gain.<kind>[.self]); anything else is "changes nothing for them". */
const GAIN_KEYS = new Set(['betrayal.self', 'betrayal', 'debt.self', 'debt', 'promise.self', 'gift', 'call', 'first']);

/**
 * The forget follow-up as play-locale TextRefs (clan names as {$agentId} tags, resolved per locale):
 * "Iris forgot X." / "Now: <consequence>." / what she gained / "The shard goes to auction; if <clan> buys it, <their gain>."
 * The buyer named is the auction's current top bidder (public to the controller); the auction may still change.
 */
export function forgetLines(f) {
  const m = f.memory;
  const who = m.about ? { $agentId: m.about } : '';
  const lines = {
    title: { key: 'forgot.title', args: { title: m.text } },
    now: { key: 'forgot.now.' + (NOW_KINDS.has(m.kind) ? m.kind : 'other'), args: { who } },
    gain: f.purpose === 'key' ? { key: 'forgot.key', args: {} } : { key: 'forgot.vision', args: { n: f.visions } },
    shard: null,
  };
  const buyer = f.auction && f.auction.buyer;
  if (f.auction && !buyer) lines.shard = { key: 'forgot.shard.none', args: {} };
  else if (buyer) {
    const g = m.kind + (buyer === m.about ? '.self' : '');
    const gainKey = GAIN_KEYS.has(g) ? g : 'other';
    lines.shard = { key: 'forgot.shard.buyer', args: { buyer: { $agentId: buyer }, gain: { key: 'forgot.gain.' + gainKey, args: { who } } } };
  }
  return lines;
}

/**
 * @returns {{observe(obs: object): {outcomes: object[], forgets: object[]}, report(index: number): object|null,
 *   reports(): Map<number, object>, latest(): object|null, reset(): void}}
 */
export function createOutcomeTracker() {
  let prev = null;
  let readings = new Map();   // prophecy index → Iris's last reading while the sign was open
  let logograms = new Map();  // logogram id → the reading the player assembled (and maybe staked)
  let reports = new Map();    // chronicle index → outcome report
  let lastReport = null;

  function snapshot(obs) {
    for (const p of obs.prophecies || []) if (p.reading && p.reading.slots && p.reading.slots.length === 4) readings.set(p.index, snapReading(p));
    for (const l of obs.logograms || []) logograms.set(l.id, l);
    return {
      session: sessionId(obs),
      chronicle: new Set((obs.chronicle || []).map((c) => c.index)),
      anchors: ((obs.iris && obs.iris.anchors) || []).map((a) => ({ ...a })),
      cells: obs.dictionary ? obs.dictionary.cells : null,
      memories: (obs.memories || []).slice(),
      forgotten: ((obs.iris && obs.iris.forgotten) || []).length,
      auctions: new Set((obs.auctions || []).map((a) => a.id)),
      prophecies: new Set((obs.prophecies || []).map((p) => p.index)),
      ashKnown: !!(obs.iris && obs.iris.ashKey && obs.iris.ashKey.known),
    };
  }

  /** The reading the player staked on sign `index` (a logogram matched to an anchor held before the reveal). */
  function stakedReading(index, anchors) {
    let best = null;
    for (const l of logograms.values()) {
      if (l.prophecy !== index || !l.impliedAnchor) continue;
      if (!anchors.some((a) => a.shell === l.impliedAnchor.shell && a.tick === l.impliedAnchor.tick)) continue;
      best = l; // later logograms win (Map keeps insertion order)
    }
    return best ? { slots: best.slots.map((s) => s.meaning), offset: best.offset, tick: best.impliedAnchor.tick, shell: best.impliedAnchor.shell } : null;
  }

  function build(c, obs, p) {
    const proof = (obs.proofs || []).find((x) => x.index === c.index);
    const mine = stakedReading(c.index, p.anchors);
    const iris = readings.get(c.index) || null;
    const reading = mine ? { who: 'you', ...mine } : iris ? { who: 'iris', ...iris } : null;
    const verdict = slotVerdict(reading, c);
    const staked = mine && mine.tick !== c.tick ? { tick: mine.tick, shell: mine.shell } : null;
    const offset = reading && reading.offset != null ? reading.offset : null;
    return {
      index: c.index,
      tick: c.tick,
      first: c.index === Math.min(...(obs.chronicle || []).map((x) => x.index)) && (obs.chronicle || []).length === 1, // the season's first reveal
      truth: { ...c.meaning },
      proof: proof ? (proof.verified ? 'ok' : 'fail') : 'pending',
      reading,
      verdict,
      irisRight: c.irisReadSlots ?? null,
      stake: stakeResult(c, p.anchors, { log: obs.log, staked }),
      learned: learnedFrom(c, p.cells, obs.dictionary ? obs.dictionary.cells : null, { verdict, offset }),
    };
  }

  return {
    observe(obs) {
      const out = { outcomes: [], forgets: [] };
      if (!obs || !obs.season) return out;
      if (prev && prev.session !== sessionId(obs)) { prev = null; readings = new Map(); logograms = new Map(); reports = new Map(); lastReport = null; }
      if (prev) {
        const fresh = (obs.chronicle || []).filter((c) => !prev.chronicle.has(c.index));
        for (const c of fresh) {
          const r = build(c, obs, prev);
          reports.set(c.index, r);
          lastReport = r;
          out.outcomes.push(r);
        }
        // the proof can land after the reveal (a slow verifier): keep the stored reports current
        for (const r of reports.values()) {
          if (r.proof !== 'pending') continue;
          const pr = (obs.proofs || []).find((x) => x.index === r.index);
          if (pr) r.proof = pr.verified ? 'ok' : 'fail';
        }
        const f = forgetFollowup(prev, obs);
        if (f) out.forgets.push(f);
      }
      prev = snapshot(obs);
      return out;
    },
    report: (index) => reports.get(index) || null,
    reports: () => reports,
    latest: () => lastReport,
    reset() { prev = null; readings = new Map(); logograms = new Map(); reports = new Map(); lastReport = null; },
  };
}
