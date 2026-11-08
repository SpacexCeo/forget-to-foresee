// Presentation hooks: room events → named VFX and audio cues. The VFX module (src/vfx/, `createVfx`,
// docs/vfx.md) and the audio module (src/audio/) are written by other agents; the play layer loads
// them only if present and calls play(name, opts) on game events. Missing modules, missing effect
// names or a throwing effect never break the game: cues are presentation only and never change
// state (spec §2 "camera, skip and FPS never change state").
import { CAMPS } from '../scenes/layout.js';

/**
 * Rare events with their spec durations (spec §6) and frequent ones. Every name here is either mapped
 * in VFX_MAP / AUDIO_MAP or listed in SILENT_CUES with its reason (tests/client/audio.test.mjs checks).
 * `command_ok` and `ui_click` are the player's own actions (a confirmed command, a pressed button).
 */
export const CUE_NAMES = Object.freeze([
  'memory_burn', 'vision', 'crisis', 'double_ring', 'finale', 'shells_leave',
  'anchor_placed', 'fragment_contributed', 'fragment_dark', 'reveal_gift', 'reveal_storm', 'reveal_silence', 'reveal_call',
  'link_break', 'link_mend', 'guest_voice', 'guest_yes', 'guest_no', 'key_spoken', 'offer', 'pact', 'escrow', 'silk_transfer',
  'tick_start', 'shell_enter', 'shell_exit', 'rejected', 'talk', 'auction', 'command_ok', 'ui_click',
]);

/**
 * Cue → effect name of src/vfx (EFFECT_NAMES). Cues without an effect, on purpose:
 *   vision          the `memory_burn` cue of the same moment already plays the `vision` effect at Iris
 *   crisis / shells_leave   the `tension` singleton is driven by the season tension level (play/presentation.js),
 *                   not by one-shot cues; the crisis strike is `storm_hit` at the Ash camp
 *   shell_enter     the mist loops live under the Shells (`shell_mist` with `follow`), not at Iris's feet
 *   link_break, fragment_dark, pact, escrow, silk_transfer, offer, talk, tick_start, guest_*, rejected, ui
 *                   agent moments are shown by the agents' own poses and lines (play/behaviour.js); no particles
 */
export const VFX_MAP = Object.freeze({
  memory_burn: 'vision', anchor_placed: 'anchor_plant', reveal_storm: 'storm_hit', reveal_gift: 'gift',
  fragment_contributed: 'gift', key_spoken: 'gift', double_ring: 'gift', crisis: 'storm_hit', finale: 'vote_finale',
  auction: 'shard_auction',
});
/** Extra options per effect cue (merged over the cue data). The finale beams rise from the camps of layout.js. */
export const VFX_OPTS = Object.freeze({
  finale: { points: CAMPS.map((c) => [c.position[0], 2.5, c.position[2]]), target: [0, 14, 0] },
  double_ring: { scale: 1.6 },
});
/** Cue → sound (or group) of src/audio (AUDIO_MANIFEST). */
export const AUDIO_MAP = Object.freeze({
  memory_burn: 'memory_dissolve', vision: 'vision_whoosh', anchor_placed: 'anchor_plant', reveal_gift: 'gift_chime',
  reveal_storm: 'storm_crack', reveal_call: 'guest_call', guest_voice: 'guest_call', shells_leave: 'sting_gone', rejected: 'ui_error',
  tick_start: 'ui_notify', offer: 'ui_notify', fragment_dark: 'ui_notify', fragment_contributed: 'ui_confirm', link_mend: 'ui_confirm',
  pact: 'ui_confirm', command_ok: 'ui_confirm', ui_click: 'ui_click', key_spoken: 'gift_chime', crisis: 'storm_crack', link_break: 'storm_crack',
  auction: 'bid_tick', escrow: 'bid_tick', silk_transfer: 'bid_tick', guest_yes: 'guest_loop', guest_no: 'guest_drop', double_ring: 'vote_stone',
});
/** Per-cue playback options for the sound (gain 0..1, rate, delay seconds). */
export const AUDIO_OPTS = Object.freeze({
  link_break: { gain: 0.35, rate: 1.3 },   // a short, distant crack: a link snaps, not a storm
  crisis: { gain: 0.8 },
  silk_transfer: { gain: 0.6 },
  escrow: { gain: 0.6 },
  ui_click: { gain: 0.6 },
});
/**
 * Cues that play nothing, on purpose:
 *   reveal_silence   the Guests' Silence is the absence of an event; silence is the cue
 *   talk             the dialogue has its subtitles and the agent's talk clip; a sound per line would nag
 *   shell_enter / shell_exit   the ambience bed crossfade (amb_shell_inside <-> wind and camp beds) is the cue
 */
export const SILENT_CUES = Object.freeze(['reveal_silence', 'talk', 'shell_enter', 'shell_exit']);
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
    try { if (this.vfx && fx) this.vfx.play(fx, { ...data, ...(VFX_OPTS[name] || {}), position: pos || [0, 1, 0] }); } catch (e) { console.warn('[play] vfx cue failed', name, e); }
    // `pos` makes the sound positional (HRTF); cues without a place (UI, stingers) play in the head.
    try { if (this.audio && snd) this.audio.play(snd, { ...(AUDIO_OPTS[name] || {}), pos: pos || undefined }); } catch (e) { console.warn('[play] audio cue failed', name, e); }
    for (const fn of [...this.listeners]) { try { fn(name, opts); } catch { /* listeners are presentation only */ } }
  }

  event(ev) { for (const c of cuesForEvent(ev)) this.play(c.name, c.at, c.data); }

  update(dt, ctx = {}) {
    try { if (this.vfx && this.vfx.update) this.vfx.update(dt); } catch { /* keep rendering */ }
    try { if (this.audio && this.audio.setListener && ctx.camera) this.audio.setListener(ctx.camera, ctx.focus); } catch { /* keep rendering */ }
  }
}
