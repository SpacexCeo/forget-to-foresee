// The game menu (owner, 11.11; docs/ui-style-and-dialogue.md): one tabbed panel for Profile, Achievements, NFTs,
// Inventory (with the wheel), Agents and Log / Stats. Dark green-black glass to the owner's Profile reference
// (docs/art/ui/profile-owner-ref.jpg, 12.11), thin borders, gold labels, rarity colour frames, 40 px+ targets; reduced motion = static (no spin animation, no confetti, no pop). Honest by construction: the
// NFTs tab lists only what a testnet read confirms right now (play/profile.js readOnChain), everything else is
// labelled local. Items come from the items manifest (game/public/assets/items/manifest.json).
import { COMPANIONS_ENABLED } from '../scenes/companion-rules.js';
import { lockedCompanionSlot } from '../ui/companion-slot.js';
import { readOnChain } from './profile.js';
import { createWheel } from '../game/wheel.js';
import { renderWheel, WHEEL_CSS } from './wheel-view.js';
import { createInventory, RARITIES } from '../game/inventory.js';
import { achievementsFor } from '../game/achievements.js';
import { NEAR_DEPLOYMENT } from '../net/near-deployment.js';
import { loadHolder } from '../net/holder.js';
import { holderSection } from './holder-panel.js';
import { renderProfileView } from './profile-view.js';
import { createChestBag } from '../game/chests.js';
import { createFriends } from './friends.js';
import { createChestClient } from '../net/chest-client.js';
import { groupChests, loadArchive, archiveOpened, outcomeOf, verifyHref, nftImage, rewardArt, chestArt } from './chest-history.js';
import { cue } from '../audio/town-audio.js';
import { formatSilkC } from '../net/silk-core.js';
import { wardrobe, TRY_ON_SECONDS } from './skins.js';
import { collectionView } from './nft-collection.js';

/** UI-004 tab icons (line art, currentColor). */
const TAB_ICON = Object.freeze({
  profile: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></svg>',
  achievements: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5a3 3 0 0 0 3 4m8-4h3a3 3 0 0 1-3 4m-4 3v4m-4 3h8"/></svg>',
  nfts: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M7 4h10l4 5-9 11L3 9l4-5Zm-4 5h18M9 9l3 11 3-11M7 4l2 5m8-5-2 5"/></svg>',
  inventory: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M5 8h14l-1 12H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2"/></svg>',
  agents: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9c.6-3.3 3-5 6-5s5.4 1.7 6 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18 15c1.7.6 2.7 2.2 3 5"/></svg>',
  friends: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2c2.6.2 4.4 1.7 5 4.3"/></g></svg>',
  log: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M5 20v-6m5 6V9m5 11V5m5 15v-9"/></svg>',
});
export const TABS = Object.freeze(['profile', 'achievements', 'nfts', 'inventory', 'friends', 'agents', 'log']);
/** The Town Ledger tab (flag townLedger; src/ui/town-ledger.js): second, after Profile, only when the flag is on. */
export const TOWN_TAB = 'town';
const TOWN_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3 20h18M5 20v-8l4-3 4 3v8M13 20V8l3-3 3 3v12M8 15h2M16 11h0M16 15h0"/></svg>';
const RARITY_COLOR = Object.freeze({ common: '#b9bfc7', uncommon: '#2fc4b2', rare: '#8d5cf6', epic: '#e0479e', legendary: '#f2a516' });
let manifestP = null;
/** The items manifest (cached). */
export function loadManifest(base = (import.meta.env && import.meta.env.BASE_URL) || '/', fetch = globalThis.fetch) {
  return (manifestP ||= fetch(base + 'assets/items/manifest.json').then((r) => r.json()).then((m) => (m.items || []).filter((i) => i.kind === 'shard' || i.kind === 'part')).catch(() => []));
}

