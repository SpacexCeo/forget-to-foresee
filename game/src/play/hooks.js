// Presentation hooks: room events → named VFX and audio cues. The VFX module (src/vfx/, `createVfx`,
// docs/vfx.md) and the audio module (src/audio/) are written by other agents; the play layer loads
// them only if present and calls play(name, opts) on game events. Missing modules, missing effect
// names or a throwing effect never break the game: cues are presentation only and never change
// state (spec §2 "camera, skip and FPS never change state").

/** Rare events with their spec durations (spec §6) and frequent ones. */
export const CUE_NAMES = Object.freeze([
  'memory_burn', 'vision', 'crisis', 'double_ring', 'finale', 'shells_leave',
  'anchor_placed', 'fragment_contributed', 'fragment_dark', 'reveal_gift', 'reveal_storm', 'reveal_silence', 'reveal_call',
  'link_break', 'link_mend', 'guest_voice', 'guest_yes', 'guest_no', 'key_spoken', 'offer', 'pact', 'escrow', 'silk_transfer',
  'tick_start', 'shell_enter', 'shell_exit', 'rejected', 'talk', 'auction',
]);

/** Cue → effect name of src/vfx (EFFECT_NAMES) and sound of src/audio (AUDIO_MANIFEST). */
export const VFX_MAP = Object.freeze({
  memory_burn: 'vision', anchor_placed: 'anchor_plant', reveal_storm: 'storm_hit', reveal_gift: 'gift',
  shell_enter: 'shell_mist', crisis: 'tension', double_ring: 'vote_finale', finale: 'vote_finale', shells_leave: 'tension',
  auction: 'shard_auction', fragment_contributed: 'gift',
});
export const AUDIO_MAP = Object.freeze({
  memory_burn: 'memory_dissolve', vision: 'vision_whoosh', anchor_placed: 'anchor_plant', reveal_gift: 'gift_chime',
  reveal_storm: 'storm_crack', guest_voice: 'guest_call', shells_leave: 'sting_gone', rejected: 'ui_error',
  tick_start: 'ui_notify', offer: 'ui_notify', fragment_contributed: 'ui_confirm', link_mend: 'ui_confirm', key_spoken: 'gift_chime',
  auction: 'bid_tick', guest_yes: 'guest_loop', guest_no: 'guest_drop', double_ring: 'vote_stone',
});
/** The finale sting depends on the outcome. */
export function audioFor(name, data = {}) {
  if (name === 'finale') return data.outcome === 'weapon' ? 'sting_weapon' : data.outcome === 'survived' ? 'sting_survived' : data.outcome === 'gift' ? 'gift_chime' : 'sting_gone';
  return AUDIO_MAP[name] || null;
}

const REVEAL = ['reveal_gift', 'reveal_storm', 'reveal_silence', 'reveal_call'];
const CLANS = ['iris', 'salt', 'ash', 'moss', 'amber', 'frost'];

/**
 * Cues for one view event: [{name, at, data}] where `at` names a place the 3D layer resolves
 * ({kind:'camp', clan} | {kind:'scroll'} | {kind:'anchor', shell} | {kind:'iris'} | {kind:'sky'}).
 */
