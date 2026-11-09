// Engine → i18n adapter.
// The engine (frozen for parity with prototype-2d) writes English prose into
// S.feed, memory texts and shard titles. This layer recognises every one of
// those templates and turns it into a semantic event {key, args} whose args
// carry IDs, not words. Rendering then goes through the active locale, so the
// whole chronicle re-renders when the language changes mid-season.
// When the engine migrates to emitting {key, args} itself (docs/i18n-migration.md),
// parseEngineText() becomes unnecessary and renderEvent() stays as is.
import { NAMES, SLOTS, MEAN, SHORT, FORMS } from '../../game/engine.js';

export const AGENT_IDS = ['iris', 'salt', 'ash', 'moss', 'amber', 'frost'];
export const POWER = [10, 20, 40, 80];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (list) => '(' + [...list].sort((a, b) => b.length - a.length).map(esc).join('|') + ')';
const MEAN_FLAT = MEAN.flatMap((row, s) => row.map((txt, m) => ({ txt, s, m })));

/** Placeholder types: regex source + converter to a tagged, language-free value. */
const TYPES = {
  agent: { re: alt(NAMES), val: (x) => ({ $agent: NAMES.indexOf(x) }) },
  int: { re: '(-?\\d+)', val: (x) => Number(x) },
  shell: { re: alt(SHORT[0]), val: (x) => ({ $shell: SHORT[0].indexOf(x) }) },
  form: { re: alt(FORMS), val: (x) => ({ $form: FORMS.indexOf(x) }) },
  slot: { re: alt(SLOTS), val: (x) => ({ $slot: SLOTS.indexOf(x) }) },
  meaning: { re: alt(MEAN_FLAT.map((x) => x.txt)), val: (x) => { const f = MEAN_FLAT.find((y) => y.txt === x); return { $meaning: [f.s, f.m] }; } },
  action: { re: alt(MEAN[1]), val: (x) => ({ $meaning: [1, MEAN[1].indexOf(x)] }) },
  mark: { re: '(✓|✗)', val: (x) => x === '✓' },
  /** Verbatim: hashes and secret phrases are never translated (spec §9). */
  text: { re: '(.+?)', val: (x) => x },
  title: { re: '(.+)', val: (x) => ({ $msg: parseWith(TITLE_PATTERNS, x) || { key: 'mem.unknown', args: {} } }) },
  agents: { re: '(.+)', val: (x) => ({ $agents: x.split(', ').map((n) => NAMES.indexOf(n)) }) },
};

function compile(table) {
  return Object.entries(table).map(([key, spec]) => {
    const tpl = typeof spec === 'string' ? spec : spec.tpl;
    const fixed = typeof spec === 'string' ? {} : spec.fixed || {};
    const names = [];
    let src = '';
    let last = 0;
    for (const m of tpl.matchAll(/\{(\w+):(\w+)\}/g)) {
      src += esc(tpl.slice(last, m.index));
      const type = TYPES[m[2]];
      if (!type) throw new Error(`unknown placeholder type ${m[2]} in ${key}`);
      src += type.re;
      names.push([m[1], type]);
      last = m.index + m[0].length;
    }
    src += esc(tpl.slice(last));
    return { key, re: new RegExp('^' + src + '$'), names, fixed };
  });
}

function parseWith(patterns, text) {
  if (typeof text !== 'string') return null;
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const args = { ...p.fixed };
    p.names.forEach(([name, type], i) => { if (!name.startsWith('_')) args[name] = type.val(m[i + 1]); });
    return { key: p.key, args };
  }
  return null;
}

/* ---------- templates, copied verbatim from engine.js ---------- */
// The engine writes English: with the English locale, renderEvent() reproduces each line exactly
// (log.giftTaken aside, which formats the list of names). A '#suffix' marks a plural variant of a key.

