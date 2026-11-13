// The loading screen as a quiet ritual (a reference game teardown M4 / F2, flag `loadRitual`; reimplemented in our misty voice).
// On top of the existing loading screen (#boot, ui/loading.js): the central hub warms from dormant to lit with the
// progress (--boot-p), the bar reads as the way in, and one Iris-voice line turns every 4 s with a controls hint. No
// counter is shown: the Register count does not exist yet, and a number is never invented. Reduced motion: no glow pulse,
// the lines change without a fade. Pure helpers are exported for the tests.

export const TIP_MS = 4000;
/** Iris-voice lines (teardown §9), in five languages; only lines that are true in this build. */
export const TIPS = Object.freeze({
  en: ['The Loom is hungry.', 'Silk burns. The Gate remembers.', 'Pay the Gate once. The valley opens.', 'Spiders keep time. Learn their count.', 'A quiet clan is not an empty clan.', 'Iris translates the Loom. Badly. She is a doctor, not a poet.', 'Iris: a doctor-linguist from another planet, year 2048. She came through the glass.', 'Free. Testnet. No promises. Only the Loom.', 'The Loom remembers who fed it.'],
  ru: ['Ткацкий Станок голоден.', 'Шёлк сгорает. Врата помнят.', 'Заплати Вратам однажды, и долина откроется.', 'Пауки ведут счёт времени. Выучи их счёт.', 'Тихий клан — не пустой клан.', 'Ирис переводит Станок. Плохо. Она врач, а не поэт.', 'Ирис — врач-лингвист с другой планеты, 2048 год. Она пришла сквозь стекло.', 'Бесплатно. Тестнет. Без обещаний. Только Станок.', 'Станок помнит, кто его кормил.'],
  uk: ['Ткацький Верстат голодний.', 'Шовк згоряє. Брама памʼятає.', 'Заплати Брамі один раз, і долина відкриється.', 'Павуки ведуть лік часу. Вивчи їхній лік.', 'Тихий клан — не порожній клан.', 'Ірис перекладає Верстат. Погано. Вона лікарка, а не поетка.', 'Ірис — лікарка-лінгвістка з іншої планети, 2048 рік. Вона прийшла крізь скло.', 'Безкоштовно. Тестнет. Без обіцянок. Лише Верстат.', 'Верстат памʼятає, хто його годував.'],
  it: ['Il Telaio ha fame.', 'La seta brucia. Il Portale ricorda.', 'Paga il Portale una volta. La valle si apre.', 'I ragni tengono il tempo. Impara il loro conto.', 'Un clan silenzioso non è un clan vuoto.', 'Iris traduce il Telaio. Male. È una medica, non una poetessa.', 'Iris: medica e linguista da un altro pianeta, anno 2048. È arrivata attraverso il vetro.', 'Gratis. Testnet. Nessuna promessa. Solo il Telaio.', 'Il Telaio ricorda chi lo ha nutrito.'],
  zh: ['织机饿了。', '丝在燃烧。门扉记得。', '向门扉付一次，山谷就会打开。', '蜘蛛在计时。学会它们的节拍。', '安静的氏族并非空无一人。', '艾瑞斯在翻译织机。翻得很糟。她是医生，不是诗人。', '艾瑞斯：来自另一颗星球的医生兼语言学家，2048 年。她穿过玻璃而来。', '免费。测试网。没有承诺。只有织机。', '织机记得谁喂过它。'],
});
export const HINTS = Object.freeze({
  en: { touch: 'Left thumb walks, right thumb looks.', keys: 'WASD to walk, the mouse to look, E to speak.' },
  ru: { touch: 'Левый палец — идти, правый — смотреть.', keys: 'WASD — идти, мышь — смотреть, E — говорить.' },
  uk: { touch: 'Лівий палець — іти, правий — дивитися.', keys: 'WASD — іти, миша — дивитися, E — говорити.' },
  it: { touch: 'Il pollice sinistro cammina, il destro guarda.', keys: 'WASD per camminare, il mouse per guardare, E per parlare.' },
  zh: { touch: '左手拇指行走，右手拇指环顾。', keys: 'WASD 行走，鼠标环顾，E 交谈。' },
});
export const langOf = (code) => { const l = String(code || 'en').slice(0, 2).toLowerCase(); return TIPS[l] ? l : 'en'; };
/** The line on show `ms` after the ritual began (a hint every fourth turn). */
export function lineAt(ms, { lang = 'en', touch = false } = {}) {
  const tips = TIPS[langOf(lang)], i = Math.floor(Math.max(0, ms) / TIP_MS);
  if (i % 4 === 3) return HINTS[langOf(lang)][touch ? 'touch' : 'keys'];
  return tips[(i - Math.floor(i / 4)) % tips.length];
}
/** Progress 0..1 -> how lit the hub is (dormant at 0.25 opacity, never fully dark) and the glow radius in px. */
export function warmth(p) { const k = Math.max(0, Math.min(1, Number(p) || 0)); return { opacity: +(0.25 + 0.75 * k).toFixed(3), glow: Math.round(18 * k * k) }; }

