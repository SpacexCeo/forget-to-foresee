// The licensed music beds (owner picks, 12.11; whole pieces looped by art/audio/build_music.py, CC-BY 4.0, credited
// in docs/art/manifest.md and the README): which bed plays where. Pure, tested.
//   town          the streets inside the walls                       "Hiraeth" (Scott Buckley)
//   interior      the shops (Exchange, Scribe, Inn)                  "Tears in Rain" (Scott Buckley)
//   outside       beyond the walls, the hunt (incl. ordinary fights) "Floating Cities" (Kevin MacLeod)
//   boss          the crownrift elite engaged; the season finale     "Legionnaire" (Scott Buckley)
//   chapter_done  after a chapter (season) is passed: the outcome,   "Frozen Star" (Kevin MacLeod)
//                 and the calm back in town before Hiraeth returns
// Rain keeps the zone's bed (the rain ambience plays on top) until a rain bed is picked. The archipelago's ordinary
// trials keep the synthesized stems (null) until their bed is picked.

export const MUSIC_BEDS = Object.freeze({
  town: 'mus_town',
  interior: 'mus_interior',
  outside: 'mus_outside',
  boss: 'mus_boss',
  chapter_done: 'mus_chapter_done',
  rain: null,
  archipelago: null,
});

/** Seconds of crossfade between beds (the shop door fade is about this long). */
export const MUSIC_XFADE = 2.5;
/** Floating Cities lifts a little while monsters chase her (owner: "a slight intensity lift when mobs aggro"). */
export const AGGRO_LIFT = 1.25;
/** The elite's bed holds this long after it lets go, so a step out of its leash and back does not flap. */
export const BOSS_HOLD = 4;
/** Back in town after a passed chapter, Frozen Star plays this long (one pass) before Hiraeth returns. */
export const CHAPTER_DONE_SECONDS = 210;

const RAINY = new Set(['drizzle', 'rain', 'storm']);

/**
 * The town scene's bed. Priority: the elite fight, then a just-passed chapter (outdoors), then the zone.
 * @param {{zone?: string, weather?: string, boss?: boolean, chapterDone?: boolean}} o @param {object} [beds]
 */
export function musicFor({ zone = 'town', weather = 'clear', boss = false, chapterDone = false } = {}, beds = MUSIC_BEDS) {
  if (boss && zone !== 'interior' && beds.boss) return beds.boss;
  if (zone === 'interior') return beds.interior || beds.town || null;
  if (chapterDone && beds.chapter_done) return beds.chapter_done;
  if (RAINY.has(weather) && beds.rain) return beds.rain;
  if (zone === 'outside') return beds.outside || beds.town || null;
  return beds.town || null;
}

/**
 * The archipelago's bed by season chapter (play/chapters.js chapterFor): the final trials ('vote') get Legionnaire,
 * the outcome ('ending') Frozen Star, the rest null (the tension stems).
 */
export function archipelagoMusic(chapter, beds = MUSIC_BEDS) {
  if (chapter === 'vote') return beds.boss || null;
  if (chapter === 'ending') return beds.chapter_done || null;
  return beds.archipelago || null;
}

/** sessionStorage key: when a season's outcome was reached (ms), so the town can play Frozen Star on return. */
export const CHAPTER_DONE_KEY = 'ftf.music.chapterDone';
/** Remembers that a chapter was just passed (called once per outcome by the archipelago). */
export function markChapterDone(store = globalThis.sessionStorage, now = Date.now()) {
  try { store && store.setItem(CHAPTER_DONE_KEY, String(now)); } catch { /* storage off */ }
}
/** Seconds of Frozen Star still due when the town opens (0 if none); consumes the mark. */
export function takeChapterDone(store = globalThis.sessionStorage, now = Date.now(), within = 20 * 60e3) {
  try {
    const t = Number(store && store.getItem(CHAPTER_DONE_KEY));
    if (!t) return 0;
    store.removeItem(CHAPTER_DONE_KEY);
    return now - t >= 0 && now - t < within ? CHAPTER_DONE_SECONDS : 0;
  } catch { return 0; }
}
