// Lobby (spec §1): FORGET / TO FORESEE, "THE FUTURE COSTS A MEMORY.", ENTER THE WORLD,
// CLAN · MEMORIES · TOURNAMENTS, SETTINGS, profile; animated background that never
// blocks input; full keyboard navigation; stacks at narrow widths.
import { h, bindI18n, ensureStyles, createDialog, rovingArrows, tx } from './dom.js';
import { buildSettings, buildLangToggle } from './settings.js';
import { mountTournamentCard } from './tournament-card.js'; // used by the tournaments dialog
import { getUiContext } from './context.js';
import { getEntitlement } from './entitlement.js';
import { loadRecipe, recipeHash } from './hologram/recipe.js';
import { STORAGE_KEYS } from './storage.js';

/**
 * @param {HTMLElement} root
 * @param {{ctx?: object, onEnter?: () => void, flow?: object}} opts
 * @returns {{el: HTMLElement, ctx: object, focus(): void, openPanel(name: string): void, destroy(): void}}
 */
export function mountLobby(root, opts = {}) {
  const ctx = opts.ctx || getUiContext();
  const { i18n, prefs } = ctx;
  ensureStyles();

  // Owner reference art (docs/ui/lobby-reference.jpg) as a full-bleed backdrop with drifting mist layers on top.
  const bgEl = h('div', { class: 'ftf-bg ftf-bg-art', attrs: { 'aria-hidden': 'true' } },
    h('div', { class: 'ftf-bg-image', attrs: { style: `background-image: url('${(import.meta.env && import.meta.env.BASE_URL) || '/'}assets/ui/lobby_bg.jpg')` } }), h('div', { class: 'ftf-mist ftf-mist-a' }), h('div', { class: 'ftf-mist ftf-mist-b' }), h('div', { class: 'ftf-bg-vignette' }));
  const bg = { setReduced: (on) => bgEl.classList.toggle('ftf-still', !!on), setTier() {}, destroy() {} };
  bg.setReduced(prefs.reducedMotion());

  const enter = h('button', { class: 'ftf-btn ftf-btn-primary', i18n: 'lobby.enter', attrs: { type: 'button', id: 'ftf-enter' } });
  enter.addEventListener('click', () => { if (opts.onEnter) opts.onEnter(); });

  // Panels
  const panels = {
    settings: createDialog(i18n, { id: 'ftf-dlg-settings', titleKey: 'settings.title', body: buildSettings(ctx) }),
    profile: createDialog(i18n, { id: 'ftf-dlg-profile', titleKey: 'profile.title', body: buildProfile() }),
    clan: createDialog(i18n, { id: 'ftf-dlg-clan', titleKey: 'panel.clan.title', body: infoBody('panel.clan.body') }),
    memories: createDialog(i18n, { id: 'ftf-dlg-memories', titleKey: 'panel.memories.title', body: infoBody('panel.memories.body') }),
    tournaments: createDialog(i18n, { id: 'ftf-dlg-tournaments', titleKey: 'panel.tournaments.title', body: h('div') }),
  };
  const tourInDialog = mountTournamentCard(panels.tournaments.el.querySelector('.ftf-dialog-body > div'), ctx, { headingLevel: 3 });

  function infoBody(key) {
    return h('div', {}, h('p', { class: 'ftf-badge', i18n: 'common.notInBuild' }), h('p', { i18n: key }));
  }
  function buildProfile() {
    const access = h('dd'), holo = h('dd'), progress = h('dd'), status = h('p', { class: 'ftf-status', attrs: { role: 'status' } });
    const body = h('div', {},
      h('dl', { class: 'ftf-kv' },
        h('dt', { i18n: 'profile.id' }), h('dd', { text: ctx.guestId, attrs: { translate: 'no' } }),
        h('dt', { i18n: 'profile.access' }), access,
        h('dt', { i18n: 'profile.hologram' }), holo,
        h('dt', { i18n: 'profile.progress' }), progress),
      h('button', { class: 'ftf-btn', i18n: 'profile.reset', attrs: { type: 'button' }, on: { click: reset } }),
      status);
    function fill() {
      const ent = getEntitlement(ctx.storage);
      tx(access, i18n, ent ? 'profile.access.demo' : 'profile.access.none');
      const r = loadRecipe(ctx.storage);
      if (r) { holo.textContent = recipeHash(r).slice(0, 16) + '…'; delete holo.dataset.i18n; holo.classList.add('ftf-hash'); }
      else { holo.classList.remove('ftf-hash'); tx(holo, i18n, 'profile.hologram.none'); }
      const done = opts.flow ? opts.flow.done : {};
      const count = ['entitlement', 'tutorial', 'customization'].filter((k) => done[k]).length;
      tx(progress, i18n, 'flow.stepOf', { n: count, total: 3 });
    }
    function reset() {
      for (const k of [STORAGE_KEYS.entitlement, STORAGE_KEYS.flow, STORAGE_KEYS.hologram, STORAGE_KEYS.tournament]) ctx.storage.removeItem(k);
      if (opts.flow) opts.flow.reset();
      ctx.tournament.reload();
      fill();
      tx(status, i18n, 'profile.resetDone');
    }
    body._fill = fill;
    return body;
  }

  const open = (name) => (e) => {
    if (name === 'profile') panels.profile.el.querySelector('.ftf-dialog-body > div')._fill();
    panels[name].open(e && e.currentTarget);
  };
  const profileChip = h('button', {
    class: 'ftf-btn ftf-pill', attrs: { type: 'button', 'aria-haspopup': 'dialog' }, on: { click: open('profile') },
    i18nAttrs: { 'aria-label': 'lobby.profile.aria' }, attrArgs: () => ({ name: i18n.t('profile.guest'), mode: i18n.t('profile.mode.demo') }),
  }, h('span', { i18n: 'lobby.guestDemo' }));

  const exitStatus = h('p', { class: 'ftf-exit-status', attrs: { role: 'status' } });
  const exit = () => { try { window.close(); } catch { /* browsers only close script-opened tabs */ } setTimeout(() => tx(exitStatus, i18n, 'lobby.exitHint'), 150); };
  const item = (key, onClick, extra = {}) => h('li', {}, h('button', { class: 'ftf-menu-item', i18n: key, attrs: { type: 'button', ...extra }, on: { click: onClick } }));
  const menu = h('nav', { class: 'ftf-menu', i18nAttrs: { 'aria-label': 'lobby.nav.label' } },
    enter,
    h('ul', { class: 'ftf-menu-list' }, item('lobby.settings', open('settings'), { 'aria-haspopup': 'dialog' }), item('lobby.exit', exit)),
    exitStatus);
  rovingArrows(menu);

  const card = { destroy() {} }; // the weekly tournament lives in its dialog; the lobby itself matches the owner reference

  const main = h('main', { class: 'ftf-lobby ftf-lobby-ref' },
    h('div', { class: 'ftf-topbar' }, buildLangToggle(ctx), h('span', { class: 'ftf-topbar-sep', attrs: { 'aria-hidden': 'true' } }), profileChip),
    h('section', { class: 'ftf-hero', attrs: { 'aria-labelledby': 'ftf-title' } },
      h('h1', { class: 'ftf-title', attrs: { id: 'ftf-title' } },
        h('span', { class: 'ftf-title-1', i18n: 'app.title.line1' }), h('span', { class: 'ftf-title-2', i18n: 'app.title.line2' }),
        h('span', { class: 'sr-only', text: ' ' })),
      h('div', { class: 'ftf-rule', attrs: { 'aria-hidden': 'true' } }, h('span'), h('i'), h('span')),
      h('p', { class: 'ftf-tagline', i18n: 'app.tagline' }),
      menu),
    h('footer', { class: 'sr-only' }, h('span', { i18n: 'lobby.demoNotice' })));

  const skip = h('a', { class: 'ftf-skip', i18n: 'common.skipToContent', attrs: { href: '#ftf-enter' }, on: { click: (e) => { e.preventDefault(); enter.focus(); } } });
  const wrap = h('div', { class: 'ftf-root' }, skip, bgEl, main, Object.values(panels).map((p) => p.el));
  root.appendChild(wrap);

  const unbind = bindI18n(wrap, i18n);
  const unPrefs = prefs.subscribe(() => { bg.setReduced(prefs.reducedMotion()); bg.setTier(prefs.tier()); });
  enter.focus({ preventScroll: true });

  return {
    el: wrap,
    ctx,
    focus: () => enter.focus(),
    openPanel: (name) => open(name)(),
    destroy() { unbind(); unPrefs(); bg.destroy(); card.destroy(); tourInDialog.destroy(); wrap.remove(); },
  };
}
