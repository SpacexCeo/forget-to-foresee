// Hologram constructor (spec §8): shape, components, particles, filter layers
// (whitelist), palette, noise, light, trails, gesture → canonical recipeHash.
// Preview, randomize, reset, save/load, low-tier preview. Cosmetic only.
import { h, tx, bindI18n, ensureStyles } from '../dom.js';
import { getUiContext } from '../context.js';
import {
  DEFAULT_RECIPE, SHAPES, COMPONENTS, LAYERS, GESTURES, NUMERIC, PALETTE_KEYS, PALETTE_PRESETS, MAX_COMPONENTS, MAX_LAYERS,
  normalizeRecipe, recipeHash, randomizeRecipe, saveRecipe, loadRecipe,
} from './recipe.js';
import { createHologramPreview } from './preview.js';

let seq = 0;

/**
 * @param {HTMLElement} root
 * @param {{ctx?: object, initial?: object, onChange?: (recipe, hash) => void}} opts
 */
export function mountConstructor(root, opts = {}) {
  const ctx = opts.ctx || getUiContext();
  const { i18n, prefs, storage } = ctx;
  ensureStyles();
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
  const actions = h('div', { class: 'ftf-row' },
    btn('ctor.randomize', () => { apply(randomizeRecipe(), true); tx(status, i18n, 'ctor.randomized'); }),
    btn('ctor.reset', () => { apply(DEFAULT_RECIPE, true); tx(status, i18n, 'ctor.resetDone'); }),
    btn('ctor.save', () => { const r = saveRecipe(storage, recipe); tx(status, i18n, r.persistent ? 'ctor.saved' : 'ctor.saveFailed'); }),
    btn('ctor.load', () => { const r = loadRecipe(storage); if (r) { apply(r, true); tx(status, i18n, 'ctor.loaded'); } else tx(status, i18n, 'ctor.loadNone'); }));

  const el = h('div', { class: 'ftf-ctor' },
    h('div', { class: 'ftf-ctor-preview' },
      canvas, stillNote,
      h('div', {}, h('span', { class: 'ftf-muted', i18n: 'ctor.hash' }), ' ', hashEl),
      h('div', { class: 'ftf-choice' }, h('label', { attrs: { for: id + '-low' } }, lowBox, h('span', { i18n: 'ctor.lowTier' }))),
      h('p', { class: 'ftf-muted', i18n: 'ctor.lowTierHint' }),
      actions, status),
    h('div', { class: 'ftf-ctor-controls' },
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
  function apply(next, syncAll) {
    recipe = normalizeRecipe(next);
    const hash = recipeHash(recipe);
    hashEl.textContent = hash;
    hashEl.title = hash;
    for (const [k, fn] of Object.entries(fields)) if (syncAll || k === 'components' || k === 'layers' || k.includes('.')) fn();
    preview.setRecipe(recipe);
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
    destroy() { unbind(); unPrefs(); preview.destroy(); el.remove(); },
  };
}
