// Sound in the town (feature 4; effects synthesized by art/audio/build_audio.py): the wind bed and the licensed music
// beds (src/audio/music.js: Hiraeth in the streets, Tears in Rain in the shops, Floating Cities beyond the walls,
// Legionnaire against the elite, Frozen Star after a passed chapter), footsteps (stone in the streets, wood in the shops), and cues that other modules send as a
// window event `ftf:sound` with the sound or group name (the wheel's ticks and prize, the shop door, the casts, the
// free mint). It starts on the first key or tap (browsers allow sound only after a gesture) and follows the volume
// settings shared with the archipelago (src/audio/mix.js). The archipelago's play layer has its own audio; this one
// is disposed when Iris leaves the town and made again when she comes back.
import { musicFor, MUSIC_XFADE, AGGRO_LIFT, BOSS_HOLD, takeChapterDone } from './music.js';

export const STEP_EVERY = Object.freeze({ walk: 0.62, run: 0.9 });
/** Cue names the game sends; anything else is ignored. */
export const TOWN_CUES = Object.freeze(['ui_click', 'ui_confirm', 'ui_notify', 'ui_error', 'bid_tick', 'gift_chime', 'vision_whoosh', 'storm_crack', 'memory_dissolve',
  // combat (owner, 12.11): Iris's strikes and dash, the casts' build and release, the monsters by type, Iris hit
  'strike_swing', 'strike_impact', 'strike_heavy', 'dash_whoosh',
  'cast_charge_frost', 'cast_release_frost', 'cast_charge_storm', 'cast_release_storm',
  'mob_skitter_attack', 'mob_hulker_slam', 'mob_veilbell_seed', 'mob_crownrift_blade', 'mob_hurt_small', 'mob_hurt_big', 'mob_death',
  'iris_hurt', 'iris_down']);
/** Footstep surfaces (six soft variations each). */
export const STEP_SURFACES = Object.freeze(['stone', 'wood', 'grass']);
/** The monsters' sounds by type (play/mobs.js types): attack / telegraph, hurt, death. */
export const MOB_SOUNDS = Object.freeze({
  skitter: Object.freeze({ attack: 'mob_skitter_attack', hurt: 'mob_hurt_small' }),
  veilbell: Object.freeze({ attack: 'mob_veilbell_seed', hurt: 'mob_hurt_small' }),
  hulker: Object.freeze({ attack: 'mob_hulker_slam', hurt: 'mob_hurt_big' }),
  crownrift: Object.freeze({ attack: 'mob_crownrift_blade', hurt: 'mob_hurt_big' }),
});

/**
 * Weather sound (window event 'ftf:weather' {state, thunder?} from render/lookdev.js): the rain bed for a state and
 * whether the streets are wet. drizzle = the light bed, rain = the heavy bed, storm = heavy + distant thunder (played
 * `thunder` seconds after each flash). Pure, tested.
 */
export const WEATHER_BEDS = Object.freeze({ drizzle: 'amb_rain_light', rain: 'amb_rain_heavy', storm: 'amb_rain_heavy' });
export function weatherSound(state) {
  const bed = WEATHER_BEDS[state] || null;
  return { bed, wet: !!bed, level: state === 'storm' ? 1 : state === 'rain' ? 0.85 : bed ? 0.7 : 0 };
}

/** The cue's name from an `ftf:sound` detail: a name, or {name, pos, gain}. */
export const cueName = (d) => (d && typeof d === 'object' ? d.name : d);

/** Sends a sound cue from anywhere (no import of the audio engine needed). */
export function cue(name, win = globalThis) {
  try { if (win && win.dispatchEvent && typeof CustomEvent === 'function') win.dispatchEvent(new CustomEvent('ftf:sound', { detail: name })); } catch { /* no DOM */ }
}

/** A cue placed in the world (the monsters, an impact): heard from where it happens. */
export function cueAt(name, pos, gain = 1, win = globalThis) {
  try { if (win && win.dispatchEvent && typeof CustomEvent === 'function') win.dispatchEvent(new CustomEvent('ftf:sound', { detail: { name, pos: pos ? [pos[0], pos[1], pos[2]] : null, gain } })); } catch { /* no DOM */ }
}

/**
 * Footstep pacing: feed it the distance walked each frame; it says when a step falls (pure, tested).
 * @returns {(dist: number, running: boolean) => boolean}
 */
export function stepper() {
  let acc = 0;
  return (dist, running) => { acc += Math.max(0, dist); const every = running ? STEP_EVERY.run : STEP_EVERY.walk; if (acc >= every) { acc %= every; return true; } return false; };
}

/**
 * @param {{createAudio: Function, win?: Window}} o
 */
