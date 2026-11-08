// Hologram constructor (spec §8): shape, components, particles, filter layers
// (whitelist), palette, noise, light, trails, gesture → canonical recipeHash.
// Preview, randomize, reset, save/load, low-tier preview. Cosmetic only.
import { h, tx, bindI18n, ensureStyles } from '../dom.js';
import { getUiContext } from '../context.js';
import {
  DEFAULT_RECIPE, SHAPES, COMPONENTS, LAYERS, GESTURES, NUMERIC, PALETTE_KEYS, PALETTE_PRESETS, LOOK_PRESETS, MAX_COMPONENTS, MAX_LAYERS,
  normalizeRecipe, recipeHash, randomizeRecipe, saveRecipe, loadRecipe,
} from './recipe.js';
import { createHologramPreview } from './preview.js';
import { MOTION, installMotionStyles, enter, exit, stagger, press } from '../motion/index.js';

let seq = 0;

/**
 * @param {HTMLElement} root
 * @param {{ctx?: object, initial?: object, onChange?: (recipe, hash) => void, compact?: boolean}} opts
 *   `compact`: the onboarding picker (docs/tutorial.md §2.1): four look tiles next to the preview and a
 *   "Customize" toggle that reveals the full constructor; nothing is removed, only folded.
 */
export function mountConstructor(root, opts = {}) {
  const ctx = opts.ctx || getUiContext();
  const { i18n, prefs, storage } = ctx;
  ensureStyles();
  installMotionStyles(root.ownerDocument || document);
  const id = 'ftf-ctor-' + (++seq);
  let recipe = normalizeRecipe(opts.initial || loadRecipe(storage) || DEFAULT_RECIPE);
  let lowTier = prefs.tier() === 'low';

  const canvas = h('canvas', { class: 'ftf-ctor-canvas', attrs: { role: 'img' }, i18nAttrs: { 'aria-label': 'ctor.preview' } });
  const hashEl = h('code', { class: 'ftf-hash', attrs: { translate: 'no' } });
  const stillNote = h('p', { class: 'ftf-muted', i18n: 'ctor.previewStill' });
  const status = h('p', { class: 'ftf-status', attrs: { role: 'status', 'aria-live': 'polite' } });
  const lowBox = h('input', { attrs: { type: 'checkbox', id: id + '-low', checked: lowTier }, on: { change: (e) => { lowTier = e.target.checked; preview.setTier(lowTier ? 'low' : 'high'); } } });

  const fields = {};
  const set = (mut) => { const draft = JSON.parse(JSON.stringify(recipe)); mut(draft); apply(normalizeRecipe(draft), false); };

  function radioGroup(name, legendKey, values, labelPrefix, get, put) {
    const fs = h('fieldset', { class: 'ftf-field' }, h('legend', { i18n: legendKey }),
      h('div', { class: 'ftf-choice' }, values.map((v) => h('label', {},
        h('input', { attrs: { type: 'radio', name: id + '-' + name, value: v }, on: { change: () => set((d) => put(d, v)) } }),
        h('span', { i18n: labelPrefix + v })))));
    fields[name] = () => fs.querySelectorAll('input').forEach((i) => { i.checked = i.value === get(recipe); });
    return fs;
  }
  function checkGroup(name, legendKey, hintKey, max, values, labelPrefix, key) {
    const fs = h('fieldset', { class: 'ftf-field' }, h('legend', { i18n: legendKey }),
      h('p', { class: 'ftf-muted', i18n: hintKey, args: { max }, attrs: { id: id + '-' + name + '-hint' } }),
      h('div', { class: 'ftf-choice', attrs: { 'aria-describedby': id + '-' + name + '-hint' } }, values.map((v) => h('label', {},
        h('input', { attrs: { type: 'checkbox', value: v }, on: { change: (e) => set((d) => { const s = new Set(d[key]); if (e.target.checked) s.add(v); else s.delete(v); d[key] = [...s]; }) } }),
        h('span', { i18n: labelPrefix + v })))));
    fields[name] = () => {
      const on = new Set(recipe[key]);
      fs.querySelectorAll('input').forEach((i) => { i.checked = on.has(i.value); i.disabled = !i.checked && on.size >= max; });
    };
    return fs;
  }
  function range(group, field, min, max, step) {
    const rid = `${id}-${group}-${field}`;
    const out = h('output', { attrs: { for: rid } });
    const input = h('input', { attrs: { type: 'range', id: rid, min, max, step }, on: { input: (e) => set((d) => { d[group][field] = Number(e.target.value); }) } });
    fields[group + '.' + field] = () => { input.value = recipe[group][field]; out.textContent = String(recipe[group][field]); };
    return h('div', { class: 'ftf-range' }, h('label', { i18n: `ctor.${group}.${field}`, attrs: { for: rid } }), out, input);
  }
  const groupBox = (group, legendKey) => h('fieldset', { class: 'ftf-field' }, h('legend', { i18n: legendKey }),
    NUMERIC.filter(([g]) => g === group).map(([g, f, min, max, step]) => range(g, f, min, max, step)));

  const colorInputs = PALETTE_KEYS.map((k) => {
    const cid = `${id}-pal-${k}`;
    const input = h('input', { attrs: { type: 'color', id: cid }, on: { input: (e) => set((d) => { d.palette[k] = e.target.value; }) } });
    fields['palette.' + k] = () => { input.value = recipe.palette[k]; };
    return h('label', { attrs: { for: cid } }, h('span', { i18n: 'ctor.palette.' + k }), input);
  });
  const presetButtons = Object.entries(PALETTE_PRESETS).map(([name, pal]) => {
    const swatch = h('span', { text: '■', attrs: { 'aria-hidden': 'true' } });
    swatch.style.color = pal.primary;
    return h('button', { class: 'ftf-btn ftf-btn-small', attrs: { type: 'button' }, on: { click: () => set((d) => { d.palette = { ...pal }; }) } },
      swatch, h('span', { i18n: 'ctor.preset.' + name }));
  });

  const gestureId = id + '-gesture';
  const gesture = h('select', { class: 'ftf-select', attrs: { id: gestureId }, on: { change: (e) => set((d) => { d.gesture = e.target.value; }) } },
    GESTURES.map((g) => h('option', { i18n: 'gesture.' + g, attrs: { value: g } })));
  fields.gesture = () => { gesture.value = recipe.gesture; };

  const btn = (key, fn) => h('button', { class: 'ftf-btn', i18n: key, attrs: { type: 'button' }, on: { click: fn } });
  const say = (key) => { tx(status, i18n, key); enter(status, { from: 'fade' }); };
  const randomize = () => { apply(randomizeRecipe(), true); say('ctor.randomized'); };
  const actions = h('div', { class: 'ftf-row' },
    btn('ctor.randomize', randomize),
    btn('ctor.reset', () => { apply(DEFAULT_RECIPE, true); say('ctor.resetDone'); }),
    btn('ctor.save', () => { const r = saveRecipe(storage, recipe); say(r.persistent ? 'ctor.saved' : 'ctor.saveFailed'); }),
    btn('ctor.load', () => { const r = loadRecipe(storage); if (r) { apply(r, true); say('ctor.loaded'); } else say('ctor.loadNone'); }));

  // Compact picker: one tile per complete look; the pressed tile is the one whose recipe is on screen.
  const compact = !!opts.compact;
  const lookTiles = compact ? Object.entries(LOOK_PRESETS).map(([name, look]) => {
    const sw = h('span', { class: 'ftf-look-swatch', attrs: { 'aria-hidden': 'true' } }, PALETTE_KEYS.map((k) => { const d = h('i'); d.style.background = look.palette[k]; return d; }));
    const tile = h('button', { class: 'ftf-btn ftf-look', attrs: { type: 'button', 'data-look': name, 'aria-pressed': 'false' }, on: { click: () => { apply(look, true); tx(status, i18n, 'onb.look.chosen', () => ({ look: i18n.t('onb.look.' + name) })); } } },
      sw, h('span', { class: 'ftf-btn-label', i18n: 'onb.look.' + name }));
    tile._hash = recipeHash(look);
    return tile;
  }) : [];
  const looksRow = compact ? h('div', { class: 'ftf-looks', attrs: { role: 'group' }, i18nAttrs: { 'aria-label': 'onb.look.label' } }, lookTiles) : null;
  const detailId = id + '-detail';
  const customize = compact ? h('button', { class: 'ftf-btn ftf-btn-small', attrs: { type: 'button', 'aria-expanded': 'false', 'aria-controls': detailId }, i18n: 'onb.look.customize' }) : null;
  const detail = h('div', { class: 'ftf-ctor-detail', attrs: compact ? { id: detailId, hidden: true } : {} },
    h('div', {}, h('span', { class: 'ftf-muted', i18n: 'ctor.hash' }), ' ', hashEl),
    h('div', { class: 'ftf-choice' }, h('label', { attrs: { for: id + '-low' } }, lowBox, h('span', { i18n: 'ctor.lowTier' }))),
    h('p', { class: 'ftf-muted', i18n: 'ctor.lowTierHint' }),
    actions);
  if (customize) customize.addEventListener('click', () => {
    const open = detail.hidden;
    const controls = el.querySelector('.ftf-ctor-controls');
    el.classList.toggle('ftf-ctor-open', open);
    customize.setAttribute('aria-expanded', String(open));
    tx(customize, i18n, open ? 'onb.look.less' : 'onb.look.customize');
    if (open) {
      // Unfold: the detail block rises in, the control groups follow in a stagger.
      detail.hidden = false; controls.hidden = false;
      enter(detail, { from: 'rise' });
      stagger([...controls.children], { from: 'rise', duration: MOTION.duration.base, step: 30, cap: 240 });
    } else {
      // Fold: both leave quickly, then are hidden (the layout snaps back only once they are invisible).
      Promise.all([exit(detail, { to: 'rise' }), exit(controls, { to: 'rise' })]).then(() => { detail.hidden = true; controls.hidden = true; detail.style.opacity = ''; controls.style.opacity = ''; });
    }
  });

  const el = h('div', { class: 'ftf-ctor' + (compact ? ' ftf-ctor-compact' : '') },
    h('div', { class: 'ftf-ctor-preview' },
      canvas, stillNote,
      looksRow,
      compact ? h('div', { class: 'ftf-row' }, customize, btn('ctor.randomize', randomize)) : null,
      detail, status),
    h('div', { class: 'ftf-ctor-controls', attrs: compact ? { hidden: true } : {} },
      radioGroup('shape', 'ctor.shape', SHAPES, 'shape.', (r) => r.shape, (d, v) => { d.shape = v; }),
      checkGroup('components', 'ctor.components', 'ctor.componentsHint', MAX_COMPONENTS, COMPONENTS, 'comp.', 'components'),
      checkGroup('layers', 'ctor.layers', 'ctor.layersHint', MAX_LAYERS, LAYERS, 'layer.', 'layers'),
      groupBox('particles', 'ctor.particles'),
      h('fieldset', { class: 'ftf-field' }, h('legend', { i18n: 'ctor.palette' }), h('div', { class: 'ftf-colors' }, colorInputs), h('div', { class: 'ftf-row', attrs: { role: 'group' }, i18nAttrs: { 'aria-label': 'ctor.presets' } }, presetButtons)),
      groupBox('noise', 'ctor.noise'),
      groupBox('light', 'ctor.light'),
      groupBox('trails', 'ctor.trails'),
      h('div', { class: 'ftf-field' }, h('label', { i18n: 'ctor.gesture', attrs: { for: gestureId } }), gesture)));
  root.appendChild(el);

  const preview = createHologramPreview(canvas, { recipe, tier: lowTier ? 'low' : 'high', reducedMotion: prefs.reducedMotion() });
  // Staged reveal: the preview first, then the look tiles one by one; every button gets press and lift feedback.
  enter(canvas, { from: 'scale', duration: MOTION.duration.slow });
  if (lookTiles.length) stagger(lookTiles, { from: 'rise', delay: 120, step: 60, cap: 300 });
  const unPress = [...el.querySelectorAll('button')].map((b) => { b.classList.add('mo-lift'); return press(b); });
  let lastHash = null;
  function apply(next, syncAll) {
    recipe = normalizeRecipe(next);
    const hash = recipeHash(recipe);
    hashEl.textContent = hash;
    hashEl.title = hash;
    for (const [k, fn] of Object.entries(fields)) if (syncAll || k === 'components' || k === 'layers' || k.includes('.')) fn();
    for (const tile of lookTiles) tile.setAttribute('aria-pressed', String(tile._hash === hash));
    preview.setRecipe(recipe);
    // A whole new look (a tile, randomize, reset, load) cross-fades the preview and the hash; slider nudges do not.
    if (syncAll && lastHash && lastHash !== hash) { enter(canvas, { from: 'fade', duration: MOTION.duration.slow }); enter(hashEl, { from: 'fade' }); }
    lastHash = hash;
    if (opts.onChange) opts.onChange(recipe, hash);
  }
  const syncMotion = () => { const r = prefs.reducedMotion(); stillNote.hidden = !r; preview.setReduced(r); };
  const unPrefs = prefs.subscribe(syncMotion);
  syncMotion();
  apply(recipe, true);
  const unbind = bindI18n(el, i18n);

  return {
    el,
    getRecipe: () => normalizeRecipe(recipe),
    getHash: () => recipeHash(recipe),
    save: () => saveRecipe(storage, recipe),
    destroy() { unbind(); unPrefs(); preview.destroy(); unPress.forEach((f) => f()); el.remove(); },
  };
}