export const LOG_TEMPLATES = {
  'log.keyCommitted': 'Owner’s Key committed: {hash:text}.',
  'log.tickStart': '— Tick {tick:int} —',
  'log.debtRepaid': '{who:agent} repaid the debt: +{amount:int} silk.',
  'log.debtDefault': '{who:agent} did not repay the debt. Iris cut ties.',
  'log.claimRepaid': '{debtor:agent} paid {amount:int} silk to the shard holder, {holder:agent}.',
  'log.irisKeepsPromise': 'Iris keeps her word to {who:agent} and contributes the fragment.',
  'log.agentKeepsPromise': '{who:agent} keeps the promise and contributes a fragment.',
  'log.agentBrokePromise': '{who:agent} broke the promise.',
  'log.escrowContribute': 'Amber contributes a fragment: the escrow released.',
  'log.playerContribute': 'Iris places your fragment in the Scroll.',
  'log.agentContribute': '{who:agent} places a fragment in the Scroll.',
  'log.contribute': '{who:agent} contributes a fragment.',
  'log.playerHeldPrize': 'You held your fragment and received {amount:int} silk. Your part of the message went dark.',
  'log.agentHeldPrize': '{who:agent} held a fragment for the prize ({amount:int}). That part of the message went dark.',
  // rules v3 only (QA-022): held prizes pay at the finale, refunded questions, the Shells leaving
  'log.playerHeldPrizeV3': 'You held your fragment: a prize of {amount:int} waits for the finale, paid only if the message is read without you.',
  'log.agentHeldPrizeV3': '{who:agent} held a fragment for the prize ({amount:int}, paid at the finale). That part of the message went dark.',
  'log.deferredPrize': '{who:agent} receives the deferred prize of {amount:int} silk: the message was read without them.',
  'log.askRefund': 'The Guests returned the silk for an unanswered question.',
  'log.shellsGone': 'The Shells have gone. The world’s silk has lost its worth.',
  'log.fragmentMissed': '{who:agent} did not contribute a fragment in time.',
  'log.agentCheat': '{who:agent} cheated {victim:agent} out of {amount:int} silk.',
  'log.agentBreak': '{who:agent} cut ties with {other:agent}.',
  'log.reconciled': '{a:agent} and {b:agent} are speaking again.',
  'log.stopsTalkingToIris': '{who:agent} no longer speaks to Iris.',
  'log.guestVoice': { tpl: 'The Guests speak: a new sign.', fixed: { count: 1 } },
  'log.guestVoice#many': { tpl: 'The Guests speak: {count:int} new signs.' },
  'log.crisis': 'The Voice: an ambiguous sign over every Shell. Ash read it as “Weapon”.',
  'log.ashBreaks': 'Ash cuts ties with {who:agent}.',
  'log.saltRumor': 'Salt whispers to everyone: “It is a weapon. I saw it.”',
  'log.lieRevealed': 'Iris understood: {who:agent} sold her a false word. She no longer speaks to {_who:agent}.',
  'log.giftPaid': 'Gift on Shell {shell:shell}: {amount:int} silk for you, and your stake back.',
  'log.giftTaken': 'The gift went to {who:agents}.',
  'log.stormBurned': 'A Storm on Shell {shell:shell} burned your stake.',
  'log.callMemory': 'Call: Iris has a new memory.',
  'log.eventResolved': 'Tick {tick:int} · Shell {shell:shell}: {action:action}, power {power:int}. Leaf #{leaf:int} checked against the root {verified:mark}',
  'log.anchorPlaced': 'Anchor: Shell {shell:shell}, tick {tick:int}.',
  'log.guestsYes': 'The Guests: yes, “{form:form}” in the {slot:slot} slot means “{meaning:meaning}”.',
  'log.guestsNo': 'The Guests: no, it is not “{meaning:meaning}”.',
  'log.forgaveBetrayal': 'Iris forgot the grudge and speaks to {who:agent} again.',
  'log.forgotOwner': 'Iris forgot who her owner is. She obeys less.',
  'log.visionAshKey': 'Vision: Iris sees Ash’s Key — “{phrase:text}”.',
  'log.visionSigns': 'Vision: Iris sees {count:int} future signs before anyone else.',
  'log.visionSigns#one': 'Vision: Iris sees {count:int} future sign before anyone else.',
  'log.visionEmpty': 'The vision is empty: no more voices are coming.',
  'log.shardListed': 'Shard “{title:title}” is up for auction.',
  'log.keyMismatch': 'The Key did not match the commitment.',
  'log.keySpoken': 'Iris speaks: “{phrase:text}”. The hash matches Ash’s commitment ✓',
  'log.ashReturns': 'Ash returns. “Someone knew my words. So the future can be read.”',
  'log.mediated': 'Iris reconciled {a:agent} and {b:agent}.',
  'log.wordBought': 'Bought a word from {who:agent}. Iris trusts it for now.',
  'log.loanGiven': 'You lent {who:agent} {amount:int} silk.',
  'log.frostGift': 'Frost gave a word. Iris will remember.',
  'log.pact': 'Pact with {who:agent}: both contribute by tick {tick:int}.',
  'log.escrowOpened': 'Escrow open: {amount:int} silk wait for Amber’s fragment.',
  'log.outbid': '{who:agent} outbids you: {amount:int}.',
  'log.promiseKept': '{who:agent}: promise fulfilled.',
  'log.escrowPaid': 'Escrow: {amount:int} silk went to Amber.',
  'log.frostShard': 'Frost forgot a memory for a vision. Shard “{title:title}” is up for auction.',
  'log.shardBurned': 'Shard “{title:title}” burned.',
  'log.shardBetrayalDestroyed': '{who:agent} bought and destroyed the memory of their own deceit.',
  'log.shardBetrayalBought': '{who:agent} bought the memory of how {other:agent} deceived Iris. Now {_who:agent} distrusts them too.',
  'log.shardDebtCleared': '{who:agent} bought back their own debt and wrote it off.',
  'log.shardDebtBought': '{who:agent} bought your debt: {debtor:agent} now owes them.',
  'log.shardPromiseFound': '{who:agent} bought the shard and learned that Iris forgot her promise.',
  'log.shardFirstBought': '{who:agent} bought Iris’s First Word. They now know your Key.',
  'log.frostShardInsight': 'Frost’s shard: Iris learned a true word.',
  'log.frostShardHonest': 'Frost’s shard: Salt was honest with you.',
};

