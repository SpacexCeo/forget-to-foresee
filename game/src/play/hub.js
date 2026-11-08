// The Shell hub (owner decision 08.11, "Shell-first"): the island is a hub, the play happens inside
// the Shells. The human has three verbs: fly into a Shell, read the sign the Guest draws (Iris
// pre-fills her reading, the human may change any slot) and stake 10 silk on that reading. Leaving
// a Shell ends the trial; trials with no new sign and no decision advance on their own. Iris's
// routine runs as a small, public autopilot that stops for one-click decisions (an offer, the
// fragment, the Key, the vote).
//
// Everything here is an ordinary room command sent through the PlaySession's command bus: the same
// API an agent uses over HTTP, with the same proximity rules. Where a rule needs Iris at a place
// (the anchor zone for a stake, a camp for an offer, the Scroll for the fragment and the vote), the
// hub walks the room avatar there first (`move`, simulated time only) instead of making the player
// walk, and returns it afterwards. No rule is evaluated here and the engine is untouched.
// No three.js and no DOM: node tests drive it end to end.

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Real milliseconds between two automatic trials, so each reveal can be seen. */
export const AUTO_PAUSE_MS = 1400;
/** Safety bound on automatic trials in one advance (a season has 17). */
const MAX_AUTO = 17;
/** Ticks on which the hub asks about Iris's fragment (the honest-cooperator tick and the last chance). */
const FRAGMENT_ASK = (obs) => [6, obs.season.contributionDeadline];

/** The Shell a visible sign is about, as Iris reads it (her implied anchor), or null. */
export function signShell(p) {
  return p && p.impliedAnchor ? p.impliedAnchor.shell : null;
}

/** Visible signs grouped by the Shell Iris reads them for: Map<shell, prophecy[]>, newest first. */
export function signsByShell(obs) {
  const m = new Map([[1, []], [2, []], [3, []], [4, []]]);
  for (const p of (obs && obs.prophecies) || []) {
    const s = signShell(p);
    if (s) m.get(s).push(p);
  }
  for (const list of m.values()) list.sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt) || (b.index - a.index));
  return m;
}

/** The sign the Guest of Shell `n` draws: one Iris reads for this Shell, else the newest visible sign. */
export function signForShell(obs, n) {
  const own = signsByShell(obs).get(n) || [];
  if (own.length) return own[0];
  const all = ((obs && obs.prophecies) || []).slice().sort((a, b) => (b.vision - a.vision) || (b.publishedAt - a.publishedAt));
  return all[0] || null;
}

/** The trial a reading points at: publication tick + delay + 1 (the room's assemble_logogram rule). */
export function impliedTick(p, slots) {
  return p.publishedAt + slots[3] + 1;
}

/**
 * The next one-click decision the autopilot must not take alone, or null.
 * `asked` remembers decisions already shown (`fragment@6`, `key`, …) so a "not now" sticks.
 */
export function interruptFor(obs, asked = new Set()) {
  if (!obs) return null;
  const s = obs.season;
  if (s.phase === 'end') return s.heir == null && !asked.has('heir') ? { id: 'heir', kind: 'heir' } : null;
  if (s.phase === 'vote') return { id: 'vote', kind: 'vote' };
  if (s.phase !== 'play') return null;
  for (const o of obs.offers || []) {
    if (o.kind === 'gift' || o.kind === 'sell') continue; // gifts: the autopilot takes them; word sales: it lets them pass (expiry costs nothing)
    const id = 'offer:' + o.id;
    if (!asked.has(id)) return { id, kind: 'offer', offer: o };
  }
  const iris = obs.iris;
  const ash = obs.relationships && (obs.relationships.clans || []).find((c) => c.clan === 'ash');
  if (iris.ashKey && iris.ashKey.known && ash && ash.isolated && !asked.has('speak')) {
    return { id: 'speak', kind: 'speak' };
  }
  if (iris.keyVision && iris.keyVision.open && !asked.has('key')) return { id: 'key', kind: 'key', keyVision: iris.keyVision };
  const f = iris.fragment;
  if (f && f.status === 'held' && s.tick <= s.contributionDeadline) {
    for (const t of FRAGMENT_ASK(obs)) {
      const id = 'fragment@' + t;
      if (s.tick >= t && !asked.has(id) && (t === s.contributionDeadline ? s.tick === t : true)) return { id, kind: 'fragment', fragment: f };
    }
  }
  return null;
}

