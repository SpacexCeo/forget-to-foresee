// The RPG HUD layout (sprint plan 5.4 / 5.5 / 3.3): every rectangle at the 1920 × 1080 reference, scaled with --u.
// The design tokens are declared here with the plan's final values as fallbacks (A5's tokens.css overrides them).
export const HUD_CSS = `
.rpg { --u: calc(min(100vw, 100vh * 1.7778) / 1920); /* a 1920x1080 frame; the lower pieces sit by bottom, so a window taller than 16:9 keeps them at the foot of the screen */
  position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: var(--font-ui); color: var(--ftf-text); }
.rpg[hidden] { display: none; }
.rpg * { box-sizing: border-box; }
.rpg button { font: inherit; color: inherit; pointer-events: auto; cursor: pointer; }
.rpg .px { position: absolute; }
.rpg { --k: max(var(--u), 0.72px); /* the HUD pieces never shrink below 72 % (a 1382 px wide frame): small windows stay readable */
  --rpg-bg: rgba(13, 20, 20, .85); --rpg-line: rgba(197, 164, 105, .5); --rpg-shadow: 0 2px 8px rgba(0, 0, 0, .35); --rpg-r: max(6px, calc(10 * var(--k))); }
.rpg .panel { background: var(--rpg-bg); border: 1px solid var(--rpg-line); border-radius: var(--rpg-r); box-shadow: var(--rpg-shadow); }
/* player frame 24,24 340×92: round portrait in a gold ring, the name in the display face, a level pill, HP, mana, stamina */
.rpg-frame { left: calc(24 * var(--k)); top: calc(24 * var(--k)); width: calc(340 * var(--k)); height: calc(92 * var(--k)); pointer-events: auto; cursor: pointer; }
.rpg-frame:focus-visible { outline: 2px solid var(--ftf-gold); outline-offset: 2px; }
.rpg-portrait { position: absolute; left: calc(10 * var(--k)); top: calc(10 * var(--k)); width: calc(72 * var(--k)); height: calc(72 * var(--k)); border-radius: 50%;
  border: 2px solid var(--ftf-gold); box-shadow: 0 0 0 1px rgba(0, 0, 0, .6), inset 0 0 0 1px rgba(0, 0, 0, .5); background: #13241e 50% 12% / cover no-repeat; }
.rpg-name { position: absolute; left: calc(96 * var(--k)); top: calc(8 * var(--k)); max-width: calc(170 * var(--k)); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font: 700 max(16px, calc(22 * var(--k)))/1.2 var(--font-title); color: var(--ftf-gold-bright, #dcc08a); letter-spacing: .01em; }   /* long names stop before the level pill (full name in the title) */
.rpg-lv { position: absolute; right: calc(12 * var(--k)); top: calc(10 * var(--k)); min-width: calc(40 * var(--k)); height: max(16px, calc(20 * var(--k))); padding: 0 8px; border-radius: 999px;
  border: 1px solid var(--rpg-line); font-size: max(11px, calc(12 * var(--k))); font-weight: 700; line-height: max(14px, calc(18 * var(--k))); text-align: center; color: var(--ftf-gold); background: rgba(197,164,105,.14); }
.rpg-bar { position: absolute; border: 1px solid rgba(0,0,0,.7); border-radius: 999px; overflow: hidden; }
.rpg-bar i { position: absolute; inset: 0 auto 0 0; display: block; }
.rpg-bar i.ghost { background: rgba(255,255,255,.7); transition: width .5s linear; }
.rpg-bar b { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: max(11px, calc(12 * var(--k))); font-weight: 700; font-variant-numeric: tabular-nums; text-shadow: 0 1px 0 #000, 0 0 2px #000; }
.rpg-hp, .rpg-mana { box-shadow: inset 0 1px 2px rgba(0,0,0,.6); }
.rpg-hp::after, .rpg-mana::after { content: ""; position: absolute; left: calc(6 * var(--k)); top: 50%; width: max(10px, calc(12 * var(--k))); height: max(10px, calc(12 * var(--k))); transform: translateY(-50%); background: center / contain no-repeat; pointer-events: none; }
.rpg-hp::after { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23ffe1dc' d='M12 21s-7-4.4-9.3-9C1.2 8.9 3 5 6.6 5c2.1 0 3.4 1.2 4.4 2.6C12 6.2 13.3 5 15.4 5 19 5 20.8 8.9 19.3 12 17 16.6 12 21 12 21z'/%3E%3C/svg%3E"); }
.rpg-mana::after { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23dcefff' d='M12 3s-6 7-6 11a6 6 0 0012 0c0-4-6-11-6-11z'/%3E%3C/svg%3E"); }
.rpg-hp { left: calc(96 * var(--k)); top: calc(40 * var(--k)); width: calc(232 * var(--k)); height: max(14px, calc(18 * var(--k))); background: var(--hp-bg); }
.rpg-hp i.fill { background: linear-gradient(180deg, #e05a4f, var(--hp) 55%, #a8362e); }
.rpg-mana { left: calc(96 * var(--k)); top: calc(62 * var(--k)); width: calc(232 * var(--k)); height: max(12px, calc(14 * var(--k))); background: var(--mana-bg); }
.rpg-mana i.fill { background: linear-gradient(180deg, #5aa5e2, var(--mana) 55%, #2d6fa8); }
.rpg-mana b { font-size: max(10px, calc(11 * var(--k))); }
.rpg-hp[data-low="1"] i.fill { animation: rpg-pulse 1s ease-in-out infinite; }
.rpg-mana[data-pulse="1"] { box-shadow: 0 0 0 2px var(--ftf-danger); }
@keyframes rpg-pulse { 50% { background: var(--ftf-danger); filter: brightness(1.4); } }
/* stamina (game/stamina.js): a thin bar under the mana, only while it is below full or just spent */
.rpg-stam { left: calc(96 * var(--k)); top: calc(80 * var(--k)); width: calc(232 * var(--k)); height: max(3px, calc(5 * var(--k))); background: rgba(0,0,0,.5); border-color: rgba(0,0,0,.6); opacity: 0; transition: opacity .4s; }
.rpg-stam[data-show="1"] { opacity: 1; }
.rpg-stam i.fill { background: #7fd68a; transition: width .12s linear; }
.rpg-stam[data-winded="1"] i.fill { background: repeating-linear-gradient(135deg, #e0a040 0 4px, #9a6a22 4px 8px); }
.rpg-stam[data-flash="1"] { box-shadow: 0 0 0 1px var(--ftf-warn); }
.rpg-vignette { position: absolute; inset: 0; pointer-events: none; opacity: 0; box-shadow: inset 0 0 calc(160 * var(--k)) rgba(210, 40, 30, .12); transition: opacity .3s; }
.rpg-vignette[data-on="1"] { opacity: 1; }
/* buffs 24,124 */
.rpg-buffs { left: calc(24 * var(--k)); top: calc(124 * var(--k)); width: calc(340 * var(--k)); display: flex; flex-wrap: wrap; gap: calc(4 * var(--k)); }
.rpg-buff { position: relative; width: calc(32 * var(--k)); height: calc(32 * var(--k)); border: 2px solid var(--ftf-ok); border-radius: 6px; background: #1a2230; pointer-events: auto;
  display: flex; align-items: flex-end; justify-content: center; font-size: max(10px, calc(11 * var(--k))); font-weight: 700; }
.rpg-buff[data-debuff="1"] { border-color: var(--ftf-danger); }
/* target: top centre, 320×64 */
.rpg-target { left: 50%; transform: translateX(-50%); top: calc(24 * var(--k)); width: calc(320 * var(--k)); height: calc(64 * var(--k)); }
.rpg-target[hidden] { display: none; }
.rpg-target[data-elite="1"] { border: 2px solid var(--ftf-gold); }
.rpg-target .tn { position: absolute; left: calc(12 * var(--k)); top: calc(8 * var(--k)); font-size: max(14px, calc(16 * var(--k))); font-weight: 700; }
.rpg-target .tl { position: absolute; right: calc(12 * var(--k)); top: calc(10 * var(--k)); font-size: max(11px, calc(12 * var(--k))); color: var(--ftf-muted); }
.rpg-target .rpg-bar { left: calc(12 * var(--k)); top: calc(40 * var(--k)); width: calc(296 * var(--k)); height: calc(14 * var(--k)); background: var(--hp-bg); }
.rpg-target .rpg-bar i.fill { background: var(--hp); }
/* radar 1696,24 200×200: a thin gold ring, N at the top, the zone inside, +/- at the lower-left edge, coordinates under it */
.rpg-map { left: auto; right: calc(24 * var(--k)); top: calc(24 * var(--k)); width: calc(200 * var(--k)); height: calc(200 * var(--k)); border-radius: 50%; border: 2px solid rgba(197,164,105,.75);
  background: rgba(14,20,20,.9); overflow: hidden; pointer-events: auto; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.5), var(--rpg-shadow); }
.rpg-map:focus-visible { outline: 2px solid var(--ftf-gold); outline-offset: 2px; }
.rpg-map canvas { width: 100%; height: 100%; display: block; }
.rpg-map .n { position: absolute; left: 50%; top: calc(3 * var(--k)); transform: translateX(-50%); min-width: max(16px, calc(18 * var(--k))); height: max(16px, calc(18 * var(--k))); padding: 0 3px; border-radius: 999px;
  background: var(--ftf-gold); color: #17120a; font: 700 max(10px, calc(11 * var(--k)))/max(16px, calc(18 * var(--k))) var(--font-ui); text-align: center; }
.rpg-map .loc { position: absolute; left: 50%; top: calc(26 * var(--k)); transform: translateX(-50%); max-width: 70%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 1px 8px 1px max(18px, calc(20 * var(--k)));
  border-radius: 999px; background: rgba(10,14,14,.72) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23c5a469' d='M12 2a7 7 0 00-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 00-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z'/%3E%3C/svg%3E") 5px center / max(10px, calc(12 * var(--k))) no-repeat;
  font-size: max(10px, calc(12 * var(--k))); font-weight: 600; color: var(--ftf-text); pointer-events: none; }
.rpg-map .loc[hidden] { display: none; }
.rpg-zoom { left: auto; right: calc(212 * var(--k)); top: calc(160 * var(--k)); display: flex; flex-direction: column; gap: 4px; }
.rpg-zoom button { width: max(20px, calc(26 * var(--k))); height: max(20px, calc(26 * var(--k))); border-radius: 50%; border: 1px solid var(--rpg-line); background: var(--rpg-bg); box-shadow: var(--rpg-shadow); font-weight: 700; line-height: 1; padding: 0; }
.rpg-zoom button:hover:not(:disabled) { border-color: var(--ftf-gold); }
.rpg-zoom button:disabled { opacity: .45; cursor: not-allowed; }
.rpg-coords { left: calc(100% - 124 * var(--k)); top: calc(232 * var(--k)); transform: translateX(-50%); padding: 1px 10px; border-radius: 999px; border: 1px solid var(--rpg-line); background: var(--rpg-bg);
  white-space: pre; font-size: max(11px, calc(12 * var(--k))); font-variant-numeric: tabular-nums; color: var(--ftf-muted); }
.rpg-coords[hidden] { display: none; }
/* cast bar: centred above the hotbar, 300×16 */
.rpg-castbar { left: 50%; transform: translateX(-50%); top: auto; bottom: calc(124 * var(--k)); width: calc(300 * var(--k)); height: calc(16 * var(--k)); background: rgba(0,0,0,.6); }
.rpg-castbar[hidden] { display: none; }
.rpg-castbar i.fill { background: var(--ftf-gold); }
.rpg-castbar[data-int="1"] i.fill { background: var(--ftf-danger); }
/* hotbar: the filled slots centred over the XP bar */
.rpg-hotbar { left: 50%; transform: translateX(-50%); top: auto; bottom: calc(40 * var(--k)); width: auto; height: calc(52 * var(--k)); display: flex; justify-content: center; gap: calc(8 * var(--k)); }
.rpg-slot { position: relative; flex: 0 0 calc(52 * var(--k)); height: calc(52 * var(--k)); border: 1px solid var(--rpg-line); border-radius: 8px; background: var(--rpg-bg); box-shadow: var(--rpg-shadow); padding: 0; pointer-events: auto; overflow: hidden; transition: transform 80ms; }
.rpg-slot:hover { border-color: var(--ftf-gold); }
.rpg-slot:focus-visible { outline: 2px solid var(--ftf-gold); outline-offset: 2px; }
.rpg-slot[data-state="empty"] { border-style: dashed; display: none; }   /* only filled slots show (design review 13.11) ... */
.rpg-hotbar[data-edit="1"] .rpg-slot[data-state="empty"] { display: block; }   /* ... and the empty ones while the Skills window is open, to drop on */
.rpg-slot[data-pressed="1"] { transform: scale(.94); border-color: var(--ftf-gold); }
.rpg-slot .ic { position: absolute; left: 50%; top: 50%; width: calc(40 * var(--k)); height: calc(40 * var(--k)); transform: translate(-50%, -50%); background: center / contain no-repeat; }
.rpg-slot[data-state="cooldown"] .ic { filter: brightness(.35); }
.rpg-slot[data-state="nomana"] .ic { filter: grayscale(.6) sepia(.4) hue-rotate(180deg) brightness(.8); }
.rpg-slot[data-flash="1"] { box-shadow: inset 0 0 0 2px var(--ftf-danger); }
.rpg-slot .sw { position: absolute; inset: 0; pointer-events: none; }
.rpg-slot .cd { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: max(14px, calc(16 * var(--k))); font-weight: 700; text-shadow: 0 1px 2px #000; }
.rpg-slot .k { position: absolute; left: calc(3 * var(--k)); top: calc(3 * var(--k)); min-width: max(13px, calc(16 * var(--k))); height: max(13px, calc(16 * var(--k))); padding: 0 2px; border-radius: 4px; border: 1px solid rgba(197,164,105,.35); background: rgba(0,0,0,.72);
  font-size: max(10px, calc(11 * var(--k))); font-weight: 700; line-height: max(11px, calc(14 * var(--k))); text-align: center; color: var(--ftf-text); }
.rpg-slot[data-nomana="1"] .k { color: var(--ftf-danger); }
.rpg-slot[data-active="1"] { border-color: var(--ftf-gold); animation: rpg-glow 1s ease-in-out infinite; }
@keyframes rpg-glow { 50% { box-shadow: inset 0 0 0 2px var(--ftf-gold); } }
/* xp bar 760,1054 400×8 */
.rpg-xp { left: calc(50% - 200 * var(--k)); top: auto; bottom: calc(18 * var(--k)); width: calc(400 * var(--k)); height: max(6px, calc(8 * var(--k))); background: var(--xp-bg); border-color: rgba(0,0,0,.7); pointer-events: auto; }
.rpg-xp i.fill { background: var(--xp); }
.rpg-xp .tick { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.4); }
/* log 24,864 400×192 (the town market ticker is its header row while it runs: html.rpg-mk) */
.rpg-log { left: calc(24 * var(--k)); top: auto; bottom: calc(24 * var(--k)); width: calc(400 * var(--k)); height: calc(192 * var(--k)); pointer-events: auto; display: flex; flex-direction: column; overflow: hidden; }
html.rpg-mk .rpg-log { padding-top: max(28px, calc(36 * var(--k))); }
.rpg-log .tabs { display: flex; gap: 2px; padding: 4px 6px 0; border-bottom: 1px solid rgba(197,164,105,.18); }
.rpg-log .tabs button { height: max(22px, calc(26 * var(--k))); padding: 0 10px; border: 0; border-radius: 6px 6px 0 0; background: transparent; font-size: max(12px, calc(13 * var(--k))); color: var(--ftf-muted); }
.rpg-log .tabs button[aria-selected="true"] { background: rgba(197,164,105,.12); color: var(--ftf-text); box-shadow: inset 0 -2px 0 var(--ftf-gold); }
.rpg-log .body { flex: 1; overflow-y: auto; padding: 4px 10px; font-size: max(12px, calc(13 * var(--k))); line-height: 1.4; }
.rpg-log .body p { margin: 0 0 2px; padding-left: 12px; position: relative; }
.rpg-log .body p::before { content: "\\25C6"; position: absolute; left: 0; top: 0; font-size: .7em; line-height: 2; opacity: .7; }
.rpg-log .body .sys { color: var(--ftf-muted); } .rpg-log .body .quest { color: var(--ftf-gold); } .rpg-log .body .err { color: var(--ftf-danger); } .rpg-log .body .xp { color: #c9a6ff; } .rpg-log .body .loot { color: var(--ftf-silk); }
/* bottom-right, by right: the silk chip, a thin divider, then the tray */
.rpg-silk { left: auto; right: calc(264 * var(--k)); top: auto; bottom: calc(24 * var(--k)); width: calc(168 * var(--k)); height: calc(48 * var(--k)); pointer-events: auto; cursor: pointer; }
.rpg-silk::after { content: ""; position: absolute; right: calc(-17 * var(--k)); top: 15%; bottom: 15%; width: 1px; background: var(--rpg-line); pointer-events: none; }
.rpg-silk:focus-visible { outline: 2px solid var(--ftf-gold); outline-offset: 2px; }
.rpg-silk .coin { position: absolute; left: calc(10 * var(--k)); top: calc(12 * var(--k)); width: calc(24 * var(--k)); height: calc(24 * var(--k)); border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff4cf, #e8dcb4 45%, #9c8a55); }
.rpg-silk .l1 { position: absolute; left: calc(42 * var(--k)); top: calc(5 * var(--k)); font-size: max(14px, calc(17 * var(--k))); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ftf-silk); white-space: nowrap; }
.rpg-silk .l2 { position: absolute; left: calc(42 * var(--k)); top: calc(27 * var(--k)); font-size: max(10px, calc(11 * var(--k))); color: var(--ftf-warn); white-space: nowrap; }
.rpg-silk .l2[data-off="1"] { color: var(--ftf-muted); }
.rpg-silk .sync { position: absolute; right: calc(8 * var(--k)); top: calc(12 * var(--k)); width: max(22px, calc(24 * var(--k))); height: max(22px, calc(24 * var(--k))); border-radius: 50%; border: 1px solid var(--rpg-line); background: transparent; padding: 0; font-size: 13px; }
.rpg-silk[data-pop="1"] { animation: rpg-pop .24s ease-out; }
@keyframes rpg-pop { 50% { transform: scale(1.08); } }
.rpg-tray { left: auto; right: calc(24 * var(--k)); top: auto; bottom: calc(24 * var(--k)); height: calc(48 * var(--k)); display: flex; gap: calc(8 * var(--k)); }
.rpg-tray button { position: relative; flex: 0 0 calc(48 * var(--k)); width: calc(48 * var(--k)); height: calc(48 * var(--k)); min-width: 0; padding: 0; border: 1px solid var(--rpg-line); border-radius: 8px; background: var(--rpg-bg); box-shadow: var(--rpg-shadow); display: flex; align-items: center; justify-content: center; }
.rpg-tray button:hover { border-color: var(--ftf-gold); background: rgba(30,40,38,.92); }
.rpg-tray button[aria-pressed="true"] { border-color: var(--ftf-gold); }
.rpg-tray button:disabled { opacity: .45; cursor: not-allowed; }
.rpg-tray svg { width: calc(24 * var(--k)); height: calc(24 * var(--k)); margin-top: calc(-8 * var(--k)); color: var(--ftf-gold-bright, #dcc08a); }
.rpg-tray .k { position: absolute; left: 50%; bottom: 2px; transform: translateX(-50%); min-width: 14px; padding: 0 3px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: 3px; background: rgba(0,0,0,.6); font: 700 10px/12px ui-monospace, monospace; color: var(--ftf-text); }   /* the key in a small badge at the foot */
.rpg-tray .lbl { position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%); padding: 4px 8px; border: 1px solid var(--ftf-line, rgba(197,164,105,.4)); border-radius: 6px; background: var(--ftf-panel-solid, #101f1a); color: var(--ftf-text); font: 600 13px var(--font-ui); white-space: nowrap; pointer-events: none; display: none; }
.rpg-tray button:hover .lbl, .rpg-tray button:focus-visible .lbl { display: block; }   /* a text label on hover and focus */
.rpg-tray .dot { position: absolute; right: 3px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: var(--ftf-gold); display: none; }
.rpg-tray button[data-badge="1"] .dot { display: block; }
/* desktop: five tray buttons in the owner's order (bag, character, map, journal, the menu gear); Skills (N) and the
   Market (B) stay on their keys and in the game menu, not on the tray */
@media (min-width: 900px) {
  #rpg-tray-skills, #rpg-tray-market { display: none; }
  #rpg-tray-bag { order: 1; } #rpg-tray-character { order: 2; } #rpg-tray-map { order: 3; } #rpg-tray-journal { order: 4; }
}
.rpg-tray .i-gear { display: none; }
/* ---------------------------------------------------------------------------------------------------------------
   Desktop (>= 900 px): the transparent HUD (owner 13.11). No panels or borders: text and thin lines over the scene with
   a soft dark text shadow. Sizes are at the 1920 x 1080 reference in --k; the phone keeps the panels above.
   --------------------------------------------------------------------------------------------------------------- */
@media (min-width: 900px) {
  .rpg { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --ts: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); text-shadow: var(--ts); }
  .rpg .panel { background: none; border: 0; box-shadow: none; border-radius: 0; }
  /* player: a small round portrait, "Name  Lv n", then thin HP / mana / stamina lines with their numbers to the right */
  .rpg-frame { left: calc(28 * var(--k)); top: calc(28 * var(--k)); width: calc(330 * var(--k)); height: calc(60 * var(--k)); display: flex; align-items: baseline; align-content: flex-start; gap: calc(8 * var(--k)); padding-left: calc(66 * var(--k)); }
  .rpg-portrait { left: 0; top: 0; width: calc(52 * var(--k)); height: calc(52 * var(--k)); border: 0; box-shadow: 0 1px 3px rgba(0,0,0,.55); }
  .rpg-name { position: static; max-width: calc(170 * var(--k)); font: 600 max(13px, calc(16 * var(--k)))/1.25 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; letter-spacing: 0; }
  .rpg-lv { position: static; min-width: 0; height: auto; padding: 0; border: 0; border-radius: 0; background: none; font-size: max(11px, calc(13 * var(--k))); font-weight: 500; line-height: 1.25; color: rgba(235,238,235,.62); }
  .rpg-hp, .rpg-mana, .rpg-stam { left: calc(66 * var(--k)); width: calc(178 * var(--k)); height: max(2px, calc(3 * var(--k))); border: 0; border-radius: 2px; overflow: visible; background: rgba(0,0,0,.4); box-shadow: 0 1px 1px rgba(0,0,0,.35); }
  .rpg-hp { top: calc(29 * var(--k)); } .rpg-mana { top: calc(43 * var(--k)); } .rpg-stam { top: calc(57 * var(--k)); }
  .rpg-hp::after, .rpg-mana::after { display: none; }
  .rpg-bar i { border-radius: 2px; }
  .rpg-hp i.fill { background: #e2493e; } .rpg-mana i.fill { background: #4c8ee6; } .rpg-stam i.fill { background: #8fd694; }
  .rpg-hp i.ghost { background: rgba(255,255,255,.55); }
  .rpg-hp b, .rpg-mana b { inset: 50% auto auto calc(100% + 10 * var(--k)); transform: translateY(-50%); white-space: nowrap;
    font-size: max(10px, calc(12 * var(--k))); font-weight: 500; color: rgba(240,242,240,.9); text-shadow: var(--ts); }
  .rpg-mana[data-pulse="1"] { box-shadow: 0 0 0 1px var(--ftf-danger); }
  .rpg-buffs { left: calc(28 * var(--k)); top: calc(100 * var(--k)); }
  .rpg-target { background: none; }
  .rpg-target .tn { color: #fff; } .rpg-target .rpg-bar { height: max(3px, calc(4 * var(--k))); border: 0; background: rgba(0,0,0,.4); }
  /* radar: a plain dark translucent disc, a small N, the zoom and coordinates only on hover */
  .rpg-map { right: calc(30 * var(--k)); top: calc(28 * var(--k)); width: calc(150 * var(--k)); height: calc(150 * var(--k)); border: 0; background: rgba(10,14,16,.5); box-shadow: none; }
  .rpg-map .n { top: calc(2 * var(--k)); min-width: 0; height: auto; padding: 0; background: none; color: #fff; font: 600 max(10px, calc(12 * var(--k)))/1.2 system-ui, sans-serif; text-shadow: var(--ts); }
  .rpg-map .loc { display: none; }
  .rpg-zoom { right: calc(166 * var(--k)); top: calc(126 * var(--k)); gap: 2px; opacity: 0; transition: opacity .15s; }
  .rpg-map:hover + .rpg-zoom, .rpg-zoom:hover, .rpg-zoom:focus-within { opacity: 1; }
  .rpg-zoom button { width: max(18px, calc(20 * var(--k))); height: max(18px, calc(20 * var(--k))); border: 0; background: rgba(10,14,16,.55); box-shadow: none; font-size: 12px; text-shadow: none; }
  .rpg-coords { left: calc(100% - 105 * var(--k)); top: calc(156 * var(--k)); padding: 0; border: 0; background: none; font-size: max(10px, calc(10 * var(--k))); color: rgba(240,242,240,.75); opacity: 0; transition: opacity .15s; pointer-events: none; }
  .rpg-map:hover ~ .rpg-coords { opacity: 1; }
  /* hotbar: the skill icons alone, the key number under each, one thin XP line below the row */
  .rpg-hotbar { bottom: calc(30 * var(--k)); height: calc(60 * var(--k)); gap: calc(26 * var(--k)); }
  .rpg-slot { flex: 0 0 calc(40 * var(--k)); height: calc(60 * var(--k)); border: 0; border-radius: 0; background: none; box-shadow: none; overflow: visible; }
  .rpg-slot:hover { border: 0; } .rpg-slot:hover .ic { filter: brightness(1.15); }
  .rpg-slot .ic { top: 0; width: calc(40 * var(--k)); height: calc(40 * var(--k)); transform: translateX(-50%); border-radius: calc(8 * var(--k)); box-shadow: 0 1px 3px rgba(0,0,0,.5); }
  .rpg-slot .sw, .rpg-slot .cd { left: 0; right: 0; top: 0; bottom: auto; height: calc(40 * var(--k)); border-radius: calc(8 * var(--k)); }
  .rpg-slot .k { left: 50%; top: auto; bottom: 0; transform: translateX(-50%); min-width: 0; height: auto; padding: 0; border: 0; background: none; font-size: max(11px, calc(13 * var(--k))); font-weight: 500; line-height: 1.2; color: rgba(240,242,240,.85); text-shadow: var(--ts); }
  .rpg-slot[data-state="empty"] .ic { border: 1px dashed rgba(255,255,255,.45); box-shadow: none; }
  .rpg-slot[data-flash="1"] { box-shadow: none; } .rpg-slot[data-flash="1"] .ic { box-shadow: 0 0 0 2px var(--ftf-danger); }
  .rpg-slot[data-active="1"] { animation: none; } .rpg-slot[data-active="1"] .ic { box-shadow: 0 0 0 2px var(--ftf-gold); }
  .rpg-slot[data-pressed="1"] { border: 0; }
  .rpg-xp { left: calc(50% - 210 * var(--k)); bottom: calc(16 * var(--k)); width: calc(420 * var(--k)); height: max(2px, calc(3 * var(--k))); border: 0; border-radius: 2px; background: rgba(0,0,0,.4); }
  .rpg-xp i.fill { background: #9d6cf0; border-radius: 2px; } .rpg-xp .tick { display: none; }
  .rpg-castbar { bottom: calc(108 * var(--k)); height: max(3px, calc(4 * var(--k))); border: 0; }
  .rpg-castbar b { top: auto; bottom: 100%; height: auto; padding-bottom: 2px; font-weight: 500; }
  /* log: plain text lines; the tabs show on hover; the town market line heads it (html.rpg-mk) */
  .rpg-log { left: calc(40 * var(--k)); bottom: calc(24 * var(--k)); width: calc(440 * var(--k)); height: calc(112 * var(--k)); overflow: visible; }
  html.rpg-mk .rpg-log { padding-top: max(18px, calc(22 * var(--k))); }
  .rpg-log .tabs { position: absolute; right: 0; top: calc(-26 * var(--k)); padding: 0; border: 0; opacity: 0; transition: opacity .15s; }
  .rpg-log:hover .tabs, .rpg-log:focus-within .tabs { opacity: 1; }
  .rpg-log .tabs button { height: max(18px, calc(20 * var(--k))); padding: 0 8px; border-radius: 4px; background: rgba(10,14,16,.5); font-size: max(11px, calc(12 * var(--k))); text-shadow: none; }
  .rpg-log .tabs button[aria-selected="true"] { box-shadow: none; background: rgba(10,14,16,.75); }
  .rpg-log .body { padding: 0; overflow-y: hidden; font-size: max(12px, calc(14 * var(--k))); line-height: 1.6; scrollbar-width: thin; }
  .rpg-log:hover .body { overflow-y: auto; }
  .rpg-log .body p { padding-left: 0; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rpg-log .body p::before { display: none; }
  .rpg-log .body .sys { color: rgba(240,242,240,.9); } .rpg-log .body .xp { color: #e2d4ff; } .rpg-log .body .quest { color: #f0d9a4; } .rpg-log .body .loot { color: #f2e8c6; }
  /* silk: the old coin, small, then the number */
  .rpg-silk { right: calc(290 * var(--k)); bottom: calc(26 * var(--k)); width: calc(130 * var(--k)); height: calc(44 * var(--k)); }
  .rpg-silk::after { display: none; }
  .rpg-silk .coin { left: 0; top: calc(5 * var(--k)); width: max(12px, calc(14 * var(--k))); height: max(12px, calc(14 * var(--k))); }
  .rpg-silk .l1 { left: calc(22 * var(--k)); top: 0; font-size: max(12px, calc(15 * var(--k))); font-weight: 500; color: #fff; }
  .rpg-silk .l2 { left: calc(22 * var(--k)); top: calc(22 * var(--k)); font-size: max(10px, calc(11 * var(--k))); color: rgba(240,200,120,.85); }
  .rpg-silk .l2[data-off="1"] { color: rgba(240,242,240,.7); }
  .rpg-silk .sync { right: 0; top: 0; width: max(18px, calc(20 * var(--k))); height: max(18px, calc(20 * var(--k))); border: 0; background: rgba(10,14,16,.5); font-size: 11px; }
  /* tray: five thin white line icons, the key in brackets under each, no button backgrounds */
  .rpg-tray { right: calc(28 * var(--k)); bottom: calc(22 * var(--k)); height: calc(48 * var(--k)); gap: calc(6 * var(--k)); }
  .rpg-tray button { flex: 0 0 calc(44 * var(--k)); width: calc(44 * var(--k)); height: calc(48 * var(--k)); border: 0; border-radius: 6px; background: none; box-shadow: none; flex-direction: column; justify-content: flex-start; gap: calc(4 * var(--k)); color: rgba(255,255,255,.88); }
  .rpg-tray button:hover { background: none; border: 0; color: #fff; filter: brightness(1.2); }
  .rpg-tray button[aria-pressed="true"] { border: 0; color: var(--ftf-gold-bright, #dcc08a); }
  .rpg-tray button:focus-visible { outline: 1px solid rgba(255,255,255,.6); outline-offset: 1px; }
  .rpg-tray svg { width: calc(24 * var(--k)); height: calc(24 * var(--k)); margin: 0; color: inherit; stroke-width: 1.5; filter: drop-shadow(0 1px 1px rgba(0,0,0,.8)); }
  .rpg-tray .k { position: static; transform: none; min-width: 0; padding: 0; border: 0; background: none; font: 500 max(10px, calc(12 * var(--k)))/1.2 system-ui, sans-serif; color: rgba(240,242,240,.85); text-shadow: var(--ts); }
  .rpg-tray .k { font-size: max(9px, calc(10 * var(--k))); opacity: .8; }   /* just the letter, small, under the icon (owner 13.11: no [ ] brackets) */
  .rpg-tray .dot { right: calc(6 * var(--k)); top: 0; width: 6px; height: 6px; }
  .rpg-tray .lbl { text-shadow: none; }
  .rpg-tray .i-menu { display: none; } .rpg-tray .i-gear { display: inline; }
  #rpg-tray-menu { order: 5; }
}
/* level-up banner, toasts */
.rpg-banner { left: 50%; top: calc(160 * var(--u)); transform: translateX(-50%); font: 700 calc(28 * var(--u)) var(--font-title); font-size: max(22px, calc(28 * var(--u))); color: var(--ftf-gold); text-shadow: 0 2px 8px #000; opacity: 0; }
.rpg-banner[data-show="1"] { animation: rpg-rise 1.2s var(--ease, cubic-bezier(.2,.8,.2,1)) forwards; }
@keyframes rpg-rise { 0% { opacity: 0; transform: translate(-50%, 10px); } 20% { opacity: 1; transform: translate(-50%, 0); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -20px); } }
.rpg-tip { position: fixed; z-index: 60; max-width: max(240px, calc(320 * var(--u))); padding: 10px 12px; background: var(--ftf-panel-solid, var(--ftf-panel-solid, #101f1a)); border: 1px solid var(--ftf-border); border-radius: 8px;
  color: var(--ftf-text); font: 14px/1.4 var(--font-ui, system-ui); pointer-events: none; box-shadow: 0 8px 32px rgba(0,0,0,.55); }
.rpg-tip b { display: block; font-size: 16px; margin-bottom: 2px; } .rpg-tip .m { color: var(--ftf-muted); } .rpg-tip .w { color: var(--ftf-warn); }
/* the old HUD's frame, wallet and skill bar give way to this layer (its toasts stay) */
html.rpg-on .ph-frame, html.rpg-on .ph-wallet, html.rpg-on .ph-xp, html.rpg-on .ph-vignette, html.rpg-on .ftf-cast-bar { display: none !important; }
html.rpg-on { --rpg-k: max(calc(min(100vw, 100vh * 1.7778) / 1920), 0.72px); }   /* the same scale as .rpg --k */
@media (min-width: 900px) {
  /* the old frame's heroine swap: a small badge on the portrait's lower left */
  html.rpg-on .ph-swap { left: calc(var(--rpg-k) * 22) !important; top: calc(var(--rpg-k) * 60) !important; width: max(20px, calc(var(--rpg-k) * 22)) !important; height: max(20px, calc(var(--rpg-k) * 22)) !important; border-width: 1px !important; z-index: 11; }
  /* the quest tracker (A1): plain text lines with a small gold dot in the right column under the radar; no panel, no title bar */
  html.rpg-on .ft { top: calc(var(--rpg-k) * 196) !important; right: calc(var(--rpg-k) * 30); width: max(220px, calc(var(--rpg-k) * 260)); max-height: calc(100vh - var(--rpg-k) * 300);
    padding: 0; border: 0; border-radius: 0; background: none; box-shadow: none; overflow-x: hidden; scrollbar-width: none;
    font: 500 max(12px, calc(var(--rpg-k) * 14))/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); }
  html.rpg-on .ft-head { position: absolute; right: 0; top: 0; opacity: 0; transition: opacity .15s; }   /* no title bar: only the × (hide), on hover */
  html.rpg-on .ft:hover .ft-head, html.rpg-on .ft:focus-within .ft-head { opacity: 1; }
  html.rpg-on .ft-head span, html.rpg-on .ft-key, html.rpg-on .ft-collapse { display: none; }
  html.rpg-on .ft button { text-shadow: inherit; }
  html.rpg-on .ft-ib { min-width: 0; min-height: 0; width: max(16px, calc(var(--rpg-k) * 18)); height: max(16px, calc(var(--rpg-k) * 18)); padding: 0; border: 0; border-radius: 4px; background: none; font-size: 11px; line-height: 1; color: rgba(240,242,240,.7); }
  html.rpg-on .ft-ib:hover { color: #fff; background: rgba(10,14,16,.45); }
  html.rpg-on .ft-road { display: grid; grid-template-columns: 1fr auto; align-items: baseline; column-gap: 8px; margin: 0 0 4px; padding: 0 22px 0 14px; border: 0; border-radius: 0; background: none; position: relative; }
  html.rpg-on .ft-road::before { content: ""; position: absolute; left: 1px; top: .55em; width: 7px; height: 7px; border-radius: 50%; background: rgba(232,220,180,.75); box-shadow: 0 1px 1px rgba(0,0,0,.6); }
  html.rpg-on .ft-road small { display: inline; font-size: inherit; color: rgba(240,242,240,.8); }
  html.rpg-on .ft-road b { font-size: inherit; font-weight: 600; color: var(--ftf-silk, #e8dcb4); }
  html.rpg-on .ft-road .ft-bar { grid-column: 1 / -1; height: 2px; margin-top: 2px; background: rgba(0,0,0,.4); }
  html.rpg-on .ft-q { padding: 2px 0 2px 14px; border: 0; position: relative; }
  html.rpg-on .ft-q::before { content: ""; position: absolute; left: 1px; top: calc(2px + .55em); width: 7px; height: 7px; border-radius: 50%; background: var(--ftf-gold-bright, #f0c75e); box-shadow: 0 1px 1px rgba(0,0,0,.6); }
  html.rpg-on .ft-qh { align-items: center; gap: 4px; }
  html.rpg-on .ft-title, html.rpg-on .ft-q.compact .ft-title { color: #fff; font-weight: 500; }
  html.rpg-on .ft-obj { font-size: max(11px, calc(var(--rpg-k) * 12)); color: rgba(240,242,240,.72); }
  html.rpg-on .ft-ready { font-size: max(11px, calc(var(--rpg-k) * 12)); font-weight: 600; color: #8fe0a8; }
  html.rpg-on .ft-more { font-size: max(11px, calc(var(--rpg-k) * 12)); color: rgba(240,242,240,.65); }
  html.rpg-on .ft-showmore { width: auto; height: auto; margin: 2px 0 0 14px; padding: 0; font-size: max(11px, calc(var(--rpg-k) * 12)); color: rgba(240,242,240,.6); text-decoration: underline; text-underline-offset: 2px; background: none; }
  html.rpg-on .ft-flash { animation: none; }
  /* the settings gear and the photo camera give way to the tray's gear (Esc: the game menu with Settings) and the P key */
  html.rpg-on .ftf-scene-tools, html.rpg-on .ftf-photo-open { display: none !important; }
  /* bottom-left: the chat chip as a plain line above the log; the town market line heads the log (html.rpg-mk) */
  html.rpg-on .ftf-chat { left: calc(var(--rpg-k) * 40) !important; bottom: calc(var(--rpg-k) * 144) !important; }
  html.rpg-on .ftf-chat-chip { min-height: 0; padding: 2px 0; border: 0; background: none; font-weight: 500; text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); }
  html.rpg-on .ftf-chat-chip:hover { color: #fff; }
  html.rpg-on .ftf-mk { left: calc(var(--rpg-k) * 40) !important; bottom: calc(var(--rpg-k) * 136 - max(18px, calc(var(--rpg-k) * 22))) !important; width: calc(var(--rpg-k) * 440); max-width: none !important; }
  html.rpg-on .ftf-mk > button { width: auto; max-width: 100%; min-height: max(18px, calc(var(--rpg-k) * 22)); padding: 0; gap: 6px; border: 0; border-radius: 0; background: none;
    font: 500 max(12px, calc(var(--rpg-k) * 14))/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: rgba(240,242,240,.9); text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); overflow: hidden; white-space: nowrap; }
  html.rpg-on .ftf-mk > button > span:last-child { overflow: hidden; text-overflow: ellipsis; }   /* the full text is its title (rpg/index.js syncs it) */
  html.rpg-on .ftf-mk .dot { width: 6px; height: 6px; box-shadow: none; }
  html.rpg-on .ftf-mk .box { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,.35); }   /* the last trades open upward */
}
@media (max-width: 899px) {
  html.rpg-on .ft { top: calc(164px + env(safe-area-inset-top, 0px)) !important; max-height: max(96px, calc(100vh - 356px)); }   /* under the radar, above the silk chip */
  html.rpg-on .ftf-scene-tools { right: calc(160px + env(safe-area-inset-right, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); }   /* left of the radar */
  html.rpg-on .ftf-photo-open { top: calc(12px + env(safe-area-inset-top, 0px)) !important; right: calc(208px + env(safe-area-inset-right, 0px)) !important; transform: none !important; }
  html.rpg-on .ftf-chat { left: calc(12px + env(safe-area-inset-left, 0px)) !important; bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; }
  html.rpg-on .ftf-mk { left: calc(92px + env(safe-area-inset-left, 0px)) !important; bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important; max-width: calc(100vw - 164px) !important; }
  html.rpg-on .ftf-mk > button { max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }   /* the full text is its title (rpg/index.js syncs it) */
  html.rpg-mk .rpg-log { padding-top: 0; }
  .rpg-log { display: none !important; }
}
@media (max-width: 479px) {
  html.rpg-on .ft { top: calc(160px + env(safe-area-inset-top, 0px)) !important; }
  html.rpg-on .ftf-scene-tools { right: calc(12px + env(safe-area-inset-right, 0px)); top: calc(112px + env(safe-area-inset-top, 0px)); }   /* under the small radar */
  html.rpg-on .ftf-photo-open { top: calc(112px + env(safe-area-inset-top, 0px)) !important; right: calc(60px + env(safe-area-inset-right, 0px)) !important; }
}
@media (max-width: 599px), (max-width: 899px) and (orientation: portrait), (max-width: 899px) and (max-height: 500px) {
  html.rpg-on .ft { top: calc(80px + env(safe-area-inset-top, 0px)) !important; left: calc(14px + env(safe-area-inset-left, 0px)); right: auto; width: calc(100vw - 112px); max-height: max(96px, calc(100vh - 340px)); }
  html.rpg-on .ftf-scene-tools { display: none !important; }   /* the menu button under the radar opens the game menu with Settings */
  html.rpg-on .ftf-photo-open { top: calc(94px + env(safe-area-inset-top, 0px)) !important; right: calc(76px + env(safe-area-inset-right, 0px)) !important; width: 36px !important; height: 36px !important; transform: none !important; border-color: rgba(255,255,255,.35) !important; background: rgba(10,14,16,.55) !important; }
  html.rpg-on .ftf-chat { left: calc(14px + env(safe-area-inset-left, 0px)) !important; bottom: calc(50px + env(safe-area-inset-bottom, 0px)) !important; }
  html.rpg-on .ftf-chat-chip { border-color: rgba(255,255,255,.3); background: rgba(10,14,16,.5); font-weight: 500; }
  html.rpg-on .ftf-mk { left: calc(14px + env(safe-area-inset-left, 0px)) !important; bottom: calc(6px + env(safe-area-inset-bottom, 0px)) !important; max-width: calc(50% - 76px) !important; }
  html.rpg-on .ftf-mk > button { min-height: 32px; padding: 0; border: 0; border-radius: 0; background: none; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.9); }
  html.rpg-on .ftf-mk .dot { display: none; }
  html.rpg-on .ftf-mk .mk-text { font-size: 0; }
  html.rpg-on .ftf-mk .mk-text::after { content: attr(data-n); font: 500 13px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; }   /* the count alone */
  html.rpg-on .ftf-mk .box { position: absolute; left: 0; bottom: calc(100% + 8px); width: min(320px, calc(100vw - 28px)); }
  html.rpg-on .ts-arc .ts-btn:not(.ts-use) { display: none !important; }   /* the 2 x 2 skill grid is the touch hotbar (a touch is a held key) */
  html.rpg-on body:not(.ts-on) .ftf-town-prompt { bottom: calc(200px + env(safe-area-inset-bottom, 0px)); }
}
/* phone landscape (<= 500 px tall): the portrait layout, with the tracker under the player on the left (the joystick
   zone there takes touches only where no HUD piece is), the Use pill above the 2 x 2 skills, and the heroine swap as a
   small badge on the portrait */
@media (max-width: 899px) and (max-height: 500px) and (orientation: landscape) {
  html.rpg-on .ft { top: calc(78px + env(safe-area-inset-top, 0px)) !important; width: min(300px, 40vw); max-height: max(72px, calc(100vh - 232px)); }
  html.rpg-on .ph-swap { left: calc(4px + env(safe-area-inset-left, 0px)) !important; top: calc(34px + env(safe-area-inset-top, 0px)) !important; width: 26px !important; height: 26px !important; border-width: 1px !important; z-index: 11; }
  html.rpg-on .ts-btn.ts-use { bottom: 196px; }
  html.rpg-on .ftf-chat { bottom: calc(48px + env(safe-area-inset-bottom, 0px)) !important; }
}
/* minimised panels (scenes/panel-pills.js) under the rpg HUD: small thin text lines beside the radar, no pill boxes
   (owner 13.11: the pills sat over the radar and the tracker) */
html.rpg-on .ftf-pills { top: calc(var(--rpg-k) * 30) !important; right: calc(var(--rpg-k) * 196 + env(safe-area-inset-right, 0px)) !important; gap: 2px; }
html.rpg-on .ftf-pill { min-height: 0; max-width: max(160px, calc(var(--rpg-k) * 240)); padding: 1px 0; border: 0; border-radius: 0; background: none; box-shadow: none;
  font: 500 max(11px, calc(var(--rpg-k) * 13))/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: rgba(240,242,240,.88); text-align: right;
  text-shadow: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); }
html.rpg-on .ftf-pill::before { content: "97 a0"; color: var(--ftf-gold-bright, #f0c75e); }   /* a small arrow: tap to open it again */
html.rpg-on .ftf-pill:hover { transform: none; color: #fff; text-decoration: underline; text-underline-offset: 2px; }
@media (max-width: 899px) {
  html.rpg-on .ftf-pills { top: calc(14px + env(safe-area-inset-top, 0px)) !important; right: calc(96px + env(safe-area-inset-right, 0px)) !important; }
  html.rpg-on .ftf-pill { max-width: 140px; min-height: 22px; font-size: 12px; }
}
@media (max-width: 599px), (max-width: 899px) and (orientation: portrait) {
  html.rpg-on .ftf-pills { top: calc(140px + env(safe-area-inset-top, 0px)) !important; right: calc(12px + env(safe-area-inset-right, 0px)) !important; }
  html.rpg-on .ftf-pill { max-width: 96px; }
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
  .rpg-stam { left: 76px; top: 68px; width: 192px; height: 4px; }
  .rpg-silk::after { display: none; }
  .rpg-tray button { width: 48px; } .rpg-tray svg { width: 24px; height: 24px; }
}
@media (max-width: 479px) {
  .rpg-frame { width: 256px; } .rpg-hp, .rpg-mana { width: 168px; }
  .rpg-map { width: 92px; height: 92px; border-width: 2px; } .rpg-map .n { font-size: 10px; } .rpg-map .loc { display: none; }
  .rpg-stam { width: 168px; }
  .rpg-log { display: none; }
}
.rpg-pbar { display: none; }
/* phone portrait (owner 13.11): the same transparent style. Top: the player, the compact tracker, the radar and one menu
   button under it. Bottom: the skills as a 2 x 2 grid on the right above a thin bar (the trade count, the silk, bag
   and map) and the XP line along the very bottom. Landscape phones (<= 500 px tall) share it; their own changes follow. */
@media (max-width: 599px), (max-width: 899px) and (orientation: portrait), (max-width: 899px) and (max-height: 500px) {
  .rpg { --ts: 0 1px 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.5); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-shadow: var(--ts); }
  .rpg .panel { background: none; border: 0; box-shadow: none; border-radius: 0; }
  .rpg-frame { left: calc(14px + env(safe-area-inset-left, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); width: 232px; height: 60px; }
  .rpg-portrait { left: 0; top: 0; width: 44px; height: 44px; border: 1.5px solid rgba(255,255,255,.7); box-shadow: 0 1px 3px rgba(0,0,0,.5); }
  .rpg-name { left: 58px; top: 2px; max-width: 110px; font: 600 15px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; }
  .rpg-lv { left: auto; right: 0; top: 4px; min-width: 0; height: auto; padding: 0; border: 0; border-radius: 0; background: none; font-size: 12px; font-weight: 500; line-height: 1.2; color: rgba(240,242,240,.75); }
  .rpg-hp, .rpg-mana, .rpg-stam { left: 58px; width: 112px; height: 3px; border: 0; border-radius: 2px; overflow: visible; background: rgba(0,0,0,.4); box-shadow: none; }
  .rpg-hp { top: 27px; } .rpg-mana { top: 39px; } .rpg-stam { top: 51px; }
  .rpg-hp::after, .rpg-mana::after { display: none; }
  .rpg-bar i { border-radius: 2px; } .rpg-hp i.fill { background: #e2493e; } .rpg-mana i.fill { background: #4c8ee6; } .rpg-stam i.fill { background: #8fd694; }
  .rpg-hp b, .rpg-mana b { inset: 50% auto auto calc(100% + 8px); transform: translateY(-50%); white-space: nowrap; font-size: 11px; font-weight: 500; color: rgba(240,242,240,.9); }
  .rpg-map { right: calc(12px + env(safe-area-inset-right, 0px)); top: calc(12px + env(safe-area-inset-top, 0px)); width: 72px; height: 72px; border: 1px solid rgba(255,255,255,.35); background: rgba(10,14,16,.5); box-shadow: none; }
  .rpg-map .n { top: 1px; min-width: 0; height: auto; padding: 0; background: none; color: #fff; font: 600 10px/1.2 system-ui, sans-serif; }
  .rpg-map .loc { display: none; }
  /* one round menu button under the radar (it opens the tray grid: character, skills, journal, map, bag, market, menu) */
  .rpg-tray { left: auto; right: calc(28px + env(safe-area-inset-right, 0px)); top: calc(92px + env(safe-area-inset-top, 0px)); bottom: auto; width: 40px; height: 40px; flex-direction: column; }
  .rpg-tray button { flex: 0 0 40px; width: 40px; height: 40px; border: 1px solid rgba(255,255,255,.35); border-radius: 50%; background: rgba(10,14,16,.55); box-shadow: none; }
  .rpg-tray button svg { width: 22px; height: 22px; margin: 0; color: #fff; stroke-width: 1.5; }
  .rpg-tray .k { display: none; }
  .rpg-tray[data-open="1"] { width: 160px; grid-template-columns: repeat(3, 48px); }
  .rpg-tray[data-open="1"] button { width: 48px; height: 48px; border-radius: 12px; }
  /* bag and map sit in the bottom bar */
  .rpg-tray:not([data-open="1"]) #rpg-tray-bag, .rpg-tray:not([data-open="1"]) #rpg-tray-map { display: flex; position: fixed; bottom: calc(2px + env(safe-area-inset-bottom, 0px)); width: 44px; height: 38px; border: 0; border-radius: 6px; background: none; }
  .rpg-tray:not([data-open="1"]) #rpg-tray-bag { right: calc(66px + env(safe-area-inset-right, 0px)); top: auto; }
  .rpg-tray:not([data-open="1"]) #rpg-tray-map { right: calc(12px + env(safe-area-inset-right, 0px)); top: auto; }
  .rpg-pbar { display: block; left: 0; right: 0; top: auto; bottom: 0; height: calc(42px + env(safe-area-inset-bottom, 0px)); background: linear-gradient(to top, rgba(8,12,14,.72), rgba(8,12,14,.5)); border-top: 1px solid rgba(255,255,255,.08); }
  .rpg-pbar::before, .rpg-pbar::after { content: ""; position: absolute; bottom: calc(10px + env(safe-area-inset-bottom, 0px)); width: 1px; height: 22px; background: rgba(255,255,255,.22); }
  .rpg-pbar::before { right: calc(116px + env(safe-area-inset-right, 0px)); } .rpg-pbar::after { right: calc(61px + env(safe-area-inset-right, 0px)); }
  .rpg-xp { left: 14px; right: 14px; width: auto; bottom: calc(2px + env(safe-area-inset-bottom, 0px)); height: 2px; border: 0; border-radius: 2px; background: rgba(255,255,255,.12); }
  .rpg-xp i.fill { background: #9d6cf0; } .rpg-xp .tick { display: none; }
  .rpg-silk { left: calc(50% - 56px); right: auto; top: auto; bottom: calc(5px + env(safe-area-inset-bottom, 0px)); width: 112px; height: 34px; }
  .rpg-silk .coin { left: 0; top: 9px; width: 16px; height: 16px; }
  .rpg-silk .l1 { left: 22px; top: 1px; font-size: 15px; font-weight: 500; color: #fff; }
  .rpg-silk .l2 { left: 22px; top: 20px; font-size: 9px; color: rgba(240,242,240,.7); }
  .rpg-silk .sync { right: 0; top: 5px; width: 24px; height: 24px; border: 0; background: rgba(10,14,16,.5); }
  /* the skills: a 2 x 2 grid of large touch targets above the bar on the right; no key numbers */
  .rpg-hotbar { left: auto; right: calc(14px + env(safe-area-inset-right, 0px)); transform: none; top: auto; bottom: calc(56px + env(safe-area-inset-bottom, 0px)); width: auto; height: auto;
    display: grid; grid-template-columns: repeat(2, 60px); gap: 10px; }
  .rpg-slot { flex: none; width: 60px; height: 60px; border: 1px solid rgba(255,255,255,.3); border-radius: 12px; background: rgba(10,14,16,.5); box-shadow: 0 2px 6px rgba(0,0,0,.35); }
  .rpg-slot .ic { width: 48px; height: 48px; border-radius: 9px; }
  .rpg-slot .k { display: none; }
  .rpg-castbar { bottom: calc(200px + env(safe-area-inset-bottom, 0px)); }
  .rpg-target { top: calc(140px + env(safe-area-inset-top, 0px)); }
  .rpg-buffs { left: calc(14px + env(safe-area-inset-left, 0px)); top: calc(78px + env(safe-area-inset-top, 0px)); }
}
`;
