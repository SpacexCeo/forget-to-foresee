// Quest markers over the givers (owner, 12.11: "I can't see the quests"): a gold "!" over a townsperson with a quest on
// offer and a gold "?" over one whose quest can be turned in, bobbing gently above the head, always facing the camera
// (sprites), drawn over the scene so a wall never hides them. Which giver shows which mark comes from
// scenes/town-quests.js `markers()`; positions from the townsfolk (folkAt). Procedural canvas texture, no art file.
import * as THREE from 'three';

export const MARK_HEIGHT = 2.55;

/** A canvas texture of the mark: a dark disc with a gold ring and the gold glyph. */
export function markTexture(sym, doc = globalThis.document) {
  const c = doc.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(12,16,18,0.82)'; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#ffc861'; g.stroke();
  g.fillStyle = '#ffc861'; g.font = '700 82px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sym, 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
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
    if (!s) { s = new THREE.Sprite(matFor('!')); s.scale.set(0.62, 0.62, 1); s.renderOrder = 999; s.name = 'quest_mark_' + giver; root.add(s); sprites.set(giver, s); }
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
        s.position.set(p[0], p[1] + MARK_HEIGHT + (reducedMotion ? 0 : 0.08 * Math.sin(time * 2.2 + giver.length)), p[2]);
      }
      lastKey = [...want].map(([g, sym]) => g + sym).join(',');
      return lastKey;
    },
    get shown() { return [...sprites].filter(([, s]) => s.visible).map(([giver, s]) => ({ giver, sym: [...mats].find(([, m]) => m === s.material)?.[0] })); },
    setActive(on) { root.visible = !!on; },
    dispose() { scene.remove(root); for (const m of mats.values()) { if (m.map) m.map.dispose(); m.dispose(); } },
  };
}