export const MEMORY_TEMPLATES = {
  'mem.first': 'First Word: the owner’s Key, known only to Iris',
  'mem.callArrival': 'The Shells’ Call on the night of arrival',
  'mem.mossGift': 'Moss shared silk on the first night',
  'mem.betrayalLie': '{who:agent} sold a false word (“{form:form}” in the {slot:slot} slot)',
  'mem.betrayalDebt': '{who:agent} did not repay a debt of {amount:int}',
  'mem.betrayalPact': '{who:agent} did not contribute a fragment as promised',
  'mem.call': 'The Call of Shell {shell:shell} at tick {tick:int}',
  'mem.debt': '{who:agent} owes {amount:int} silk',
  'mem.frostGift': 'Frost gave a word from the chronicle',
  'mem.promise': 'You promised {who:agent} to contribute a fragment by tick {tick:int}',
};

export const SHARD_TITLE_TEMPLATES = {
  'shardTitle.saltTrade': 'How Salt traded in words',
  'shardTitle.slotWord': 'A word from the {slot:slot} slot',
};

export const SHARD_RESULT_TEMPLATES = {
  'shardResult.burned': 'Nobody bought it. The shard burned; it is gone from the world’s history.',
  'shardResult.bought': 'Bought by {who:agent} for {amount:int}.',
};

export const FATE_TEMPLATES = {
  'fate.auction': 'at auction',
  'fate.burned': 'burned',
  'fate.bought': 'bought by {who:agent} for {amount:int}',
};

export const PIN_SOURCES = { 'the Guests': 'pinSource.guests', 'Frost': 'pinSource.frost', 'a shard': 'pinSource.shard' };

const strip = (ev) => ev && ev.key.includes('#') ? { ...ev, key: ev.key.split('#')[0] } : ev;
const MEMORY_PATTERNS = compile(MEMORY_TEMPLATES);
const TITLE_PATTERNS = [...compile(SHARD_TITLE_TEMPLATES), ...MEMORY_PATTERNS];
const LOG_PATTERNS = compile(LOG_TEMPLATES);
const RESULT_PATTERNS = compile(SHARD_RESULT_TEMPLATES);
const FATE_PATTERNS = compile(FATE_TEMPLATES);

