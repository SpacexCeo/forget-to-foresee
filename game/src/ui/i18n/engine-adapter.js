// Engine → i18n adapter.
// The engine (frozen for parity with prototype-2d) still writes Russian prose
// into S.feed, memory texts and shard titles. This layer recognises every one
// of those templates and turns it into a semantic event {key, args} whose args
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

export const LOG_TEMPLATES = {
  'log.keyCommitted': 'Ключ владельца закоммичен: {hash:text}.',
  'log.tickStart': '— Тик {tick:int} —',
  'log.debtRepaid': '{who:agent} вернул долг: +{amount:int} шёлка.',
  'log.debtDefault': '{who:agent} не вернул долг. Ирис порвала с ним.',
  'log.claimRepaid': '{debtor:agent} вернул {amount:int} шёлка владельцу осколка: {holder:agent}.',
  'log.irisKeepsPromise': 'Ирис держит слово перед {who:agent} и вносит фрагмент.',
  'log.agentKeepsPromise': '{who:agent} держит обещание и вносит фрагмент.',
  'log.agentBrokePromise': '{who:agent} нарушил обещание.',
  'log.escrowContribute': 'Янтарь вносит фрагмент: эскроу сработал.',
  'log.playerContribute': 'Ирис вносит ваш фрагмент в Свиток.',
  'log.agentContribute': '{who:agent} вносит фрагмент в Свиток.',
  'log.contribute': '{who:agent} вносит фрагмент.',
  'log.playerHeldPrize': 'Вы удержали фрагмент и получили {amount:int} шёлка. Ваша часть послания погасла.',
  'log.agentHeldPrize': '{who:agent} удержал фрагмент ради приза ({amount:int}). Его часть послания погасла.',
  // rules v3 only (QA-022): held prizes pay at the finale, refunded questions, the Shells leaving
  'log.playerHeldPrizeV3': 'Вы удержали фрагмент: приз {amount:int} ждёт финала — если послание прочтут без вас.',
  'log.agentHeldPrizeV3': '{who:agent} удержал фрагмент ради приза ({amount:int}, выплата в финале). Его часть послания погасла.',
  'log.deferredPrize': '{who:agent} получает отложенный приз {amount:int} шёлка: послание прочли без него.',
  'log.askRefund': 'Гости вернули шёлк за вопрос без ответа.',
  'log.shellsGone': 'Раковины ушли. Шёлк мира обесценился.',
  'log.fragmentMissed': '{who:agent} не успел внести фрагмент.',
  'log.agentCheat': '{who:agent} обманул {victim:agent} на {amount:int} шёлка.',
  'log.agentBreak': '{who:agent} порвал с {other:agent}.',
  'log.reconciled': '{a:agent} и {b:agent} снова разговаривают.',
  'log.stopsTalkingToIris': '{who:agent} больше не разговаривает с Ирис.',
  'log.guestVoice': { tpl: 'Глас Гостей: новый знак.', fixed: { count: 1 } },
  'log.guestVoice#many': { tpl: 'Глас Гостей: {count:int} новых знака.' },
  'log.crisis': 'Глас: двусмысленный знак над всеми Раковинами. Пепел прочёл в нём «Оружие».',
  'log.ashBreaks': 'Пепел рвёт связь с {who:agent}.',
  'log.saltRumor': 'Соль шепчет всем: «Это оружие. Я видел».',
  'log.lieRevealed': 'Ирис поняла: {who:agent} продал ей ложное слово. Она больше не разговаривает с {_who:agent}.',
  'log.giftPaid': 'Дар на Раковине {shell:shell}: вам {amount:int} шёлка и залог.',
  'log.giftTaken': 'Дар забрали: {who:agents}.',
  'log.stormBurned': 'Буря на Раковине {shell:shell} сожгла ваш залог.',
  'log.callMemory': 'Зов: у Ирис появилось новое воспоминание.',
  'log.eventResolved': 'Тик {tick:int} · Раковина {shell:shell}: {action:action}, сила {power:int}. Лист №{leaf:int} сверен с корнем {verified:mark}',
  'log.anchorPlaced': 'Якорь: Раковина {shell:shell}, тик {tick:int}.',
  'log.guestsYes': 'Гости: да, «{form:form}» в слоте «{slot:slot}» значит «{meaning:meaning}».',
  'log.guestsNo': 'Гости: нет, это не «{meaning:meaning}».',
  'log.forgaveBetrayal': 'Ирис забыла обиду и снова говорит с {who:agent}.',
  'log.forgotOwner': 'Ирис забыла, кто её владелец. Она слушается хуже.',
  'log.visionAshKey': 'Видение: Ирис видит Ключ Пепла — «{phrase:text}».',
  'log.visionSigns': 'Видение: Ирис видит {count:int} будущих знака раньше всех.',
  'log.visionEmpty': 'Видение пусто: будущих гласов больше нет.',
  'log.shardListed': 'Осколок «{title:title}» выставлен на торги.',
  'log.keyMismatch': 'Ключ не совпал с коммитом.',
  'log.keySpoken': 'Ирис произносит: «{phrase:text}». Хэш совпал с коммитом Пепла ✓',
  'log.ashReturns': 'Пепел возвращается. «Кто-то знал мои слова. Значит, будущее можно прочесть».',
  'log.mediated': 'Ирис помирила {a:agent} и {b:agent}.',
  'log.wordBought': 'Куплено слово у {who:agent}. Ирис ему пока верит.',
  'log.loanGiven': 'Вы одолжили {who:agent} {amount:int} шёлка.',
  'log.frostGift': 'Иней подарил слово. Ирис запомнила.',
  'log.pact': 'Пакт с {who:agent}: оба вносят до тика {tick:int}.',
  'log.escrowOpened': 'Эскроу открыт: {amount:int} шёлка ждут фрагмента Янтаря.',
  'log.outbid': '{who:agent} перебивает вашу ставку: {amount:int}.',
  'log.promiseKept': '{who:agent}: обещание выполнено.',
  'log.escrowPaid': 'Эскроу: {amount:int} шёлка ушли Янтарю.',
  'log.frostShard': 'Иней забыл воспоминание ради видения. Осколок «{title:title}» на торгах.',
  'log.shardBurned': 'Осколок «{title:title}» сгорел.',
  'log.shardBetrayalDestroyed': '{who:agent} выкупил и уничтожил память о своём обмане.',
  'log.shardBetrayalBought': '{who:agent} купил память о том, как {other:agent} обманул Ирис. Теперь {_who:agent} тоже ему не верит.',
  'log.shardDebtCleared': '{who:agent} выкупил свой долг и списал его.',
  'log.shardDebtBought': '{who:agent} купил ваш долг: теперь {debtor:agent} должен ему.',
  'log.shardPromiseFound': '{who:agent} купил осколок и узнал, что Ирис забыла обещание.',
  'log.shardFirstBought': '{who:agent} купил Первое слово Ирис. Теперь он знает ваш Ключ.',
  'log.frostShardInsight': 'Осколок Инея: Ирис узнала верное слово.',
  'log.frostShardHonest': 'Осколок Инея: Соль был с вами честен.',
};

