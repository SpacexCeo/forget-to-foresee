// Town props from the items set (art queue, 11.11): the trading board beside the Shard Exchange door, its board
// showing the latest agent trades (drawn from the town ledger, redrawn when it changes), and the wheel of fortune
// beside the Inn door, turning slowly; E at the wheel opens the wheel tab of the game menu. The phone variants
// (_m) load on phones. Visual only (no colliders): both stand against the house fronts, off the walking line.
import * as THREE from 'three';
import { fetchGltfUrl } from '../render/assets.js';
import { TOWN_SHOPS, besideDoor, BOARD_SPOT, WHEEL_SPOT } from './town-layout.js';
export { besideDoor, BOARD_SPOT, WHEEL_SPOT };


/**
 * @param {{scene: THREE.Scene, town: object, ledger?: object, i18n?: object, mobile?: boolean, base?: string, doc?: Document}} o
 */
export function createTownProps({ scene, town, ledger = null, i18n = null, mobile = false, base = (import.meta.env && import.meta.env.BASE_URL) || '/', doc = globalThis.document }) {
  const shop = (id) => TOWN_SHOPS.find((s) => s.id === id);
  const group = new THREE.Group(); group.name = 'town_props'; scene.add(group);
  const items = [];
  const place = (spot) => { const s = shop(spot.shop); return s ? besideDoor(s.door, spot.out, spot.side) : null; };
  const boardAt = place(BOARD_SPOT), wheelAt = place(WHEEL_SPOT);
  let wheelSpin = null, boardTex = null, boardCanvas = null, grounded = false;

  function load(file, at, onReady) {
    if (!at) return;
    const name = mobile ? file.replace(/\.glb$/, '_m.glb') : file;
    fetchGltfUrl(base + 'assets/items/' + name).then((gltf) => {
      const root = gltf.scene; root.position.set(...at.position); root.rotation.y = at.heading;
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      group.add(root); items.push({ root, at });
      onReady(root);
    }).catch((e) => console.warn('[props]', file, e));
  }

  /** The board's face: the newest agent trades in a few lines (local, town silk). */
  function drawBoard() {
    if (!boardCanvas) return;
    const g = boardCanvas.getContext('2d'); if (!g) return;
    g.fillStyle = '#14201c'; g.fillRect(0, 0, 512, 320);
    g.fillStyle = '#e9b44c'; g.font = 'bold 22px system-ui, sans-serif';
    g.fillText(i18n ? i18n.t('spot.exchange.board') : 'Trading board', 20, 44);
    g.font = '22px ui-monospace, monospace';
    const lines = ledger ? ledger.log().slice(0, 7) : [];
    if (!lines.length) { g.fillStyle = '#9fb8b0'; g.fillText(i18n ? i18n.t('open.none') : '—', 20, 96); }
    lines.forEach((l, k) => {
      g.fillStyle = l.result >= 0 ? '#7fd18b' : '#ff8a7a';
      const who = i18n ? i18n.t('folk.name.' + l.npc) : l.npc;
      g.fillText(`${who.slice(0, 10).padEnd(10)} ${l.side === 'buy' ? '▲' : l.side === 'sell' ? '▼' : '·'} ${(l.result >= 0 ? '+' : '') + (l.result / 100).toFixed(2)}`, 20, 92 + k * 32);
    });
    if (boardTex) boardTex.needsUpdate = true;
  }

  load('trading_board.glb', boardAt, (root) => {
    let socket = null;
    root.traverse((o) => { if (!socket && /^socket_board/.test(o.userData.name || o.name || '')) socket = o; });
    if (!doc || !doc.createElement) return;
    boardCanvas = doc.createElement('canvas'); boardCanvas.width = 512; boardCanvas.height = 320;
    boardTex = new THREE.CanvasTexture(boardCanvas); boardTex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.81), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
    face.name = 'trading_board_face';
    if (socket) { face.position.set(0, 0, 0.012); socket.add(face); } else { face.position.set(0, 1.6, 0.06); root.add(face); }
    drawBoard();
  });
  load('prop_wheel_of_fortune.glb', wheelAt, (root) => {
    root.traverse((o) => { if (!wheelSpin && /^wheel_spin/.test(o.userData.name || o.name || '')) wheelSpin = o; });
  });
  const unLedger = ledger && ledger.subscribe ? ledger.subscribe(drawBoard) : null;

  return {
    group, boardAt, wheelAt,
    /** Whether a world point is within reach of the wheel (the town spot for E). */
    nearWheel: (pos) => !!wheelAt && Math.hypot(pos[0] - wheelAt.position[0], pos[2] - wheelAt.position[2]) <= WHEEL_SPOT.reach && Math.abs(pos[1] - wheelAt.position[1]) < 2.5,
    /** Per frame: sit the props on the ground once its colliders are in; the wheel turns slowly. */
    update(dt, reducedMotion = false) {
      if (!grounded && town.groundAt) {
        let all = items.length === 2;
        for (const it of items) { const y = town.groundAt(it.at.position[0], it.at.position[2]); if (y == null) all = false; else it.root.position.y = y; }
        grounded = all;
      }
      if (wheelSpin && !reducedMotion) wheelSpin.rotation.z += dt * 0.25;
    },
    dispose() { if (unLedger) unLedger(); scene.remove(group); },
  };
}
