// World HUD view model (docs/ui-world-hud.md §8). The HUD renders from a plain object of this
// shape; the orchestrator builds it from engine state, the preview page uses DEMO_MODEL, which
// reproduces the owner's mockups word for word. UI chrome labels are i18n keys inside the
// packages; narrative content here is a TextRef ({key, args}) so a language switch re-renders it.

/**
 * @typedef {{ key: string, args?: Record<string, any> }} TextRef
 *   Rendered with `tx(el, i18n, ref.key, ref.args)`. Numbers in `args` are locale-formatted by ICU
 *   ("4.6" in en, "4,6" in ru); pass strings only for hashes, names and clock times.
 */

/**
 * @typedef {Object} TrialModel
 * @property {number} n          current trial (1-based)
 * @property {number} total      trials in the season
 * @property {'explore'|'interpret'|'anchor'|'resolve'} phase   key suffix of `wh.trial.phase.*`
 * @property {number} skillTier
 * @property {number} attempts
 * @property {number} attemptsMax
 * @property {TextRef} arena     arena name
 * @property {number} progressDone
 * @property {number} progressTotal
 * @property {number} progressPct   0..100, shown as-is (the mockup rounds 12/17 to 71)
 */

/**
 * @typedef {Object} QuestModel
 * @property {string} id
 * @property {TextRef} title
 * @property {TextRef[]} body        desktop: every line; the banner shows them as separate lines
 * @property {TextRef[]} [bodyShort] mobile card variant (2 short lines); falls back to `body`
 */

/**
 * @typedef {Object} SignStat
 * @property {'stability'|'anchorStrength'|'powerRange'|'delay'} id   key suffix of `wh.sign.*`, icon: shield / link / bolt / clock
 * @property {TextRef} value
 */

/**
 * @typedef {Object} SignModel
 * @property {string} id
 * @property {number} number          "Sign #10"
 * @property {'elemental'|'conditional'} type   key suffix of `wh.sign.type.*`
 * @property {'active'|'resolved'} state
 * @property {boolean} anchored
 * @property {SignStat[]} stats        exactly four, in the mockup order
 * @property {{ shell: 0|1|2|3, tierFrom: number, tierTo: number }} anchor   shell index → `shell.N` roman numeral
 */

/**
 * @typedef {Object} LogEntry
 * @property {string} id
 * @property {string} time            clock text as shown ("13:48")
 * @property {TextRef} text
 */

/**
 * @typedef {Object} DialogueModel
 * @property {'iris'|'salt'|'ash'|'moss'|'amber'|'frost'} speaker   → `agent.<id>`
 * @property {TextRef} line
 * @property {{ id: string, hotkey: string, text: TextRef }[]} replies   `hotkey` is the keyboard hint ("A")
 * @property {boolean} [expanded]     mobile bar state
 */

/**
 * @typedef {Object} WorldHudModel
 * @property {TrialModel} trial
 * @property {QuestModel[]} quests
 * @property {number} questIndex          which quest the banner / mobile card shows
 * @property {{ text: TextRef, visible: boolean }} hint
 * @property {{ open: boolean, filter: 'all'|'active'|'resolved'|'anchors', items: SignModel[] }} signs
 * @property {{ tab: 'log'|'hints'|'lore', log: LogEntry[], hints: LogEntry[], lore: LogEntry[], unread: boolean }} journal
 * @property {{ text: TextRef, hotkey: string, visible: boolean }} prompt
 * @property {DialogueModel} dialogue
 * @property {{ id: 'map'|'signs'|'inventory'|'help'|'settings', hotkey?: string }[]} hotbar   `hotkey` omitted → icon button (settings shows the gear)
 */

/** Value formatters that produce the exact mockup renderings. */
export const fmt = {
  /** "34%" */
  pct: (n) => ({ key: 'wh.sign.pct', args: { n } }),
  /** "+5%" (negative numbers keep their own sign) */
  signedPct: (n) => ({ key: 'wh.sign.pct', args: { n: (n > 0 ? '+' : '') + n } }),
  /** "20 – 51%" */
  range: (from, to) => ({ key: 'wh.sign.range', args: { from, to } }),
  /** "4.6 s – 47.6 s" */
  seconds: (from, to) => ({ key: 'wh.sign.seconds', args: { from, to } }),
};

const t = (key, args) => (args ? { key, args } : { key });

const sign = (number, type, stability, strength, powerFrom, powerTo, delayFrom, delayTo, shell, tierFrom, tierTo) => ({
  id: 'sign-' + number,
  number,
  type,
  state: 'active',
  anchored: true,
  stats: [
    { id: 'stability', value: fmt.pct(stability) },
    { id: 'anchorStrength', value: fmt.signedPct(strength) },
    { id: 'powerRange', value: fmt.range(powerFrom, powerTo) },
    { id: 'delay', value: fmt.seconds(delayFrom, delayTo) },
  ],
  anchor: { shell, tierFrom, tierTo },
});