/** Every i18n key the adapter can emit (the missing-key test checks them all). */
export const ADAPTER_KEYS = [...new Set([
  ...[LOG_TEMPLATES, MEMORY_TEMPLATES, SHARD_TITLE_TEMPLATES, SHARD_RESULT_TEMPLATES, FATE_TEMPLATES].flatMap((t) => Object.keys(t).map((k) => k.split('#')[0])),
  ...Object.values(PIN_SOURCES), 'log.unknown', 'mem.unknown',
])];

/** Engine feed line → semantic event, or null when no template matches. */
export const parseLogText = (text) => strip(parseWith(LOG_PATTERNS, text));
export const parseMemoryText = (text) => parseWith(MEMORY_PATTERNS, text);
export const parseShardTitle = (text) => parseWith(TITLE_PATTERNS, text);
export const parseShardResult = (text) => parseWith(RESULT_PATTERNS, text);
export const parseFate = (text) => parseWith(FATE_PATTERNS, text);

/* ---------- rendering ---------- */

const listFmt = new Map();
function joinList(items, locale) {
  try {
    let f = listFmt.get(locale);
    if (!f) { f = new Intl.ListFormat(locale, { type: 'conjunction' }); listFmt.set(locale, f); }
    return f.format(items);
  } catch { return items.join(', '); }
}

