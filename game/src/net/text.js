// English rendering for API payloads. Events and observations carry semantic {key, args} (IDs, not
// words) plus English text; clients may re-render the key in another locale. Engine prose is parsed
// by the UI's engine adapter, so the API and the HUD use one set of templates.
import en from '../locales/en.js';
import { createI18n } from '../ui/i18n/i18n.js';
import {
  localizeFeedEntry, localizeMemoryText, localizeShardTitle, localizeShardResult, localizeFate, localizePinSource,
  offerEvent, effectEvent, fxToLine, renderEvent, renderLine,
} from '../ui/i18n/engine-adapter.js';

/** World-layer dialogue and description templates (English only: the API is English). */
export const WORLD_TEMPLATES = {
  'dialogue.greet.warm': '“Iris. Sit by our fire; you are welcome here.”',
  'dialogue.greet.neutral': '“Iris. What brings you to our camp?”',
  'dialogue.greet.cold': '“Say what you came for, Iris, and go.”',
  'dialogue.refuse': '{who} turns away. They are not speaking to Iris. (Mend the link first.)',
  'dialogue.isolated': '“I read the sign over the Shells. It is a weapon. Leave me be.”',
  'dialogue.noOffers': '“Nothing to trade this tick.”',
  'dialogue.promise': '“Remember your promise: your fragment in the Scroll by tick {tick}.”',
  'dialogue.helper': '“You are not Iris. Only Iris trades with the clans.”',
  'inspect.scroll': 'The Scroll medallion: {inScroll} of 6 fragments are in. {revealed} signs are recorded in the chronicle.',
  'inspect.anchorZone': 'Anchor zone of Shell {shell}. Your anchors here: {count}.',
  'inspect.pedestal': 'The memory-shard pedestal. Open auctions: {open}.',
  'inspect.camp': 'Camp of {who}. Fragment: {fragment}. Link with Iris: {link}.',
  'inspect.glass': 'Behind the glass a Guest draws {count} round signs.',
  'clue.chronicle': 'Chronicle, tick {tick}: the sign meant Shell {place}, {action}, power {power}, after {delay} ticks.',
  'clue.prophecy': 'The Guest\'s sign #{index}, published at tick {pub}.',
  'clue.vision': 'The Guest\'s sign #{index}, seen in a vision before its publication at tick {pub}.',
};

const i18n = createI18n({ messages: { en: { ...en, ...WORLD_TEMPLATES } }, locale: 'en', onMissing: () => {} });
export const t = (key, args) => i18n.t(key, args);
export const render = (ev) => renderEvent(ev, i18n);

export const logEntry = (f) => { const e = localizeFeedEntry(f, i18n); return { tick: e.tick, tone: e.cls || 'plain', key: e.event.key, args: e.event.args, text: e.text }; };
export const memoryText = (txt) => localizeMemoryText(txt, i18n);
export const shardTitle = (txt) => localizeShardTitle(txt, i18n);
export const shardResult = (txt) => localizeShardResult(txt, i18n);
export const fateText = (txt) => localizeFate(txt, i18n);
export const pinSource = (src) => localizePinSource(src, i18n);
export const offerText = (o) => { const ev = offerEvent(o); return { key: ev.key, args: ev.args, text: renderEvent(ev, i18n) }; };
export const effectTextEn = (m) => renderEvent(effectEvent(m), i18n);
export const fxLine = (fx) => { const ln = fxToLine(fx); if (!ln) return null; const r = renderLine(ln, i18n); return { speakerId: ln.speakerId, speaker: r.speaker, key: ln.key, args: ln.args, text: r.text }; };
export const reasonText = (reason) => (i18n.has('reason.' + reason) ? i18n.t('reason.' + reason) : reason.replace(/_/g, ' '));
