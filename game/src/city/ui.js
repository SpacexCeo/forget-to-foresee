// The city's interface: a slim HUD (day, silk, satiety, the live NEAR price, the current quest), a context
// prompt, a hotbar and one panel at a time (market, tavern, quest board, Exchange, a resident, bag and friends,
// the Shell Gate, help). It renders the CityState and the price feed and calls back with intents; it never
// changes state itself. Every string comes from the city locales, so a language switch re-renders in place.
import '../ui/world-hud/fonts.js';
import './city.css';
import { h } from '../ui/dom.js';
import { GOODS, MEALS, BAG_SIZE, RESIDENT_TASTE, FRIEND_LEVELS, marketTable, msToNextDay, toNextLevel, buyPrice, goodById } from './economy.js';
import { INTRO_STEPS, RESIDENT_IDS, questProgress } from './state.js';
import { formatUsd, formatChange } from './prices.js';

const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const hhmm = (ms) => { const d = new Date(ms); return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':'); };

/**
 * @param {object} o
 * @param {HTMLElement} o.root the overlay root (#ui)
 * @param {{i18n: object}} o.ctx
 * @param {import('./state.js').CityState} o.city
 * @param {object} o.feed price feed (prices.js createPriceFeed)
 * @param {object} o.on intents: buy, sell, eat, snack, talk, ask, gift, handIn, accept, drop, tournament, settings, refresh, use, openChange
 */
