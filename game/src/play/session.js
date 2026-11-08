// PlaySession: the browser-side game loop glue between the 3D client and the authoritative room.
// It owns the transport and the command bus, keeps the latest observation and action list, turns
// the player's position into a hotspot with context options, replays walks to the room before an
// action needs proximity, tracks the onboarding flags and computes the single current goal.
// No three.js and no DOM here (node tests drive it end to end); no rule is evaluated here.
import { CommandBus } from './commands.js';
import { Trail } from './trail.js';
import { hotspotAt, contextOptions, defaultOption, placeForSpot } from './interactions.js';
import { currentGoal } from './objectives.js';

const SYNC_EPS = 0.6; // meters: closer than this the room avatar counts as "here"

export class PlaySession {
  /**
   * @param {{transport: object, sleep?: (ms:number)=>Promise<void>, skipOnboarding?: boolean}} o
   */
  constructor({ transport, sleep, skipOnboarding = false }) {
    this.transport = transport;
    this.bus = new CommandBus(transport, { sleep });
    this.obs = null;
    this.actions = [];
    this.flags = { reachedScroll: false, heldFragment: false, talked: false, asked: false, anchored: false, skipOnboarding, hub: false };
    this.client = { zone: 'island', pos: null, shellSpots: null };
    this.trail = null;
    this.spot = null;
    this.options = [];
    this.optionKeys = new Map(); // option id + version → idempotency key
    this.goal = null;
    this.listeners = new Map();
    this.syncing = false;
    this.lastSync = { ok: true, mode: null, reason: null };
    this.unsub = transport.subscribe((ev) => this.emit('event', ev));
    this.bus.onResult((r) => this.emit('result', r));
  }

