// Sound in the town (feature 4; every sound is synthesized by art/audio/build_audio.py, no samples): the wind bed and
// the calm music stem, footsteps (stone in the streets, wood in the shops), and cues that other modules send as a
// window event `ftf:sound` with the sound or group name (the wheel's ticks and prize, the shop door, the casts, the
// free mint). It starts on the first key or tap (browsers allow sound only after a gesture) and follows the volume
// settings shared with the archipelago (src/audio/mix.js). The archipelago's play layer has its own audio; this one
// is disposed when Iris leaves the town and made again when she comes back.
export const STEP_EVERY = Object.freeze({ walk: 0.62, run: 0.9 });
/** Cue names the game sends; anything else is ignored. */
export const TOWN_CUES = Object.freeze(['ui_click', 'ui_confirm', 'ui_notify', 'ui_error', 'bid_tick', 'gift_chime', 'vision_whoosh', 'storm_crack', 'memory_dissolve']);

/** Sends a sound cue from anywhere (no import of the audio engine needed). */
export function cue(name, win = globalThis) {
  try { if (win && win.dispatchEvent && typeof CustomEvent === 'function') win.dispatchEvent(new CustomEvent('ftf:sound', { detail: name })); } catch { /* no DOM */ }
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
export function createTownAudio({ createAudio, win = globalThis }) {
  const audio = createAudio();
  audio.setZone('plaza');
  const steps = stepper();
  const onCue = (e) => { if (TOWN_CUES.includes(e.detail)) audio.play(e.detail); };
  const unlock = () => { audio.unlock().catch(() => {}); };
  win.addEventListener('ftf:sound', onCue);
  win.addEventListener('keydown', unlock, { once: true });
  win.addEventListener('pointerdown', unlock, { once: true });
  return {
    audio,
    /** Per frame: Iris walked `dist` metres; indoors the floor is wood. */
    step(dist, running, indoors = false) { if (steps(dist, running)) audio.play(indoors ? 'step_wood' : 'step_stone', { gain: running ? 0.9 : 0.7 }); },
    setListener(camera, target) { if (audio.setListener) audio.setListener(camera, target); },
    dispose() { win.removeEventListener('ftf:sound', onCue); win.removeEventListener('keydown', unlock); win.removeEventListener('pointerdown', unlock); audio.dispose(); },
  };
}
