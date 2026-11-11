// Scripted townsfolk dialogue (owner, 11.11: no language model): a small intent matcher over what the player types.
// The keyword lists live in the locale files (`chat.lex.*`, pipe-separated, any of the five languages), so the matcher
// works in the player's language and falls back to English words. A reply is a locale key plus arguments built from
// the agent's real state (measured return, last trade, price). Pure and deterministic.

export const INTENTS = Object.freeze(['greet', 'hire', 'status', 'trade', 'explain', 'where', 'help', 'bye']);
export const TOPICS = Object.freeze(['silk', 'shell', 'sign', 'trial', 'seal', 'shard', 'memory', 'slots']);
export const PLACES = Object.freeze(['exchange', 'scribe', 'inn', 'altar', 'board', 'mirror']);

/** Lower case, no punctuation, ё as е, single spaces. */
export function normalize(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** The words of a lexicon entry ("hello|good day|hi"), normalized. */
const words = (s) => String(s || '').split('|').map(normalize).filter(Boolean);

/** Whether `norm` contains `w` as a word prefix (so "trades" matches "trade"), or as a substring for CJK text. */
function hit(norm, w) {
  if (/[぀-鿿]/.test(w)) return norm.includes(w);
  return (' ' + norm).includes(' ' + w);
}

/**
 * Matches a phrase to an intent.
 * @param {string} text  what the player typed
 * @param {(key: string) => string} lex  locale lookup for `chat.lex.*` (current locale; English words always count too)
 * @returns {{intent: string, topic: string|null, score: number}}
 */
export function matchIntent(text, lex) {
  const norm = normalize(text);
  if (!norm) return { intent: 'help', topic: null, score: 0 };
  const score = (key) => words(lex(key)).reduce((n, w) => n + (hit(norm, w) ? w.length : 0), 0);
  const topic = TOPICS.map((t) => [t, score('chat.lex.topic.' + t)]).sort((a, b) => b[1] - a[1])[0];
  const place = PLACES.map((p) => [p, score('chat.lex.place.' + p)]).sort((a, b) => b[1] - a[1])[0];
  const scores = Object.fromEntries(INTENTS.map((i) => [i, score('chat.lex.' + i)]));
  // a named place with a "where" word, or a word to explain, decides the topic
  if (place[1] && (scores.where || !topic[1])) return { intent: 'where', topic: place[0], score: place[1] + scores.where };
  if (topic[1]) return { intent: 'explain', topic: topic[0], score: topic[1] + scores.explain };
  const best = INTENTS.filter((i) => !['explain', 'where'].includes(i)).map((i) => [i, scores[i]]).sort((a, b) => b[1] - a[1])[0];
  return best[1] ? { intent: best[0], topic: null, score: best[1] } : { intent: 'unknown', topic: null, score: 0 };
}

/**
 * The scripted reply: {key, args}. `agent` is the ledger's view of the townsperson ({measured, experience, price,
 * recent}); `lastTrade` the newest log line of this agent or null.
 */
export function replyFor(match, { agent = null, lastTrade = null, rounds = 5 } = {}) {
  switch (match.intent) {
    case 'greet': return { key: 'chat.greet', args: {} };
    case 'hire': return { key: 'chat.hire', args: { price: agent ? agent.price : 10, rounds } };
    case 'status': return agent && agent.measured != null
      ? { key: agent.measured >= 0.98 ? 'chat.status.good' : 'chat.status.bad', args: { pct: (agent.measured * 100).toFixed(1), n: agent.recent.length, exp: agent.experience } }
      : { key: 'chat.status.novice', args: {} };
    case 'trade': return lastTrade ? { key: 'chat.trade', args: { echo: lastTrade.echo, side: lastTrade.side, result: (lastTrade.result >= 0 ? '+' : '') + (lastTrade.result / 100).toFixed(2), reason: lastTrade.reason } } : { key: 'chat.trade.none', args: {} };
    case 'explain': return { key: 'gloss.' + match.topic + '.def', args: {} };
    case 'where': return { key: 'chat.where.' + match.topic, args: {} };
    case 'bye': return { key: 'chat.bye', args: {} };
    case 'help': return { key: 'chat.help', args: {} };
    default: return { key: 'chat.unknown', args: {} };
  }
}