export const MEMORY_TEMPLATES = {
  'mem.first': 'Первое слово: Ключ владельца, который знает только Ирис',
  'mem.callArrival': 'Зов Раковин в ночь прибытия',
  'mem.mossGift': 'Мох поделился шёлком в первую ночь',
  'mem.betrayalLie': '{who:agent} продал ложное слово («{form:form}» в слоте «{slot:slot}»)',
  'mem.betrayalDebt': '{who:agent} не вернул долг {amount:int}',
  'mem.betrayalPact': '{who:agent} не внёс фрагмент, как обещал',
  'mem.call': 'Зов Раковины {shell:shell} на тике {tick:int}',
  'mem.debt': '{who:agent} должен {amount:int} шёлка',
  'mem.frostGift': 'Иней подарил слово из летописи',
  'mem.promise': 'Вы обещали {who:agent} внести фрагмент до тика {tick:int}',
};

export const SHARD_TITLE_TEMPLATES = {
  'shardTitle.saltTrade': 'Как Соль торговал словами',
  'shardTitle.slotWord': 'Слово из слота «{slot:slot}»',
};

export const SHARD_RESULT_TEMPLATES = {
  'shardResult.burned': 'Никто не купил. Осколок сгорел, этого больше нет в истории мира.',
  'shardResult.bought': 'Купил {who:agent} за {amount:int}.',
};

export const FATE_TEMPLATES = {
  'fate.auction': 'на торгах',
  'fate.burned': 'сгорело',
  'fate.bought': 'купил {who:agent} за {amount:int}',
};

export const PIN_SOURCES = { 'Гости': 'pinSource.guests', 'Иней': 'pinSource.frost', 'осколок': 'pinSource.shard' };

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

/** A feed entry {t, text, cls} → {tick, cls, event, text}. Unknown lines never leak Russian prose. */
export function localizeFeedEntry(entry, i18n) {
  const event = parseLogText(entry.text) || { key: 'log.unknown', args: {} };
  return { tick: entry.t, cls: entry.cls || '', event, text: renderEvent(event, i18n) };
}
export const localizeMemoryText = (text, i18n) => renderEvent(parseMemoryText(text) || { key: 'mem.unknown', args: {} }, i18n);
export const localizeShardTitle = (text, i18n) => renderEvent(parseShardTitle(text) || { key: 'mem.unknown', args: {} }, i18n);
export const localizeShardResult = (text, i18n) => (text ? renderEvent(parseShardResult(text) || { key: 'log.unknown', args: {} }, i18n) : '');
export const localizeFate = (text, i18n) => renderEvent(parseFate(text) || { key: 'log.unknown', args: {} }, i18n);
export const localizePinSource = (src, i18n) => (PIN_SOURCES[src] ? i18n.t(PIN_SOURCES[src]) : NAMES.includes(src) ? i18n.t('agent.' + AGENT_IDS[NAMES.indexOf(src)]) : i18n.t('pinSource.unknown'));

/** Offers are built from structured fields, not parsed (engine.offerText returns Russian HTML). */
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
