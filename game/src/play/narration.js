// Narration: an optional voice for Iris's lines, hints, the tutorial (Task I) and the chapter films
// (Task P) through the browser's Web Speech API, in the current UI locale (en, uk, ru, it, zh), with
// rate control from the player's preferences. Presentation only: it never touches the room or the
// engine, and it is a graceful no-op wherever speech synthesis is missing (old browsers, Node, a
// locked-down kiosk). No DOM is required: node tests drive it with a fake synthesizer.
//
//   import { createNarration } from './play/narration.js';
//   const narration = createNarration({ prefs, i18n });
//   narration.speak('A sign woke on Shell II.');                 // one line, queued
//   narration.say('chapter.arrival.shot1', { shell: 'II' });      // an i18n key, rendered first
//   narration.speak(text, { channel: 'film', interrupt: true });  // a film shot: cancels lines and hints
//   narration.subscribe(({ type, id }) => …);                     // 'start' | 'end' | 'cancel' | 'error'
//
// Channels (who is speaking): 'line' (Iris, the clans), 'hint' (coaching toasts), 'ui' (recaps,
// settings sample), 'tutorial', 'film'. A film or tutorial shot wins over lines and hints; hints
// never interrupt anyone and are dropped first when the queue is full.

/** BCP 47 tag per UI locale, the tag speech voices are matched against. */
export const NARRATION_LANG = Object.freeze({ en: 'en-US', uk: 'uk-UA', ru: 'ru-RU', it: 'it-IT', zh: 'zh-CN' });
/** Speaking-rate steps offered in Settings (1 = the voice's natural pace). */
export const NARRATION_RATES = Object.freeze([0.75, 0.9, 1, 1.15, 1.3]);
/** Lower channel number = more important. */
export const CHANNEL_PRIORITY = Object.freeze({ film: 0, tutorial: 0, ui: 1, line: 2, hint: 3 });
const QUEUE_MAX = 4;
/** Chromium stops long utterances after ~15 s: sentences are spoken one by one and never longer than this. */
const CHUNK_CHARS = 180;

export function localeToLang(locale) { return NARRATION_LANG[locale] || NARRATION_LANG.en; }

