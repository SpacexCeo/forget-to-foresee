// Quest markers over the givers (owner, 12.11: "I can't see the quests"): a gold "!" over a townsperson with a quest on
// offer and a gold "?" over one whose quest can be turned in, bobbing gently above the head, always facing the camera
// (sprites), drawn over the scene so a wall never hides them. Which giver shows which mark comes from
// scenes/town-quests.js `markers()`; positions from the townsfolk (folkAt). Owner 14.11: the icon tile (a dark square with a
// gold frame) read as garish, so the mark is the bare glyph: gold, a soft gold glow, a thin dark outline for contrast.
import * as THREE from 'three';

export const MARK_HEIGHT = 2.55;
/** The sprite's world size (width, height): taller than wide, like the glyph; it shrinks with distance as the heads do. */
export const MARK_SIZE = Object.freeze([0.46, 0.66]);

/** A canvas texture of the bare glyph: no tile, no frame; a soft glow, a thin dark outline, a warm gold fill. */
export function markTexture(sym, doc = globalThis.document) {
  const W = 96, H = 136;
  const c = doc.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.font = '900 108px "Arial Black", "Segoe UI Black", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const x = W / 2, y = H / 2 + 6;
  // the glow: a blurred gold pass under the glyph
  g.save(); g.shadowColor = 'rgba(255,196,84,0.85)'; g.shadowBlur = 22; g.fillStyle = 'rgba(255,200,97,0.9)'; g.fillText(sym, x, y); g.fillText(sym, x, y); g.restore();
  // the outline: thin and dark, so the gold reads on sky and on bright walls alike
  g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = 'rgba(28,18,6,0.9)'; g.strokeText(sym, x, y);
  // the fill: light gold at the top to deeper amber at the foot
  const grad = g.createLinearGradient(0, y - 46, 0, y + 46); grad.addColorStop(0, '#fff1b8'); grad.addColorStop(0.5, '#ffcf5a'); grad.addColorStop(1, '#e09a22');
  g.fillStyle = grad; g.fillText(sym, x, y);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {() => {giver: string, sym: '!'|'?'}[]} o.markers @param {(giver: string) => number[]|null} o.folkAt
 * @param {(sym: string) => THREE.Texture} [o.texture] @param {boolean} [o.reducedMotion]
 */
export function createQuestMarkers({ scene, markers, folkAt, texture = (sym) => markTexture(sym), reducedMotion = false }) {
  const root = new THREE.Group(); root.name = 'story_quest_markers'; scene.add(root);
  const mats = new Map(), sprites = new Map();
  const matFor = (sym) => { if (!mats.has(sym)) mats.set(sym, new THREE.SpriteMaterial({ map: texture(sym), depthTest: false, depthWrite: false, transparent: true })); return mats.get(sym); };
  function spriteFor(giver) {
    let s = sprites.get(giver);
    if (!s) { s = new THREE.Sprite(matFor('!')); s.scale.set(MARK_SIZE[0], MARK_SIZE[1], 1); s.renderOrder = 999; s.name = 'quest_mark_' + giver; root.add(s); sprites.set(giver, s); }
    return s;
  }
  let lastKey = '';
  return {
    root,
    /** Per frame: the right mark over each giver, bobbing; hidden where there is none. */
    update(time = 0) {
      const list = markers() || [], want = new Map(list.map((m) => [m.giver, m.sym]));
      for (const [giver, s] of sprites) if (!want.has(giver)) s.visible = false;
      for (const [giver, sym] of want) {
        const p = folkAt(giver), s = spriteFor(giver);
        if (!p) { s.visible = false; continue; }
        if (s.material !== matFor(sym)) s.material = matFor(sym);
        s.visible = true;
        s.position.set(p[0], p[1] + MARK_HEIGHT + (reducedMotion ? 0 : 0.07 * Math.sin(time * 2 + giver.length)), p[2]);
      }
      lastKey = [...want].map(([g, sym]) => g + sym).join(',');
      return lastKey;
    },
    get shown() { return [...sprites].filter(([, s]) => s.visible).map(([giver, s]) => ({ giver, sym: [...mats].find(([, m]) => m === s.material)?.[0] })); },
    setActive(on) { root.visible = !!on; },
    dispose() { scene.remove(root); for (const m of mats.values()) { if (m.map) m.map.dispose(); m.dispose(); } },
  };
}
