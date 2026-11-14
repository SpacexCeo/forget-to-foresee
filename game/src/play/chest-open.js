// The open-case moment (night plan 12.11, "Loot chests from monsters"): a sealed chest from the bag is sent to the
// chest service (net/chest-client.js); while it answers, a reel of possible rewards spins; with the answer the reel
// slows and lands on the real outcome, the reward card rises in its rarity frame (art: assets/cards/loot), a chime and
// a short vibration play (audio/town-audio.js cue → haptics), and the card says whether the opening is verified: the
// leaf and the Merkle proof recomputed in this browser against the root committed on chain, and the draw's random
// value against the on-chain seed (net/chest.js). Reduced motion: no reel, the card
// fades in. No service, no outcome: the chest stays sealed and the panel says why.
import { cue } from '../audio/town-audio.js';
import { rewardArt } from './chest-history.js';
// the plain message keys (net/chest-client.js CHEST_ERRORS; kept here so this panel loads without the net code)
const ERR_KEYS = ['off', 'soon', 'rate', 'daily', 'sold_out', 'no_guest', 'no_key', 'network', 'tx_failed', 'no_opening', 'stale', 'replayed', 'deck_mismatch', 'request'];

const FRAME = Object.freeze({ common: 'common', uncommon: 'common', rare: 'rare', epic: 'epic', legendary: 'legendary', nft: 'mythic' });
const GLOW = Object.freeze({ common: '#cfc6ad', uncommon: '#2fc4b2', rare: '#5fb6ff', epic: '#c77dff', legendary: '#ffc46b', mythic: '#ffe7a8' });
export const REEL = Object.freeze({ tiles: 46, land: 40, tile: 108, seconds: 5.2 });

