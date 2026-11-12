// The Shell monument (story K2, docs/leaderboard.md): two fused nacre shells on a low plinth with a glowing seam,
// beside the spawn opposite the Gate-Loom. Procedural (no new art file). E in reach ("Read the Shell") opens the board
// panel (ui/board-panel.js): the latest snapshot (game/public/board/latest.json, else the relayer's /api/board/latest)
// and the player's own row recomputed from the local expedition log. Behind ?story=1 (boot-world loads it lazily).
import * as THREE from 'three';
import { scoreAccount } from '../game/board-score.js';
import { renderBoardPanel } from '../ui/board-panel.js';

/** Town-local metres: to Iris's left in the first frame, mirroring the Gate-Loom (4, 0, 22.5) across the spawn path. */
export const BOARD_TOWN = Object.freeze([-4, 0, 22.5]);
export const BOARD_REACH = 2.6;

/** A snapshot is shown only if it has the expected shape (pure); anything else falls back to the local preview. */
export function validSnapshot(s) {
  return !!(s && s.v === 1 && Array.isArray(s.rows) && typeof s.root === 'string' && /^[0-9a-f]{64}$/.test(s.root)
    && s.rows.every((r) => r && typeof r.account === 'string' && Number.isFinite(r.score) && Number.isFinite(r.rank) && (r.actor === 'human' || r.actor === 'scripted')));
}

/** Loads the latest snapshot: the published file first, then the relayer; null when neither answers. */
export async function loadSnapshot({ base = '/', relayer = null, fetch = globalThis.fetch, timeoutMs = 6000 } = {}) {
  const urls = [base.replace(/\/?$/, '/') + 'board/latest.json'];
  if (relayer) urls.push(relayer.replace(/\/$/, '') + '/api/board/latest');
  for (const url of urls) {
    try {
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
      const r = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (!r || !r.ok) continue;
      const s = await r.json();
      if (validSnapshot(s)) return s;
    } catch { /* offline or none published: try the next source */ }
  }
  return null;
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene @param {number[]} o.position world position @param {number} [o.facing]
 * @param {object} o.i18n @param {() => object[]} o.log the local expedition log (town-quests ledger.log)
 * @param {() => Promise<object|null>} [o.load] snapshot loader (loadSnapshot bound to the page's base and relayer)
 * @param {string} [o.account] the player's account id, when known @param {Document} [o.doc]
 */
export function createTownBoard({ scene, position, facing = 0, i18n, log = () => [], load = async () => null, account = null, doc = globalThis.document, win = globalThis }) {
  const t = (k, a) => i18n.t(k, a);
  const root = new THREE.Group(); root.name = 'story_shell_board';
  root.position.set(position[0], position[1], position[2]); root.rotation.y = facing;
  const stone = new THREE.MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.85 });
  const nacre = new THREE.MeshStandardMaterial({ color: 0xe8e1d4, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color(0x24352f), emissiveIntensity: 0.25 });
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x8fe2d6, toneMapped: false });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.45, 20), stone); plinth.position.y = 0.22;
  const shellGeo = new THREE.SphereGeometry(0.9, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  const a = new THREE.Mesh(shellGeo, nacre); a.scale.set(1, 1.25, 0.42); a.position.set(-0.12, 0.45, 0); a.rotation.z = 0.18;
  const b = new THREE.Mesh(shellGeo, nacre); b.scale.set(0.9, 1.1, 0.4); b.position.set(0.16, 0.45, 0.02); b.rotation.z = -0.24;
  const seam = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 40, Math.PI), seamMat); seam.position.set(0.02, 0.47, 0.37); seam.scale.set(1, 1.6, 1);
  root.add(plinth, a, b, seam);
  scene.add(root);

  let panel = null, view = null, snapshot = null, loaded = false, tab = 'human';
  const local = () => { try { return scoreAccount(log() || []); } catch { return null; } };
  function close() { if (panel) { panel.remove(); panel = null; view = null; } if (keyHandler) { win.removeEventListener('keydown', keyHandler); keyHandler = null; } }
  let keyHandler = null;
  function draw() {
    const prevTab = view ? view.tab : tab;
    if (panel) panel.remove();
    view = renderBoardPanel({ doc, i18n, snapshot, local: local(), account, tab: prevTab, onClose: close, copy: (s) => win.navigator && win.navigator.clipboard && win.navigator.clipboard.writeText(s) });
    panel = view.panel; doc.body.append(panel);
    const first = panel.querySelector('button'); if (first && first.focus) first.focus();
  }
  async function open() {
    draw();
    if (!loaded) { loaded = true; try { snapshot = await load(); } catch { snapshot = null; } if (panel) draw(); }
    if (!keyHandler) { keyHandler = (e) => { if (e.key === 'Escape') close(); }; win.addEventListener('keydown', keyHandler); }
  }

  const spot = {
    id: 'shell_board',
    near: (pos) => { const at = root.position; return Math.hypot(pos[0] - at.x, pos[2] - at.z) <= BOARD_REACH && Math.abs(pos[1] - at.y) < 3; },
    prompt: () => t('lb.prompt'),
    onInteract: () => { if (panel) close(); else open(); return true; },
    busy: () => !!panel,
  };
  return {
    root, spot,
    get open() { return !!panel; }, get snapshot() { return snapshot; },
    openPanel: open, close,
    /** Per frame: a panel closes when she walks off; the seam breathes. */
    update(pos, time = 0) {
      seamMat.color.setHSL(0.47, 0.6, 0.62 + 0.08 * Math.sin(time * 1.3));
      if (panel && pos) { const at = root.position; if (Math.hypot(pos[0] - at.x, pos[2] - at.z) > BOARD_REACH + 2) close(); }
    },
    setActive(on) { root.visible = !!on; if (!on) close(); },
    dispose() { close(); scene.remove(root); plinth.geometry.dispose(); shellGeo.dispose(); seam.geometry.dispose(); stone.dispose(); nacre.dispose(); seamMat.dispose(); },
  };
}