/** Text as it should be spoken: no markup, keyboard caps read as words, separators as pauses. */
export function stripMarkup(text) {
  return String(text == null ? '' : text)
    .replace(/<kbd>\s*([^<]*?)\s*<\/kbd>/gi, ' $1 ')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s*[·•]\s*/g, ', ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s*…/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits spoken text into sentence-sized chunks (CJK full stops included), each ≤ CHUNK_CHARS. */
export function chunkText(text, max = CHUNK_CHARS) {
  const out = [];
  const sentences = String(text).match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [String(text)];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).trim().length > max && cur) { out.push(cur.trim()); cur = ''; }
    if (s.trim().length > max) {
      // one very long sentence: break at commas, then at word boundaries
      let rest = s.trim();
      while (rest.length > max) {
        let cut = rest.lastIndexOf(',', max);
        if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
        if (cut < max / 2) cut = max;
        out.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      cur = rest ? rest + ' ' : '';
    } else cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

/** Picks the best voice for a language tag: exact tag first, then same language, local voices preferred. */
export function pickVoice(voices, lang) {
  if (!voices || !voices.length) return null;
  const norm = (v) => String(v || '').toLowerCase().replace('_', '-');
  const want = norm(lang), base = want.split('-')[0];
  const score = (v) => {
    const l = norm(v.lang);
    let s = 0;
    if (l === want) s += 40; else if (l.split('-')[0] === base) s += 20; else return -1;
    if (v.localService) s += 4;
    if (v.default) s += 2;
    if (/natural|neural|premium|enhanced/i.test(v.name || '')) s += 3;
    return s;
  };
  let best = null, bestS = -1;
  for (const v of voices) { const s = score(v); if (s > bestS) { best = v; bestS = s; } }
  return best;
}

/**
 * @param {object} o
 * @param {object} [o.prefs] UI prefs (ui/prefs.js): `narration` on/off and `narrationRate` are read live
 * @param {object} [o.i18n] for `say(key, args)` and the voice language (`i18n.locale`)
 * @param {(key:string, args?:object)=>string} [o.render] message renderer for `say` (default: i18n.t)
 * @param {object} [o.synth] speechSynthesis (default: globalThis.speechSynthesis)
 * @param {Function} [o.Utterance] SpeechSynthesisUtterance constructor (default: the global one)
 * @param {boolean} [o.enabled] overrides the prefs switch (tests, the settings "try it" button)
 * @param {number} [o.rate] overrides the prefs rate
 */
export function createNarration({ prefs = null, i18n = null, render = null, synth = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, enabled, rate } = {}) {
  const available = !!(synth && typeof synth.speak === 'function' && typeof Utterance === 'function');
  const subs = new Set();
  const queue = [];          // pending {id, chunks, lang, rate, channel, resolve}
  let current = null;        // the item being spoken
  let seq = 0, paused = false, voices = [], destroyed = false, forced = enabled;
  let unsubPrefs = null;

  const emit = (type, item, extra = {}) => { for (const fn of [...subs]) { try { fn({ type, id: item ? item.id : null, channel: item ? item.channel : null, text: item ? item.text : '', ...extra }); } catch (e) { console.warn('[narration] listener failed', e); } } };
  const prefOn = () => (forced != null ? !!forced : !!(prefs && prefs.get().narration));
  const prefRate = () => {
    if (rate != null) return clampRate(rate);
    const r = prefs ? Number(prefs.get().narrationRate) : 1;
    return clampRate(Number.isFinite(r) ? r : 1);
  };
  const locale = () => (i18n && i18n.locale) || 'en';

  function refreshVoices() {
    try { voices = (synth && typeof synth.getVoices === 'function' && synth.getVoices()) || []; } catch { voices = []; }
  }
  if (available) {
    refreshVoices();
    try { if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refreshVoices); } catch { /* optional */ }
  }
  if (prefs && typeof prefs.subscribe === 'function') {
    unsubPrefs = prefs.subscribe((p) => { if (!p.narration && forced == null) cancel(); });
  }

  function speakNext() {
    if (destroyed || current || paused || !queue.length) return;
    const item = queue.shift();
    current = item;
    emit('start', item);
    speakChunk(item, 0);
  }

  function speakChunk(item, k) {
    if (current !== item) return;
    if (k >= item.chunks.length) { finish(item, 'end'); return; }
    let u;
    try {
      u = new Utterance(item.chunks[k]);
      u.lang = item.lang;
      u.rate = item.rate;
      u.pitch = 1;
      u.volume = 1;
      const v = pickVoice(voices, item.lang);
      if (v) u.voice = v;
    } catch (e) { finish(item, 'error', { error: e }); return; }
    u.onend = () => speakChunk(item, k + 1);
    u.onerror = (e) => {
      // "interrupted" and "canceled" come from our own cancel(); anything else ends the item
      const kind = e && e.error;
      if (current === item) finish(item, kind === 'interrupted' || kind === 'canceled' ? 'cancel' : 'error', { error: kind });
    };
    item.utterance = u;
    try { synth.speak(u); } catch (e) { finish(item, 'error', { error: e }); }
  }

  function finish(item, type, extra = {}) {
    if (current !== item) return;
    current = null;
    emit(type, item, extra);
    item.resolve(type);
    speakNext();
  }

  function cancel() {
    const dropped = queue.splice(0, queue.length);
    for (const d of dropped) { emit('cancel', d); d.resolve('cancel'); }
    const cur = current;
    current = null;
    if (available) { try { synth.cancel(); } catch { /* ignore */ } }
    if (cur) { emit('cancel', cur); cur.resolve('cancel'); }
  }

  /**
   * Speaks `text` (markup stripped). Returns {id, done: Promise<'end'|'cancel'|'error'>, cancel()} or
   * null when narration is off, unavailable or the text is empty.
   * @param {string} text
   * @param {{channel?: 'line'|'hint'|'ui'|'tutorial'|'film', interrupt?: boolean, lang?: string, locale?: string, rate?: number}} [opts]
   */
  function speak(text, opts = {}) {
    if (destroyed || !available || !prefOn()) return null;
    const spoken = stripMarkup(text);
    if (!spoken) return null;
    const channel = CHANNEL_PRIORITY[opts.channel] != null ? opts.channel : 'line';
    const pr = CHANNEL_PRIORITY[channel];
    const item = {
      id: ++seq, channel, text: spoken, chunks: chunkText(spoken),
      lang: opts.lang || localeToLang(opts.locale || locale()), rate: clampRate(opts.rate != null ? opts.rate : prefRate()),
      resolve: null, utterance: null,
    };
    item.done = new Promise((r) => { item.resolve = r; });
    // a film or tutorial shot, or an explicit interrupt, silences everything less important
    if (opts.interrupt || pr === 0) {
      for (let i = queue.length - 1; i >= 0; i--) if (CHANNEL_PRIORITY[queue[i].channel] >= pr || opts.interrupt) { const [d] = queue.splice(i, 1); emit('cancel', d); d.resolve('cancel'); }
      if (current && (opts.interrupt || CHANNEL_PRIORITY[current.channel] > pr)) {
        const cur = current; current = null;
        try { synth.cancel(); } catch { /* ignore */ }
        emit('cancel', cur); cur.resolve('cancel');
      }
    }
    // a hint never waits behind other hints, and never speaks over a film
    if (channel === 'hint' && ((current && CHANNEL_PRIORITY[current.channel] === 0) || queue.some((q) => q.channel === 'hint'))) { item.resolve('cancel'); return null; }
    queue.push(item);
    while (queue.length > QUEUE_MAX) {
      // drop the least important pending item (the newest among equals)
      let di = 0;
      for (let i = 1; i < queue.length; i++) if (CHANNEL_PRIORITY[queue[i].channel] >= CHANNEL_PRIORITY[queue[di].channel]) di = i;
      const [d] = queue.splice(di, 1);
      emit('cancel', d); d.resolve('cancel');
      if (d === item) return null;
    }
    speakNext();
    return { id: item.id, done: item.done, cancel: () => cancelItem(item) };
  }

  function cancelItem(item) {
    const qi = queue.indexOf(item);
    if (qi >= 0) { queue.splice(qi, 1); emit('cancel', item); item.resolve('cancel'); return; }
    if (current === item) { current = null; try { synth.cancel(); } catch { /* ignore */ } emit('cancel', item); item.resolve('cancel'); speakNext(); }
  }

  return {
    /** True when the browser can speak at all (independent of the player's switch). */
    get available() { return available; },
    /** True when narration is on and available: callers may skip building text otherwise. */
    enabled: () => available && prefOn(),
    /** True while an utterance is being spoken. */
    get speaking() { return !!current; },
    get pending() { return queue.length; },
    speak,
    /** Renders an i18n key (through `render` or i18n.t) and speaks it. */
    say(key, args = {}, opts = {}) {
      if (!i18n && !render) return null;
      const text = render ? render(key, args) : i18n.t(key, args);
      return speak(text, opts);
    },
    cancel,
    pause() { if (paused) return; paused = true; if (available) { try { synth.pause(); } catch { /* ignore */ } } },
    resume() { if (!paused) return; paused = false; if (available) { try { synth.resume(); } catch { /* ignore */ } } speakNext(); },
    get paused() { return paused; },
    /** Temporarily forces narration on/off regardless of prefs (null = follow prefs again). */
    force(on) { forced = on; if (on === false) cancel(); },
    /** Voices the browser offers for a UI locale (empty when none: the browser may still speak with a default voice). */
    voicesFor: (loc) => { refreshVoices(); const l = localeToLang(loc || locale()); return voices.filter((v) => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(l.split('-')[0])); },
    /** True when at least one voice speaks the locale's language. */
    supports: (loc) => { refreshVoices(); return !!pickVoice(voices, localeToLang(loc || locale())); },
    rate: prefRate,
    lang: () => localeToLang(locale()),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    destroy() { destroyed = true; cancel(); subs.clear(); if (unsubPrefs) unsubPrefs(); try { if (available && typeof synth.removeEventListener === 'function') synth.removeEventListener('voiceschanged', refreshVoices); } catch { /* ignore */ } },
  };
}

function clampRate(r) { return Math.min(2, Math.max(0.5, Number(r) || 1)); }

/** A fake speech synthesizer for tests and for the no-browser path: records utterances, ends them on demand. */
export function fakeSynth({ voices = [] } = {}) {
  const spoken = [];
  let live = null;
  const synth = {
    spoken,
    getVoices: () => voices,
    speak(u) { spoken.push(u); live = u; if (u.onstart) u.onstart({ type: 'start' }); },
    cancel() { const u = live; live = null; if (u && u.onerror) u.onerror({ type: 'error', error: 'interrupted' }); },
    pause() { synth.pausedFlag = true; },
    resume() { synth.pausedFlag = false; },
    pausedFlag: false,
    /** Ends the current utterance as the browser would. */
    finish() { const u = live; live = null; if (u && u.onend) u.onend({ type: 'end' }); },
    get live() { return live; },
  };
  class FakeUtterance { constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; this.onend = null; this.onerror = null; this.onstart = null; } }
  return { synth, Utterance: FakeUtterance };
}
