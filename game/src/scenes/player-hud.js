// The player HUD in the town (owner brief 12.11): a portrait frame at the top left (round gold-rimmed portrait, name,
// level ring with XP, health with a damage trail), the quest tracker under it (the town objective, collapsible), a
// silk wallet at the top right (coin, count that ticks up, floating +/- deltas, the sealed-chest badge) and one toast
// stack. Dark green-black and gold, after docs/art/ui/profile-owner-ref.jpg. It only shows in the town phase; the
// archipelago keeps its own trial/silk HUD (the judge path). The bottom-left corner stays free for the chat panel.

import { showPremise } from '../ui/premise.js';
import { silkView, subscribeSilk, syncSilkNow, formatSilkC } from '../net/silk-core.js';

const ICON = (d) => `url("data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e6c47c" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>')}")`;
const I_SKIP = ICON('<path d="M5 5l9 7-9 7zM17 5v14"/>');

const CSS = `
.ph { --ph-bg: rgba(12, 20, 17, .86); --ph-line: rgba(201, 163, 90, .55); --ph-gold: #d8b46a; --ph-ink: #f1ead8; --ph-dim: #a9b3a8;
  position: fixed; inset: 0; pointer-events: none; z-index: 14; font: 14px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ph-ink); }
.ph[hidden] { display: none; }
.ph button { font: inherit; color: inherit; }
.ph-frame { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); left: calc(14px + env(safe-area-inset-left, 0px));
  display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 10px; min-width: 230px; max-width: 290px; padding: 8px 14px 8px 8px;
  background: var(--ph-bg); border: 1px solid var(--ph-line); border-radius: 40px 16px 16px 40px; box-shadow: 0 8px 22px rgba(0, 0, 0, .35); pointer-events: auto; cursor: pointer; text-align: left; }
.ph-frame:focus-visible { outline: 2px solid var(--ph-gold); outline-offset: 2px; }
.ph-portrait { position: relative; width: 60px; height: 60px; border-radius: 50%; }
.ph-ring { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(var(--ph-gold) calc(var(--p, 0) * 1turn), rgba(216, 180, 106, .18) 0); }
.ph-portrait img { position: absolute; inset: 4px; width: 52px; height: 52px; border-radius: 50%; object-fit: cover; object-position: 50% 12%; background: #18241f; border: 2px solid #0c1411; }
.ph-swap { background-image: var(--ph-i-swap) !important; background-position: center !important; background-size: 70% !important; background-repeat: no-repeat !important; font-size: 0 !important; position: absolute; left: calc(6px + env(safe-area-inset-left, 0px)); top: calc(4px + env(safe-area-inset-top, 0px)); z-index: 1; width: 28px; height: 28px; border-radius: 50%; padding: 0; display: grid; place-items: center; background: #0c1411; border: 2px solid #d8b46a; color: #f3d7a0; font: 700 14px/1 system-ui, sans-serif; cursor: pointer; pointer-events: auto; }
.ph-swap[hidden] { display: none; }
@media (pointer: coarse) { .ph-swap { width: 40px; height: 40px; left: calc(2px + env(safe-area-inset-left, 0px)); top: calc(2px + env(safe-area-inset-top, 0px)); font-size: 18px; } }
.ph-lvl { position: absolute; right: -4px; bottom: -4px; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; display: grid; place-items: center;
  background: linear-gradient(#e6c47c, #b88d3f); color: #1a1408; font: 700 12px/1 system-ui, sans-serif; border: 2px solid #0c1411; }
.ph-name { font: 600 16px/1.15 Georgia, "Libre Caslon Text", serif; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ph-title { color: var(--ph-gold); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; margin-top: 2px; }
.ph-xp { color: var(--ph-dim); font-size: 11px; margin-top: 2px; }
.ph-hp, .ph-st { position: relative; margin-top: 6px; border-radius: 7px; border: 1.5px solid #c9a35a; box-shadow: inset 0 1px 3px rgba(0, 0, 0, .65), 0 0 0 1px #0c1411; overflow: hidden; }
.ph-hp { height: 12px; background: #2a1412; }
.ph-hp > i, .ph-st > i { position: absolute; left: 0; top: 0; bottom: 0; }
.ph-hp .ph-trail { background: linear-gradient(180deg, #fff3d6, #f2b968); transition: width .7s ease .4s; }
.ph-hp .ph-fill { background: linear-gradient(180deg, #ff7a66 0%, #d6303a 52%, #8f1420 100%); transition: width .15s ease; }
.ph-hp .ph-fill::after, .ph-st .ph-sfill::after { content: ""; position: absolute; left: 2px; right: 2px; top: 1px; height: 40%; border-radius: 4px; background: linear-gradient(rgba(255, 255, 255, .42), rgba(255, 255, 255, 0)); }
.ph-hp::before, .ph-st::before { content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(0, 0, 0, .42) calc(10% - 1px) 10%); }
.ph-hp.ph-heal .ph-fill { animation: ph-heal .7s ease-out; }
@keyframes ph-heal { 0% { filter: none; box-shadow: none; } 30% { filter: brightness(1.35) hue-rotate(80deg); box-shadow: 0 0 10px #8fe39b; } 100% { filter: none; } }
.ph-hp.ph-low .ph-fill { animation: ph-pulse 1s ease-in-out infinite; }
@keyframes ph-pulse { 50% { filter: brightness(1.45); } }
.ph-hp::after, .ph-st::after { content: attr(data-num); position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; font: 700 9px/1 system-ui, sans-serif; color: #fff; text-shadow: 0 1px 2px #000; opacity: 0; transition: opacity .15s; }
.ph-frame:hover .ph-hp::after, .ph-frame:hover .ph-st::after, .ph-frame.ph-nums .ph-hp::after, .ph-frame.ph-nums .ph-st::after { opacity: 1; }
.ph-st { height: 8px; margin-top: 4px; background: #0f2624; max-height: 12px; transition: opacity .4s, max-height .4s, margin .4s; }
.ph-st .ph-sfill { background: linear-gradient(180deg, #8ff3e4 0%, #2fb9aa 55%, #16756d 100%); transition: width .12s linear; }
.ph-st.ph-hide { opacity: 0; max-height: 0; margin-top: 0; border-width: 0; }
.ph-st.ph-winded .ph-sfill { background: repeating-linear-gradient(135deg, #4d6b68 0 4px, #33504d 4px 8px); }
.ph-st.ph-flash { animation: ph-flash .35s ease-out 2; }
@keyframes ph-flash { 50% { border-color: #ff8f7a; box-shadow: 0 0 8px #ff8f7a; } }
.ph-vignette { position: fixed; inset: 0; pointer-events: none; z-index: 9; background: radial-gradient(ellipse at center, transparent 55%, rgba(150, 10, 20, .38) 100%); opacity: 0; transition: opacity .4s; }
.ph-vignette.ph-on { opacity: 1; animation: ph-vig 1.6s ease-in-out infinite; }
@keyframes ph-vig { 50% { opacity: .55; } }
body.st-winded .ts-btn[data-skill="dash"], body.st-winded .ftf-cast-slot[data-id="dash"] { filter: grayscale(1) brightness(.7); }
.ph-quest { position: absolute; top: calc(98px + env(safe-area-inset-top, 0px)); left: calc(14px + env(safe-area-inset-left, 0px)); max-width: 290px; }
.ph-wallet { position: absolute; top: calc(62px + env(safe-area-inset-top, 0px)); right: calc(18px + env(safe-area-inset-right, 0px)); display: flex; gap: 8px; align-items: center; pointer-events: auto; }
.ph-coin, .ph-chest { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 4px 14px 4px 6px; background: var(--ph-bg); border: 1px solid var(--ph-line); border-radius: 20px; box-shadow: 0 6px 16px rgba(0, 0, 0, .3); cursor: pointer; }
.ph-coin i { width: 30px; height: 30px; flex: none; background: var(--ph-coin) center / 30px 30px no-repeat; }
.ph-coin.ph-spin i { background-image: var(--ph-coin-spin); background-size: 240px 30px; background-position: 0 0; animation: ph-spin .5s steps(8) 2; }
@keyframes ph-spin { to { background-position: -240px 0; } }
.ph-coin b { font: 600 17px/1 Georgia, "Libre Caslon Text", serif; font-variant-numeric: tabular-nums; min-width: 3ch; text-align: right; }
.ph-coin.ph-bump b { color: var(--ph-gold); }
.ph-coin .ph-silk { display: grid; justify-items: end; line-height: 1; }
.ph-coin .ph-sub { font: 600 11px/1.1 system-ui, sans-serif; color: #f2c46b; white-space: nowrap; }
.ph-coin .ph-sub.ph-muted { color: rgba(243, 234, 216, .6); }
.ph-sync { min-height: 28px; padding: 2px 9px; border-radius: 14px; border: 1px solid var(--ph-line); background: var(--ph-bg); color: #f2c46b; font: 600 12px/1 system-ui, sans-serif; cursor: pointer; }
.ph-chest { padding: 4px 12px 4px 8px; font-weight: 700; color: var(--ph-gold); }
.ph-chest[hidden] { display: none; }
.ph-delta { position: absolute; right: 22px; top: 44px; font: 700 15px/1 system-ui, sans-serif; pointer-events: none; animation: ph-float 1.2s ease-out forwards; text-shadow: 0 1px 3px rgba(0, 0, 0, .7); }
.ph-delta.ph-plus { color: #9be3a9; } .ph-delta.ph-minus { color: #f19a8a; }
@keyframes ph-float { from { opacity: 0; transform: translateY(0); } 15% { opacity: 1; } to { opacity: 0; transform: translateY(26px); } }
.ph-toasts { position: absolute; top: calc(112px + env(safe-area-inset-top, 0px)); right: calc(18px + env(safe-area-inset-right, 0px)); display: flex; flex-direction: column; gap: 6px; align-items: flex-end; max-width: min(340px, 70vw); }
.ph-toast { padding: 8px 14px; background: var(--ph-bg); border: 1px solid var(--ph-line); border-left: 3px solid var(--ph-gold); border-radius: 10px; box-shadow: 0 6px 16px rgba(0, 0, 0, .3); animation: ph-in .25s ease-out; }
.ph-lvl.ph-up { animation: ph-lvlup .9s ease-out; }
@keyframes ph-lvlup { 0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255, 200, 96, .9); } 35% { transform: scale(1.45); box-shadow: 0 0 0 8px rgba(255, 200, 96, .35); } 100% { transform: scale(1); box-shadow: 0 0 0 14px rgba(255, 200, 96, 0); } }
.ph-toast.ph-out { opacity: 0; transform: translateX(12px); transition: opacity .3s, transform .3s; }
@keyframes ph-in { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
/* the town's own pieces, restyled to match while the HUD is on */
body.ph-on .ftf-town-profile { display: none; }
body.ph-on .ftf-town-objective { top: calc(114px + env(safe-area-inset-top, 0px)); left: calc(14px + env(safe-area-inset-left, 0px)); max-width: min(290px, calc(100% - 28px));
  background: rgba(12, 20, 17, .86); border: 1px solid rgba(201, 163, 90, .55); border-radius: 12px; pointer-events: auto; cursor: pointer; }
body.ph-on.ph-quest-min .ftf-town-objective { max-width: 44px; overflow: hidden; white-space: nowrap; color: transparent; }
body.ph-on .ftf-quest-meta button { background: rgba(12, 20, 17, .86); border-color: rgba(201, 163, 90, .55); text-shadow: none; }
body.ph-on .ftf-quest-meta { top: calc(162px + env(safe-area-inset-top, 0px)); left: calc(14px + env(safe-area-inset-left, 0px)); }
body.ph-on #toast { display: none !important; }
/* the skill bar (scenes/town-casting.js) in the same palette; its health line moves into the frame */
body.ph-on .ftf-cast-bar { background: rgba(12, 20, 17, .82); border: 1px solid rgba(201, 163, 90, .55); box-shadow: 0 8px 22px rgba(0, 0, 0, .35); }
body.ph-on .ftf-cast-slot { border-color: rgba(201, 163, 90, .45); }
body.ph-on .ftf-hp { display: none; }
/* declutter (owner, 12.11): persistent labels become icons with a tooltip; one short line where text stays */
.ph-help { width: 40px; height: 40px; border-radius: 50%; background: var(--ph-bg) var(--ph-i-help) center / 24px no-repeat; font-size: 0 !important; border: 1px solid var(--ph-line); color: var(--ph-gold); font: 700 17px/1 Georgia, serif; cursor: pointer; box-shadow: 0 6px 16px rgba(0, 0, 0, .3); }
body.ph-on .ftf-town-objective { box-sizing: border-box; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: min(340px, calc(100% - 28px)); padding-left: 38px; }
body.ph-on .ftf-town-objective::before { content: ""; position: absolute; left: 10px; top: 50%; width: 20px; height: 20px; margin: -10px 0 0; border-radius: 0; box-shadow: none; background: var(--ph-i-quest) center / contain no-repeat; }
body.ph-on.ph-quest-min .ftf-town-objective { white-space: normal; max-width: min(340px, calc(100% - 28px)); color: inherit; }
body.ph-on .ftf-quest-meta button { width: 40px; height: 40px; min-height: 40px; padding: 0; font-size: 0; background: rgba(12, 20, 17, .86) ${I_SKIP} center / 20px no-repeat; }
body.ph-on .ftf-quest-meta { top: calc(162px + env(safe-area-inset-top, 0px)); }
body.ph-on .ftf-scene-tools .ftf-btn-label, body.ph-on .ftf-scene-tools .ftf-scene-hint { display: none; }
body.ph-on .ftf-scene-tools .ftf-btn { min-width: 40px; min-height: 40px; padding: 0 9px; }
body.ph-on .ftf-chat-chip[data-n] span { display: none; }
body.ph-on .ftf-chat-chip[data-n]::after { content: attr(data-n); padding-left: 24px; min-height: 20px; line-height: 20px; background: var(--ph-i-players) left center / 20px no-repeat; }
body.ph-on .ftf-altar-timer { padding: 4px 10px 4px 32px !important; font-size: 12px !important; background-image: var(--ph-i-altar) !important; background-repeat: no-repeat !important; background-position: 8px center !important; background-size: 18px !important; }
.ph-toast { max-width: min(320px, 70vw); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
@media (max-width: 700px), (max-height: 500px) {
  .ph-frame { min-width: 0; max-width: 200px; gap: 8px; padding: 5px 10px 5px 5px; }
  .ph-portrait { width: 46px; height: 46px; } .ph-portrait img { inset: 3px; width: 40px; height: 40px; }
  .ph-name, .ph-title, .ph-xp { display: none; } .ph-frame { padding-right: 12px; } .ph-hp, .ph-st { width: 70px; } .ph-hp { margin-top: 0; }
  body.ph-on .ftf-town-objective { top: calc(108px + env(safe-area-inset-top, 0px)); max-width: max(140px, 34vw); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  body.ph-on.ph-quest-min .ftf-town-objective { white-space: normal; max-width: calc(100% - 28px); color: inherit; } /* on a phone a tap unfolds the one-line tracker */
  body.ph-on .ftf-quest-meta { top: calc(152px + env(safe-area-inset-top, 0px)); }
  .ph-wallet { top: calc(60px + env(safe-area-inset-top, 0px)); }
  .ph-coin b { font-size: 15px; }
  .ph-toasts { top: calc(110px + env(safe-area-inset-top, 0px)); }
}
@media (prefers-reduced-motion: reduce) { .ph-lvl.ph-up, .ph-delta, .ph-toast, .ph-hp .ph-fill, .ph-st, .ph-vignette { animation: none !important; } .ph-hp > i, .ph-st > i { transition: none; } }
`;