const CSS = `
.co { position: fixed; inset: 0; z-index: 45; display: flex; overflow-y: auto; padding: 16px 0; background: radial-gradient(ellipse at 50% 45%, rgba(20, 30, 28, .92), rgba(3, 6, 6, .96)); color: #e9e6dc; font: 15px/1.45 system-ui, sans-serif; }
.co-box { margin: auto; width: min(760px, calc(100vw - 24px)); display: grid; gap: 16px; justify-items: center; text-align: center; }
.co-title { font: 600 13px/1.2 system-ui; letter-spacing: .18em; text-transform: uppercase; color: #d9b26a; }
.co-reel { position: relative; width: 100%; height: 132px; overflow: hidden; border-radius: 14px; border: 1px solid rgba(214, 226, 214, .14); background: rgba(10, 16, 15, .8);
  mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent); -webkit-mask-image: linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent); }
.co-strip { position: absolute; top: 12px; left: 50%; display: flex; gap: 8px; will-change: transform; }
.co-tile { flex: 0 0 100px; height: 108px; border-radius: 12px; display: grid; place-items: center; background: linear-gradient(160deg, #18211f, #101716); box-shadow: inset 0 0 0 1px var(--g, rgba(214,226,214,.2)), inset 0 -18px 30px -18px var(--g, transparent); }
.co-tile img { width: 64px; height: 64px; object-fit: contain; }
.co-tile b { font: 600 22px/1 "Cormorant Garamond", Georgia, serif; color: var(--g, #e9e6dc); }
.co-mark { position: absolute; top: 4px; bottom: 4px; left: 50%; width: 2px; transform: translateX(-1px); background: #d9b26a; box-shadow: 0 0 10px #d9b26a; }
.co-card { position: relative; width: min(250px, 62vw, calc((100vh - 220px) * .6667)); min-width: 150px; aspect-ratio: 2 / 3; opacity: 0; transform: translateY(24px) scale(.94); transition: opacity .5s ease, transform .6s cubic-bezier(.2, 1.4, .4, 1); }
.co-card.co-in { opacity: 1; transform: none; }
.co-card .co-frame { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.co-card .co-art { position: absolute; left: 16%; right: 16%; top: 18%; height: 42%; display: grid; place-items: center; border-radius: 10px; background: radial-gradient(circle, var(--g) 0%, transparent 70%); }
.co-card .co-art img { width: 70%; height: 70%; object-fit: contain; filter: drop-shadow(0 6px 10px rgba(0,0,0,.5)); }
.co-card .co-art b { font: 600 46px/1 "Cormorant Garamond", Georgia, serif; color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
.co-card .co-name { position: absolute; left: 12%; right: 12%; top: 64%; font: 600 20px/1.15 "Cormorant Garamond", Georgia, serif; }
.co-card .co-rar { position: absolute; left: 12%; right: 12%; top: 77%; font: 600 11px/1.2 system-ui; letter-spacing: .16em; text-transform: uppercase; color: var(--g); }
.co-glow { position: absolute; inset: -30%; background: radial-gradient(circle, var(--g) 0%, transparent 60%); opacity: .35; pointer-events: none; }
.co-ver { font-size: 13px; max-width: 560px; } .co-ver b { color: #7fd18b; } .co-ver.co-no b { color: #ff8a7a; }
.co-ver code { font: 12px ui-monospace, monospace; color: rgba(233,230,220,.75); word-break: break-all; }
.co a { color: #d9b26a; }
.co-note { color: rgba(233, 230, 220, .62); font-size: 13px; max-width: 520px; }
.co-btns { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.co-btn { min-height: 44px; padding: 10px 22px; border-radius: 10px; border: 0; cursor: pointer; font: 700 15px/1 system-ui; color: #14201c; background: linear-gradient(135deg, #e6c27e, #c99a48); }
.co-btn.co-ghost { color: #e9e6dc; background: transparent; border: 1px solid rgba(214, 226, 214, .22); }
.co-chest { position: relative; width: 120px; height: 96px; margin-top: 18px; }
.co-chest .co-base { position: absolute; left: 0; right: 0; bottom: 0; height: 60px; border-radius: 6px 6px 10px 10px; background: linear-gradient(180deg, #6b4a26, #3d2912); box-shadow: inset 0 0 0 3px #c99a48, 0 10px 24px rgba(0,0,0,.5); }
.co-chest .co-lid { position: absolute; left: -4px; right: -4px; bottom: 56px; height: 34px; border-radius: 40px 40px 6px 6px; background: linear-gradient(180deg, #7d5730, #4a3218); box-shadow: inset 0 0 0 3px #c99a48; transform-origin: 50% 100%; transition: transform .4s cubic-bezier(.2,.9,.3,1.2); }
.co-chest .co-lock { position: absolute; left: 50%; bottom: 40px; width: 16px; height: 18px; margin-left: -8px; border-radius: 3px; background: #e6c27e; }
.co-chest .co-beam { position: absolute; left: 50%; bottom: 60px; width: 60px; height: 0; margin-left: -30px; background: linear-gradient(0deg, var(--g, #fff), transparent); opacity: 0; filter: blur(2px); transition: height .5s ease-out, opacity .5s ease-out; }
.co-chest.co-shake { animation: co-shake .0833s linear infinite alternate; }
@keyframes co-shake { from { transform: translateX(-4px); } to { transform: translateX(4px); } }
.co-chest.co-opened .co-lid { transform: rotateX(70deg) translateY(-6px); }
.co-chest.co-opened .co-beam { height: 220px; opacity: .85; }
.co-chest.co-fade { opacity: 0; transition: opacity .4s ease; }
@media (prefers-reduced-motion: reduce) { .co-card { transition: opacity .2s linear; transform: none; } .co-chest { display: none; } }
html[data-motion="reduce"] .co-card { transition: opacity .2s linear; transform: none; }
html[data-motion="reduce"] .co-chest { display: none; }
`;

