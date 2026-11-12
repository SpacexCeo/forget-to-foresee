// Touch-aware copy (owner, 12.11: "on a phone there is no K"). On touch devices every translated string passes through
// touchCopy(): keyboard hints in brackets disappear in every language, and the English phrasings that name a key
// say the touch action instead. Strings written for touch on purpose (ICU `input` selects, *.touch keys) pass unchanged.

const RULES = [
  [/\s?\((?:[A-Z]|Esc|Space|F\d{1,2})\)/g, ''],                              // "Walk there (G)" -> "Walk there" (any language)
  [/\bLeft click to cast · Esc to put it away\b/g, 'Release to cast · drag to the left to cancel'],
  [/\bN or Esc closes the map\./g, 'Tap ✕ to close the map.'],
  [/\b[Pp]ress K, or Esc → menu\b/g, 'tap ⇄ on your portrait'],
  [/\bEsc opens the menu\b/g, 'The Controls button opens the menu'],
  [/\bEsc → menu\b/g, 'Controls → menu'],
  [/\b([Pp])ress E again\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap Use again'],
  [/\b([Pp])ress E\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap Use'],
  [/\b([Pp])ress T\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap End trial'],
  [/\b([Pp])ress V\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap Signs & Visions'],
  [/\b([Pp])ress M\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap Memories'],
  [/\b([Pp])ress K\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap ⇄ on your portrait'],
  [/\b([Pp])ress G\b/g, (_, p) => (p === 'P' ? 'T' : 't') + 'ap the quest'],
  [/\b([Cc])lick (a|the|any|an) /g, (_, c, w) => (c === 'C' ? 'T' : 't') + 'ap ' + w + ' '],
];

/** Pure: the touch version of a UI string. */
export function touchCopy(text) {
  if (typeof text !== 'string' || !text) return text;
  let s = text;
  for (const [re, to] of RULES) s = s.replace(re, to);
  return s;
}

/** Wraps `i18n.t` once so strings follow the device: `isTouch()` is read at every call. */
export function installTouchCopy(i18n, isTouch) {
  if (!i18n || i18n.__touchCopy) return;
  const raw = i18n.t;
  // touch: a written touch variant (`<key>.touch` in the locale) wins; otherwise the generic rewrite
  i18n.t = (key, args) => {
    if (!isTouch()) return raw(key, args);
    if (typeof key === 'string' && !key.endsWith('.touch') && i18n.has && i18n.has(key + '.touch')) return raw(key + '.touch', args);
    return touchCopy(raw(key, args));
  };
  i18n.__touchCopy = true;
}
