// The Glass Shoal look preview (shoal.html; behind the flag glassShoal, ?ff=glassShoal): the arena's light, mirror
// flat, mist, god rays, bloom and grade on placeholder dressing, so the look can be judged and tuned (?render=1 opens
// the render panel) before the island's real scene graph lands. ?shoalLook=lowSun|pearlDawn|stormSilver picks a preset,
// ?tier=ultra|high|low and ?profile=phone|desktop the quality, ?still=1 holds the camera (stills and tests).
import * as THREE from 'three';
import { features } from './features.js';
import { createShoalLook, dressPreview } from './render/shoal-look.js';
import { lookFromQuery } from './render/shoal-look-data.js';
import { browserProfile } from './render/lookdev.js';

const q = new URLSearchParams(location.search);
await features.load().catch(() => {});
if (!features.on('glassShoal')) { document.getElementById('gate').hidden = false; }
else start();

function start() {
  const { panel, params } = lookFromQuery(location.search);
  const profile = browserProfile(), tier = ['ultra', 'high', 'low'].includes(q.get('tier')) ? q.get('tier') : (profile === 'phone' ? 'high' : 'high');
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight); document.getElementById('app').append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(params.fov, innerWidth / innerHeight, 0.1, 4000);
  const reduced = () => q.get('still') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const look = createShoalLook({ renderer, scene, camera, tier, profile, params, reduced });
  dressPreview(look, scene);
  const sunH = () => { const p = look.params, b = (p.sunBearing * Math.PI) / 180; return [Math.sin(b), Math.cos(b)]; };
  let t = 0, frames = 0, fps = 0, acc = 0;
  const clock = new THREE.Clock();
  window.__shoal = { look, renderer, camera, scene, get fps() { return fps; } };
  if (panel) import('./render/shoal-panel.js').then((m) => m.createShoalPanel({ look, fps: () => fps }));
  addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); look.setSize(innerWidth, innerHeight); });
  const focus = new THREE.Vector3(0, 0, 0);
  const loop = () => {
    const dt = Math.min(0.1, clock.getDelta()); if (!reduced()) t += dt;
    acc += dt; frames++; if (acc > 0.5) { fps = frames / acc; frames = 0; acc = 0; }
    // the camera looks across the flat toward the low sun, drifting slowly sideways
    const [sx, sz] = sunH(), side = Math.sin(t * 0.05) * 6;
    camera.position.set(-sx * 16 + sz * side, 1.9 + Math.sin(t * 0.07) * 0.3, -sz * 16 - sx * side);
    camera.lookAt(sx * 60, 4.5, sz * 60);
    look.update(dt, focus); look.render();
    requestAnimationFrame(loop);
  };
  loop();
}