export function createTownAudio({ createAudio, win = globalThis, rand = Math.random, store = globalThis.sessionStorage, clock = () => (globalThis.performance ? performance.now() : Date.now()) / 1000 }) {
  const audio = createAudio({ music: false }); // the licensed beds replace the synthesized stems here
  audio.setZone('plaza');
  const steps = stepper();
  // a small volume jitter on top of the engine's pitch variation: no two strikes or steps sound the same
  const onCue = (e) => {
    const d = e.detail, name = cueName(d);
    if (!TOWN_CUES.includes(name)) return;
    const o = { gain: ((d && d.gain) || 1) * (0.86 + 0.14 * rand()) };
    if (d && d.pos) o.pos = d.pos;
    audio.play(name, o);
  };
  const unlock = () => { audio.unlock().catch(() => {}); };
  // Foot contacts from the locomotion (window event 'ftf:foot' {running?, surface?} on each contact frame): while they
  // arrive the distance pacing below stays quiet, so a step is heard exactly when a foot lands
  let surface = 'stone', lastContact = -1e9;
  const now = () => (globalThis.performance ? performance.now() : Date.now());
  const onFoot = (e) => { const d = e.detail || {}; lastContact = now(); api.footContact(d.surface || surface, !!d.running); };
  // Weather: one looping rain bed crossfaded on state changes; thunder after each storm flash; wet steps outdoors
  let rain = null, wet = false, weatherState = 'clear', musicZone = 'town';
  let bossUntil = -1, aggro = false, lastBed;
  const chapterLeft = takeChapterDone(store); // just back from a passed chapter: Frozen Star first
  const chapterUntil = chapterLeft ? clock() + chapterLeft : -1;
  const applyMusic = () => {
    if (!audio.setMusic) return;
    const t = clock();
    const bed = musicFor({ zone: musicZone, weather: weatherState, boss: t < bossUntil, chapterDone: t < chapterUntil });
    if (bed !== lastBed) { lastBed = bed; audio.setMusic(bed, MUSIC_XFADE); }
    if (audio.setMusicLevel) audio.setMusicLevel(aggro && musicZone === 'outside' && t >= bossUntil ? AGGRO_LIFT : 1);
  };
  const onWeather = (e) => {
    const d = e.detail || {}, w = weatherSound(d.state);
    wet = w.wet;
    if (d.state && d.state !== weatherState) { weatherState = d.state; applyMusic(); }
    if ((rain?.bedName ?? null) !== w.bed) {
      rain?.stop(3);
      rain = w.bed ? audio.play(w.bed, { loop: true, gain: 0 }) : null;
      if (rain) { rain.bedName = w.bed; rain.setGain?.(w.level, 3); }
    } else if (rain) rain.setGain?.(w.level, 2);
    if (d.state === 'storm' && Number.isFinite(d.thunder)) audio.play('thunder_distant', { delay: Math.max(0, d.thunder), gain: 0.8 + 0.2 * rand() });
  };
  win.addEventListener('ftf:weather', onWeather);
  applyMusic();
  win.addEventListener('ftf:foot', onFoot);
  win.addEventListener('ftf:sound', onCue);
  win.addEventListener('keydown', unlock, { once: true });
  win.addEventListener('pointerdown', unlock, { once: true });
  const api = {
    audio,
    /** Per frame: Iris walked `dist` metres; indoors the floor is wood. */
    step(dist, running, floor = 'stone') { surface = floor === true ? 'wood' : floor; if (now() - lastContact > 1000 && steps(dist, running)) this.footContact(surface, running); },
    /** One foot meets the ground (the locomotion's contact frame when it has one, else the distance pacing). */
    footContact(surface = 'stone', running = false) {
      let s = surface === true ? 'wood' : STEP_SURFACES.includes(surface) ? surface : 'stone'; // true: the old "indoors" flag
      if (wet && s !== 'wood') s = 'wet'; // rain outdoors: wet steps (indoors stays dry)
      audio.play('step_' + s, { gain: (running ? 0.85 : 0.62) * (0.85 + 0.15 * rand()) });
    },
    setListener(camera, target) { if (audio.setListener) audio.setListener(camera, target); },
    /** Per frame (cheap when unchanged): 'town' | 'interior' | 'outside'; the bed crossfades when it changes. */
    setMusicZone(z) { if (z !== musicZone) { musicZone = z; applyMusic(); } },
    /**
     * Per frame from the monsters: `aggro` some monster chases her, `elite` the crownrift is engaged (its bed holds
     * BOSS_HOLD s after it lets go). Also lets timed beds (Frozen Star after a chapter) run out.
     */
    setCombat({ aggro: a = false, elite = false } = {}) {
      const t = clock();
      if (elite) bossUntil = t + BOSS_HOLD;
      const was = aggro; aggro = !!a;
      const bed = musicFor({ zone: musicZone, weather: weatherState, boss: t < bossUntil, chapterDone: t < chapterUntil });
      if (bed !== lastBed || was !== aggro) applyMusic();
    },
    get musicZone() { return musicZone; },
    get weather() { return { bed: rain?.bedName ?? null, wet }; },
    dispose() { rain?.stop(0.3); win.removeEventListener('ftf:weather', onWeather); win.removeEventListener('ftf:foot', onFoot); win.removeEventListener('ftf:sound', onCue); win.removeEventListener('keydown', unlock); win.removeEventListener('pointerdown', unlock); audio.dispose(); },
  };
  return api;
}
