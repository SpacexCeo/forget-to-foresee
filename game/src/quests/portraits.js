// The five quest givers' portraits (game/public/assets/ui/portraits/<giver>_{128,256}.webp, transparent): shown next
// to "From: <giver>" in the journal and in the talk panel, with a letter fallback (market/art.js artBox).
export const PORTRAIT_GIVERS = Object.freeze(['elder', 'guard', 'innkeeper', 'lamplighter', 'shardkeeper']);
const defaultBase = () => { try { return (import.meta.env && import.meta.env.BASE_URL) || '/'; } catch { return '/'; } };
/** The portrait of a giver (128 or 256 px), or null for anyone else. Pure. */
export const portraitPath = (giver, size = 128, base = defaultBase()) => (PORTRAIT_GIVERS.includes(giver) ? `${base}assets/ui/portraits/${giver}_${size >= 200 ? 256 : 128}.webp` : null);