/** Resolves one tagged argument into display text for the active locale. */
export function resolveArg(v, i18n) {
  if (v == null || typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if ('$agent' in v) return i18n.t('agent.' + (AGENT_IDS[v.$agent] || 'unknown'));
  if ('$shell' in v) return i18n.t('shell.' + v.$shell);
  if ('$form' in v) return i18n.t('form.' + v.$form);
  if ('$slot' in v) return i18n.t('slot.' + v.$slot);
  if ('$meaning' in v) return i18n.t(`meaning.${v.$meaning[0]}.${v.$meaning[1]}`);
  if ('$agents' in v) return joinList(v.$agents.map((i) => i18n.t('agent.' + (AGENT_IDS[i] || 'unknown'))), i18n.locale);
  if ('$msg' in v) return renderEvent(v.$msg, i18n);
  return '';
}

/** Renders a semantic event {key, args} in the active locale. */
export function renderEvent(ev, i18n) {
  if (!ev) return i18n.t('log.unknown');
  const args = {};
  for (const [k, v] of Object.entries(ev.args || {})) args[k] = resolveArg(v, i18n);
  return i18n.t(ev.key, args);
}

/** A feed entry {t, text, cls} → {tick, cls, event, text}. Unknown lines never leak raw engine prose. */
export function localizeFeedEntry(entry, i18n) {
  const event = parseLogText(entry.text) || { key: 'log.unknown', args: {} };
  return { tick: entry.t, cls: entry.cls || '', event, text: renderEvent(event, i18n) };
}
export const localizeMemoryText = (text, i18n) => renderEvent(parseMemoryText(text) || { key: 'mem.unknown', args: {} }, i18n);
export const localizeShardTitle = (text, i18n) => renderEvent(parseShardTitle(text) || { key: 'mem.unknown', args: {} }, i18n);
export const localizeShardResult = (text, i18n) => (text ? renderEvent(parseShardResult(text) || { key: 'log.unknown', args: {} }, i18n) : '');
export const localizeFate = (text, i18n) => renderEvent(parseFate(text) || { key: 'log.unknown', args: {} }, i18n);
export const localizePinSource = (src, i18n) => (PIN_SOURCES[src] ? i18n.t(PIN_SOURCES[src]) : NAMES.includes(src) ? i18n.t('agent.' + AGENT_IDS[NAMES.indexOf(src)]) : i18n.t('pinSource.unknown'));

/** Offers are built from structured fields, not parsed (engine.offerText returns English HTML). */
export function offerEvent(o) {
  const who = { $agent: o.from };
  switch (o.kind) {
    case 'sell': return { key: 'offer.sell', args: { who, form: { $form: o.f }, slot: { $slot: o.s }, meaning: { $meaning: [o.s, o.m] }, price: o.price } };
    case 'loan': return { key: 'offer.loan', args: { who, amount: o.n, back: o.back, tick: o.due } };
    case 'gift': return { key: 'offer.gift', args: { who } };
    case 'pact': return { key: 'offer.pact', args: { who, tick: o.by } };
    case 'escrow': return { key: 'offer.escrow', args: { who, price: o.price } };
    default: return { key: 'offer.unknown', args: { who } };
  }
}
export const localizeOffer = (o, i18n) => ({ speakerId: AGENT_IDS[o.from], speaker: i18n.t('agent.' + AGENT_IDS[o.from]), text: renderEvent(offerEvent(o), i18n) });

/** What forgetting a memory would do (engine.effectText equivalent). */
export function effectEvent(m) {
  const who = m.about != null ? { $agent: m.about } : '';
  switch (m.kind) {
    case 'first': return { key: 'effect.first', args: {} };
    case 'call': return { key: 'effect.call', args: {} };
    case 'gift': return { key: 'effect.gift', args: { who } };
    case 'betrayal': return { key: 'effect.betrayal', args: { who } };
    case 'debt': return { key: 'effect.debt', args: { who, amount: m.data.amount, tick: m.data.due } };
    case 'promise': return { key: 'effect.promise', args: { who, tick: m.data.by } };
    default: return { key: 'effect.unknown', args: {} };
  }
}

/* ---------- S.fx → agent lines (subtitles under the holograms, spec §3) ---------- */

const WALK_KINDS = ['silk', 'betray', 'shard', 'gift'];
/** Semantic visual event → {speakerId, key, args}, or null when it has no spoken line. */
export function fxToLine(fx) {
  const agent = (i) => AGENT_IDS[i];
  switch (fx.type) {
    case 'voice': return { speakerId: 'guests', key: 'line.voice', args: { count: fx.n } };
    case 'crisis': return { speakerId: 'ash', key: 'line.crisis', args: {} };
    case 'event': return { speakerId: 'guests', key: 'line.event', args: { shell: { $shell: fx.place }, action: { $meaning: [1, fx.action] }, power: POWER[fx.power], verified: fx.verified ? 'yes' : 'no' } };
    case 'anchor': return { speakerId: 'iris', key: 'line.anchor', args: { shell: { $shell: fx.place }, tick: fx.t } };
    case 'ask': return { speakerId: 'guests', key: fx.yes ? 'line.askYes' : 'line.askNo', args: {} };
    case 'memory_burned': return { speakerId: 'iris', key: fx.purpose === 'key' ? 'line.burnKey' : 'line.burnVision', args: { kind: fx.kind } };
    case 'key_spoken': return { speakerId: 'ash', key: 'line.keySpoken', args: {} };
    case 'fragment': return { speakerId: agent(fx.i), key: fx.i === 0 ? 'line.fragmentIris' : 'line.fragment', args: {} };
    case 'dark': return { speakerId: agent(fx.i), key: 'line.dark', args: {} };
    case 'break': return { speakerId: agent(fx.i), key: 'line.break', args: { other: { $agent: fx.j } } };
    case 'mend': return { speakerId: agent(fx.i), key: 'line.mend', args: { other: { $agent: fx.j } } };
    case 'walk': return { speakerId: agent(fx.from), key: 'line.walk.' + (WALK_KINDS.includes(fx.kind) ? fx.kind : 'silk'), args: { to: { $agent: fx.to } } };
    case 'pact': return { speakerId: agent(fx.with), key: 'line.pact', args: {} };
    case 'escrow': return { speakerId: 'amber', key: 'line.escrow', args: {} };
    case 'end': return { speakerId: 'guests', key: 'line.end', args: { outcome: fx.outcome } };
    default: return null;
  }
}
export const LINE_KEYS = ['line.voice', 'line.crisis', 'line.event', 'line.anchor', 'line.askYes', 'line.askNo', 'line.burnKey', 'line.burnVision', 'line.keySpoken', 'line.fragmentIris', 'line.fragment', 'line.dark', 'line.break', 'line.mend', ...WALK_KINDS.map((k) => 'line.walk.' + k), 'line.pact', 'line.escrow', 'line.end'];

/** Renders an agent line: {speakerId, speaker, text}. */
export function renderLine(line, i18n) {
  return { speakerId: line.speakerId, speaker: i18n.t('agent.' + line.speakerId), text: renderEvent(line, i18n) };
}