export function cuesForEvent(ev) {
  const d = ev.data || {};
  const out = [];
  const cue = (name, at, data = {}) => out.push({ name, at, data });
  switch (ev.type) {
    case 'fx': {
      const f = d.fx || {};
      switch (f.type) {
        case 'memory_burned': cue('memory_burn', { kind: 'iris' }, { kind: f.kind, purpose: f.purpose }); cue('vision', { kind: 'iris' }, { purpose: f.purpose }); break;
        case 'crisis': cue('crisis', { kind: 'camp', clan: 'ash' }); break;
        case 'event': if (f.action != null) cue(REVEAL[f.action] || 'reveal_gift', { kind: 'anchor', shell: f.place + 1 }, { power: f.power, verified: f.verified }); break;
        case 'anchor': cue('anchor_placed', { kind: 'anchor', shell: f.place + 1 }, { tick: f.t }); break;
        case 'fragment': cue('fragment_contributed', { kind: 'scroll' }, { clan: CLANS[f.i] }); break;
        case 'dark': cue('fragment_dark', { kind: 'camp', clan: CLANS[f.i] }); break;
        case 'break': cue('link_break', { kind: 'camp', clan: CLANS[f.i] }, { other: CLANS[f.j] }); break;
        case 'mend': cue('link_mend', { kind: 'camp', clan: CLANS[f.i] }, { other: CLANS[f.j] }); break;
        case 'voice': cue('guest_voice', { kind: 'sky' }, { count: f.n }); break;
        case 'ask': cue(f.yes ? 'guest_yes' : 'guest_no', { kind: 'glass' }); break;
        case 'key_spoken': cue('key_spoken', { kind: 'camp', clan: 'ash' }); break;
        case 'pact': cue('pact', { kind: 'camp', clan: CLANS[f.with] }); break;
        case 'escrow': cue('escrow', { kind: 'camp', clan: 'amber' }); break;
        case 'walk': cue('silk_transfer', { kind: 'camp', clan: CLANS[f.from] }, { to: CLANS[f.to], kind: f.kind }); break;
        case 'end': cue(f.outcome === 'gone' ? 'shells_leave' : 'finale', { kind: 'scroll' }, { outcome: f.outcome }); break;
        default: break;
      }
      break;
    }
    case 'auction.opened': cue('auction', { kind: 'pedestal' }, { auctionId: d.auctionId }); break;
    case 'dialogue.offer': cue('offer', { kind: 'camp', clan: d.from }, { kind: d.kind }); break;
    case 'season.tick_started': cue('tick_start', { kind: 'sky' }, { tick: d.tick }); break;
    case 'season.phase_changed': if (d.to === 'vote') cue('double_ring', { kind: 'scroll' }); break;
    case 'world.zone_changed': cue(d.zone === 'shell' ? 'shell_enter' : 'shell_exit', { kind: 'iris' }, { shell: d.shell ?? d.from }); break;
    default: break;
  }
  return out;
}

/**
 * Fans cues out to the optional VFX and audio players. `resolve(at)` turns a place into a world
 * position (THREE.Vector3 or [x, y, z]). Every call is guarded.
 */
export class Hooks {
  constructor({ resolve = () => null } = {}) {
    this.resolve = resolve;
    this.vfx = null; this.audio = null;
    this.played = []; // last cues, for the dev HUD and tests
    this.listeners = new Set();
  }

  attachVfx(v) { this.vfx = v || null; }
  attachAudio(a) { this.audio = a || null; }
  onCue(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  play(name, at = null, data = {}) {
    let position = null;
    try { position = at ? this.resolve(at) : null; } catch { position = null; }
    const opts = { ...data, position, at };
    this.played.push({ name, t: Date.now() }); if (this.played.length > 12) this.played.shift();
    const pos = position && position.isVector3 ? position.toArray() : position;
    const fx = VFX_MAP[name], snd = audioFor(name, data);
    try { if (this.vfx && fx) this.vfx.play(fx, { ...data, position: pos || [0, 1, 0] }); } catch (e) { console.warn('[play] vfx cue failed', name, e); }
    try { if (this.audio && snd) this.audio.play(snd, { position: pos || undefined }); } catch (e) { console.warn('[play] audio cue failed', name, e); }
    for (const fn of [...this.listeners]) { try { fn(name, opts); } catch { /* listeners are presentation only */ } }
  }

  event(ev) { for (const c of cuesForEvent(ev)) this.play(c.name, c.at, c.data); }

  update(dt, ctx = {}) {
    try { if (this.vfx && this.vfx.update) this.vfx.update(dt); } catch { /* keep rendering */ }
    try { if (this.audio && this.audio.setListener && ctx.camera) this.audio.setListener(ctx.camera, ctx.focus); } catch { /* keep rendering */ }
  }
}