export function createCityUi({ root, ctx, city, feed, on }) {
  const { i18n } = ctx;
  const t = (k, a) => i18n.t(k, a);
  const el = h('div', { class: 'city-ui', hidden: true });
  root.appendChild(el);

  /* ---------- HUD ---------- */
  const status = h('div', { class: 'city-status' });
  const quest = h('button', { class: 'city-quest', attrs: { type: 'button' }, on: { click: () => open('journal') } });
  const prompt = h('button', { class: 'city-prompt', attrs: { type: 'button' }, hidden: true, on: { click: () => on.use() } });
  const toasts = h('div', { class: 'city-toasts', attrs: { role: 'status', 'aria-live': 'polite' } });
  const bar = h('div', { class: 'city-bar' });
  const scrim = h('div', { class: 'city-scrim', hidden: true, on: { click: () => close() } });
  const panel = h('div', { class: 'city-panel', hidden: true, attrs: { role: 'dialog', 'aria-modal': 'true' } });
  const cover = h('div', { class: 'city-cover', hidden: true });
  const note = h('div', { class: 'city-local' });
  el.append(status, quest, note, toasts, prompt, bar, scrim, panel, cover);

  let current = null;   // {kind, arg, sub}
  let promptState = null, lastStatusKey = '', lastQuestKey = '';

  const btn = (key, args, onClick, cls = '') => h('button', { class: 'city-btn ' + cls, attrs: { type: 'button' }, text: t(key, args), on: { click: onClick } });
  const reasonText = (reason) => (i18n.has('city.reason.' + reason) ? t('city.reason.' + reason, { size: BAG_SIZE }) : t('city.reason.other'));
  const resName = (id) => t('city.res.' + id + '.name');
  const goodName = (id) => t('city.good.' + id);
  const silkTag = (n) => h('span', { class: 'city-silk', text: '◈ ' + n });

  function toast(text, tone = '') {
    const node = h('div', { class: 'city-toast ' + tone, text });
    toasts.appendChild(node);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => { node.classList.add('city-toast--out'); setTimeout(() => node.remove(), 400); }, 4200);
  }
  /** Shows a refused action's reason; returns the result unchanged. */
  function tell(result) { if (result && !result.ok) toast(reasonText(result.reason), 'city-toast--bad'); return result; }

  function questTitle(q) {
    switch (q.type) {
      case 'deliver': return t('city.quest.deliver', { n: q.n, good: goodName(q.good), name: resName(q.to) });
      case 'greet': return t('city.quest.greet', { n: q.n });
      case 'sell': return t('city.quest.sell', { silk: q.silk });
      default: return t('city.quest.' + q.type);
    }
  }

  /* ---------- HUD rendering ---------- */
  function renderStatus(now) {
    const d = city.data, v = feed.view().near;
    const nearText = v.status === 'live' || v.status === 'stale' ? formatUsd(v.data.usd) + (v.data.change24h != null ? ' ' + formatChange(v.data.change24h) : '') : v.status === 'loading' || v.status === 'idle' ? '…' : '—';
    const key = [i18n.locale, city.day, Math.ceil(msToNextDay(now) / 1000), d.silk, Math.round(d.satiety), nearText, v.status].join('|');
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    const sat = Math.round(d.satiety);
    status.replaceChildren(
      h('div', { class: 'city-status__name' }, h('b', { text: t('city.name') }), h('span', { text: t('city.day', { n: city.day % 1000 }) + ' · ' + t('city.dayNext', { time: clock(msToNextDay(now)) }) })),
      h('div', { class: 'city-status__row' },
        h('span', { class: 'city-chip', attrs: { title: t('city.silk') } }, silkTag(d.silk)),
        h('span', { class: 'city-chip city-chip--sat' + (city.fed ? ' is-fed' : city.hungry ? ' is-hungry' : ''), attrs: { title: city.fed ? t('city.fed') : city.hungry ? t('city.hungry') : t('city.satiety') } },
          h('span', { text: t('city.satiety') }), h('i', { class: 'city-meter' }, h('i', { style: `width:${sat}%` })), h('span', { text: sat + '%' })),
        h('button', { class: 'city-chip city-chip--near is-' + v.status, attrs: { type: 'button', title: v.status === 'offline' ? t('city.near.offline') : t('city.ex.source', { source: feed.sources.near }) }, on: { click: () => open('exchange') } },
          h('span', { text: t('city.near') }), h('b', { text: nearText }))),
    );
  }

  function renderQuest() {
    const d = city.data, step = city.introStep, q = d.quests[0];
    const key = [i18n.locale, d.intro.join(), d.quests.map((x) => x.id + ':' + questProgress(x, d).have).join(',')].join('|');
    if (key === lastQuestKey) return;
    lastQuestKey = key;
    if (step) quest.replaceChildren(h('small', { text: t('city.intro.title') + ' · ' + t('city.step', { n: d.intro.length + 1, total: INTRO_STEPS.length }) }), h('b', { text: t('city.intro.' + step.id) }));
    else if (q) { const p = questProgress(q, d); quest.replaceChildren(h('small', { text: t('city.bar.journal') + (d.quests.length > 1 ? ' · ' + d.quests.length : '') }), h('b', { text: questTitle(q) + ' · ' + t('city.quests.progress', p) })); }
    else quest.replaceChildren(h('small', { text: t('city.bar.journal') }), h('b', { text: t('city.quests.noneActive') }));
  }

  function renderBar() {
    bar.replaceChildren(
      barBtn('city.bar.journal', 'V', () => toggle('journal')),
      barBtn('city.bar.me', 'M', () => toggle('me')),
      barBtn('city.bar.tournament', 'T', () => toggle('gate'), 'city-bar__btn--gold'),
      barBtn('city.bar.help', 'H', () => toggle('help')),
      barBtn('city.bar.settings', null, () => on.settings()),
    );
    note.textContent = t('city.local');
  }
  const barBtn = (key, kbd, fn, cls = '') => h('button', { class: 'city-bar__btn ' + cls, attrs: { type: 'button' }, on: { click: fn } }, h('span', { text: t(key) }), kbd ? h('kbd', { text: kbd }) : null);

  /** @param {{key: string, args?: object}|null} p */
  function setPrompt(p) {
    const key = p ? p.key + JSON.stringify(p.args || {}) + i18n.locale : '';
    if (key === promptState) return;
    promptState = key;
    prompt.hidden = !p;
    if (p) prompt.replaceChildren(h('kbd', { text: 'E' }), h('span', { text: t(p.key, p.args) }));
  }

  /* ---------- panels ---------- */
  const head = (titleKey, subtitle) => h('header', { class: 'city-panel__head' },
    h('div', {}, h('h2', { text: t(titleKey) }), subtitle ? h('p', { text: subtitle }) : null),
    h('div', { class: 'city-panel__purse' }, silkTag(city.data.silk)),
    h('button', { class: 'city-x', attrs: { type: 'button', 'aria-label': t('city.close') }, text: '×', on: { click: () => close() } }));

  function marketPanel() {
    const day = city.day, forecast = city.hasPerk('frost');
    const rows = marketTable(day, city.discount).map((r) => h('tr', {},
      h('td', { class: 'city-td-name', text: goodName(r.id) }),
      h('td', {}, btn('city.market.buyFor', { price: r.buy }, () => { tell(on.buy(r.id)); }, 'city-btn--small')),
      h('td', {}, city.data.bag[r.id] > 0 ? btn('city.market.sellFor', { price: r.sell }, () => { tell(on.sell(r.id)); }, 'city-btn--small city-btn--ghost') : h('span', { class: 'city-dim', text: String(r.sell) })),
      h('td', { class: 'city-td-num', text: String(city.data.bag[r.id]) }),
      h('td', { class: 'city-td-trend' + (forecast ? (r.trend > 0 ? ' is-up' : r.trend < 0 ? ' is-down' : '') : ' city-dim'), text: forecast ? (r.trend > 0 ? '▲ ' + t('city.market.rise') : r.trend < 0 ? '▼ ' + t('city.market.fall') : '• ' + t('city.market.flat')) : '?' })));
    return [
      head('city.market.title', t('city.market.note')),
      h('p', { class: 'city-meta', text: [t('city.market.bag', { n: city.bagCount, size: BAG_SIZE }), t('city.dayNext', { time: clock(msToNextDay(city.now())) }), city.discount ? t('city.market.discount') : null].filter(Boolean).join(' · ') }),
      h('table', { class: 'city-table' },
        h('thead', {}, h('tr', {}, ...['city.market.good', 'city.market.buy', 'city.market.sell', 'city.market.have', 'city.market.tomorrow'].map((k) => h('th', { text: t(k) })))),
        h('tbody', {}, ...rows)),
      forecast ? null : h('p', { class: 'city-dim', text: t('city.market.forecastLocked') }),
    ];
  }

  function tavernPanel() {
    const meals = MEALS.map((m) => {
      const free = m.id === 'stew' && city.freeMeal;
      return h('div', { class: 'city-row' },
        h('div', {}, h('b', { text: t('city.meal.' + m.id) }), h('small', { text: t('city.tavern.food', { n: m.food }) })),
        free ? btn('city.tavern.free', null, () => { tell(on.eat(m.id)); }, 'city-btn--gold') : btn('city.tavern.order', { price: m.price }, () => { tell(on.eat(m.id)); }));
    });
    const snacks = GOODS.filter((g) => g.food && city.data.bag[g.id] > 0).map((g) => h('div', { class: 'city-row' },
      h('div', {}, h('b', { text: goodName(g.id) + ' × ' + city.data.bag[g.id] }), h('small', { text: t('city.tavern.food', { n: g.food }) })),
      btn('city.tavern.eat', null, () => { tell(on.snack(g.id)); }, 'city-btn--ghost')));
    return [
      head('city.tavern.title', t('city.tavern.note')),
      h('p', { class: 'city-meta', text: t('city.satiety') + ' ' + Math.round(city.data.satiety) + '% · ' + (city.fed ? t('city.fed') : city.hungry ? t('city.hungry') : '') }),
      ...meals,
      snacks.length ? h('h3', { text: t('city.tavern.snack') }) : null, ...snacks,
    ];
  }

  function questRow(q, actions) {
    const p = questProgress(q, city.data);
    return h('div', { class: 'city-row' },
      h('div', {}, h('b', { text: questTitle(q) }), h('small', { text: t('city.quests.reward', { silk: q.reward }) + (actions.progress ? ' · ' + t('city.quests.progress', p) : '') })),
      actions.button);
  }

  function journalPanel(atBoard) {
    const d = city.data, live = feed.nearLive;
    const offers = atBoard ? city.offers({ priceLive: live }) : [];
    const intro = city.introStep
      ? [h('h3', { text: t('city.intro.title') }), ...INTRO_STEPS.map((s, i) => h('div', { class: 'city-step' + (d.intro.includes(s.id) ? ' is-done' : s === city.introStep ? ' is-now' : '') }, h('i', { text: d.intro.includes(s.id) ? '✓' : String(i + 1) }), h('span', { text: t('city.intro.' + s.id) }), silkTag(s.reward)))]
      : [];
    return [
      head(atBoard ? 'city.quests.title' : 'city.bar.journal'),
      ...intro,
      atBoard ? h('h3', { text: t('city.quests.offers') }) : null,
      ...(atBoard ? (offers.length ? offers.map((q) => questRow(q, { button: btn('city.quests.accept', null, () => { tell(on.accept(q.id)); }, 'city-btn--small') })) : [h('p', { class: 'city-dim', text: t('city.quests.none') })]) : []),
      h('h3', { text: t('city.quests.active') }),
      ...(d.quests.length ? d.quests.map((q) => questRow(q, { progress: true, button: btn('city.quests.drop', null, () => { tell(on.drop(q.id)); }, 'city-btn--small city-btn--ghost') })) : [h('p', { class: 'city-dim', text: t('city.quests.noneActive') })]),
      !city.introStep && !atBoard ? h('p', { class: 'city-dim', text: t('city.intro.done') }) : null,
    ];
  }

  function statusTag(v) { return h('span', { class: 'city-tag is-' + v.status, text: t('city.ex.status.' + v.status) + (v.at ? ' · ' + t('city.ex.updated', { time: hhmm(v.at) }) : '') }); }
  const changeCell = (c) => h('td', { class: 'city-td-num' + (c > 0 ? ' is-up' : c < 0 ? ' is-down' : ''), text: c == null ? '' : formatChange(c) });

  function exchangePanel() {
    const v = feed.view();
    const near = v.near.data, memes = v.memes.data, nfts = v.nfts.data;
    return [
      head('city.ex.title', t('city.ex.note')),
      h('section', { class: 'city-ex' },
        h('h3', {}, t('city.ex.near'), statusTag(v.near)),
        near ? h('div', { class: 'city-ex__big' }, h('b', { text: formatUsd(near.usd) }), near.change24h != null ? h('span', { class: near.change24h >= 0 ? 'is-up' : 'is-down', text: formatChange(near.change24h) + ' · ' + t('city.ex.change') }) : null) : null,
        h('small', { class: 'city-dim', text: t('city.ex.source', { source: feed.sources.near }) })),
      h('section', { class: 'city-ex' },
        h('h3', {}, t('city.ex.memes'), statusTag(v.memes)),
        memes ? h('table', { class: 'city-table' },
          h('thead', {}, h('tr', {}, ...['city.ex.token', 'city.ex.price', 'city.ex.change', 'city.ex.liquidity'].map((k) => h('th', { text: t(k) })))),
          h('tbody', {}, ...memes.map((m) => h('tr', {},
            h('td', { class: 'city-td-name' }, m.url ? h('a', { attrs: { href: m.url, target: '_blank', rel: 'noopener noreferrer' }, text: m.symbol }) : m.symbol),
            h('td', { class: 'city-td-num', text: formatUsd(m.usd) }), changeCell(m.change24h),
            h('td', { class: 'city-td-num city-dim', text: '$' + Math.round(m.liquidityUsd).toLocaleString('en-US') }))))) : null,
        h('small', { class: 'city-dim', text: t('city.ex.source', { source: feed.sources.memes }) })),
      h('section', { class: 'city-ex' },
        h('h3', {}, t('city.ex.nfts'), statusTag(v.nfts)),
        nfts ? h('table', { class: 'city-table' },
          h('thead', {}, h('tr', {}, ...['city.ex.shard', 'city.ex.sold', 'city.ex.owner'].map((k) => h('th', { text: t(k) })))),
          h('tbody', {}, ...nfts.slice(0, 8).map((n) => h('tr', {},
            h('td', { class: 'city-td-name', text: n.title.split(' · season')[0] }),
            h('td', { class: 'city-td-num', text: n.priceSilk != null ? t('city.ex.silk', { n: n.priceSilk }) : t('city.ex.unsold') }),
            h('td', { class: 'city-dim', text: n.owner })))) ) : null,
        h('small', { class: 'city-dim', text: t('city.ex.nftsNote') + (feed.sources.nfts ? ' ' + t('city.ex.source', { source: feed.sources.nfts }) : '') })),
      h('div', { class: 'city-actions' }, btn('city.ex.refresh', null, () => on.refresh(), 'city-btn--ghost')),
    ];
  }

  function hearts(id) {
    const lvl = city.level(id);
    return h('span', { class: 'city-hearts', attrs: { 'aria-label': t('city.level.' + lvl) } }, ...FRIEND_LEVELS.slice(1).map((_, i) => h('i', { class: i < lvl ? 'is-on' : '', text: '♥' })));
  }

  function residentPanel(id, sub) {
    const f = city.data.friends[id], lvl = city.level(id), next = toNextLevel(f.points);
    const top = [
      h('header', { class: 'city-panel__head' },
        h('div', {}, h('h2', { text: resName(id) }), h('p', { text: t('city.res.' + id + '.role') })),
        h('div', { class: 'city-panel__purse' }, hearts(id)),
        h('button', { class: 'city-x', attrs: { type: 'button', 'aria-label': t('city.close') }, text: '×', on: { click: () => close() } })),
      h('p', { class: 'city-meta', text: t('city.level.' + lvl) + ' · ' + (next ? t('city.friend.next', { n: next }) : t('city.friend.max')) }),
    ];
    if (sub && sub.gift) {
      const items = GOODS.filter((g) => city.data.bag[g.id] > 0);
      return [...top, h('p', { class: 'city-say', text: items.length ? t('city.talk.giftPick', { name: resName(id) }) : t('city.talk.giftEmpty') }),
        h('div', { class: 'city-actions' }, ...items.map((g) => h('button', { class: 'city-btn', attrs: { type: 'button' }, text: goodName(g.id) + ' × ' + city.data.bag[g.id], on: { click: () => on.gift(id, g.id) } })), btn('city.back', null, () => open('resident', id), 'city-btn--ghost'))];
    }
    const handIns = city.handIns(id, { priceLive: feed.nearLive });
    return [...top,
      h('p', { class: 'city-say', text: (sub && sub.line) || t('city.line.' + id + '.0') }),
      sub && sub.note ? h('p', { class: 'city-note', text: sub.note }) : null,
      h('div', { class: 'city-actions' },
        ...handIns.map((q) => btn('city.talk.handIn', { quest: questTitle(q) }, () => on.handIn(id, q.id), 'city-btn--gold')),
        btn('city.talk.chat', null, () => on.talk(id)),
        btn('city.talk.ask', null, () => on.ask(id)),
        btn('city.talk.gift', null, () => open('resident', id, { gift: true })),
        btn('city.talk.bye', null, () => close(), 'city-btn--ghost')),
      h('p', { class: 'city-dim', text: (lvl >= 2 ? '' : t('city.perk.locked') + ' · ') + t('city.perk.' + id) + ' · ' + t('city.me.loves', { good: goodName(RESIDENT_TASTE[id].loves) }) }),
    ];
  }

  function mePanel() {
    const d = city.data, items = GOODS.filter((g) => d.bag[g.id] > 0);
    return [
      head('city.me.title', t('city.me.stats', { meals: d.stats.meals, quests: d.stats.quests, seasons: d.stats.seasons })),
      h('h3', { text: t('city.me.bag') + ' · ' + city.bagCount + '/' + BAG_SIZE }),
      ...(items.length ? items.map((g) => h('div', { class: 'city-row' },
        h('div', {}, h('b', { text: goodName(g.id) + ' × ' + d.bag[g.id] }), g.food ? h('small', { text: t('city.tavern.food', { n: g.food }) }) : null),
        g.food ? btn('city.tavern.eat', null, () => { tell(on.snack(g.id)); }, 'city-btn--small city-btn--ghost') : null)) : [h('p', { class: 'city-dim', text: t('city.me.bagEmpty') })]),
      h('h3', { text: t('city.me.friends') }),
      ...RESIDENT_IDS.map((id) => h('div', { class: 'city-row' },
        h('div', {}, h('b', { text: resName(id) + ' · ' + t('city.level.' + city.level(id)) }), h('small', { text: t('city.res.' + id + '.role') + ' · ' + (city.hasPerk(id) ? t('city.perk.' + id) : t('city.me.loves', { good: goodName(RESIDENT_TASTE[id].loves) })) })),
        hearts(id))),
    ];
  }

  function gatePanel() {
    return [
      head('city.gate.title', t('city.tagline')),
      h('p', { class: 'city-say', text: t('city.gate.body') }),
      h('p', { class: 'city-dim', text: t('city.gate.purse') }),
      h('div', { class: 'city-actions' }, btn('city.gate.enter', null, () => on.tournament(), 'city-btn--gold'), btn('city.gate.stay', null, () => close(), 'city-btn--ghost')),
    ];
  }

  function helpPanel() {
    return [head('city.help.title', t('city.tagline')),
      ...['move', 'use', 'panels', 'camera', 'world'].map((k) => h('p', { class: 'city-help', innerHTML: t('city.help.' + k) }))]; // trusted locale strings with <kbd>
  }

  const RENDER = {
    market: marketPanel, tavern: tavernPanel, quests: () => journalPanel(true), journal: () => journalPanel(false), exchange: exchangePanel,
    resident: () => residentPanel(current.arg, current.sub), me: mePanel, gate: gatePanel, help: helpPanel,
  };

  function render() {
    renderBar();
    lastStatusKey = ''; lastQuestKey = '';
    renderStatus(city.now()); renderQuest();
    if (!current) return;
    const scroll = panel.scrollTop;
    panel.dataset.kind = current.kind;
    panel.replaceChildren(...RENDER[current.kind]().filter(Boolean));
    panel.scrollTop = scroll;
  }

  function open(kind, arg = null, sub = null) {
    if (!RENDER[kind]) return;
    const fresh = !current || current.kind !== kind || current.arg !== arg;
    current = { kind, arg, sub };
    panel.hidden = false; scrim.hidden = false;
    el.classList.add('city-ui--modal');
    render();
    if (fresh) { panel.scrollTop = 0; const first = panel.querySelector('.city-actions .city-btn, .city-row .city-btn, .city-table .city-btn'); if (first) first.focus({ preventScroll: true }); }
    if (on.openChange) on.openChange(kind, arg);
  }
  function close() {
    if (!current) return false;
    current = null;
    panel.hidden = true; scrim.hidden = true;
    el.classList.remove('city-ui--modal');
    if (on.openChange) on.openChange(null, null);
    return true;
  }
  const toggle = (kind) => (current && current.kind === kind ? close() : open(kind));

  city.subscribe(() => render());
  feed.subscribe(() => { lastStatusKey = ''; if (current && current.kind === 'exchange') render(); });
  i18n.subscribe(() => { promptState = null; render(); });
  renderBar();

  return {
    el, toast, tell, open, close, toggle, setPrompt, render, questTitle,
    get panel() { return current ? current.kind : null; },
    get panelEl() { return current ? panel : null; },
    get panelArg() { return current ? current.arg : null; },
    show() { el.hidden = false; render(); },
    hide() { close(); el.hidden = true; },
    /** A full-screen veil with a line of text (the crossing to the tournament). */
    cover(text) { cover.textContent = text || ''; cover.hidden = false; requestAnimationFrame(() => cover.classList.add('is-on')); },
    uncover() { cover.classList.remove('is-on'); setTimeout(() => { cover.hidden = true; }, 450); },
    /** Per frame: the clock in the status line and the quest tracker. */
    update(now) { renderStatus(now); renderQuest(); },
    buyPrice, goodById,
  };
}
