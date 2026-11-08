// Cinematic capture entry (docs/submission/trailer.md). main.js imports this module only when the URL
// carries ?cinematic=<name>; boot() then replaces the page's clocks with the frame-stepped virtual clock
// before the game starts and exposes `window.__ftfCinematic`, which tools/capture/capture.mjs drives
// from Playwright: load a shot, step one frame, screenshot, repeat. Without the parameter nothing here
// is loaded and the game runs exactly as before.
import { installVirtualClock, hashString } from './clock.js';
import { ShotRunner } from './runner.js';

export function boot(name = 'shot', { fps } = {}) {
  const params = new URLSearchParams(location.search);
  const rate = fps || Number(params.get('fps')) || 60;
  const clock = installVirtualClock(window, { fps: rate, seed: hashString(String(name)) });
  const runner = new ShotRunner({ clock, name: String(name) });
  window.__ftfCinematic = {
    clock, runner, fps: rate,
    /** Loads a shot script (plain data). */
    load: (shot) => runner.load(shot),
    /** Advances one frame; resolves with the shot time of the frame now on screen. */
    step: (o) => runner.step(o),
    /** The canvas as a PNG data URL plus frame statistics, read in the same task as the last render. */
    grab: () => runner.grabCanvas(),
    /** Steps until a predicate (see runner.js PREDICATES) holds. */
    until: (pred, value, max) => runner.until(pred, value, max),
    /** Steps until every placed model has streamed in. */
    waitLoaded: (ms) => runner.waitLoaded(ms),
    /** Runs a shot's setup list with rendering off. */
    setup: (list) => runner.setup(list),
    setRender: (on) => runner.setRender(on),
    /** Resets the shot clock to -preroll so capture can start after the setup moved the game. */
    rewind: (preroll = 0) => runner.rewind(preroll),
    camLog: () => runner.camLog.slice(),
    state: () => runner.state(),
    cues: () => runner.cues.slice(),
    marks: () => runner.marks.slice(),
    errors: () => runner.errors.slice(),
    get now() { return clock.now; },
  };
  return window.__ftfCinematic;
}