const CSS = `
.gm-titlebox { flex: 1; display: grid; gap: 2px; } .gm-titlebox h2 { flex: none; }
.gm-kicker { font: 600 11px/1.2 var(--font-ui, system-ui, sans-serif); letter-spacing: .16em; text-transform: uppercase; color: var(--ftf-gold, #c5a469); }
.gm-tab { flex-direction: column; justify-content: center; gap: 4px; min-width: 88px; padding: 8px 12px; }
.gm-tab svg { display: block; }
.gm-over { display: grid; grid-template-columns: 1fr auto; gap: 8px 16px; align-items: center; padding: 14px 16px; margin-bottom: 14px; border-radius: 16px; background: var(--ftf-panel-solid, #101f1a); border: 1px solid rgba(214, 226, 214, .12); }
.gm-over b { display: block; font-size: 15px; }
.gm-big { font: 600 28px/1 "Cormorant Garamond", Georgia, serif; }
.gm-bar { grid-column: 1 / -1; height: 6px; border-radius: 3px; background: rgba(233, 230, 220, .1); overflow: hidden; } .gm-bar > i { display: block; height: 100%; background: linear-gradient(90deg, #2fc4b2, var(--ftf-gold, #c5a469)); }
.gm-state { display: inline-block; padding: 2px 8px; border-radius: 8px; font: 600 11px/1.5 system-ui; background: rgba(233, 230, 220, .08); color: rgba(233, 230, 220, .65); } .gm-state.gm-on { background: rgba(127, 209, 139, .16); color: #7fd18b; }
.gm-chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
.gm-fchip { min-height: 38px; padding: 6px 14px; border-radius: 10px; border: 1px solid rgba(214, 226, 214, .16); background: transparent; color: rgba(233, 230, 220, .75); font: 600 13px/1 system-ui; cursor: pointer; }
.gm-refresh { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
.gm-refresh svg { transition: transform .5s ease; } .gm-refresh.gm-spin svg { transform: rotate(360deg); }
.gm-fchip[aria-pressed="true"] { background: rgba(47, 196, 178, .16); border-color: rgba(47, 196, 178, .6); color: #2fc4b2; }
.gm-card[role="button"] { cursor: pointer; } .gm-card[role="button"]:focus-visible { outline: 2px solid var(--ftf-gold, #c5a469); outline-offset: 2px; }
.gm-detail { display: grid; grid-template-columns: 96px 1fr; gap: 16px; align-items: center; margin-top: 14px; padding: 14px 16px; border-radius: 16px; background: var(--ftf-panel-solid, #101f1a); border: 1px solid rgba(214, 226, 214, .12); }
.gm-detail[hidden] { display: none; } .gm-detail img { width: 96px; height: 96px; object-fit: contain; } .gm-detail b { font: 600 20px/1.2 "Cormorant Garamond", Georgia, serif; margin-right: 8px; }
.gm-rchip { display: inline-block; padding: 2px 8px; border-radius: 8px; font: 600 11px/1.5 system-ui; background: rgba(197, 164, 105, .14); color: var(--ftf-gold, #c5a469); }
@media (max-width: 640px) { .gm-tab { min-width: 72px; padding: 6px 10px; font-size: 12px; } }
.gm { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(3, 7, 7, .62); font: 15px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif; color: var(--ftf-text, #eef0ea); }
.gm-panel { position: relative; width: min(920px, calc(100vw - 24px)); height: min(640px, calc(100vh - 24px)); display: grid; grid-template-rows: auto auto 1fr; border-radius: 20px; overflow: hidden;
  background: rgba(13, 19, 18, .95); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(214, 226, 214, .12); box-shadow: 0 24px 60px rgba(0, 0, 0, .55); }
@supports not (backdrop-filter: blur(1px)) { .gm-panel { background: #0f1615; } }
.gm-head { display: flex; align-items: center; gap: 12px; padding: 16px 18px 8px; }
.gm-head h2 { margin: 0; flex: 1; font: 600 19px/1.1 "Cormorant Garamond", Georgia, serif; letter-spacing: .08em; text-transform: uppercase; color: var(--ftf-text, #eef0ea); }
.gm-head h2::before { content: '✧'; color: var(--ftf-gold, #c5a469); margin-right: 10px; }
.gm-x { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(233, 230, 220, .08); font: 500 20px/1 system-ui; color: var(--ftf-text, #eef0ea); cursor: pointer; }
.gm-tabs { display: flex; gap: 8px; padding: 4px 16px 10px; overflow-x: auto; scrollbar-width: none; }
.gm-tab { flex: 0 0 auto; min-height: 44px; padding: 8px 16px; border-radius: 10px; border: 1px solid rgba(214, 226, 214, .14); background: transparent; color: rgba(233, 230, 220, .7); font: 600 14px/1 system-ui; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: transform .12s ease, background .12s ease; }
.gm-tab:hover { transform: translateY(-2px); } .gm-tab:active { transform: scale(.96); }
.gm-tab[aria-selected="true"] { background: rgba(197, 164, 105, .14); border-color: rgba(197, 164, 105, .7); color: var(--ftf-gold, #c5a469); }
.gm-body { overflow-y: auto; padding: 4px 18px 18px; }
.gm-note { color: rgba(233, 230, 220, .62); font-size: 13px; margin: 6px 0; }
.gm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 12px; }
.gm-card { position: relative; border-radius: 18px; padding: 10px 8px 8px; text-align: center; background: linear-gradient(160deg, #18211f, var(--rb, var(--ftf-panel-solid, #101f1a))); box-shadow: 0 4px 12px rgba(0, 0, 0, .3), inset 0 0 0 1px var(--rc, rgba(214, 226, 214, .18)); overflow: hidden; }
.gm-card img { width: 72px; height: 72px; object-fit: contain; display: block; margin: 0 auto 4px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.18)); }
.gm-card b { display: block; font: 700 13px/1.2 system-ui; } .gm-card small { display: block; color: rgba(233, 230, 220, .62); font-size: 11px; }
.gm-count { position: absolute; top: 6px; right: 8px; min-width: 22px; padding: 2px 6px; border-radius: 11px; background: #0b100f; color: var(--ftf-text, #eef0ea); font: 700 11px/1.4 system-ui; }
.gm-card[data-rarity="rare"]::after, .gm-card[data-rarity="epic"]::after, .gm-card[data-rarity="legendary"]::after { content: ""; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.22) 50%, transparent 60%); transform: translateX(-120%); animation: gm-shine 3.2s ease-in-out infinite; }
@keyframes gm-shine { 60%, 100% { transform: translateX(120%); } }
.gm-card.gm-new { animation: gm-pop .5s cubic-bezier(.3, 1.6, .5, 1); }
@keyframes gm-pop { from { transform: scale(.6); } to { transform: scale(1); } }
.gm-btn { min-height: 44px; padding: 10px 20px; border-radius: 10px; border: 0; cursor: pointer; font: 700 15px/1 system-ui; color: #14201c; background: linear-gradient(135deg, #e6c27e, #c99a48); box-shadow: 0 6px 16px rgba(197, 164, 105, .22); transition: transform .12s ease; }
.gm-btn:hover { transform: translateY(-2px); } .gm-btn:active { transform: scale(.96); } .gm-btn[disabled] { opacity: .45; cursor: default; transform: none; }
.gm-btn.gm-ghost { color: var(--ftf-text, #eef0ea); background: transparent; border: 1px solid rgba(214, 226, 214, .2); box-shadow: none; }
.gm-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin: 10px 0; }
.gm-prof { display: grid; grid-template-columns: 150px 1fr; gap: 18px; align-items: center; }
.gm-prof img { width: 150px; border-radius: 16px; box-shadow: 0 8px 22px rgba(30, 36, 80, .25); }
.gm-prof img.gm-ring-frame { outline: 4px solid #3fd0c9; outline-offset: 3px; box-shadow: 0 0 0 9px rgba(63, 208, 201, .25), 0 8px 22px rgba(30, 36, 80, .25); }
.gm-holder { margin-top: 18px; } .gm-holder input { flex: 1; min-width: 160px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(214, 226, 214, .2); background: #0b100f; color: var(--ftf-text, #eef0ea); font: inherit; }
.gm-holder .gm-row { flex-wrap: wrap; gap: 8px; } .gm-holder-list { margin: 6px 0; padding-left: 18px; }
.gm-ring { --p: 0; width: 64px; height: 64px; border-radius: 50%; background: conic-gradient(var(--c, #2fc4b2) calc(var(--p) * 1turn), rgba(233, 230, 220, .12) 0); display: grid; place-items: center; }
.gm-ring > span { width: 50px; height: 50px; border-radius: 50%; background: var(--ftf-panel-solid, #101f1a); display: grid; place-items: center; font: 600 16px/1 "Cormorant Garamond", Georgia, serif; }
.gm-medal { display: grid; justify-items: center; gap: 6px; text-align: center; padding: 10px 6px; border-radius: 16px; background: var(--ftf-panel-solid, #101f1a); border: 1px solid rgba(214, 226, 214, .1); }
.gm-medal[data-done="true"] { background: linear-gradient(160deg, #2a2716, #1a211b); border-color: rgba(197, 164, 105, .4); }
.gm-nft { position: relative; border-radius: 16px; overflow: hidden; background: var(--ftf-panel-solid, #101f1a); border: 1px solid rgba(214, 226, 214, .12); box-shadow: 0 6px 18px rgba(0, 0, 0, .3); padding: 10px; }
.gm-nft img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 10px; }
.gm-loot { border-color: color-mix(in srgb, var(--rc) 55%, transparent); }
.gm-loot .gm-loot-art { display: grid; place-items: center; aspect-ratio: 1; margin-bottom: 8px; border-radius: 12px; background: radial-gradient(circle, color-mix(in srgb, var(--rc) 35%, transparent) 0%, transparent 70%), #0b100f; box-shadow: inset 0 0 0 2px var(--rc); }
.gm-loot .gm-loot-art img { width: 72%; height: 72%; aspect-ratio: auto; object-fit: contain; border-radius: 0; filter: drop-shadow(0 6px 10px rgba(0,0,0,.5)); }
.gm-loot .gm-loot-art span { font: 600 46px/1 "Cormorant Garamond", Georgia, serif; color: var(--rc); }
.gm-loot b { display: block; } .gm-loot-rar { display: block; font: 700 11px/1.6 system-ui; letter-spacing: .12em; text-transform: uppercase; color: var(--rc); }
.gm-loot small.gm-note { display: block; margin: 2px 0 4px; font-size: 11px; }
.gm-chests h4 { margin: 0; font: 600 14px/1.2 system-ui; color: rgba(233, 230, 220, .8); }
.gm-hist-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin: 16px 0 6px; }
.gm-hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.gm-hist li { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: center; padding: 4px 10px 4px 4px; border-radius: 10px; background: rgba(233, 230, 220, .03); }
.gm-hist-ico { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rc) 60%, transparent); font: 600 18px/1 "Cormorant Garamond", Georgia, serif; color: var(--rc); }
.gm-hist-ico img { width: 30px; height: 30px; object-fit: contain; }
.gm-hist-txt { min-width: 0; } .gm-hist-txt b { font: 600 13px/1.3 system-ui; margin-right: 6px; } .gm-hist-txt small { display: block; color: rgba(233, 230, 220, .5); font-size: 11px; }
.gm-hist-rar { font: 700 10px/1 system-ui; letter-spacing: .08em; text-transform: uppercase; color: var(--rc); }
.gm-dust { display: inline-block; padding: 1px 6px; border-radius: 6px; font: 600 10px/1.4 system-ui; color: rgba(233, 230, 220, .55); border: 1px dashed rgba(233, 230, 220, .3); }
.gm-hist-ver { font-size: 11px; color: rgba(233, 230, 220, .5); white-space: nowrap; } a.gm-hist-ver { color: #2fc4b2; text-decoration: none; }
.gm-archive { margin-top: 12px; } .gm-archive summary { cursor: pointer; min-height: 32px; display: flex; align-items: center; color: rgba(233, 230, 220, .62); font-size: 13px; }
.gm-archive .gm-hist { opacity: .75; }
.gm-chip { display: inline-block; margin: 4px 4px 0 0; padding: 3px 9px; border-radius: 10px; font: 700 11px/1.5 system-ui; background: #0b100f; color: var(--ftf-text, #eef0ea); border: 1px solid rgba(214, 226, 214, .16); text-decoration: none; }
.gm-chip.gm-near { background: transparent; border-color: rgba(47, 196, 178, .5); color: #2fc4b2; }
.gm-ward { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 8px; }
.gm-ward-card { display: grid; justify-items: center; gap: 4px; padding: 8px 6px 10px; border-radius: 14px; text-align: center; background: var(--ftf-panel-solid, #101f1a); border: 1px solid rgba(214, 226, 214, .12); }
.gm-ward-card img { height: 96px; width: 100%; object-fit: contain; object-position: center bottom; }
.gm-ward-card b { font: 600 13px/1.2 system-ui; } .gm-ward-card small { color: rgba(233, 230, 220, .55); font-size: 11px; }
.gm-ward-card.gm-worn { border-color: rgba(197, 164, 105, .8); background: linear-gradient(160deg, #2a2716, #1a211b); }
.gm-ward-card.gm-locked img { filter: saturate(.55) brightness(.8); }
.gm-coll { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 12px; margin: 4px 0 14px; }
.gm-coll-card { all: unset; box-sizing: border-box; display: grid; gap: 6px; cursor: zoom-in; text-align: center; }
.gm-coll-card img { width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 12px; box-shadow: 0 8px 22px rgba(0,0,0,.45); transition: transform .18s ease; }
.gm-coll-card:hover img, .gm-coll-card:focus-visible img { transform: translateY(-3px); }
.gm-coll-card:focus-visible { outline: 2px solid var(--ftf-gold, #c5a469); outline-offset: 4px; border-radius: 12px; }
.gm-coll-card.gm-locked img { filter: saturate(.6) brightness(.72); }
.gm-coll-card b { font: 600 13px/1.2 system-ui; } .gm-coll-card small { color: rgba(233, 230, 220, .6); font-size: 11px; line-height: 1.35; }
.gm-coll-card .gm-on { color: var(--ftf-gold, #c5a469); font-weight: 700; }
.gm-coll-big { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; padding: 16px; background: rgba(6, 10, 9, .82); cursor: zoom-out; }
.gm-coll-big img { max-width: min(92vw, 520px); max-height: 88vh; aspect-ratio: 2 / 3; object-fit: contain; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
@media (prefers-reduced-motion: reduce) { .gm-coll-card img { transition: none; } }
.gm-agent { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 12px 14px; border-radius: 16px; background: var(--ftf-panel-solid, #101f1a); border: 1px solid rgba(214, 226, 214, .1); margin-bottom: 10px; }
.gm-agent b { font-size: 15px; }
.gm-wheelwrap { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; gap: 18px; align-items: start; }
.gm-wheel { position: relative; width: 100%; aspect-ratio: 1; }
.gm-wheel svg { width: 100%; height: 100%; }
.gm-wheel .gm-spinner { transform-origin: 50% 50%; transition: transform 4.2s cubic-bezier(.12, .8, .18, 1); }
.gm-pointer { position: absolute; top: -6px; left: 50%; width: 0; height: 0; transform: translateX(-50%); border-left: 14px solid transparent; border-right: 14px solid transparent; border-top: 26px solid #f2a516; filter: drop-shadow(0 3px 4px rgba(0,0,0,.3)); }
.gm-odds { width: 100%; border-collapse: collapse; font-size: 13px; } .gm-odds td { padding: 3px 6px; border-bottom: 1px solid rgba(214, 226, 214, .1); } .gm-odds td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.gm-confetti { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.gm-confetti i { position: absolute; top: 40%; left: 50%; width: 8px; height: 12px; border-radius: 2px; animation: gm-burst 1.1s ease-out forwards; }
@keyframes gm-burst { to { transform: translate(var(--dx), var(--dy)) rotate(540deg); opacity: 0; } }
.gm-prize { padding: 12px 14px; border-radius: 16px; background: linear-gradient(135deg, #2a2716, #1a211b); border: 1px solid rgba(197, 164, 105, .4); font-weight: 600; }
@media (max-width: 640px) { .gm-prof, .gm-wheelwrap { grid-template-columns: 1fr; } .gm-prof img { width: 120px; } }
@media (prefers-reduced-motion: reduce) { .gm-wheel .gm-spinner { transition: none; } .gm-card::after, .gm-card.gm-new, .gm-confetti i { animation: none !important; } .gm-tab, .gm-btn { transition: none; } }
html[data-motion="reduce"] .gm-wheel .gm-spinner { transition: none; } html[data-motion="reduce"] .gm-card::after, html[data-motion="reduce"] .gm-confetti i { animation: none !important; }
`;

