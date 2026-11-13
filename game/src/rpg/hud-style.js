// The RPG HUD layout (sprint plan 5.4 / 5.5 / 3.3): every rectangle at the 1920 × 1080 reference, scaled with --u.
// The design tokens are declared here with the plan's final values as fallbacks (A5's tokens.css overrides them).
export const HUD_CSS = `
.rpg { --u: calc(min(100vw, 100vh * 1.7778) / 1920);
  position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: var(--font-ui); color: var(--ftf-text); }
.rpg[hidden] { display: none; }
.rpg * { box-sizing: border-box; }
.rpg button { font: inherit; color: inherit; pointer-events: auto; cursor: pointer; }
.rpg .px { position: absolute; }
.rpg .panel { background: var(--ftf-panel); border: 1px solid var(--ftf-border); border-radius: calc(10 * var(--u)); }
/* player frame 24,24 360×96 */
.rpg-frame { left: calc(24 * var(--u)); top: calc(24 * var(--u)); width: calc(360 * var(--u)); height: calc(96 * var(--u)); pointer-events: auto; cursor: pointer; }
.rpg-portrait { position: absolute; left: calc(12 * var(--u)); top: calc(12 * var(--u)); width: calc(72 * var(--u)); height: calc(72 * var(--u)); border-radius: 50%;
  border: 2px solid var(--ftf-gold-dim); background: #13241e 50% 12% / cover no-repeat; }
.rpg-name { position: absolute; left: calc(96 * var(--u)); top: calc(10 * var(--u)); max-width: calc(190 * var(--u)); overflow: hidden; white-space: nowrap; font-size: max(14px, calc(16 * var(--u))); font-weight: 700; }   /* long names stop before the level chip (full name in the title) */
.rpg-lv { position: absolute; right: calc(16 * var(--u)); top: calc(12 * var(--u)); min-width: calc(36 * var(--u)); height: calc(18 * var(--u)); padding: 0 4px; border-radius: 4px;
  font-size: max(11px, calc(12 * var(--u))); font-weight: 700; line-height: calc(18 * var(--u)); text-align: center; color: var(--ftf-gold); background: rgba(197,164,105,.15); }
.rpg-bar { position: absolute; border: 1px solid rgba(0,0,0,.6); border-radius: 3px; overflow: hidden; }
.rpg-bar i { position: absolute; inset: 0 auto 0 0; display: block; }
.rpg-bar i.ghost { background: rgba(255,255,255,.75); transition: width .5s linear; }
.rpg-bar b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: max(11px, calc(12 * var(--u))); font-weight: 700; text-shadow: 0 1px 0 #000, 0 0 2px #000; }
.rpg-hp { left: calc(96 * var(--u)); top: calc(36 * var(--u)); width: calc(248 * var(--u)); height: calc(18 * var(--u)); background: var(--hp-bg); }
.rpg-hp i.fill { background: var(--hp); }
.rpg-mana { left: calc(96 * var(--u)); top: calc(58 * var(--u)); width: calc(248 * var(--u)); height: calc(14 * var(--u)); background: var(--mana-bg); }
.rpg-mana i.fill { background: var(--mana); }
.rpg-hp[data-low="1"] i.fill { animation: rpg-pulse 1s ease-in-out infinite; }
.rpg-mana[data-pulse="1"] { box-shadow: 0 0 0 2px var(--ftf-danger); }
@keyframes rpg-pulse { 50% { background: var(--ftf-danger); filter: brightness(1.4); } }
.rpg-vignette { position: absolute; inset: 0; pointer-events: none; opacity: 0; box-shadow: inset 0 0 calc(160 * var(--u)) rgba(210, 40, 30, .12); transition: opacity .3s; }
.rpg-vignette[data-on="1"] { opacity: 1; }
/* buffs 24,128 */
.rpg-buffs { left: calc(24 * var(--u)); top: calc(128 * var(--u)); width: calc(360 * var(--u)); display: flex; flex-wrap: wrap; gap: calc(4 * var(--u)); }
.rpg-buff { position: relative; width: calc(32 * var(--u)); height: calc(32 * var(--u)); border: 2px solid var(--ftf-ok); border-radius: 6px; background: #1a2230; pointer-events: auto;
  display: flex; align-items: flex-end; justify-content: center; font-size: max(10px, calc(11 * var(--u))); font-weight: 700; }
.rpg-buff[data-debuff="1"] { border-color: var(--ftf-danger); }
/* target 800,24 320×64 */
.rpg-target { left: calc(800 * var(--u)); top: calc(24 * var(--u)); width: calc(320 * var(--u)); height: calc(64 * var(--u)); }
.rpg-target[hidden] { display: none; }
.rpg-target[data-elite="1"] { border: 2px solid var(--ftf-gold); box-shadow: 0 0 0 2px rgba(197,164,105,.25); }
.rpg-target .tn { position: absolute; left: calc(12 * var(--u)); top: calc(8 * var(--u)); font-size: max(14px, calc(16 * var(--u))); font-weight: 700; }
.rpg-target .tl { position: absolute; right: calc(12 * var(--u)); top: calc(10 * var(--u)); font-size: max(11px, calc(12 * var(--u))); color: var(--ftf-muted); }
.rpg-target .rpg-bar { left: calc(12 * var(--u)); top: calc(40 * var(--u)); width: calc(296 * var(--u)); height: calc(14 * var(--u)); background: var(--hp-bg); }
.rpg-target .rpg-bar i.fill { background: var(--hp); }
/* minimap 1696,24 200×200 */
.rpg-map { left: calc(1696 * var(--u)); top: calc(24 * var(--u)); width: calc(200 * var(--u)); height: calc(200 * var(--u)); border-radius: 50%; border: 3px solid var(--ftf-gold-dim);
  background: rgba(14,16,24,.85); overflow: hidden; pointer-events: auto; cursor: pointer; }
.rpg-map canvas { width: 100%; height: 100%; display: block; }
.rpg-map .n { position: absolute; left: 50%; top: calc(4 * var(--u)); transform: translateX(-50%); font-size: max(11px, calc(12 * var(--u))); font-weight: 700; color: var(--ftf-gold); }
.rpg-zoom { left: calc(1696 * var(--u)); top: calc(176 * var(--u)); display: flex; gap: 4px; }
.rpg-zoom button { width: max(24px, calc(24 * var(--u))); height: max(24px, calc(24 * var(--u))); border-radius: 50%; border: 1px solid var(--ftf-border); background: var(--ftf-panel); font-weight: 700; padding: 0; }
.rpg-zoom button:disabled { opacity: .45; cursor: not-allowed; }
.rpg-coords { left: calc(1696 * var(--u)); top: calc(228 * var(--u)); width: calc(200 * var(--u)); text-align: center; font-size: max(11px, calc(12 * var(--u))); color: var(--ftf-muted); }
/* cast bar 810,940 300×16 */
.rpg-castbar { left: calc(810 * var(--u)); top: calc(940 * var(--u)); width: calc(300 * var(--u)); height: calc(16 * var(--u)); background: rgba(0,0,0,.6); }
.rpg-castbar[hidden] { display: none; }
.rpg-castbar i.fill { background: var(--ftf-gold); }
.rpg-castbar[data-int="1"] i.fill { background: var(--ftf-danger); }
/* hotbar 684,1000 552×56 */
.rpg-hotbar { left: calc(684 * var(--u)); top: calc(1000 * var(--u)); width: calc(552 * var(--u)); height: calc(56 * var(--u)); display: flex; gap: calc(6 * var(--u)); }
.rpg-slot { position: relative; flex: 0 0 calc(56 * var(--u)); height: calc(56 * var(--u)); border: 2px solid var(--ftf-border); border-radius: 8px; background: rgba(14,16,24,.88); padding: 0; pointer-events: auto; overflow: hidden; transition: transform 80ms; }
.rpg-slot:hover { border-color: var(--ftf-gold); }
.rpg-slot:focus-visible { outline: 2px solid var(--ftf-gold); outline-offset: 2px; }
.rpg-slot[data-state="empty"] { border-style: dashed; border-width: 1px; visibility: hidden; }   /* only filled slots show (design review 13.11) ... */
.rpg-hotbar[data-edit="1"] .rpg-slot[data-state="empty"] { visibility: visible; }   /* ... and the empty ones while the Skills window is open, to drop on */
.rpg-slot[data-pressed="1"] { transform: scale(.94); border-color: var(--ftf-gold); }
.rpg-slot .ic { position: absolute; left: 50%; top: 50%; width: calc(40 * var(--u)); height: calc(40 * var(--u)); transform: translate(-50%, -50%); background: center / contain no-repeat; }
.rpg-slot[data-state="cooldown"] .ic { filter: brightness(.35); }
.rpg-slot[data-state="nomana"] .ic { filter: grayscale(.6) sepia(.4) hue-rotate(180deg) brightness(.8); }
.rpg-slot[data-flash="1"] { box-shadow: inset 0 0 0 2px var(--ftf-danger); }
.rpg-slot .sw { position: absolute; inset: 0; pointer-events: none; }
.rpg-slot .cd { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: max(14px, calc(16 * var(--u))); font-weight: 700; text-shadow: 0 1px 2px #000; }
.rpg-slot .k { position: absolute; left: calc(4 * var(--u)); top: calc(2 * var(--u)); min-width: calc(16 * var(--u)); height: calc(14 * var(--u)); padding: 0 2px; border-radius: 3px; background: rgba(0,0,0,.7);
  font-size: max(10px, calc(12 * var(--u))); font-weight: 700; line-height: calc(14 * var(--u)); text-align: center; }
.rpg-slot[data-nomana="1"] .k { color: var(--ftf-danger); }
.rpg-slot[data-active="1"] { border-color: var(--ftf-gold); animation: rpg-glow 1s ease-in-out infinite; }
@keyframes rpg-glow { 50% { box-shadow: 0 0 calc(8 * var(--u)) var(--ftf-gold); } }
/* xp bar 684,1064 552×8 */
.rpg-xp { left: calc(684 * var(--u)); top: calc(1064 * var(--u)); width: calc(552 * var(--u)); height: max(6px, calc(8 * var(--u))); background: var(--xp-bg); pointer-events: auto; }
.rpg-xp i.fill { background: var(--xp); }
.rpg-xp .tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.55); }
/* chat and log 24,836 420×220 */
.rpg-log { left: calc(24 * var(--u)); top: calc(836 * var(--u)); width: calc(420 * var(--u)); height: calc(220 * var(--u)); background: rgba(14,16,24,.72); pointer-events: auto; display: flex; flex-direction: column; }
.rpg-log:hover, .rpg-log:focus-within { background: rgba(14,16,24,.92); }
.rpg-log .tabs { display: flex; gap: 2px; padding: 2px; }
.rpg-log .tabs button { height: max(24px, calc(24 * var(--u))); padding: 0 10px; border: 0; border-radius: 6px; background: transparent; font-size: max(12px, calc(13 * var(--u))); color: var(--ftf-muted); }
.rpg-log .tabs button[aria-selected="true"] { background: rgba(197,164,105,.12); color: var(--ftf-text); box-shadow: inset 0 -2px 0 var(--ftf-gold); }
.rpg-log .body { flex: 1; overflow-y: auto; padding: 4px 10px; font-size: max(13px, calc(14 * var(--u))); line-height: 1.45; }
.rpg-log .body p { margin: 0 0 4px; }
.rpg-log .body .sys { color: var(--ftf-muted); } .rpg-log .body .quest { color: var(--ftf-gold); } .rpg-log .body .err { color: var(--ftf-danger); } .rpg-log .body .xp { color: var(--ftf-xp); } .rpg-log .body .loot { color: var(--ftf-silk); }
/* silk chip 1372,1012 168×44 */
.rpg-silk { left: calc(1372 * var(--u)); top: calc(1012 * var(--u)); width: calc(168 * var(--u)); height: calc(44 * var(--u)); pointer-events: auto; cursor: pointer; }
.rpg-silk .coin { position: absolute; left: calc(10 * var(--u)); top: calc(10 * var(--u)); width: calc(24 * var(--u)); height: calc(24 * var(--u)); border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff4cf, #e8dcb4 45%, #9c8a55); }
.rpg-silk .l1 { position: absolute; left: calc(42 * var(--u)); top: calc(4 * var(--u)); font-size: max(14px, calc(16 * var(--u))); font-weight: 700; color: var(--ftf-silk); white-space: nowrap; }
.rpg-silk .l2 { position: absolute; left: calc(42 * var(--u)); top: calc(24 * var(--u)); font-size: max(11px, calc(12 * var(--u))); color: var(--ftf-warn); white-space: nowrap; }
.rpg-silk .l2[data-off="1"] { color: var(--ftf-muted); }
.rpg-silk .sync { position: absolute; right: calc(8 * var(--u)); top: calc(10 * var(--u)); width: max(24px, calc(24 * var(--u))); height: max(24px, calc(24 * var(--u))); border-radius: 50%; border: 1px solid var(--ftf-border); background: transparent; padding: 0; font-size: 13px; }
.rpg-silk[data-pop="1"] { animation: rpg-pop .24s ease-out; }
@keyframes rpg-pop { 50% { transform: scale(1.08); } }
/* tray 1552,1012 344×44 */
.rpg-tray { left: calc(1552 * var(--u)); top: calc(1012 * var(--u)); width: calc(344 * var(--u)); height: calc(44 * var(--u)); display: flex; gap: calc(6 * var(--u)); }
.rpg-tray button { position: relative; flex: 0 0 calc(44 * var(--u)); height: calc(44 * var(--u)); min-width: 0; padding: 0; border: 1px solid var(--ftf-border); border-radius: 8px; background: var(--ftf-panel); display: flex; align-items: center; justify-content: center; }
.rpg-tray button:hover { border-color: var(--ftf-gold-dim); background: rgba(255,255,255,.12); }
.rpg-tray button[aria-pressed="true"] { border-color: var(--ftf-gold); }
.rpg-tray button:disabled { opacity: .45; cursor: not-allowed; }
.rpg-tray svg { width: calc(24 * var(--u)); height: calc(24 * var(--u)); }
.rpg-tray .k { position: absolute; right: 2px; bottom: 2px; min-width: 14px; padding: 0 3px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: 3px; background: rgba(0,0,0,.55); font: 700 12px/14px ui-monospace, monospace; color: var(--ftf-text); }   /* 12 px keycaps */
.rpg-tray .lbl { position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%); padding: 4px 8px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: 6px; background: var(--ftf-panel-solid, #101f1a); color: var(--ftf-text); font: 600 13px var(--font-ui); white-space: nowrap; pointer-events: none; display: none; }
.rpg-tray button:hover .lbl, .rpg-tray button:focus-visible .lbl { display: block; }   /* a text label on hover and focus */
.rpg-tray .dot { position: absolute; right: 3px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: var(--ftf-gold); display: none; }
.rpg-tray button[data-badge="1"] .dot { display: block; }
/* level-up banner, toasts */
.rpg-banner { left: 50%; top: calc(160 * var(--u)); transform: translateX(-50%); font: 700 calc(28 * var(--u)) var(--font-title); font-size: max(22px, calc(28 * var(--u))); color: var(--ftf-gold); text-shadow: 0 2px 8px #000; opacity: 0; }
.rpg-banner[data-show="1"] { animation: rpg-rise 1.2s var(--ease, cubic-bezier(.2,.8,.2,1)) forwards; }
@keyframes rpg-rise { 0% { opacity: 0; transform: translate(-50%, 10px); } 20% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -20px); } }
.rpg-tip { position: fixed; z-index: 60; max-width: max(240px, calc(320 * var(--u))); padding: 10px 12px; background: var(--ftf-panel-solid, var(--ftf-panel-solid, #101f1a)); border: 1px solid var(--ftf-border); border-radius: 8px;
  color: var(--ftf-text); font: 14px/1.4 var(--font-ui, system-ui); pointer-events: none; box-shadow: 0 8px 32px rgba(0,0,0,.55); }
.rpg-tip b { display: block; font-size: 16px; margin-bottom: 2px; } .rpg-tip .m { color: var(--ftf-muted); } .rpg-tip .w { color: var(--ftf-warn); }
/* the old HUD's frame, wallet and skill bar give way to this layer (its toasts stay) */
html.rpg-on .ph-frame, html.rpg-on .ph-wallet, html.rpg-on .ph-xp, html.rpg-on .ph-vignette, html.rpg-on .ftf-cast-bar { display: none !important; }
/* the quest tracker (A1) sits in its plan slot (1576, 268) under the minimap, not over it */
html.rpg-on .ft { top: calc(min(100vw, 100vh * 1.7778) / 1920 * 268) !important; }
@media (max-width: 899px) { html.rpg-on .ft { top: calc(116px + env(safe-area-inset-top, 0px)) !important; } }
/* the town market ticker and the chat / online chip move clear of the Log panel (desktop: stacked above it; phone: one
   row above the hotbar, the Log hidden) */
html.rpg-on .ftf-chat { left: calc(min(100vw, 100vh * 1.7778) / 1920 * 24) !important; bottom: calc(min(100vw, 100vh * 1.7778) / 1920 * 252) !important; }
html.rpg-on .ftf-mk { left: calc(min(100vw, 100vh * 1.7778) / 1920 * 24) !important; bottom: calc(min(100vw, 100vh * 1.7778) / 1920 * 252 + 42px) !important; max-width: calc(min(100vw, 100vh * 1.7778) / 1920 * 420) !important; }
@media (max-width: 899px) {
  html.rpg-on .ftf-chat { left: calc(12px + env(safe-area-inset-left, 0px)) !important; bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; }
  html.rpg-on .ftf-mk { left: calc(92px + env(safe-area-inset-left, 0px)) !important; bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; max-width: calc(100vw - 164px) !important; }
  html.rpg-on .ftf-mk > button { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }   /* the full text is its title (rpg/index.js syncs it) */
  .rpg-log { display: none !important; }
}
/* reduced motion */
html[data-motion="reduce"] .rpg *, .rpg[data-reduced="1"] * { animation: none !important; transition: none !important; }
html[data-motion="reduce"] .rpg-banner[data-show="1"], .rpg[data-reduced="1"] .rpg-banner[data-show="1"] { opacity: 1; }
/* phone (< 900 px wide) */
@media (max-width: 899px) {
  .rpg { --u: 0.75px; }
  .rpg-frame { left: 12px; top: 12px; width: 280px; height: 80px; }
  .rpg-portrait { width: 56px; height: 56px; left: 10px; top: 12px; }
  .rpg-name { left: 76px; top: 8px; font-size: 14px; max-width: 140px; } .rpg-lv { right: 12px; left: auto; top: 9px; height: 18px; line-height: 18px; min-width: 34px; }
  .rpg-hp { left: 76px; top: 32px; width: 192px; height: 16px; } .rpg-mana { left: 76px; top: 52px; width: 192px; height: 12px; }
  .rpg-hotbar { left: 50%; transform: translateX(-50%); top: auto; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); width: auto; height: 48px; gap: 6px; }
  .rpg-slot { flex: 0 0 48px; height: 48px; } .rpg-slot:nth-child(n+6) { display: none; } .rpg-slot .ic { width: 34px; height: 34px; }
  .rpg-xp { left: 0; right: 0; width: auto; top: auto; bottom: 0; height: 4px; }
  .rpg-map { left: auto; right: 12px; top: 12px; width: 140px; height: 140px; } .rpg-zoom, .rpg-coords { display: none; }
  .rpg-target { left: 50%; transform: translateX(-50%); top: 100px; width: 260px; }
  .rpg-target .rpg-bar { width: 236px; }
  .rpg-log { left: 12px; top: auto; bottom: 72px; width: 60vw; height: 28px; } .rpg-log .tabs { display: none; } .rpg-log .body { overflow: hidden; white-space: nowrap; padding-top: 4px; }
  .rpg-silk { left: auto; right: 12px; top: auto; bottom: calc(132px + env(safe-area-inset-bottom, 0px)); width: 150px; height: 44px; }
  .rpg-tray { left: auto; right: 12px; top: auto; bottom: 72px; width: 48px; height: 48px; flex-direction: column-reverse; }
  .rpg-tray button { flex: 0 0 48px; height: 48px; display: none; } .rpg-tray button.menu { display: flex; }
  .rpg-tray[data-open="1"] { height: auto; display: grid; grid-template-columns: repeat(3, 48px); width: 160px; gap: 6px; }
  .rpg-tray[data-open="1"] button { display: flex; }
  .rpg-castbar { left: 50%; transform: translateX(-50%); top: auto; bottom: 72px; width: 240px; }
}
@media (max-width: 479px) {
  .rpg-frame { width: 256px; } .rpg-hp, .rpg-mana { width: 168px; }
  .rpg-map { width: 92px; height: 92px; border-width: 2px; } .rpg-map .n { font-size: 10px; }
  .rpg-log { display: none; }
}
`;