/**
 * Mockup content. Desktop and mobile share it; the two differences are `quests[0].bodyShort`
 * (mobile card) and `dialogue.lineMobile` (the mobile bar says "I am done speaking to Moss.").
 * @type {WorldHudModel & { dialogue: DialogueModel & { lineMobile: TextRef } }}
 */
export const DEMO_MODEL = Object.freeze({
  trial: {
    n: 13, total: 17, phase: 'explore', skillTier: 12, attempts: 3, attemptsMax: 3,
    arena: t('wh.demo.arena'), progressDone: 12, progressTotal: 17, progressPct: 71,
  },
  quests: [
    {
      id: 'q-ash-key',
      title: t('wh.demo.quest.title'),
      body: [t('wh.demo.quest.body1'), t('wh.demo.quest.body2')],
      bodyShort: [t('wh.demo.quest.body1'), t('wh.demo.quest.bodyShort2')],
    },
    { id: 'q-second-glyph', title: t('wh.demo.quest2.title'), body: [t('wh.demo.quest2.body')] },
    { id: 'q-moss', title: t('wh.demo.quest3.title'), body: [t('wh.demo.quest3.body')] },
  ],
  questIndex: 0,
  hint: { text: t('wh.demo.hint'), visible: true },
  signs: {
    open: true,
    filter: 'all',
    items: [
      sign(10, 'elemental', 34, 5, 20, 51, 4.6, 47.6, 2, 11, 13),
      sign(11, 'elemental', 45, 3, 10, 42, 3.9, 62.9, 2, 14, 15),
      sign(13, 'conditional', 39, 5, 10, 39, 4.1, 55.2, 2, 16, 16),
      { ...sign(9, 'elemental', 52, 2, 15, 40, 5.0, 38.0, 1, 8, 9), state: 'resolved', anchored: false },
    ],
  },
  journal: {
    tab: 'log',
    log: [
      { id: 'l1', time: '13:48', text: t('wh.demo.log.1') },
      { id: 'l2', time: '13:46', text: t('wh.demo.log.2') },
      { id: 'l3', time: '13:44', text: t('wh.demo.log.3') },
      { id: 'l4', time: '13:40', text: t('wh.demo.log.4') },
      { id: 'l5', time: '13:37', text: t('wh.demo.log.5') },
      { id: 'l6', time: '13:34', text: t('wh.demo.log.6') },
      { id: 'l7', time: '13:30', text: t('wh.demo.log.7') },
    ],
    hints: [
      { id: 'h1', time: '13:41', text: t('wh.demo.hints.1') },
      { id: 'h2', time: '13:20', text: t('wh.demo.hints.2') },
    ],
    lore: [
      { id: 'r1', time: '', text: t('wh.demo.lore.1') },
      { id: 'r2', time: '', text: t('wh.demo.lore.2') },
    ],
    unread: true,
  },
  prompt: { text: t('wh.demo.prompt'), hotkey: 'E', visible: true },
  dialogue: {
    speaker: 'ash',
    line: t('wh.demo.line.desktop'),
    lineMobile: t('wh.demo.line.mobile'),
    replies: [{ id: 'r-merec', hotkey: 'A', text: t('wh.demo.reply') }],
    expanded: false,
  },
  hotbar: [
    { id: 'map', hotkey: 'M' },
    { id: 'signs', hotkey: 'V' },
    { id: 'inventory', hotkey: 'I' },
    { id: 'help', hotkey: 'H' },
    { id: 'settings' },
  ],
});

/** The sign-count shown in the "All Signs (n)" chip. */
export const signCount = (model) => model.signs.items.length;

/** Items visible under a filter, in model order. */
export function filterSigns(model, filter = model.signs.filter) {
  const items = model.signs.items;
  if (filter === 'active') return items.filter((s) => s.state === 'active');
  if (filter === 'resolved') return items.filter((s) => s.state === 'resolved');
  if (filter === 'anchors') return items.filter((s) => s.anchored);
  return items;
}

/** TextRef for a sign's anchor pill: "Anchor: Shell III, Tiers 11–13" / "Anchor: Shell III, Tier 16". */
export function anchorText(i18n, a) {
  const count = a.tierTo > a.tierFrom ? 2 : 1;
  return { key: 'wh.sign.anchor', args: { shell: i18n.t('shell.' + a.shell), tiers: i18n.t('wh.sign.tiers', { count, from: a.tierFrom, to: a.tierTo }) } };
}

/** Filled segment count for the segmented bar (17 segments → 12 filled for 12/17). */
export const barSegments = (done, total) => ({ total, filled: Math.max(0, Math.min(total, Math.round(done))) });