const CSS = `
.boot--ritual .bd-hub, .boot--ritual .boot-bodies { transition: opacity .4s; opacity: calc(.25 + var(--boot-p, 0) * .75);
  filter: drop-shadow(0 0 calc(var(--boot-p, 0) * var(--boot-p, 0) * 18px) rgba(246, 216, 146, .75)); }
.boot--ritual .boot-bar { border-radius: 999px; padding: 3px 10px; border: 1px solid rgba(233, 200, 140, .35); background: rgba(10, 18, 18, .35); }
.boot--ritual .boot-tip { margin: 10px auto 0; max-width: min(520px, 90vw); text-align: center; font: italic 17px/1.35 'Cormorant Garamond', Georgia, serif; color: rgba(236, 226, 205, .82); transition: opacity .6s; min-height: 2.6em; }
.boot--ritual .boot-tip.fade { opacity: 0; }
@media (max-width: 420px) { .boot--ritual .boot-tip { font-size: 15px; } }
@media (prefers-reduced-motion: reduce) { .boot--ritual .bd-hub, .boot--ritual .boot-bodies, .boot--ritual .boot-tip { transition: none; } }
`;

/**
 * Turns the ritual on over the existing loading screen. Returns a stop function (the screen removes itself anyway).
 * @param {{root?: HTMLElement|null, doc?: Document, lang?: string, touch?: boolean, reduced?: boolean, now?: () => number}} o
 */
export function mountLoadRitual({ root = globalThis.document && globalThis.document.getElementById('boot'), doc = globalThis.document, lang = 'en', touch = false, reduced = false, now = () => Date.now() } = {}) {
  if (!root || !doc || root.classList.contains('boot--ritual')) return () => {};
  if (!doc.getElementById('lr-style')) { const s = doc.createElement('style'); s.id = 'lr-style'; s.textContent = CSS; doc.head.append(s); }
  root.classList.add('boot--ritual');
  const tip = doc.createElement('p'); tip.className = 'boot-tip'; tip.setAttribute('aria-live', 'off');
  const bottom = root.querySelector('.boot-bottom') || root; bottom.append(tip);
  const t0 = now();
  let last = '';
  const show = () => {
    const line = lineAt(now() - t0, { lang, touch });
    if (line === last) return;
    last = line;
    if (reduced) { tip.textContent = line; return; }
    tip.classList.add('fade'); setTimeout(() => { tip.textContent = line; tip.classList.remove('fade'); }, 300);
  };
  tip.textContent = last = lineAt(0, { lang, touch });
  const timer = setInterval(() => { if (!root.isConnected) { clearInterval(timer); return; } show(); }, 500);
  return () => { clearInterval(timer); tip.remove(); root.classList.remove('boot--ritual'); };
}