/** An SVG element (a plain element where the DOM has no namespaces, e.g. the node tests). */
const svgEl = (doc, tag) => (doc.createElementNS ? doc.createElementNS('http://www.w3.org/2000/svg', tag) : doc.createElement(tag));
const reduced = (doc) => { try { return doc.documentElement.dataset.motion === 'reduce' || (doc.defaultView && doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

/** A polyline sparkline in an inline SVG. */
function spark(doc, values, w = 220, h = 44, color = '#2fc4b2') {
  const svg = svgEl(doc, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('aria-hidden', 'true');
  if (values && values.length > 1) {
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - lo) / span) * (h - 6)).toFixed(1)}`).join(' ');
    const pl = svgEl(doc, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', color); pl.setAttribute('stroke-width', '2.5'); pl.setAttribute('stroke-linejoin', 'round');
    svg.append(pl);
  }
  return svg;
}

/**
 * Opens the menu. Returns {root, close, show(tab)}.
 * @param {{doc?: Document, t: Function, ledger: object, storage?: object, tab?: string, owner?: string|null, createGuest?: (() => Promise<{account?: string, error?: string}>)|null, exportKey?: Function|null,
 *   nickname?: string|null, eliseMinted?: boolean, onChain?: Promise, base?: string, manifest?: Promise}} o
 */
export function openGameMenu({ doc = document, t, ledger, storage = null, tab = 'profile', owner: ownerIn = null, createGuest = null, exportKey = null, nickname = null, eliseMinted = false, onChain = null, base = (import.meta.env && import.meta.env.BASE_URL) || '/', manifest = null, chests = null, chestClient = null, heroineToken = null, companionsRead = null, now = () => Date.now(), account = null, townLedger = false, onClose = null }) {
  const tabList = townLedger ? [TABS[0], TOWN_TAB, ...TABS.slice(1)] : TABS;
  let ledgerView = null; // the open Town Ledger (it polls the relayer while it is shown)
  if (!(doc.getElementById && doc.getElementById('gm-style'))) { const st = doc.createElement('style'); st.id = 'gm-style'; st.textContent = CSS + WHEEL_CSS; doc.head.append(st); }
  const el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, fn, cls = 'gm-btn') => { const b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', () => fn(b)); return b; };
  let owner = ownerIn; // becomes the new guest's account once the free account is made from the chest bag
  let guestBusy = false, guestErr = null;
  const wheel = createWheel({ storage, account: owner, now, earnedFrom: () => Math.max(0, ledger.level.level - 1) + (ledger.stats.trialsVerified || 0) });
  const inv = createInventory({ storage });
  const items = manifest || loadManifest(base);
  let chain = onChain || readOnChain({ owner });
  const bag = chests || createChestBag({ storage });
  const chestApi = chestClient || createChestClient({ storage });

  const root = el('div', 'gm'); root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('menu.title'));
  const panel = el('div', 'gm-panel'); root.append(panel);
  const xBtn = btn('×', () => close(), 'gm-x'); xBtn.setAttribute('aria-label', t('quest.close'));
  // UI-004 header: the game's name over the open tab's title
  const head = el('div', 'gm-head'); const titleBox = el('div', 'gm-titlebox'); const tabTitle = el('h2', null, t('menu.title'));
  titleBox.append(el('span', 'gm-kicker', 'Forget to Foresee'), tabTitle); head.append(titleBox);
  if (account) { // sign in / create account (flag accountLogin): opens its own panel over the menu
    const a = btn(account.login ? t('acct.signed', { login: account.login }) : t('acct.open'), () => account.open(), 'gm-btn'); a.style.cssText = 'margin-left:auto;min-height:40px;padding:8px 14px'; a.dataset.acct = '1'; head.append(a);
  }
  head.append(xBtn);
  const tabs = el('div', 'gm-tabs'); tabs.setAttribute('role', 'tablist');
  const body = el('div', 'gm-body'); body.setAttribute('role', 'tabpanel');
  panel.append(head, tabs, body);
  const tabBtns = {};
  for (const id of tabList) { const b = btn('', () => show(id), 'gm-tab'); b.innerHTML = TAB_ICON[id] || (id === TOWN_TAB ? TOWN_ICON : ''); b.append(el('span', null, t('menu.tab.' + id))); b.setAttribute('role', 'tab'); b.dataset.tab = id; tabBtns[id] = b; tabs.append(b); }
  root.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === root) close(); });
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  doc.body.append(root);
  let current = null;
  let closed = false;
  function close() { if (closed) return; closed = true; if (wheelView) wheelView.destroy(); if (ledgerView) ledgerView.destroy(); inv.dispose(); root.remove(); if (onClose) onClose(); }

  const views = {
    profile() {
      const holder = loadHolder(storage); // holder access (net/holder.js): cosmetic perks from a read-only NFT check
      return renderProfileView({ doc, t, ledger, base, nickname, elise: eliseMinted || !!(holder && holder.perks.includes('elise')), holder, titles: wheel.titles, exportKey });
    },
    achievements() {
      return items.then((list) => {
        const st = { ...ledger.stats, spins: wheel.history.length, distinctItems: inv.list(list).length, eliseMinted, level: ledger.level.level };
        const g = el('div', 'gm-grid');
        const all = achievementsFor(st), done = all.filter((a) => a.done).length;
        // UI-004: overall progress first, then the medals with Unlocked / Locked
        const over = el('div', 'gm-over'); const ob = el('div', 'gm-bar'); const of = el('i'); of.style.width = (100 * done / Math.max(1, all.length)).toFixed(1) + '%'; ob.append(of);
        const ol = el('div'); ol.append(el('b', null, t('menu.achOverall')), el('small', 'gm-note', t('menu.achNote')));
        over.append(ol, el('strong', 'gm-big', `${done} / ${all.length}`), ob);
        for (const a of all) {
          const m = el('div', 'gm-medal'); m.dataset.done = String(a.done);
          const ring = el('div', 'gm-ring'); ring.style.setProperty('--p', String(a.progress)); ring.style.setProperty('--c', a.done ? 'var(--ftf-gold, #c5a469)' : '#2fc4b2');
          ring.append(el('span', null, a.done ? '★' : Math.round(a.progress * 100) + '%'));
          m.append(ring, el('b', null, t('ach.' + a.id)), el('span', 'gm-state' + (a.done ? ' gm-on' : ''), t(a.done ? 'menu.unlocked' : 'menu.locked')), el('small', 'gm-note', t('ach.' + a.id + '.desc', { goal: a.goal })));
          g.append(m);
        }
        return [over, g];
      });
    },
    nfts() {
      const box = el('div'); box.append(el('p', 'gm-note', t('inv.onchain.checking')));
      chain.then((r) => {
        box.replaceChildren(el('p', 'gm-note', t('menu.nftNote')));
        if (r.state !== 'loaded' || !r.items.length) { box.append(el('p', 'gm-note', t(r.state === 'offline' ? 'inv.onchain.offline' : 'inv.onchain.none'))); return; }
        const g = el('div', 'gm-grid'); g.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
        const mine = r.items.filter((x) => x.mine), others = r.items.filter((x) => !x.mine);
        for (const it of [...mine, ...others]) {
          const c = el('div', 'gm-nft');
          if (it.kind === 'heroine') { const img = el('img'); img.src = base + 'assets/cards/elise.webp'; img.alt = ''; c.append(img); }
          c.append(el('b', null, it.mine ? t('inv.elise') : it.label || it.tokenId));
          const chip = el('span', 'gm-chip gm-near', 'NEAR testnet'); c.append(el('br'), chip);
          if (it.href) { const a = el('a', 'gm-chip', t('menu.viewToken')); a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; c.append(a); }
          c.append(el('p', 'gm-note', it.mine ? t('menu.ownedByYou') : t('inv.owner', { owner: it.owner || '—' })));
          g.append(c);
        }
        box.append(g);
      });
      // dragons owned by the heroine token's account (docs/companion-nft-plan.md), only when the chain read confirms them
      const drag = el('div');
      if (!COMPANIONS_ENABLED) drag.replaceChildren(el('h3', null, t('companion.slot')), lockedCompanionSlot(doc, t)); // owner 13.11: locked for everyone
      else if (heroineToken) {
        (companionsRead || import('../net/companions.js').then((m) => m.readCompanions({ tokenId: heroineToken }))).then((r) => {
          if (!r || r.state !== 'loaded' || !r.dragons.length) return;
          const g2 = el('div', 'gm-grid'); g2.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
          for (const d of r.dragons) {
            const c = el('div', 'gm-nft');
            c.append(el('b', null, d.title), el('br'), el('span', 'gm-chip gm-near', t('companion.owned')));
            const a = el('a', 'gm-chip', t('menu.viewToken')); a.href = d.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; c.append(a);
            c.append(el('p', 'gm-note', t('companion.account', { account: r.account })));
            g2.append(c);
          }
          drag.replaceChildren(el('h3', null, t('companion.heading')), g2);
        }).catch(() => {});
      }
      // loot NFTs from chests (chests.ftf-coordinator.testnet), only what the chain read confirms for this guest
      const loot = el('div');
      if (owner) {
        Promise.all([import('../net/chest-client.js').then((m) => m.readLootNfts({ owner })), items]).then(([r, list]) => {
          if (!r || r.state !== 'loaded' || !r.items.length) return;
          const g3 = el('div', 'gm-grid'); g3.style.gridTemplateColumns = 'repeat(auto-fill, minmax(160px, 1fr))';
          for (const it of r.items) {
            // owner 13.11: a picture per NFT, the item its deck position holds, in its rarity frame (the frame alone when unknown)
            const pic = nftImage(it, list);
            const c = el('div', 'gm-nft gm-loot'); c.style.setProperty('--rc', RARITY_COLOR[pic.rarity] || RARITY_COLOR.common);
            const art = el('div', 'gm-loot-art');
            if (pic.src) { const img = el('img'); img.src = base + 'assets/items/' + pic.src; img.alt = ''; art.append(img); } else art.append(el('span', null, '✧'));
            const r2 = el('span', 'gm-loot-rar', t('rarity.' + pic.rarity));
            c.append(art, el('b', null, pic.nameKey && pic.exact ? t(pic.nameKey) : t('chest.out.nft')), r2, el('small', 'gm-note', it.title), el('span', 'gm-chip gm-near', 'NEAR testnet'));
            const a = el('a', 'gm-chip', t('menu.viewToken')); a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; c.append(a);
            g3.append(c);
          }
          loot.replaceChildren(el('h3', null, t('chest.lootHeading')), g3);
        }).catch(() => {});
      }
      return [box, collectionSection(), drag, loot, holderSection({ doc, t, storage, owner })];
    },
    inventory() {
      return items.then((list) => {
        const g = el('div', 'gm-grid');
        const ownedAll = inv.list(list);
        // UI-004: filter chips (All / Shards / Parts) and a detail panel for the picked item
        const kind = invFilter;
        const owned = kind === 'all' ? ownedAll : ownedAll.filter((x) => x.kind === kind);
        const chips = el('div', 'gm-chips');
        for (const k of ['all', 'shard', 'part']) { const b = btn(t('menu.filter.' + k), () => { invFilter = k; show('inventory'); }, 'gm-fchip'); b.setAttribute('aria-pressed', String(k === kind)); chips.append(b); }
        // owner 13.11: refresh the bag in place (items and chests saved by the rest of the game, and the chain read)
        const refresh = btn('', (b) => { b.disabled = true; b.classList.add('gm-spin'); refreshInventory(); show('inventory'); }, 'gm-fchip gm-refresh');
        refresh.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/></svg>';
        refresh.append(el('span', null, t('menu.refresh'))); refresh.title = t('menu.refresh.tip'); refresh.setAttribute('aria-label', t('menu.refresh.tip'));
        chips.append(refresh);
        const detail = el('div', 'gm-detail'); detail.hidden = true;
        const pick = (it) => {
          detail.hidden = false; const img = el('img'); img.src = base + 'assets/items/' + (it.icon || it.icon128); img.alt = '';
          const txt = el('div'); txt.append(el('b', null, t(it.nameKey)), el('span', 'gm-rchip', t('rarity.' + (it.rarity || 'common'))), el('p', 'gm-note', t('menu.detail.' + it.kind, { n: it.n })), el('p', 'gm-note', t('menu.source.' + (it.source || 'wheel'))));
          detail.replaceChildren(img, txt);
        };
        if (!owned.length) { const p = el('p', 'gm-note', t('menu.invEmpty')); p.style.gridColumn = '1 / -1'; g.append(p); }
        for (const it of owned) {
          const c = el('div', 'gm-card' + (it.id === inv.newest && fresh.has(it.id) ? ' gm-new' : '')); c.dataset.rarity = it.rarity || 'common';
          c.tabIndex = 0; c.setAttribute('role', 'button'); c.addEventListener('click', () => pick(it)); c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(it); } });
          c.style.setProperty('--rc', RARITY_COLOR[it.rarity] || RARITY_COLOR.common); c.style.setProperty('--rb', (RARITY_COLOR[it.rarity] || 'var(--ftf-text, #eef0ea)') + '33');
          const img = el('img'); img.src = base + 'assets/items/' + (it.icon128 || it.icon); img.alt = '';
          c.append(el('span', 'gm-count', '×' + it.n), img, el('b', null, t(it.nameKey)), el('small', null, t('rarity.' + (it.rarity || 'common')) + ' · ' + t('menu.source.' + (it.source || 'wheel'))));
          g.append(c);
        }
        const sum = el('div', 'gm-row');
        sum.append(el('span', 'gm-chip', t('inv.townSilk') + ': ' + formatSilkC(ledger.silk)), btn(t('menu.openWheel'), () => show('wheel')));
        return [el('p', 'gm-note', t('inv.offchain.note')), sum, wardrobeSection(), chestSection(list), chips, g, detail];
      });
    },
    wheel() {
      return items.then((list) => {
        const view = renderWheel({ doc, t, wheel, items: list, base, inventory: inv, ledger, chests: bag, cue, reduced: reduced(doc),
          bagTarget: () => tabBtns.inventory || null,
          mintSkin: (p) => import('../net/wheel-skin.js').then((m) => m.claimWheelSkin({ storage, wheelId: wheel.id, seed: p.seed })),
          supply: import('../net/wheel-skin.js').then((m) => m.skinSupply()).catch(() => null),
          onChange: (r) => { if (r && r.ok && (r.kind === 'part' || r.kind === 'shard') && inv.newest) fresh.add(inv.newest); } });
        wheelView = view;
        return [view.root];
      });
    },
    agents() {
      const known = ledger.agentsKnown();
      if (!known.length) return [el('p', 'gm-note', t('menu.agentsEmpty'))];
      const out = [];
      const open = ledger.hires();
      for (const npc of known) {
        const a = ledger.agent(npc);
        const card = el('div', 'gm-agent');
        const left = el('div');
        left.append(el('b', null, t('folk.name.' + npc)), el('p', 'gm-note', t('hire.temp.' + (ledger.temperamentOf(npc) || 'steady')) + ' · ' + (a.measured == null ? t('spot.inn.novice') : (a.measured * 100).toFixed(1) + ' %') + ' · ' + t('menu.experience', { n: a.experience })));
        const h = open.find((x) => x.npc === npc);
        if (h) left.append(el('p', 'gm-note', t('open.line', { name: t('folk.name.' + npc), done: h.done, total: h.rounds, u: (h.unrealised / 100).toFixed(2) })));
        const recs = ledger.results ? ledger.results(npc) : [];
        if (recs.length) left.append(el('p', 'gm-note', t('menu.lastNet', { net: (recs[0].net >= 0 ? '+' : '') + (recs[0].net / 100).toFixed(2), n: recs.length })));
        card.append(left, spark(doc, (a.recent || []).map((x, i, arr) => arr.slice(0, i + 1).reduce((s, v) => s + v, 0) / (i + 1)), 140, 40, '#2fc4b2'));
        out.push(card);
      }
      return [el('p', 'gm-note', t('menu.agentsNote')), ...out];
    },
    town() { // the Town Ledger: live trades, reasons, the traders' own accounts, clan strategy (loaded on first open)
      return Promise.all([import('../ui/town-ledger.js'), import('../net/town-ledger.js')]).then(([ui, net]) => {
        if (current !== TOWN_TAB || root.isConnected === false) return []; // switched away or closed while it loaded
        ledgerView = ui.mountTownLedger({ doc, t, poll: () => net.fetchLedger(), base, now });
        return [ledgerView.root];
      }).catch(() => [el('p', 'gm-note', t('led.offline'))]);
    },
    friends() { // the friends list (play/friends.js): players added from their card, saved on this device
      const f = createFriends({ storage, me: owner || null });
      const list = f.list();
      if (!list.length) return [el('p', 'gm-note', t('friends.empty'))];
      const rows = list.map((p) => {
        const r = el('div', 'gm-card');
        r.append(el('b', null, p.name), el('small', null, p.demo ? t('friends.demo') : (p.account || '')));
        r.append(btn(t('friends.remove'), () => { f.remove(p); show('friends'); }, 'gm-btn'));
        return r;
      });
      return [el('p', 'gm-note', t('friends.note')), ...rows];
    },
    log() {
      const st = ledger.stats;
      const g = el('div', 'gm-grid');
      for (const [k, v] of [['rounds', String(st.rounds || 0)], ['winRate', st.rounds ? Math.round((100 * st.wins) / st.rounds) + ' %' : '—'], ['net', (st.net >= 0 ? '+' : '') + (st.net / 100).toFixed(2)]]) {
        const c = el('div', 'gm-card'); c.append(el('b', null, v), el('small', null, t('profile.stat.' + k))); g.append(c);
      }
      const lines = el('div');
      for (const l of ledger.log().slice(0, 40)) lines.append(el('p', 'gm-note', t('log.line', { time: new Date(l.at).toLocaleTimeString(), name: t('folk.name.' + l.npc), echo: t('exch.echo.' + l.echo), side: t('log.side.' + l.side), size: l.size, entry: (l.entry / 100).toFixed(2), exit: (l.exit / 100).toFixed(2), result: (l.result >= 0 ? '+' : '') + (l.result / 100).toFixed(2), reason: t('log.reason.' + l.reason) })));
      if (!lines.childNodes.length) lines.append(el('p', 'gm-note', t('open.none')));
      return [g, el('h3', null, t('profile.equity')), spark(doc, ledger.equity, 320, 60, 'var(--ftf-gold, #c5a469)'), el('h3', null, t('log.heading')), lines];
    },
  };
  const fresh = new Set();
  let wheelView = null; // the open wheel screen (stopped when the tab changes or the menu closes)
  let invFilter = 'all';
  /** Re-reads the inventory and the chest bag from this browser, and asks the chain again for the NFTs. */
  function refreshInventory() {
    try { if (inv.reload) inv.reload(); } catch { /* keeps what it has */ }
    try { if (bag.reload) bag.reload(); } catch { /* keeps what it has */ }
    chain = readOnChain({ owner });
  }

  /**
   * Chests from monsters (game/chests.js), owner 13.11: sealed chests on top with Open buttons; opened ones are a
   * compact read-only history (what came out, its icon, the verify link small) that one button moves to a collapsed
   * archive kept in this browser (play/chest-history.js).
   */
  function chestSection(list) {
    const all = bag.list();
    const { sealed: sealedNow, opened, archive } = groupChests(all, loadArchive(storage));
    const box = el('section', 'gm-chests');
    box.append(el('h3', null, t('chest.heading', { n: sealedNow.length })));
    if (!all.length) { box.append(el('p', 'gm-note', t('chest.none'))); return box; }
    if (!sealedNow.length) box.append(el('p', 'gm-note', t('chest.noneSealed')));
    if (!owner && sealedNow.length) box.append(guestBanner()); // one line for the whole grid, not one per card (owner, 12.11)
    if (sealedNow.length >= 2 && owner && chestApi.available && chestApi.openMany) { // batch opening (owner, 12.11): one transaction for up to 10
      const row = el('div', 'gm-row'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.flexWrap = 'wrap'; row.style.margin = '6px 0 10px';
      const five = Math.min(5, sealedNow.length), most = Math.min(10, sealedNow.length);
      for (const [label, k] of [[t('chest.batch.open', { n: five }), five], ...(most > five ? [[t('chest.batch.all', { n: most }), most]] : [])]) {
        const b = btn(label, () => openMany(k, list), 'gm-btn'); b.style.minHeight = '40px'; b.style.padding = '8px 14px'; row.append(b);
      }
      box.append(row);
    }
    if (sealedNow.length) {
      const g = el('div', 'gm-grid');
      for (const c of sealedNow.slice(0, 24)) {
        const card = el('div', 'gm-card'); card.dataset.rarity = c.tier === 'legendary' ? 'legendary' : c.tier === 'rare' ? 'rare' : 'common';
        card.style.setProperty('--rc', RARITY_COLOR[c.tier === 'legendary' ? 'legendary' : c.tier === 'rare' ? 'uncommon' : 'common']);
        const box = el('img'); box.src = base + 'assets/items/' + chestArt(c.tier); box.alt = '';
        card.append(box, el('b', null, t('chest.tier.' + c.tier)), el('small', null, t('chest.sealed')));
        const b = btn(t('chest.open'), () => openOne(c, list), 'gm-btn'); b.style.marginTop = '8px'; b.style.minHeight = '40px'; b.style.padding = '8px 14px';
        b.disabled = !chestApi.available || !owner;
        card.append(b);
        if (owner && !chestApi.available) card.append(el('small', null, t('chest.err.off')));
        g.append(card);
      }
      box.append(g);
    }
    if (opened.length) {
      const head = el('div', 'gm-hist-head');
      head.append(el('h4', null, t('chest.history', { n: opened.length })));
      const b = btn(t('chest.archiveAll'), () => { cue('ui_confirm'); archiveOpened(storage, opened); show('inventory'); }, 'gm-fchip');
      b.title = t('chest.archiveAll.tip'); head.append(b);
      box.append(head, historyList(opened.slice(0, 30), list));
      if (opened.length > 30) box.append(el('p', 'gm-note', t('chest.more', { n: opened.length - 30 })));
    }
    if (archive.length) {
      const d = el('details', 'gm-archive');
      d.append(el('summary', null, t('chest.archive', { n: archive.length })), historyList(archive.slice(0, 100), list));
      box.append(d);
    }
    return box;
  }
  /** Read-only rows for opened chests: icon, what came out (or "dust"), the box, and a small verify link. */
  function historyList(chests, list) {
    const ul = el('ul', 'gm-hist');
    for (const c of chests) {
      const o = outcomeOf(c);
      const li = el('li'); li.style.setProperty('--rc', RARITY_COLOR[(o && o.rarity) || 'common'] || RARITY_COLOR.common);
      const it = o && o.id ? list.find((x) => x.id === o.id) : null;
      const ico = el('span', 'gm-hist-ico');
      const art = rewardArt(o, 128) || (it ? it.icon128 || it.icon : null);
      if (art) { const img = el('img'); img.src = base + 'assets/items/' + art; img.alt = ''; ico.append(img); }
      else ico.textContent = !o ? '·' : o.kind === 'silk' ? '◈' : o.kind === 'xp' ? '✦' : o.kind === 'title' ? '❦' : o.kind === 'nft' ? '✧' : '?';
      const what = !o ? t('chest.opened')
        : o.kind === 'item' ? (it ? t(it.nameKey) : o.id || '?')
        : o.kind === 'nft' ? (it ? t('chest.out.nftOf', { item: t(it.nameKey) }) : t('chest.out.nft'))
        : o.kind === 'silk' ? t('chest.out.silk', { n: o.amount })
        : o.kind === 'xp' ? t('chest.out.xp', { n: o.amount })
        : o.kind === 'title' ? t('chest.out.title', { title: t('wheel.title.' + o.id) }) : '?';
      const txt = el('span', 'gm-hist-txt');
      txt.append(el('b', null, what));
      if (o && o.dust) { const d = el('span', 'gm-dust', t('chest.dust')); d.title = t('chest.dust.tip'); txt.append(d); }
      else if (o && o.kind !== 'title') txt.append(el('span', 'gm-hist-rar', t('rarity.' + o.rarity)));
      txt.append(el('small', null, t('chest.from', { box: t('chest.tier.' + c.tier) })));
      li.append(ico, txt);
      const href = verifyHref(c);
      if (href) { const a = el('a', 'gm-hist-ver', t('chest.verifyShort')); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = t('chest.viewTx'); li.append(a); }
      else li.append(el('small', 'gm-hist-ver', t(c.opening && c.opening.verified ? 'chest.verified' : 'chest.unverified')));
      ul.append(li);
    }
    return ul;
  }
  /** One opening's reward into this browser's ledger and inventory, and the chest marked opened. */
  function settleChest(chest, op, verified) {
    const o = op.outcome;
    if (o.kind === 'item' && o.id) { inv.add(o.id, 1, 'chest'); fresh.add(o.id); }
    if (o.kind === 'silk') ledger.grant({ silk: (o.amount || 0) * 100 }); // the service counts whole silk, the ledger cents
    if (o.kind === 'xp') ledger.grant({ xp: o.amount || 0 });
    bag.settle(chest.id, { index: op.index, outcome: o, tx: op.tx, nft: op.nft, verified: !!verified });
  }
  /**
   * The wardrobe (night 14.11): who she can be, from boot-world.js (window.__ftfSkins: the skin worn now and the ones the
   * chain confirms). Owned skins are worn with one click; the Sheriffchenko skin is tried on for a while until won.
   */
  function wardrobeSection() {
    const read = typeof globalThis.__ftfSkins === 'function' ? globalThis.__ftfSkins() : null;
    if (!read) return el('div');
    const box = el('section', 'gm-wardrobe'); box.append(el('h3', null, t('inv.wardrobe')));
    const row = el('div', 'gm-ward');
    const ART = { iris: 'iris.webp', elise: 'elise.webp', sheriffchenko: 'sheriffchenko_m.webp' };
    const wear = (id) => { cue('ui_confirm'); globalThis.dispatchEvent(new CustomEvent('ftf:skin-wear', { detail: { id } })); setTimeout(() => { if (current === 'inventory') show('inventory'); }, 60); };
    for (const w of wardrobe(read.current, read.owned || {})) {
      const c = el('div', 'gm-ward-card' + (w.worn ? ' gm-worn' : '') + (w.owned ? '' : ' gm-locked'));
      const img = el('img'); img.src = base + 'assets/cards/' + ART[w.id]; img.alt = ''; c.append(img, el('b', null, t('day1.skin.' + w.id)));
      if (w.worn) c.append(el('small', null, t('skin.worn')));
      else if (w.owned) c.append(btn(t('skin.wear'), () => wear(w.id), 'gm-fchip'));
      else if (w.id === 'sheriffchenko') c.append(el('small', null, t('skin.locked')), btn(t('skin.try', { n: TRY_ON_SECONDS }), () => wear(w.id), 'gm-fchip'));
      else c.append(el('small', null, t('skin.lockedElise')));
      row.append(c);
    }
    box.append(row);
    return box;
  }
  /** No guest yet: one line and the Day-1 free account button (the same mint the arrival runs, play/day1-mint.js). */
  /**
   * The cards a player can earn (owner 14.11, the painted card set; play/nft-collection.js): owned ones first, each with
   * what it takes to earn it; a card opens large on click or Enter and closes on any click.
   */
  function collectionSection() {
    const skins = typeof globalThis.__ftfSkins === 'function' ? globalThis.__ftfSkins() : null;
    let pass = false; try { pass = !!(storage && JSON.parse(storage.getItem('ftf.pass.v1') || '{}').claimId); } catch { /* none */ }
    const sec = el('section', 'gm-collection'); sec.append(el('h3', null, t('nft.collection')));
    const g = el('div', 'gm-coll');
    for (const c of collectionView({ skins, pet: globalThis.__ftfPet || null, pass })) {
      const card = el('button', 'gm-coll-card' + (c.owned ? '' : ' gm-locked')); card.type = 'button';
      const img = el('img'); img.src = base + 'assets/' + c.thumb; img.alt = ''; img.loading = 'lazy';
      card.append(img, el('b', null, t(c.nameKey)), el('small', c.owned ? 'gm-on' : null, c.owned ? t('nft.owned') : t(c.howKey)));
      card.setAttribute('aria-label', t(c.nameKey) + ': ' + (c.owned ? t('nft.owned') : t(c.howKey)));
      card.addEventListener('click', () => {
        cue('ui_click');
        const big = el('div', 'gm-coll-big'); big.setAttribute('role', 'dialog'); big.setAttribute('aria-label', t(c.nameKey));
        const im = el('img'); im.src = base + 'assets/' + c.art; im.alt = t(c.nameKey); big.append(im);
        const shut = () => { big.remove(); card.focus(); }; big.tabIndex = -1;
        big.addEventListener('click', shut);
        big.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); shut(); } }); // Escape closes the card, not the menu
        sec.append(big); if (big.focus) big.focus();
      });
      g.append(card);
    }
    sec.append(g);
    return sec;
  }
  function guestBanner() {
    const wrap = el('div', 'gm-guest'); wrap.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 10px;padding:10px 12px;border:1px solid rgba(197, 164, 105,.45);border-radius:10px;background:rgba(197, 164, 105,.08)';
    const line = el('p', 'gm-note', t('chest.guest.line')); line.style.margin = '0'; line.style.flex = '1 1 220px';
    wrap.append(line);
    if (!createGuest) return wrap;
    const b = btn(t(guestBusy ? 'chest.guest.making' : 'chest.guest.create'), async () => {
      if (guestBusy) return;
      guestBusy = true; guestErr = null; b.disabled = true; b.textContent = t('chest.guest.making');
      let r = null;
      try { r = await createGuest(); } catch (e) { r = { error: (e && e.message) || 'error' }; }
      guestBusy = false;
      if (r && r.account) owner = r.account; else guestErr = (r && r.error) || 'failed';
      if (current === 'inventory') show('inventory');
    }, 'gm-btn');
    b.style.minHeight = '40px'; b.style.padding = '8px 14px'; b.disabled = guestBusy;
    wrap.append(b);
    if (guestErr) { const e = el('small', null, t(guestErr === 'not_configured' ? 'chest.guest.off' : 'chest.guest.failed')); e.style.flexBasis = '100%'; e.setAttribute('role', 'status'); wrap.append(e); }
    return wrap;
  }
  function openOne(chest, list) {
    import('./chest-open.js').then((m) => {
      const r = m.openChestReveal({ doc, t, chest, client: chestApi, guest: owner, items: list, base, onSettled: (op, v) => settleChest(chest, op, v.verified) });
      r.result.then(() => { if (current === 'inventory') show('inventory'); });
    }).catch((e) => console.warn('[chest]', e));
  }
  /** Several sealed chests at once: one relayer transaction, a flip-by-flip reveal and a summary (play/chest-batch.js). */
  function openMany(count, list) {
    import('./chest-batch.js').then((m) => {
      const r = m.openChestBatch({ doc, t, client: chestApi, chests: bag.sealed().slice(0, count), count, items: list, base,
        onSettled: (chest, op) => settleChest(chest, op, op.verification && op.verification.verified) });
      r.result.then(() => { if (current === 'inventory') show('inventory'); });
    }).catch((e) => console.warn('[chest]', e));
  }

  function show(id) {
    current = id;
    if (wheelView) { wheelView.destroy(); wheelView = null; }
    if (ledgerView) { ledgerView.destroy(); ledgerView = null; }
    tabTitle.textContent = t('menu.tab.' + (id === 'wheel' ? 'inventory' : id));
    for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-selected', String(k === id || (id === 'wheel' && k === 'inventory')));
    { const sel = tabBtns[id === 'wheel' ? 'inventory' : id]; try { if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* old browsers */ } } // phones: the selected tab in view
    const r = views[id]();
    const put = (kids) => { if (current === id) body.replaceChildren(...kids.filter(Boolean)); };
    if (r && typeof r.then === 'function') { body.replaceChildren(el('p', 'gm-note', '…')); r.then(put); } else put(r);
  }
  show(tabList.includes(tab) || tab === 'wheel' ? tab : 'profile');
  tabBtns[tabList.includes(tab) ? tab : 'profile'].focus();
  return { root, close, show, get tab() { return current; }, wheel, inventory: inv, chests: bag };
}