  on(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); return () => this.listeners.get(type).delete(fn); }
  emit(type, data) { for (const fn of [...(this.listeners.get(type) || [])]) { try { fn(data); } catch (e) { console.warn('[play] listener failed', type, e); } } }

  /** Commits the owner key and loads the first observation. */
  async start({ phrase = '' } = {}) {
    await this.refresh();
    if (this.obs.season.phase === 'intro') {
      const r = await this.bus.send('start_season', phrase ? { phrase } : {});
      if (!r.ok) throw new Error('start_season failed: ' + r.reason);
    }
    await this.refresh();
    this.trail = new Trail(this.obs.you.position);
    return this.obs;
  }

  /** Re-reads the observation and the full action list (availability with failing reasons). */
  async refresh() {
    const o = await this.transport.observe();
    if (o.status !== 200) throw new Error('observe failed: ' + JSON.stringify(o.body));
    this.obs = o.body.observation;
    this.bus.version = this.obs.version;
    const a = await this.transport.actions();
    this.actions = a.status === 200 ? a.body.actions : [];
    this.recompute();
    this.emit('obs', this.obs);
    return this.obs;
  }

  /**
   * Per-frame input from the 3D client: where the player is (client coordinates; on the island they
   * equal room coordinates). `shellSpots` = {glass: [x, z], radius} of the interior being rendered.
   */
  setClient({ zone, pos, shellSpots = null }) {
    this.client = { zone, pos, shellSpots };
    if (this.trail && zone === 'island') this.trail.record(pos);
    const spot = pos ? hotspotAt({ zone, pos, shellSpots }) : null;
    if (spot && spot.kind === 'scroll' && !this.flags.reachedScroll) { this.flags.reachedScroll = true; this.recompute(); this.emit('goal', this.goal); }
    if (!sameSpot(spot, this.spot)) { this.spot = spot; this.recompute(); this.emit('spot', spot); }
  }

  recompute() {
    if (!this.obs) return;
    const opts = contextOptions(this.spot, this.obs, this.actions);
    for (const o of opts) {
      const k = o.id + '@' + this.obs.version;
      if (!this.optionKeys.has(k)) this.optionKeys.set(k, this.bus.key(o.cmd ? o.cmd.type : o.id));
      o.key = this.optionKeys.get(k);
    }
    if (this.optionKeys.size > 400) this.optionKeys.clear();
    this.options = opts;
    this.defaultIndex = defaultOption(opts);
    const g = currentGoal(this.obs, this.flags);
    const changed = !this.goal || !g || g.id !== this.goal.id || JSON.stringify(g.args) !== JSON.stringify(this.goal.args);
    this.goal = g;
    if (changed) this.emit('goal', g);
  }

  /**
   * Makes the room avatar stand where the client avatar stands, before a proximity-bound action.
   * Island: replays the walked trail (`move {path}`), falling back to the room's own route to the
   * hotspot's named place. Inside a Shell: the interior the client renders and the room's interior
   * differ in size, so positions map to the room's named places (glass / entrance).
   */
  async syncPosition({ force = false } = {}) {
    if (!this.obs || !this.client.pos || this.syncing) return this.lastSync;
    this.syncing = true;
    try {
      await this.bus.idle();
      await this.refresh();
      const you = this.obs.you;
      if (this.client.zone === 'shell' || you.zone === 'shell') {
        if (you.zone !== 'shell') return (this.lastSync = { ok: false, mode: 'zone', reason: 'wrong_zone' });
        const place = this.spot && this.spot.kind === 'glass' ? 'guest_glass' : 'shell_entrance';
        const target = place === 'guest_glass' ? [0, 0, -4.5] : [0, 0, 4.5];
        if (Math.hypot(you.position[0] - target[0], you.position[2] - target[2]) < 1) return (this.lastSync = { ok: true, mode: 'none' });
        const r = await this.bus.send('move', { to: place }, { silent: true });
        await this.refresh();
        return (this.lastSync = { ok: r.ok, mode: 'place', reason: r.reason });
      }
      const pos = this.client.pos;
      const d = Math.hypot(you.position[0] - pos[0], you.position[2] - pos[2]);
      if (d < SYNC_EPS && !force) { this.trail.reset(pos); return (this.lastSync = { ok: true, mode: 'none' }); }
      const path = this.trail.waypoints(pos);
      let r = path.length ? await this.bus.send('move', { path }, { silent: true }) : { ok: false, reason: 'empty' };
      let mode = 'trail';
      if (!r.ok) {
        const place = placeForSpot(this.spot);
        if (place) { r = await this.bus.send('move', { to: place }, { silent: true }); mode = 'place'; }
      }
      this.trail.reset(pos);
      await this.refresh();
      return (this.lastSync = { ok: r.ok, mode, reason: r.reason || null });
    } finally { this.syncing = false; }
  }

  /** Runs a context option: walk replay if needed, then the command with the option's key. */
  async run(option) {
    if (!option || !option.cmd) return null;
    const world = ['talk', 'inspect', 'enter_shell', 'exit_shell'].includes(option.cmd.type);
    const needsPlace = world || !['decline_offer', 'end_tick', 'set_reading_rule', 'sacrifice_memory', 'set_heir'].includes(option.cmd.type);
    if (needsPlace) await this.syncPosition();
    return this.send(option.cmd.type, option.cmd.args, { key: option.key });
  }

  /** Sends any command through the bus and refreshes; emits dialogue/inspect payloads. */
  async send(type, args = {}, { key, silent = false } = {}) {
    const r = await this.bus.send(type, args, { key, silent });
    if (r.ok) {
      if (type === 'talk') { this.flags.talked = true; this.emit('dialogue', r.body.result); }
      if (type === 'inspect') this.emit('inspect', r.body.result);
      if (type === 'ask_guests') this.flags.asked = true;
      if (type === 'place_anchor') this.flags.anchored = true;
      if (type === 'exit_shell' || type === 'enter_shell') this.emit('zone', r.body.result);
    }
    await this.refresh();
    return r;
  }

  /** The player chose to hold the fragment for now (onboarding branch; nothing is sent). */
  holdFragment() { this.flags.heldFragment = true; this.recompute(); this.emit('goal', this.goal); }

  dispose() { if (this.unsub) this.unsub(); }
}

function sameSpot(a, b) {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.clan === b.clan && a.shell === b.shell;
}
