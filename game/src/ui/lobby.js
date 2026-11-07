// Lobby (spec §1): FORGET / TO FORESEE, "THE FUTURE COSTS A MEMORY.", ENTER THE WORLD,
// CLAN · MEMORIES · TOURNAMENTS, SETTINGS, profile; animated background that never
// blocks input; full keyboard navigation; stacks at narrow widths.
import { h, bindI18n, ensureStyles, createDialog, rovingArrows, tx } from './dom.js';
import { mountBackground } from './background.js';
import { buildSettings, buildLangToggle } from './settings.js';
import { mountTournamentCard } from './tournament-card.js';
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

  const bgEl = h('div', { class: 'ftf-bg', attrs: { 'aria-hidden': 'true' } });
  const bg = mountBackground(bgEl, { reducedMotion: prefs.reducedMotion(), tier: prefs.tier() });

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
    class: 'ftf-btn ftf-profile-chip', attrs: { type: 'button', 'aria-haspopup': 'dialog' }, on: { click: open('profile') },
    i18nAttrs: { 'aria-label': 'lobby.profile.aria' }, attrArgs: () => ({ name: i18n.t('profile.guest'), mode: i18n.t('profile.mode.demo') }),
  }, h('span', { class: 'ftf-avatar', text: 'G', attrs: { 'aria-hidden': 'true' } }),
    h('span', {}, h('span', { i18n: 'profile.guest' }), ' · ', h('span', { class: 'ftf-muted', i18n: 'profile.mode.demo' })));

  const navBtn = (key, panel) => h('li', {}, h('button', { class: 'ftf-btn ftf-btn-ghost', i18n: key, attrs: { type: 'button', 'aria-haspopup': 'dialog' }, on: { click: open(panel) } }));
  const sep = () => h('li', { class: 'ftf-sep', text: '·', attrs: { 'aria-hidden': 'true' } });
  const menu = h('nav', { class: 'ftf-menu', i18nAttrs: { 'aria-label': 'lobby.nav.label' } },
    enter,
    h('p', { class: 'ftf-enter-hint', i18n: 'lobby.enterHint' }),
    h('ul', { class: 'ftf-secondary' }, navBtn('lobby.nav.clan', 'clan'), sep(), navBtn('lobby.nav.memories', 'memories'), sep(), navBtn('lobby.nav.tournaments', 'tournaments')),
    h('button', { class: 'ftf-btn ftf-btn-ghost', i18n: 'lobby.settings', attrs: { type: 'button', 'aria-haspopup': 'dialog' }, on: { click: open('settings') } }));
  rovingArrows(menu);

  const aside = h('aside', { class: 'ftf-aside' });
  const card = mountTournamentCard(aside, ctx);

  const main = h('main', { class: 'ftf-lobby' },
    h('div', { class: 'ftf-topbar' }, buildLangToggle(ctx), profileChip),
    h('section', { class: 'ftf-hero', attrs: { 'aria-labelledby': 'ftf-title' } },
      h('h1', { class: 'ftf-title', attrs: { id: 'ftf-title' } },
        h('span', { class: 'ftf-title-1', i18n: 'app.title.line1' }), h('span', { class: 'ftf-title-2', i18n: 'app.title.line2' }),
        h('span', { class: 'sr-only', text: ' ' })),
      h('p', { class: 'ftf-tagline', i18n: 'app.tagline' }),
      menu),
    aside,
    h('footer', { class: 'ftf-footer' }, h('span', { class: 'ftf-badge ftf-badge-demo', i18n: 'common.demo' }), h('span', { i18n: 'lobby.demoNotice' })));

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