/** Silk in hundredths → the shown text (two decimals, as the profile shows it). */
export const formatSilk = (cents) => (Math.round(cents) / 100).toFixed(2);

/** Pure: the frame model from the ledger level and health. */
export function frameModel({ level, hp = 100, maxHp = 100 }) {
  const p = level && level.need ? Math.max(0, Math.min(1, level.into / level.need)) : 0;
  const h = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 1;
  return { level: level ? level.level : 1, title: level ? level.title : 'newcomer', progress: p, hp: h, low: h < 0.3, xp: level ? `${level.into} / ${level.need} XP` : '' };
}

/** Pure: a wallet change → the floating delta ({text, sign}) or null when nothing changed. */
export function walletDelta(prev, next) {
  if (prev == null || next == null || prev === next) return null;
  const d = next - prev;
  return { text: (d > 0 ? '+' : '−') + formatSilk(Math.abs(d)), sign: d > 0 ? 'plus' : 'minus' };
}

/**
 * @param {{doc?: Document, t: Function, ledger: object, chests?: object, base?: string, nickname?: () => string|null,
 *   skin?: () => 'iris'|'elise', onProfile?: Function, onChests?: Function, reducedMotion?: () => boolean}} o
 */
export function createPlayerHud({ doc = document, t, ledger, chests = null, base = '/', nickname = () => null, skin = () => 'iris', onProfile = () => {}, onChests = null, onSkin = () => {}, canSwap = () => false, reducedMotion = () => false }) {
  // the HUD glyphs (art/ui build_hud_icons.py: gold glyph, dark outline): one place, CSS custom properties
  const glyph = (n) => `url("${base}assets/ui/icons/hud/${n}_glyph_48.webp")`;
  if (doc.documentElement && doc.documentElement.style && doc.documentElement.style.setProperty) {
    for (const [k, n] of [['quest', 'quest'], ['altar', 'altar'], ['players', 'players'], ['help', 'help'], ['swap', 'heroine_switch']]) doc.documentElement.style.setProperty('--ph-i-' + k, glyph(n));
  }
  if (!(doc.getElementById && doc.getElementById('ph-style'))) { const st = doc.createElement('style'); st.id = 'ph-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const root = el('div', 'ph'); root.hidden = true;

  const frame = el('button', 'ph-frame'); frame.type = 'button';
  const portrait = el('div', 'ph-portrait'); const ring = el('i', 'ph-ring'); const img = el('img'); img.alt = ''; const lvl = el('span', 'ph-lvl');
  portrait.append(ring, img, lvl);
  // the heroine switch (Iris <-> Elise) sits on the portrait's rim: its own button, not inside the frame button
  const swap = el('button', 'ph-swap', '⇄'); swap.type = 'button'; swap.hidden = true;
  swap.addEventListener('pointerdown', (e) => e.stopPropagation());
  swap.addEventListener('click', (e) => { e.stopPropagation(); onSkin(); setTimeout(renderStatic, 60); });
  const info = el('div'); const name = el('div', 'ph-name'); const title = el('div', 'ph-title'); const xp = el('div', 'ph-xp');
  const hp = el('div', 'ph-hp'); hp.setAttribute('role', 'meter'); hp.setAttribute('aria-valuemin', '0'); hp.setAttribute('aria-valuemax', '100');
  const trail = el('i', 'ph-trail'), fill = el('i', 'ph-fill'); hp.append(trail, fill);
  const st = el('div', 'ph-st ph-hide'); st.setAttribute('role', 'meter'); st.setAttribute('aria-valuemin', '0'); st.setAttribute('aria-valuemax', '100');
  const sfill = el('i', 'ph-sfill'); st.append(sfill);
  info.append(name, title, xp, hp, st); frame.append(portrait, info);
  // numbers on hover (CSS) or a long press on touch
  let pressT = 0;
  frame.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') pressT = setTimeout(() => { frame.classList.add('ph-nums'); setTimeout(() => frame.classList.remove('ph-nums'), 2500); }, 450); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) frame.addEventListener(ev, () => clearTimeout(pressT));
  const vignette = el('div', 'ph-vignette'); vignette.setAttribute('aria-hidden', 'true');
  frame.addEventListener('pointerdown', (e) => e.stopPropagation());
  frame.addEventListener('click', () => onProfile());

  const wallet = el('div', 'ph-wallet');
  const coin = el('button', 'ph-coin'); coin.type = 'button';
  // the coin (art/ui: silk_coin_96 at 2x) and its half-turn spin strip (8 frames of 96 px) played on a gain
  const icon = el('i'); icon.setAttribute('aria-hidden', 'true');
  coin.style.setProperty('--ph-coin', `url("${base}assets/ui/icons/silk_coin_96.webp")`);
  coin.style.setProperty('--ph-coin-spin', `url("${base}assets/ui/icons/silk_coin_spin.webp")`);
  // the ONE silk number (net/silk-core.js; sprint 6.2): line 1 is the silk recorded on NEAR, the number the portal and
  // the tracker show; line 2 says what is waiting to be recorded, or that the network is not answering
  const count = el('b'); const sub = el('small', 'ph-sub');
  const silkBox = el('span', 'ph-silk'); silkBox.append(count, sub);
  coin.append(icon, silkBox);
  const sync = el('button', 'ph-sync'); sync.type = 'button'; sync.hidden = true;
  sync.addEventListener('pointerdown', (e) => e.stopPropagation());
  sync.addEventListener('click', () => { syncSilkNow().catch(() => {}); });
  const chest = el('button', 'ph-chest'); chest.type = 'button'; chest.hidden = true;
  // "?" tray: the premise card again (shown once per browser on its own; ui/premise.js)
  const help = el('button', 'ph-help', '?'); help.type = 'button';
  help.addEventListener('pointerdown', (e) => e.stopPropagation());
  help.addEventListener('click', () => { showPremise(doc, t, { force: true, reducedMotion: reducedMotion() }); });
  wallet.append(help, coin, sync, chest);
  for (const b of [coin, chest]) { b.addEventListener('pointerdown', (e) => e.stopPropagation()); }
  coin.addEventListener('click', () => onProfile());
  chest.addEventListener('click', () => (onChests || onProfile)());

  const toasts = el('div', 'ph-toasts'); toasts.setAttribute('aria-live', 'polite');
  root.append(vignette, frame, swap, wallet, toasts);
  doc.body.append(root);

  // the quest tracker is the town's own objective line, moved under the frame by CSS; a tap folds it to a dot
  const objective = () => doc.querySelector('.ftf-town-objective');
  if (doc.addEventListener) doc.addEventListener('click', (e) => { const o = objective(); if (o && root.hidden === false && (e.target === o)) doc.body.classList.toggle('ph-quest-min'); }, true);

  let shown = null, anim = null, lastSkin = '', lastName = null, visible = false, lastLevel = 0;
  function renderStatic() {
    const lv = frameModel({ level: ledger.level });
    ring.style.setProperty('--p', String(lv.progress));
    // a level gained since the last render: the badge pulses once (the toast and the burst are play/kill-xp.js)
    if (lastLevel && lv.level > lastLevel && !reducedMotion()) { lvl.classList.remove('ph-up'); void lvl.offsetWidth; lvl.classList.add('ph-up'); }
    lastLevel = lv.level; lvl.textContent = String(lv.level);
    title.textContent = t('profile.title.' + lv.title); xp.textContent = lv.xp;
    const n = nickname() || t('menu.traveller'); if (n !== lastName) { name.textContent = n; lastName = n; }
    const s = skin(); if (s !== lastSkin) { img.src = base + 'assets/cards/' + s + '.webp'; lastSkin = s; }
    swap.hidden = !canSwap(); swap.setAttribute('aria-label', t('hud.skin')); swap.title = t('hud.skin');
    frame.setAttribute('aria-label', `${n} · ${t('profile.button', { level: lv.level })}`);
    const sealed = chests && chests.sealed ? chests.sealed().length : 0;
    chest.hidden = !sealed; chest.textContent = sealed ? '▣ ' + sealed : ''; chest.setAttribute('aria-label', t('chest.badge', { n: sealed }));
  }
  function floatDelta(d) {
    if (!d || reducedMotion()) return;
    const f = el('span', 'ph-delta ph-' + d.sign, d.text); wallet.append(f); setTimeout(() => f.remove(), 1300);
  }
  function setCount(cents) {
    count.textContent = formatSilkC(cents);
  }
  let lastLocal = null;
  function renderSilk() {
    const v = silkView();
    // the line under the number and the breakdown (the same words as the wallet card)
    sub.className = 'ph-sub' + (v.stale || !v.chainOk ? ' ph-muted' : '');
    sub.textContent = v.stale ? t('silk.offline') : !v.chainOk ? t('silk.checking') : v.syncing ? t('silk.syncing') : v.pendingC > 0 ? t('silk.waiting', { n: formatSilkC(v.pendingC) }) : '';
    sub.hidden = !sub.textContent;
    sync.hidden = !(v.chainOk && v.pendingC > 0 && !v.syncing); sync.textContent = t('silk.sync');
    const tip = [t('silk.tip.gate', { n: formatSilkC(v.gateC) }), t('silk.tip.chain', { n: formatSilkC(v.onChainC) }),
      ...(v.pendingC > 0 ? [t('silk.tip.pending', { n: formatSilkC(v.pendingC) })] : []), ...(v.playC > 0 ? [t('silk.tip.play', { n: formatSilkC(v.playC) })] : []),
      t('silk.tip.total', { n: formatSilkC(v.totalC) }), t('silk.tip.fee', { n: formatSilkC(v.feeC) }), ...(v.pendingC > 0 ? [t('silk.tip.sync')] : [])];
    coin.title = tip.join('\n'); coin.setAttribute('aria-label', t('town.silk') + ': ' + tip.join('. '));
    // every gain floats by the coin at once (it may still be waiting or play silk); line 1 moves with the chain number
    if (lastLocal != null && ledger.silk !== lastLocal) floatDelta(walletDelta(lastLocal, ledger.silk));
    lastLocal = ledger.silk;
    const target = v.gateC;
    if (shown == null) { shown = target; setCount(target); return; }
    if (target === shown) return;
    if (reducedMotion()) { shown = target; setCount(target); return; }
    const from = shown, t0 = performance.now(), dur = 650;
    coin.classList.add('ph-bump');
    if (target > from) { coin.classList.remove('ph-spin'); void coin.offsetWidth; coin.classList.add('ph-spin'); setTimeout(() => coin.classList.remove('ph-spin'), 1050); }
    if (anim) cancelAnimationFrame(anim);
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      setCount(from + (target - from) * e);
      if (k < 1) anim = requestAnimationFrame(step); else { anim = null; coin.classList.remove('ph-bump'); }
    };
    shown = target; anim = requestAnimationFrame(step);
  }
  const unLedger = ledger.subscribe ? ledger.subscribe(() => { renderStatic(); renderSilk(); }) : null;
  const unSilk = subscribeSilk(() => renderSilk());
  const unChests = chests && chests.subscribe ? chests.subscribe(renderStatic) : null;
  renderStatic(); renderSilk();

  let lastHp = -1;
  return {
    root,
    /** Per frame: visible only in the town phase; health from the combat layer. */
    update({ visible: v, hp: h = 100, maxHp = 100, stamina = null } = {}) {
      if (v !== visible) { visible = v; root.hidden = !v; doc.body.classList.toggle('ph-on', v); if (v) renderStatic(); }
      if (!v) { vignette.classList.remove('ph-on'); return; }
      const m = frameModel({ level: ledger.level, hp: h, maxHp });
      if (m.hp !== lastHp) {
        const healed = lastHp >= 0 && m.hp > lastHp + 0.001;
        const w = (m.hp * 100).toFixed(1) + '%';
        fill.style.width = w;
        // the trail lags on damage; on a heal it jumps with the fill and the fill shimmers green
        if (healed) { trail.style.transition = 'none'; trail.style.width = w; void trail.offsetWidth; trail.style.transition = ''; } else trail.style.width = w; // damage: the trail follows after its CSS delay
        if (healed && !reducedMotion()) { hp.classList.remove('ph-heal'); void hp.offsetWidth; hp.classList.add('ph-heal'); }
        lastHp = m.hp;
        const lowNow = m.hp < 0.25;
        hp.classList.toggle('ph-low', lowNow); vignette.classList.toggle('ph-on', lowNow && m.hp > 0);
        hp.setAttribute('aria-valuenow', String(Math.round(m.hp * 100))); hp.setAttribute('aria-label', t('hud.health'));
        hp.dataset.num = `${Math.round(h)} / ${maxHp}`;
      }
      if (stamina) {
        const r = stamina.ratio, sw = (r * 100).toFixed(1) + '%';
        if (sfill.style.width !== sw) sfill.style.width = sw;
        // a full, idle bar steps aside after three seconds; any use brings it back
        st.classList.toggle('ph-hide', r >= 0.999 && stamina.idle > 3 && !stamina.flash);
        st.classList.toggle('ph-winded', stamina.winded);
        if (stamina.flash > 0.9 && !st.classList.contains('ph-flash')) { st.classList.add('ph-flash'); setTimeout(() => st.classList.remove('ph-flash'), 750); }
        st.dataset.num = `${Math.round(stamina.value)} / 100`;
        st.setAttribute('aria-valuenow', String(Math.round(stamina.value))); st.setAttribute('aria-label', t('hud.stamina'));
      }
    },
    /** One toast in the stack (newest at the bottom, at most three). */
    toast(text, ms = 2400) {
      const n = el('div', 'ph-toast', text); toasts.append(n);
      while (toasts.children.length > 3) toasts.children[0].remove();
      setTimeout(() => { n.classList.add('ph-out'); setTimeout(() => n.remove(), 320); }, ms);
      return n;
    },
    refresh() { renderStatic(); renderSilk(); },
    dispose() { unSilk(); if (unLedger) unLedger(); if (unChests) unChests(); root.remove(); doc.body.classList.remove('ph-on'); },
  };
}
