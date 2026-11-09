// The CPU layers pass page: replays a shot's `layers` against the camera recorded in its GPU capture (`layerLog`: one
// view-projection matrix and the tracked heads per frame), so the data layers can be restyled and re-rendered without
// another GPU run. The projection is exactly the runner's (runner.js project()).
import { createLayers } from '../src/cinematic/layers.js';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/libre-caslon-text/400.css';

let layers = null, log = null;
function project(vp, w) {
  const x = vp[0] * w[0] + vp[4] * w[1] + vp[8] * w[2] + vp[12], y = vp[1] * w[0] + vp[5] * w[1] + vp[9] * w[2] + vp[13];
  const z = vp[2] * w[0] + vp[6] * w[1] + vp[10] * w[2] + vp[14], ww = vp[3] * w[0] + vp[7] * w[1] + vp[11] * w[2] + vp[15];
  const nx = x / ww, ny = y / ww, nz = z / ww;
  return [(nx + 1) / 2 * 1920, (1 - ny) / 2 * 1080, ww > 0 && nz < 1 && Math.abs(nx) < 1.6 && Math.abs(ny) < 1.6];
}
window.__lp = {
  async load(items, layerLog) {
    await document.fonts.ready;
    await Promise.all(['400 112px "Libre Caslon Text"', '700 56px "Atkinson Hyperlegible"', '600 44px "Source Sans 3"'].map((f) => document.fonts.load(f)));
    layers = createLayers(document); layers.set(items); log = layerLog;
    return log.length;
  },
  render(i) {
    const f = log[Math.min(i, log.length - 1)];
    layers.update(f.t, (w) => project(f.vp, w), (id) => (f.targets && f.targets[id] ? { pos: f.targets[id] } : null));
  },
};