/**
 * What the autopilot does on its own, as [{type, args, place, reason}]: it accepts free gifts.
 * Word sales are left to expire (no command, no trust cost); the play UI lists them as a notice and
 * the player can still buy at the camp. Everything else is a decision card (interruptFor).
 */
export function autopilotMoves(obs) {
  if (!obs || obs.season.phase !== 'play') return [];
  return (obs.offers || []).filter((o) => o.kind === 'gift').map((o) => ({ type: 'accept_offer', args: { offerId: o.id }, place: 'camp:' + o.from, reason: { key: 'hub.auto.gift', args: { who: { $agentId: o.from } } } }));
}

export class ShellHub {
  /**
   * @param {{session: import('./session.js').PlaySession, sleep?: (ms:number)=>Promise<void>, pauseMs?: number}} o
   */
  constructor({ session, sleep = defaultSleep, pauseMs = AUTO_PAUSE_MS }) {
    this.session = session;
    this.sleep = sleep;
    this.pauseMs = pauseMs;
    this.busy = null;        // name of the running operation, or null
    this.advancing = false;
    this.transit = null;     // a flight (or another screen transition) the player started; input waits for it (QA-002)
    this.card = null;        // the interrupt waiting for the player
    this.asked = new Set();
    this.seen = new Set((session.obs && session.obs.prophecies || []).map((p) => p.index));
    this.draft = null;       // {prophecy, slots[4]} for the reading inside a Shell
    this.lastStake = null;   // {ok, reason, shell, tick}
    this.notice = null;      // {key, args} one-line status for the UI
    this.listeners = new Map();
    this.stopRequested = false;
    session.on('obs', () => this.syncDraft());
  }

  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type).delete(fn); }
  emit(type, data) { for (const fn of [...(this.listeners.get(type) || [])]) { try { fn(data); } catch (e) { console.warn('[hub] listener failed', type, e); } } }
  changed() { this.emit('change', this); }

  get obs() { return this.session.obs; }
  get inShell() { return !!(this.obs && this.obs.you.zone === 'shell'); }
  get shell() { return this.obs ? this.obs.you.shell : null; }

  /** The sign shown in the current Shell and the reading draft that goes with it. */
  currentSign() { return this.inShell ? signForShell(this.obs, this.shell) : null; }

  syncDraft() {
    const p = this.currentSign();
    if (!p) { this.draft = null; return; }
    if (!this.draft || this.draft.prophecy !== p.index) {
      const slots = p.reading ? p.reading.slots.map((s) => s.meaning) : [this.shell - 1, 0, 0, 0];
      this.draft = { prophecy: p.index, slots, edited: [false, false, false, false] };
    }
  }

  /** The human changes one slot of the reading (k = 0 place, 1 action, 2 power, 3 delay). */
  cycleSlot(k, dir = 1) {
    this.syncDraft();
    if (!this.draft) return;
    this.draft.slots[k] = (this.draft.slots[k] + (dir < 0 ? 3 : 1)) % 4;
    this.draft.edited[k] = true;
    this.changed();
  }

  /** Resets the draft to Iris's own reading. */
  resetDraft() { this.draft = null; this.syncDraft(); this.changed(); }

  /** The (Shell, trial) the current draft points at. */
  target() {
    const p = this.currentSign();
    if (!p || !this.draft) return null;
    return { shell: this.draft.slots[0] + 1, tick: impliedTick(p, this.draft.slots) };
  }

  /** Claims the hub for a transition (the flight's fade) before any await, so input during it is refused. */
  beginTransit(name) {
    if (this.busy || this.advancing || this.transit) return false;
    this.transit = name; this.changed();
    return true;
  }

  endTransit() { this.transit = null; this.changed(); }

  async run(name, fn) {
    // player operations wait for a running one, for automatic trials and for a transition they are not part of
    if (this.busy || (this.advancing && name !== 'resolve') || (this.transit && this.transit !== name)) return { ok: false, reason: 'busy' };
    this.busy = name; this.changed();
    try { return await fn(); }
    finally { this.busy = null; this.changed(); }
  }

  /**
   * Runs one command where the rules need Iris to stand. Inside a Shell the room avatar steps out,
   * walks to the place, acts, walks back to the Shell's anchor zone and re-enters; on the island it
   * walks there and stays (the client then moves the visible avatar there: event `relocate`).
   */
  async runAt(place, type, args = {}) {
    const bus = this.session.bus;
    const from = this.inShell ? this.shell : null;
    const steps = [];
    const step = async (t, a) => { const r = await bus.send(t, a, { silent: true }); steps.push(r); return r; };
    if (from) { const r = await step('exit_shell', {}); if (!r.ok) return r; }
    if (place) { const r = await step('move', { to: place }); if (!r.ok) { if (from) await this.reenter(from); return r; } }
    const out = await bus.send(type, args);
    if (from) await this.reenter(from);
    await this.session.refresh();
    if (!from && place && out.ok) this.emit('relocate', { position: this.obs.you.position.slice(), place });
    return out;
  }

  async reenter(shell) {
    const bus = this.session.bus;
    await bus.send('move', { to: 'anchor_zone:' + shell }, { silent: true });
    return bus.send('enter_shell', { shell }, { silent: true });
  }

  /** Fly from the island into Shell n (the room walks to its anchor zone, then enters). */
  flyTo(n) {
    return this.run('fly', async () => {
      if (this.inShell) {
        if (this.shell === n) return { ok: true };
        const r = await this.session.send('exit_shell', {}, { silent: true });
        if (!r.ok) return r;
      }
      const mv = await this.session.bus.send('move', { to: 'anchor_zone:' + n }, { silent: true });
      if (!mv.ok) return mv;
      const r = await this.session.send('enter_shell', { shell: n });
      this.syncDraft();
      return r;
    });
  }

  /** Stake 10 silk on the current reading: assemble the logogram, then anchor at its Shell and trial. */
  stake() {
    return this.run('stake', async () => {
      this.syncDraft();
      const d = this.draft;
      if (!d) return { ok: false, reason: 'no_sign' };
      const pre = this.target();
      if (pre && this.obs.iris.anchors.some((x) => x.shell === pre.shell && x.tick === pre.tick)) { this.lastStake = { ok: false, reason: 'duplicate', ...pre }; return { ok: false, reason: 'duplicate' }; }
      const a = await this.session.bus.send('assemble_logogram', { prophecy: d.prophecy, slots: d.slots.slice() });
      if (!a.ok) { this.lastStake = { ok: false, reason: a.reason }; return a; }
      const draft = a.body.result;
      const { shell, tick } = draft.impliedAnchor;
      if (!draft.anchorable) { this.lastStake = { ok: false, reason: 'tick_passed', shell, tick }; await this.session.refresh(); return { ok: false, reason: 'tick_passed' }; }
      const r = await this.runAt('anchor_zone:' + shell, 'place_anchor', { logogram: draft.id });
      if (r.ok) this.session.flags.anchored = true;
      this.lastStake = { ok: r.ok, reason: r.reason, shell, tick };
      return r;
    });
  }

  /** Leave the Shell: the trial ends and the next ones run until a new sign or a decision. */
  async leave() {
    const r = await this.run('leave', () => this.session.send('exit_shell', {}));
    if (r.ok) await this.advance();
    return r;
  }

  /** Stops an automatic advance after the current trial. */
  stop() { this.stopRequested = true; }

  /**
   * Ends the current trial, then keeps ending trials while nothing needs the player: no new sign,
   * no decision card, the season still in play. Returns {ticks, reason}.
   */
  async advance({ max = MAX_AUTO } = {}) {
    if (this.advancing || this.busy || this.transit) return { ticks: 0, reason: 'busy' };
    this.advancing = true; this.stopRequested = false; this.card = null; this.changed();
    let ticks = 0, reason = 'max';
    try {
      for (let i = 0; i < max; i++) {
        await this.autopilot();
        const card = interruptFor(this.obs, this.asked);
        if (card && i > 0) { this.card = card; reason = 'decision'; break; }
        if (this.obs.season.phase !== 'play') { this.card = interruptFor(this.obs, this.asked); reason = this.obs.season.phase; break; }
        const before = new Set(this.obs.prophecies.map((p) => p.index));
        const r = await this.session.send('end_tick', {});
        if (!r.ok) { reason = r.reason || 'rejected'; break; }
        ticks++;
        this.notice = { key: 'hub.notice.trial', args: { tick: this.obs.season.tick } };
        this.changed();
        const fresh = this.obs.prophecies.filter((p) => !before.has(p.index) && !this.seen.has(p.index));
        for (const p of this.obs.prophecies) this.seen.add(p.index);
        await this.autopilot();
        const next = interruptFor(this.obs, this.asked);
        if (next) { this.card = next; reason = 'decision'; break; }
        if (this.obs.season.phase !== 'play') { reason = this.obs.season.phase; break; }
        if (fresh.length) {
          const p = fresh.sort((a, b) => b.publishedAt - a.publishedAt)[0];
          this.notice = { key: 'hub.notice.newSign', args: { shell: roman(signShell(p)) } };
          reason = 'sign';
          break;
        }
        if (this.stopRequested) { reason = 'stopped'; break; }
        await this.sleep(this.pauseMs);
      }
    } finally {
      this.advancing = false;
      this.changed();
    }
    this.emit('advanced', { ticks, reason });
    return { ticks, reason };
  }

  /** Iris's routine: accepts free gifts (each logged as Iris's own line). */
  async autopilot() {
    for (const m of autopilotMoves(this.obs)) {
      const r = await this.runAt(m.place, m.type, m.args);
      if (r.ok) this.emit('auto', m.reason);
    }
  }

  /** The player's answer to the current card. Returns the command result (or {ok:true}). */
  resolve(choice) {
    const c = this.card;
    if (!c) return Promise.resolve({ ok: false, reason: 'no_card' });
    return this.run('resolve', async () => {
      let r = { ok: true };
      switch (c.kind) {
        case 'offer':
          if (choice === 'accept') r = await this.runAt('camp:' + c.offer.from, 'accept_offer', { offerId: c.offer.id });
          else if (choice === 'decline') r = await this.session.send('decline_offer', { offerId: c.offer.id });
          break;
        case 'fragment':
          if (choice === 'give') r = await this.runAt('scroll', 'contribute_fragment', {});
          else this.session.holdFragment();
          break;
        case 'speak':
          if (choice === 'speak') r = await this.runAt('camp:ash', 'speak_key', {});
          break;
        case 'key': break; // the Memories panel carries the choice (forgetting is never delegated)
        case 'vote':
          r = await this.runAt('scroll', 'cast_vote', { accept: choice === 'accept' });
          break;
        case 'heir':
          r = await this.session.send('set_heir', { heir: choice === 'heir' });
          break;
        default: break;
      }
      if (r.ok || choice === 'later') this.asked.add(c.id);
      if (r.ok || choice === 'later') this.card = interruptFor(this.obs, this.asked);
      return r;
    });
  }

  /** Dismisses the card without answering (the autopilot will not ask again for it). */
  dismiss() { if (this.card) { this.asked.add(this.card.id); this.card = null; this.changed(); } }
}

function roman(n) { return ['I', 'II', 'III', 'IV'][(n || 1) - 1]; }