/** What one outcome shows: {label, icon|null, glyph|null, rarity, frame}. Pure. */
export function outcomeView(outcome, { t, items = [], base = '/' }) {
  const o = outcome || {};
  const rarity = o.kind === 'nft' ? 'nft' : (o.rarity || 'common');
  const frame = FRAME[rarity] || 'common';
  if (o.kind === 'item') {
    const it = items.find((x) => x.id === o.id);
    return { label: it ? t(it.nameKey) : (o.id || '?'), icon: it ? base + 'assets/items/' + (it.icon128 || it.icon) : null, glyph: it ? null : '?', rarity, frame };
  }
  // the painted silk and XP piles and NFT art (assets/items/icons, play/chest-history.js rewardArt)
  const art = rewardArt(o, 256);
  if (o.kind === 'silk') return { label: t('chest.out.silk', { n: o.amount || 0 }), icon: art ? base + 'assets/items/' + art : null, glyph: art ? null : '◈', rarity, frame };
  if (o.kind === 'xp') return { label: t('chest.out.xp', { n: o.amount || 0 }), icon: art ? base + 'assets/items/' + art : null, glyph: art ? null : '✦', rarity, frame };
  if (o.kind === 'title') return { label: t('chest.out.title', { title: t('wheel.title.' + o.id) }), icon: null, glyph: '❦', rarity, frame };
  if (o.kind === 'nft') { const it = items.find((x) => x.id === o.id); const pic = art || (it ? it.icon128 || it.icon : null); return { label: it ? t('chest.out.nftOf', { item: t(it.nameKey) }) : t('chest.out.nft'), icon: pic ? base + 'assets/items/' + pic : null, glyph: pic ? null : '✧', rarity, frame }; }
  return { label: '?', icon: null, glyph: '?', rarity, frame };
}

/** The reel's filler tiles: a mix of the manifest's items and the other reward kinds (looks only; the landing tile is the outcome). */
export function reelTiles(items, rand, n = REEL.tiles) {
  const kinds = ['silk', 'xp', 'item', 'item', 'item']; // the deck's kinds (docs/chests.md): no titles
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = rand() < 0.04 ? 'nft' : kinds[Math.floor(rand() * kinds.length)];
    const it = items.length ? items[Math.floor(rand() * items.length)] : null;
    out.push(k === 'item' && it ? { kind: 'item', id: it.id, rarity: it.rarity || 'common' } : { kind: k === 'item' ? 'silk' : k, rarity: k === 'nft' ? 'nft' : ['common', 'uncommon', 'rare', 'epic'][Math.floor(rand() * 4)], amount: 0, id: 'seeker' });
  }
  return out;
}

/**
 * Opens one chest. Resolves with {ok, opening?, verification?, error?} when the panel closes.
 * @param {object} o
 * @param {Document} [o.doc] @param {Function} o.t @param {object} o.chest a sealed chest from the bag
 * @param {object} o.client chest client @param {string|null} o.guest the Day-1 guest account
 * @param {Promise<object[]>|object[]} [o.items] manifest items @param {string} [o.base]
 * @param {(opening: object, verification: object) => void} [o.onSettled] pays the reward and settles the chest
 * @param {string} [o.explorer] @param {() => number} [o.rand]
 */
