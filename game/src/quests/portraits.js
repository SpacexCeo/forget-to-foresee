// Every speaker's bust portrait (game/public/assets/ui/portraits/<key>_{128,256}.webp): the quest givers', the townsfolk,
// the children, the Wayfarer, the Hatchkeeper and the heroines (owner 14.11: every dialogue speaker shows a face). Shown next
// to "From: <giver>" in the journal, in the talk panels and in the wake-up dialogue, with a letter fallback (market/art.js artBox).
export const PORTRAIT_GIVERS = Object.freeze(['elder', 'guard', 'innkeeper', 'lamplighter', 'shardkeeper', 'baker', 'courier', 'musician', 'scribe', 'shrinekeeper',
  'sweeper', 'child_a', 'child_b', 'wayfarer', 'hatchkeeper', 'iris', 'elise', 'sheriffchenko']);
const defaultBase = () => { try { return (import.meta.env && import.meta.env.BASE_URL) || '/'; } catch { return '/'; } };
/** The portrait of a giver (128 or 256 px), or null for anyone else. Pure. */
export const portraitPath = (giver, size = 128, base = defaultBase()) => (PORTRAIT_GIVERS.includes(giver) ? `${base}assets/ui/portraits/${giver}_${size >= 200 ? 256 : 128}.webp` : null);
