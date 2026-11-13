// Remote feature flags (a reference game teardown M8 / F0): the owner can switch a feature off (or on) during freeze night
// without a code deploy, by editing the static /features.json next to the build. At boot the file is fetched with a
// 3 s timeout and no cache; its values are merged over the built-in defaults below. A name the build does not define is
// ignored (the file can only toggle what this build contains), and only real booleans count ("true" does not). Any
// failure keeps the defaults, silently. Nothing waits for it: until it answers, the defaults hold.

/** Built-in defaults: every new feature is OFF in main until the owner turns it on. `flags` is the layer itself. */
export const DEFAULT_FLAGS = Object.freeze({
  flags: true,
  damageNumbers: false,
  loadRitual: false,
  register: false,
  loomMeter: false,
  presenceChip: false,
  tuneOverlay: false,
  statusBanner: false,
  // sprint 5h (docs/plans/sprint/FTF-5h-Six-Agent-Sprint.md 3.6): off until A5 turns them on in features.json
  questJournal: false, questTracker: false, autoWalk: false, starterGuide: false,
  rpgHud: false, skillTree: false, hotbar: false,
  marketplace: false, lootFx: false, playGames: false, silkView: false,
  newPlayerIntro: false, labPrologue: false, agentTournament: false, firstSeenTips: false,
  glassShoal: false, // the level-5 boss fight: quest, Loomblade, dragon ride, the Glass Shoal (docs/plans/boss/glass-shoal-boss.md)
  accountLogin: false, // sign in / create account with a NEAR, EVM or Solana wallet (docs/account-login.md)
  glassShoal: false, // the level-5 boss island (docs/plans/boss/glass-shoal-boss.md); ?ff=glassShoal previews it
});
export const FEATURES_TIMEOUT_MS = 3000;
export const SPRINT_FLAGS = Object.freeze(['questJournal', 'questTracker', 'autoWalk', 'starterGuide', 'rpgHud', 'skillTree', 'hotbar', 'marketplace', 'lootFx', 'playGames', 'silkView', 'newPlayerIntro', 'labPrologue', 'agentTournament', 'firstSeenTips']);

/** Pure: ?ff=all | ?ff=name,name (tests and previews): flags switched on for this page only; unknown names ignored. */
export function queryFlags(search = '', defaults = DEFAULT_FLAGS) {
  let q = null; try { q = new URLSearchParams(search).get('ff'); } catch { q = null; }
  if (!q) return {};
  const names = q === 'all' ? SPRINT_FLAGS : q.split(',').map((x) => x.trim());
  return Object.fromEntries(names.filter((n) => n in defaults).map((n) => [n, true]));
}

/** Pure: defaults + a parsed remote object -> the merged flags (unknown names and non-booleans dropped). */
export function mergeFlags(remote, defaults = DEFAULT_FLAGS) {
  const out = { ...defaults };
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return out;
  const src = remote.flags && typeof remote.flags === 'object' && !Array.isArray(remote.flags) ? remote.flags : remote;
  for (const k of Object.keys(defaults)) if (typeof src[k] === 'boolean') out[k] = src[k];
  return out;
}

/**
 * The flag store. `load()` fetches once; `on(name)` answers from the defaults until then.
 * @param {{url?: string, fetch?: Function, timeoutMs?: number, defaults?: object}} [o]
 */
export function createFeatures({ url = ((import.meta.env && import.meta.env.BASE_URL) || '/') + 'features.json', fetch = globalThis.fetch, timeoutMs = FEATURES_TIMEOUT_MS, defaults = DEFAULT_FLAGS } = {}) {
  const forced = queryFlags((globalThis.location && globalThis.location.search) || '', defaults); // ?ff= wins over the file
  let flags = { ...defaults, ...forced }, source = 'default', loading = null;
  const listeners = new Set();
  return {
    get source() { return source; },
    on: (name) => flags[name] === true,
    all: () => ({ ...flags }),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    load() {
      if (loading) return loading;
      loading = (async () => {
        if (typeof fetch !== 'function') return flags;
        const ac = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = setTimeout(() => ac && ac.abort(), timeoutMs);
        try {
          const r = await Promise.race([fetch(url, { cache: 'no-store', signal: ac ? ac.signal : undefined }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))]);
          if (!r || !r.ok) return flags;
          const j = await r.json();
          if (!j || typeof j !== 'object') return flags;
          flags = { ...mergeFlags(j, defaults), ...forced }; source = 'remote';
          for (const fn of [...listeners]) { try { fn(flags); } catch { /* a listener's own problem */ } }
        } catch { /* offline, timeout, bad JSON: the defaults hold */ } finally { clearTimeout(timer); }
        return flags;
      })();
      return loading;
    },
  };
}

/** The game's one flag store (fetched once by boot-world.js). */
export const features = createFeatures();
