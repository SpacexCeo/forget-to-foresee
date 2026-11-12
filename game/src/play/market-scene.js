// The town market made visible (docs/town-economy.md): when the ticker sees a new trade (net/market.js), the townsperson who
// sold it shows a small chip over the head ("bread × 3 · 9 silk") while Iris is near, and by day the buyer walks to
// the stalls by the Shard Exchange for a while (townsfolk.sendToTrade, the same trade loop a hired agent runs), then
// home. Hired agents are left alone; at most two market visitors at a time. Pure DOM + projection; no game rule.
import * as THREE from 'three';

export const CHIP = Object.freeze({ show: 4.5, radius: 22, height: 2.5 });
export const VISIT = Object.freeze({ seconds: 75, max: 2 });

/**
 * @param {{camera: object, folk: () => object|null, folkPos: (p: object) => number[], hired: () => string[], isDay: () => boolean,
 *   t: Function, doc?: Document, now?: () => number}} o
 */
export function createMarketScene({ camera, folk, folkPos, hired, isDay, t, doc = globalThis.document, now = () => performance.now() / 1000 }) {
  const el = doc.createElement('div');
  el.className = 'ftf-mk-chip'; el.hidden = true;
  el.style.cssText = 'position:fixed;left:0;top:0;z-index:11;pointer-events:none;padding:4px 10px;border-radius:10px;background:rgba(16,22,24,.82);'
    + 'color:#f3ead8;font:13px/1.3 system-ui,sans-serif;border:1px solid rgba(233,180,76,.5);transform:translate(-50%,-100%);white-space:nowrap';
  doc.body.append(el);
  const chips = []; // {key, text, t0}
  const visits = new Map(); // key -> until (seconds)
  const v = new THREE.Vector3();
  const person = (key) => { const tf = folk(); const p = tf && tf.byKey.get(key); return p && p.state === 'loaded' && p.root.visible ? p : null; };
  const release = (key) => { visits.delete(key); const tf = folk(); if (tf && !hired().includes(key)) tf.sendToTrade(key, false); };

  return {
    el,
    visits: () => [...visits.keys()],
    /** A new trade from the ticker: {buyer, seller, item, qty, price}. */
    onTrade(r) {
      const time = now();
      if (folk() && folk().byKey.has(r.seller)) chips.push({ key: r.seller, text: `${t('mk.i.' + r.item)} × ${r.qty} · ${r.qty * r.price}`, t0: time });
      if (chips.length > 4) chips.splice(0, chips.length - 4);
      const tf = folk();
      if (tf && isDay() && tf.byKey.has(r.buyer) && !visits.has(r.buyer) && visits.size < VISIT.max && !hired().includes(r.buyer)) {
        visits.set(r.buyer, time + VISIT.seconds); tf.sendToTrade(r.buyer, true);
      }
    },
    /** Per frame; `enabled` false hides the chip (indoors, a talk, away from the town). */
    update(playerPos, enabled = true) {
      const time = now();
      for (const [key, until] of visits) if (time > until || !isDay()) release(key);
      while (chips.length && time - chips[0].t0 > CHIP.show) chips.shift();
      const c = chips[0], p = enabled && c && person(c.key);
      if (!p) { el.hidden = true; return; }
      const pos = folkPos(p);
      if (Math.abs(pos[1] - playerPos[1]) > CHIP.height || Math.hypot(pos[0] - playerPos[0], pos[2] - playerPos[2]) > CHIP.radius) { el.hidden = true; return; }
      v.set(pos[0], pos[1] + p.def.height + 0.3, pos[2]).project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { el.hidden = true; return; }
      el.textContent = c.text; el.hidden = false;
      el.style.left = ((v.x + 1) / 2 * (globalThis.innerWidth || 1280)).toFixed(1) + 'px';
      el.style.top = ((1 - v.y) / 2 * (globalThis.innerHeight || 720)).toFixed(1) + 'px';
    },
    dispose() { for (const k of [...visits.keys()]) release(k); el.remove(); },
  };
}