export function openChestReveal({ doc = document, t, chest, client, guest, items = [], base = (import.meta.env && import.meta.env.BASE_URL) || '/', onSettled = () => {}, explorer = 'https://testnet.nearblocks.io', rand = Math.random }) {
  if (!(doc.getElementById && doc.getElementById('co-style'))) { const st = doc.createElement('style'); st.id = 'co-style'; st.textContent = CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const reduced = (() => { try { return doc.documentElement.dataset.motion === 'reduce' || (doc.defaultView && doc.defaultView.matchMedia && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } })();
  const root = el('div', 'co'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('chest.title'));
  const box = el('div', 'co-box');
  const title = el('div', 'co-title', t('chest.opening.' + chest.tier));
  const reel = el('div', 'co-reel'); const strip = el('div', 'co-strip'); reel.append(strip, el('div', 'co-mark'));
  // the sealed chest (sprint 6.5): it shakes while NEAR answers, then the lid swings open and a beam of the outcome's
  // rarity colour bursts out before the reel lands (instant cut under reduced motion: the chest is not shown)
  const chestEl = el('div', 'co-chest'); const beamEl = el('div', 'co-beam');
  chestEl.append(beamEl, el('div', 'co-base'), el('div', 'co-lid'), el('div', 'co-lock')); chestEl.setAttribute('aria-hidden', 'true');
  const stage = el('div'); stage.style.position = 'relative';
  const info = el('div'); info.setAttribute('aria-live', 'polite');
  const btns = el('div', 'co-btns');
  box.append(title, chestEl, reel, stage, info, btns);
  root.append(box);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && done) close(); });
  doc.body.append(root);
  let done = false, resolveP;
  const result = new Promise((r) => { resolveP = r; });
  let outcomeResult = { ok: false, error: 'closed' };
  function close() { root.remove(); resolveP(outcomeResult); }
  const closeBtn = () => { const b = el('button', 'co-btn', t('chest.close')); b.type = 'button'; b.addEventListener('click', close); btns.replaceChildren(b); b.focus && b.focus(); done = true; };

  // the reel never waits long for the manifest: after 1.5 s it spins with the reward kinds alone
  Promise.race([Promise.resolve(items), new Promise((r) => setTimeout(() => r([]), 1500))]).then((list) => {
    const tiles = reelTiles(list, rand);
    const tileEl = (o, from = list) => {
      const v = outcomeView(o, { t, items: from, base });
      const d = el('div', 'co-tile'); d.style.setProperty('--g', GLOW[v.frame === 'mythic' ? 'mythic' : v.rarity] || GLOW.common);
      if (v.icon) { const i = el('img'); i.src = v.icon; i.alt = ''; d.append(i); } else d.append(el('b', null, v.glyph));
      return d;
    };
    tiles.forEach((o) => strip.append(tileEl(o)));
    // idle spin while the service answers
    let x = -6 * REEL.tile, spinning = !reduced, raf = 0; // start with the strip already under the whole window
    const win = doc.defaultView || globalThis;
    const tick = () => { if (!spinning) return; x -= 9; if (-x > (REEL.tiles - 12) * REEL.tile) x = -6 * REEL.tile; strip.style.transform = `translateX(${x}px)`; raf = win.requestAnimationFrame ? win.requestAnimationFrame(tick) : 0; };
    if (!reduced) tick(); else reel.hidden = true;
    info.replaceChildren(el('p', 'co-note', t('chest.asking')));
    if (!reduced) chestEl.classList.add('co-shake'); else chestEl.hidden = true;

    return client.open({ guest, chestId: chest.id, source: chest.source }).then(async (r) => {
      if (!r.ok) {
        spinning = false; if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
        reel.hidden = true; chestEl.classList.remove('co-shake'); // no answer, no opening: the chest stays shut
        outcomeResult = { ok: false, error: r.error };
        cue('ui_error');
        info.replaceChildren(el('p', null, t('chest.err.' + (ERR_KEYS.includes(r.error) ? r.error : 'bad'))), el('p', 'co-note', t('chest.stillSealed')));
        closeBtn();
        return;
      }
      const op = r.opening;
      // the landing tile and the card name the real item: wait a little more for the manifest here
      const full = await Promise.race([Promise.resolve(items), new Promise((r) => setTimeout(() => r(list), 3000))]).catch(() => list);
      const verification = op.verification || { verified: false, leafOk: false, proofOk: false, randomOk: false, chainOk: null };
      // land the reel on the outcome
      const land = () => new Promise((res) => {
        if (reduced) { res(); return; }
        spinning = false; if (raf && win.cancelAnimationFrame) win.cancelAnimationFrame(raf);
        const landing = tileEl(op.outcome, full);
        strip.replaceChild(landing, strip.children[REEL.land]);
        const target = -(REEL.land * REEL.tile + 50) + (rand() - 0.5) * 60;
        strip.style.transition = 'none'; strip.style.transform = `translateX(${x}px)`;
        void strip.offsetWidth;
        strip.style.transition = `transform ${REEL.seconds}s cubic-bezier(.12, .78, .14, 1)`;
        strip.style.transform = `translateX(${target}px)`;
        let at = 0; for (let k = 0; k < 22; k++) { at += 50 + k * k * 8; if (at < REEL.seconds * 1000) setTimeout(() => cue('bid_tick'), at); }
        setTimeout(res, REEL.seconds * 1000 + 120);
      });
      // the lid opens and the beam bursts (0.6-1.5 s), then the reel lands
      if (!reduced) {
        const v0 = outcomeView(op.outcome, { t, items: full, base });
        beamEl.style.setProperty('--g', GLOW[v0.frame === 'mythic' ? 'mythic' : v0.rarity] || GLOW.common);
        chestEl.classList.remove('co-shake'); chestEl.classList.add('co-opened'); cue('gift_chime');
        await new Promise((res) => setTimeout(res, 900));
        chestEl.classList.add('co-fade'); setTimeout(() => { chestEl.hidden = true; }, 400);
      }
      await land();
      // the card
      const v = outcomeView(op.outcome, { t, items: full, base });
      const glow = GLOW[v.frame === 'mythic' ? 'mythic' : v.rarity] || GLOW.common;
      const card = el('div', 'co-card'); card.style.setProperty('--g', glow);
      const g = el('div', 'co-glow'); g.style.setProperty('--g', glow);
      const art = el('div', 'co-art'); art.style.setProperty('--g', glow + '66');
      if (v.icon) { const i = el('img'); i.src = v.icon; i.alt = ''; art.append(i); } else art.append(el('b', null, v.glyph));
      const frame = el('img', 'co-frame'); frame.src = base + 'assets/cards/loot/frame_' + v.frame + '.webp'; frame.alt = '';
      card.append(g, art, frame, el('div', 'co-name', v.label), el('div', 'co-rar', t(op.outcome.kind === 'nft' ? 'chest.rar.nft' : 'rarity.' + (op.outcome.rarity || 'common'))));
      stage.replaceChildren(card);
      reel.hidden = true; // the card takes the reel's place (short screens)
      setTimeout(() => card.classList.add('co-in'), 30);
      cue('gift_chime');
      outcomeResult = { ok: true, opening: op, verification };
      try { onSettled(op, verification); } catch (e) { console.warn('[chest] settle', e); }
      // the verification line (a ?chestpreview fixture says so and links nothing)
      if (op.preview) { info.replaceChildren(el('div', 'co-ver co-no', null)); info.firstChild.append(el('b', null, t('chest.preview'))); closeBtn(); return; }
      const ver = el('div', 'co-ver' + (verification.verified ? '' : ' co-no'));
      ver.append(el('b', null, t(verification.verified ? 'chest.verified' : 'chest.unverified')), doc.createTextNode(' '));
      ver.append(doc.createTextNode(t(verification.verified ? 'chest.verified.full' : verification.proofOk ? 'chest.verified.chain' : 'chest.verified.none', { index: op.index })));
      const pf = op.proof || {};
      const det = el('p', 'co-note'); det.append(el('code', null, `root ${String(pf.root || '').slice(0, 16)}… · leaf ${String(pf.leaf || '').slice(0, 16)}… · proof ${(pf.proof || []).length} · random ${String(pf.random || '').slice(0, 12)}…`));
      det.append(el('br'), el('code', null, `node tools/verify-chest/verify.mjs --index ${op.index} --attest`));
      const links = el('p', 'co-note');
      if (op.tx) { const a = el('a', null, t('chest.viewTx')); a.href = `${explorer}/txns/${op.tx}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); }
      if (op.nft && op.nft.contract && op.nft.tokenId) { const a = el('a', null, t('chest.viewNft')); a.href = `${explorer}/nft-token/${op.nft.contract}/${op.nft.tokenId}`; a.target = '_blank'; a.rel = 'noopener noreferrer'; if (links.childNodes.length) links.append(doc.createTextNode(' · ')); links.append(a); }
      info.replaceChildren(ver, det, links);
      closeBtn();
    });
  }).catch((e) => { console.warn('[chest] reveal', e); info.replaceChildren(el('p', null, t('chest.err.bad'))); closeBtn(); });
  return { root, result, close };
}
