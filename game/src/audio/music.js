// The licensed music beds (owner picks, 12.11; built by art/audio/build_music.py, CC-BY 4.0, credited in
// docs/art/manifest.md and the README): which bed plays where. Pure, tested.
//   town      the streets inside the walls                    -> the town theme
//   interior  the shops (Exchange, Scribe, Inn)               -> "Tears in Rain" (crossfades on the door fade)
//   outside   beyond the walls, where the monsters roam      -> the combat bed when picked, else the town theme
//   archipelago                                              -> its bed when picked, else null (the old stems)
// Rain (drizzle/rain/storm) overrides the outdoor zones when a rain bed is picked; interiors keep their own bed.

/** The town theme: one of the two finalists ('mus_town_moonlight' | 'mus_town_dreams'); switch it here. */
export const TOWN_THEME = 'mus_town_moonlight';

/** zone -> bed; null = no pick yet (falls back as described above). */
export const MUSIC_BEDS = Object.freeze({
  town: TOWN_THEME,
  interior: 'mus_interior',
  outside: null,
  archipelago: null,
  rain: null,
});

export const MUSIC_ZONES = Object.freeze(['town', 'interior', 'outside', 'archipelago']);
const RAINY = new Set(['drizzle', 'rain', 'storm']);

/** Seconds of crossfade between beds (the shop door fade is about this long). */
export const MUSIC_XFADE = 2.5;

/**
 * The bed for a zone and weather, or null for "no licensed bed here" (the engine then keeps its old stems).
 * @param {{zone?: string, weather?: string}} o @param {object} [beds]
 */
export function musicFor({ zone = 'town', weather = 'clear' } = {}, beds = MUSIC_BEDS) {
  if (zone === 'interior') return beds.interior || beds.town || null;
  if (zone === 'archipelago') return (RAINY.has(weather) && beds.rain) || beds.archipelago || null;
  if (RAINY.has(weather) && beds.rain) return beds.rain;
  if (zone === 'outside') return beds.outside || beds.town || null;
  return beds.town || null;
}
