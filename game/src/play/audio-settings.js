// Volume sliders (master / music / effects) for the scene settings dialog. The dialog itself belongs to
// the UI shell (src/ui/scene-controls.js, Codex-owned), so this widget is appended to it from main.js
// without editing that file; the labels are the `audio.*` keys of the play locales (src/play/locales).
// Values persist through the audio runtime (localStorage 'ftf.audio.v1', docs/audio.md) even before the
// audio module has loaded.
import { loadVolumes, saveVolumes, BUSES } from '../audio/mix.js';
import en from './locales/en.js';
import ru from './locales/ru.js';
import uk from './locales/uk.js';
import it from './locales/it.js';
import zh from './locales/zh.js';

const labelsOf = (m) => ({ title: m['audio.title'], master: m['audio.master'], music: m['audio.music'], sfx: m['audio.sfx'] });
export const AUDIO_LABELS = Object.freeze(Object.fromEntries(Object.entries({ en, uk, ru, it, zh }).map(([locale, m]) => [locale, Object.freeze(labelsOf(m))])));
export function labelsFor(locale) { return AUDIO_LABELS[String(locale || 'en').slice(0, 2)] || AUDIO_LABELS.en; }
/** Slider rows for a volumes object: percentages 0..100 per bus. */
export function volumeRows(vols) { return BUSES.map((bus) => ({ bus, pct: Math.round(Math.min(1, Math.max(0, +vols[bus] || 0)) * 100) })); }

const CSS = `
.pl-audio { margin: 14px 0 6px; }
.pl-audio h3 { font: inherit; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; opacity: .78; margin: 0 0 8px; }
.pl-audio label { display: grid; grid-template-columns: 6.5em 1fr 3em; gap: 10px; align-items: center; margin: 6px 0; }
.pl-audio input[type=range] { width: 100%; min-width: 0; accent-color: #d9a441; }
.pl-audio output { text-align: right; font-variant-numeric: tabular-nums; opacity: .85; }`;

/**
 * @param {HTMLElement} dialog the scene controls dialog (or any container)
 * @param {{audio: () => object|null, i18n?: {locale: string, subscribe?: Function}, storage?: object}} o
 *   `audio()` returns the runtime once it has loaded (the module is lazy), null before that.
 */
export function mountAudioSettings(dialog, { audio, i18n = null, storage = null } = {}) {
  if (!dialog || typeof document === 'undefined') return null;
  if (!document.querySelector('style[data-pl-audio]')) { const st = document.createElement('style'); st.dataset.plAudio = '1'; st.textContent = CSS; document.head.append(st); }
  const section = document.createElement('section');
  section.className = 'pl-audio'; section.setAttribute('aria-labelledby', 'pl-audio-title');
  const title = document.createElement('h3'); title.id = 'pl-audio-title';
  section.append(title);
  const rows = new Map();
  const current = () => { const a = audio && audio(); return a ? a.getVolumes() : loadVolumes(storage); };
  for (const { bus, pct } of volumeRows(current())) {
    const label = document.createElement('label');
    const name = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '5'; input.value = String(pct); input.dataset.bus = bus;
    const out = document.createElement('output'); out.textContent = pct + '%';
    input.addEventListener('input', () => {
      const v = +input.value / 100; out.textContent = input.value + '%';
      const a = audio && audio();
      if (a) a.setVolume(bus, v); else saveVolumes(storage, { ...loadVolumes(storage), [bus]: v });
    });
    input.addEventListener('change', () => { const a = audio && audio(); if (a) a.play(bus === 'music' ? 'ui_confirm' : 'ui_click'); });
    label.append(name, input, out);
    section.append(label);
    rows.set(bus, { name, input, out });
  }
  function relabel() {
    const L = labelsFor(i18n ? i18n.locale : 'en');
    title.textContent = L.title;
    for (const [bus, r] of rows) { r.name.textContent = L[bus]; r.input.setAttribute('aria-label', L[bus]); }
  }
  relabel();
  const unsub = i18n && i18n.subscribe ? i18n.subscribe(relabel) : null;
  // Before the resume button when the dialog has the UI shell's layout; otherwise at the end.
  const body = dialog.querySelector ? dialog.querySelector('.ftf-dialog-body') || dialog : dialog;
  const last = body.lastElementChild;
  if (last && last.tagName === 'BUTTON') body.insertBefore(section, last); else body.append(section);
  return {
    element: section,
    /** Re-reads the runtime's volumes (e.g. after the audio module loaded). */
    refresh() { for (const { bus, pct } of volumeRows(current())) { const r = rows.get(bus); r.input.value = String(pct); r.out.textContent = pct + '%'; } },
    destroy() { if (unsub) unsub(); section.remove(); },
  };
}
