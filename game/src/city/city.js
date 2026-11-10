// The city layer: runs Evermind while Iris is in town (owner 10.11: an open hub city in the spirit of an MMO
// capital, one town, walls for a border). It owns the zone switch (collision world, camera limits, lights),
// the context interaction (E), the residents, the Exchange boards and the city UI, and it hands over to the
// season's play layer at the Shell Gate. boot-world.js drives it through the same small surface as the play
// layer (update, handleKey, ui.panel, routeWish, zone), so movement, camera and input stay in one place.
// Rules live in state.js / economy.js (pure, tested); this file only wires them to the scene and the UI.
import * as THREE from 'three';
import { CityState } from './state.js';
import { createPriceFeed, formatUsd, formatChange } from './prices.js';
import { createCityUi } from './ui.js';
import { IrisActor, Residents } from './actors.js';
import { GOODS, MEALS, buyPrice, priceFactor } from './economy.js';
import { CITY_CAMERA, placeAt, residentAt } from './layout.js';
import { cityUrl } from './url.js';

const PROMPT = { market: 'city.prompt.market', tavern: 'city.prompt.tavern', exchange: 'city.prompt.exchange', quests: 'city.prompt.quests', gate: 'city.prompt.gate' };
const PANEL = { market: 'market', tavern: 'tavern', exchange: 'exchange', quests: 'quests', gate: 'gate' };

/** Draws the three in-world boards of the Exchange from the feed (nothing is drawn that the feed does not hold). */
export function drawBoards(boards, view, t) {
  const INK = '#101b1e', GOLD = '#f6df9b', TEXT = '#ece6d4', DIM = '#8f978c', UP = '#8fd3ff', DOWN = '#ff8c6b';
  const serif = (px, w = 400) => `${w} ${px}px "Libre Caslon Text", "WH Cyrillic", Georgia, serif`;
  const sans = (px, w = 500) => `${w} ${px}px "Source Sans 3", "Segoe UI", system-ui, sans-serif`;
  const frame = (g, title, status) => {
    g.fillStyle = INK; g.fillRect(0, 0, 384, 512);
    g.strokeStyle = 'rgba(232,214,172,.6)'; g.lineWidth = 3; g.strokeRect(8, 8, 368, 496);
    g.fillStyle = GOLD; g.font = serif(30); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(title, 192, 56, 340);
    g.fillStyle = status === 'live' ? UP : status === 'offline' ? DOWN : DIM; g.font = sans(17);
    g.fillText(t('city.ex.status.' + status), 192, 84, 340);
    g.strokeStyle = 'rgba(232,214,172,.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(40, 98); g.lineTo(344, 98); g.stroke();
  };
  const draw = (name, fn) => { const b = boards[name]; if (!b) return; fn(b.canvas.getContext('2d')); b.texture.needsUpdate = true; };
  draw('near', (g) => {
    frame(g, t('city.near'), view.near.status);
    const d = view.near.data;
    if (!d) return;
    g.fillStyle = GOLD; g.font = serif(86); g.fillText(formatUsd(d.usd), 192, 270, 340);
    if (d.change24h != null) { g.fillStyle = d.change24h >= 0 ? UP : DOWN; g.font = sans(34, 600); g.fillText((d.change24h >= 0 ? '▲ ' : '▼ ') + formatChange(d.change24h), 192, 336, 340); }
    g.fillStyle = DIM; g.font = sans(18); g.fillText(t('city.ex.change'), 192, 372, 340);
  });
  draw('memes', (g) => {
    frame(g, t('city.ex.board.memes'), view.memes.status);
    (view.memes.data || []).slice(0, 7).forEach((m, i) => {
      const y = 140 + i * 50;
      g.textAlign = 'left'; g.fillStyle = TEXT; g.font = sans(20, 600); g.fillText(m.symbol, 28, y, 170);
      g.fillStyle = DIM; g.font = sans(17); g.fillText(formatUsd(m.usd), 28, y + 21, 220);
      if (m.change24h != null) { g.textAlign = 'right'; g.fillStyle = m.change24h >= 0 ? UP : DOWN; g.font = sans(20, 600); g.fillText((m.change24h >= 0 ? '▲ ' : '▼ ') + formatChange(m.change24h), 356, y + 8, 130); }
    });
  });
  draw('nfts', (g) => {
    frame(g, t('city.ex.board.nfts'), view.nfts.status);
    (view.nfts.data || []).slice(0, 7).forEach((n, i) => {
      const y = 140 + i * 50, parts = n.title.split(' · ');
      g.textAlign = 'left'; g.fillStyle = TEXT; g.font = sans(19, 600); g.fillText((parts[0] || n.tokenId).replace('Memory shard ', ''), 28, y, 120);
      g.fillStyle = DIM; g.font = sans(17); g.fillText(parts[1] || '', 28, y + 21, 200);
      g.textAlign = 'right'; g.fillStyle = GOLD; g.font = sans(20, 600); g.fillText(n.priceSilk != null ? '◈ ' + n.priceSilk : '—', 356, y + 8, 120);
    });
  });
}

/**
 * @param {object} o
 * @param {object} o.cityScene scenes/city.js @param {object} o.rig camera rig @param {object} o.player CharacterController
 * @param {THREE.Object3D} o.avatar @param {object} o.lookdev @param {THREE.Camera} o.camera
 * @param {HTMLElement} o.uiRoot @param {object} o.ctx play context @param {() => Promise<void>} o.onTournament
 * @param {() => void} o.onSettings @param {{world: object, spawn: number[]}} o.island where the tournament starts
 */
export function startCity({ cityScene, rig, player, avatar, lookdev, camera, uiRoot, ctx, onTournament, onSettings, island }) {
  const { i18n } = ctx;
  const t = (k, a) => i18n.t(k, a);
  const city = new CityState({ storage: ctx.storage });
  const feed = createPriceFeed({});
  const iris = new IrisActor(avatar);
  const residents = new Residents({ root: cityScene.root, uiRoot, name: (id) => t('city.res.' + id + '.name'), role: (id) => t('city.res.' + id + '.role') });
  const origin = new THREE.Vector3(...cityScene.origin);
  const state = { active: false, shown: false, now: 0, target: null, saveTimer: 0, leaving: false, savedRig: null };

  function flush() {
    for (const n of city.drainNews()) {
      if (n.kind === 'intro') ui.toast(t('city.toast.intro', { silk: n.silk }) + (n.finished ? ' · ' + t('city.intro.done') : ''));
      else if (n.kind === 'quest') ui.toast(t('city.toast.quest', { silk: n.silk }) + (n.bonus ? ' · ' + t('city.toast.bonus', { bonus: n.bonus }) : ''));
      else if (n.kind === 'friend') ui.toast(t('city.toast.friend', { name: t('city.res.' + n.resident + '.name'), level: t('city.level.' + n.level) }));
      else if (n.kind === 'hungry') ui.toast(t('city.toast.hungry'), 'city-toast--bad');
    }
  }
  const act = (result) => { flush(); return result; };

  function askLine(id) {
    if (id === 'moss') return t('city.ask.moss', { meal: t('city.meal.' + MEALS[0].id) });
    if (id === 'amber') {
      const best = GOODS.slice().sort((a, b) => priceFactor(a.id, city.day) - priceFactor(b.id, city.day))[0];
      return t('city.ask.amber', { good: t('city.good.' + best.id), price: buyPrice(best.id, city.day, city.discount) });
    }
    if (id === 'frost') {
      const v = feed.view().near;
      return v.status === 'live' ? t('city.ask.frost.live', { price: formatUsd(v.data.usd), change: v.data.change24h != null ? formatChange(v.data.change24h) : '0%' }) : t('city.ask.frost.offline');
    }
    if (id === 'salt') { const r = city.rumour(); return t(r.sure ? 'city.ask.salt.sure' : 'city.ask.salt', { good: t('city.good.' + r.good), claim: r.claim }); }
    return t('city.ask.ash');
  }

  const ui = createCityUi({
    root: uiRoot, ctx, city, feed,
    on: {
      use: () => use(),
      buy: (id) => act(city.buy(id)), sell: (id) => act(city.sell(id)),
      eat: (id) => act(city.eat(id)), snack: (id) => act(city.snack(id)),
      accept: (id) => act(city.accept(id, { priceLive: feed.nearLive })), drop: (id) => act(city.drop(id)),
      talk: (id) => {
        const r = city.talk(id);
        if (!r.ok) return ui.tell(r);
        residents.say(id, state.now);
        ui.open('resident', id, { line: t('city.line.' + id + '.' + r.line), note: r.first ? t('city.talk.first') : null });
        flush();
        return r;
      },
      ask: (id) => { residents.say(id, state.now); ui.open('resident', id, { line: askLine(id) }); },
      gift: (id, good) => {
        const r = city.gift(id, good);
        if (!r.ok) { ui.tell(r); ui.open('resident', id); return r; }
        residents.say(id, state.now, 3);
        ui.open('resident', id, { line: t(r.loved ? 'city.talk.loved' : 'city.talk.liked') });
        flush();
        return r;
      },
      handIn: (id, questId) => {
        const r = city.handIn(questId, id, { priceLive: feed.nearLive });
        if (!r.ok) return ui.tell(r);
        residents.say(id, state.now, 3);
        ui.open('resident', id, { line: t('city.talk.liked') });
        flush();
        return r;
      },
      refresh: () => feed.refresh(),
      settings: () => onSettings && onSettings(),
      tournament: () => goTournament(),
      openChange: (kind) => { if (kind === 'exchange') { city.note('prices'); city.save(); flush(); } },
    },
  });
  feed.subscribe((view) => drawBoards(cityScene.boards, view, t));
  i18n.subscribe(() => drawBoards(cityScene.boards, feed.view(), t));
  // the boards' typefaces arrive after the first paint: draw again once they are in
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawBoards(cityScene.boards, feed.view(), t)).catch(() => {});

  /** E: talk to the envoy in reach, else use the place Iris stands at. */
  function use() {
    const tg = state.target;
    if (!tg || ui.panel) return false;
    if (tg.resident) { ui.open('resident', tg.resident.id, { line: t('city.line.' + tg.resident.id + '.0') }); residents.say(tg.resident.id, state.now, 3); }
    else ui.open(PANEL[tg.place.kind]);
    return true;
  }

  /** Puts Iris in the city: its collision world, a closer camera, the city's lights; the island's sky stays. */
  function enter() {
    if (state.active) return;
    state.active = true;
    cityScene.setActive(true, lookdev.cfg.pointLights);
    player.world = cityScene.world;
    state.savedRig = { maxDist: rig.maxDist, dist: rig.dist };
    rig.world = cityScene.world;
    rig.maxDist = CITY_CAMERA.maxDist; rig.dist = CITY_CAMERA.dist; rig.distTarget = null; rig.saved = null;
    rig.pitchOffset = CITY_CAMERA.pitchOffset;
    const sp = cityScene.spawn();
    player.teleport(sp.pos, sp.heading);
    rig.yaw = rig.baseYaw;
    if (lookdev.clouds && lookdev.clouds.group) lookdev.clouds.group.visible = false; // the ground reaches the horizon here
    iris.load();
    residents.loadAll();
    drawBoards(cityScene.boards, feed.view(), t);
    feed.start();
  }

  /** Shows the city's interface (the lobby is gone). */
  function show() { state.shown = true; uiRoot.ownerDocument.body.classList.add('in-city'); ui.show(); }

  /** Back to the island's world for a season: everything of the city steps aside. */
  function leave() {
    if (!state.active) return;
    state.active = false; state.shown = false;
    city.save();
    feed.stop();
    ui.hide(); residents.hide();
    iris.release();
    cityScene.setActive(false);
    uiRoot.ownerDocument.body.classList.remove('in-city');
    if (lookdev.clouds && lookdev.clouds.group) lookdev.clouds.group.visible = true;
    for (const l of lookdev.lanternLights || []) l.visible = !!lookdev.cfg.pointLights;
    player.world = island.world; rig.world = island.world;
    rig.saved = null; rig.distTarget = null;
    if (state.savedRig) rig.maxDist = state.savedRig.maxDist;
    rig.dist = rig.defaultDist; rig.pitchOffset = 0;
    player.teleport(island.spawn, 0);
    rig.yaw = rig.baseYaw;
  }

  async function goTournament() {
    if (state.leaving) return;
    state.leaving = true;
    city.note('gate'); city.save(); flush();
    ui.close();
    ui.cover(t('city.gate.travel'));
    await new Promise((r) => setTimeout(r, 450));
    leave();
    // the veil belongs to the city UI, which is hidden now: keep only the veil up while the season loads
    ui.el.hidden = false; ui.el.classList.add('city-ui--veil');
    try { await onTournament(); } finally {
      ui.uncover();
      setTimeout(() => { ui.el.hidden = true; ui.el.classList.remove('city-ui--veil'); }, 500);
    }
  }

  function update(dt, { speed = 0 } = {}) {
    if (!state.active) return;
    state.now += dt;
    const local = cityScene.toLocal(player.pos);
    const res = residentAt(local[0], local[2]);
    const place = res ? null : placeAt(local[0], local[2]);
    state.target = res ? { resident: res } : place && PANEL[place.kind] ? { place } : null;
    ui.setPrompt(!state.shown || ui.panel || !state.target ? null : res ? { key: 'city.prompt.talk', args: { name: t('city.res.' + res.id + '.name') } } : { key: PROMPT[place.kind] });
    if (state.shown) {
      city.tick(dt);
      flush();
      if ((state.saveTimer += dt) > 10) { state.saveTimer = 0; city.save(); }
      ui.update(Date.now());
    }
    for (const l of lookdev.lanternLights || []) l.visible = false; // the island's lanterns are 4 km away
    iris.update(dt, speed);
    residents.update(dt, { now: state.now, irisLocal: local, camera, origin, reducedMotion: lookdev.reducedMotion, hidePlates: !state.shown || !!ui.panel });
    cityScene.update(lookdev.reducedMotion ? 0 : state.now);
  }

  function handleKey(code) {
    if (!state.shown) return false;
    if (code === 'Escape') return ui.close();
    if (code === 'KeyL') { const ls = i18n.locales || ['en', 'ru']; i18n.setLocale(ls[(ls.indexOf(i18n.locale) + 1) % ls.length]); return true; }
    if (ui.panel) {
      if ((code === 'KeyV' && ui.panel === 'journal') || (code === 'KeyM' && ui.panel === 'me') || (code === 'KeyT' && ui.panel === 'gate') || (code === 'KeyH' && ui.panel === 'help')) ui.close();
      return true; // a panel owns the keyboard
    }
    if (code === 'KeyE' || code === 'KeyF') return use();
    if (code === 'KeyV') { ui.open('journal'); return true; }
    if (code === 'KeyM') { ui.open('me'); return true; }
    if (code === 'KeyT') { ui.open('gate'); return true; }
    if (code === 'KeyH') { ui.open('help'); return true; }
    return false;
  }

  return {
    city, feed, ui: { get panel() { return ui.panel; }, get panelEl() { return ui.panelEl; } }, cityUi: ui, residents,
    enter, show, leave, update, handleKey, goTournament,
    routeWish: () => null, cancelRoute() {}, routeActive: false, session: null,
    get zone() { return state.active ? 'city' : 'island'; },
    get active() { return state.active; },
    get canRun() { return !city.hungry; },
  };
}

/**
 * The city's side of a season: the purse a finished season pays, and the way back to Evermind (a reload that
 * lands in the city: the season lives in the browser tab and does not survive leaving it).
 * @param {{play: object, ctx: object, uiRoot: HTMLElement, settingsDialog?: HTMLElement, location?: Location}} o
 */
export function attachSeasonBridge({ play, ctx, uiRoot, settingsDialog = null, location = globalThis.location }) {
  const { i18n } = ctx, doc = uiRoot.ownerDocument;
  const city = new CityState({ storage: ctx.storage });
  let pill = null, over = false;
  const goBack = (ask) => {
    if (ask && !over && !doc.defaultView.confirm(i18n.t('city.return.confirm'))) return;
    location.assign(cityUrl(location.href));
  };
  const renderPill = (silk) => {
    if (!pill) { pill = doc.createElement('div'); pill.className = 'city-return'; doc.body.appendChild(pill); }
    const label = doc.createElement('span'), b = doc.createElement('button');
    label.textContent = i18n.t('city.return.paid', { silk });
    b.type = 'button'; b.textContent = i18n.t('city.return'); b.addEventListener('click', () => goBack(false));
    pill.replaceChildren(label, b);
  };
  let paid = null;
  const onObs = (o) => {
    if (!o || !o.season || !o.season.outcome || over) return;
    over = true;
    const r = city.creditSeason({ seasonId: o.season.seasonId || 'local-' + (o.season.merkleRoot || o.version), silk: o.iris ? o.iris.silk : 0, outcome: o.season.outcome });
    paid = r.ok ? r.purse : 0;
    renderPill(paid);
  };
  play.session.on('obs', onObs);
  onObs(play.session.obs);
  let row = null;
  if (settingsDialog) {
    row = doc.createElement('div'); row.className = 'city-return-row';
    const b = doc.createElement('button');
    b.type = 'button'; b.addEventListener('click', () => goBack(true));
    row.appendChild(b); settingsDialog.appendChild(row);
    const label = () => { b.textContent = i18n.t('city.return'); if (pill && paid != null) renderPill(paid); };
    label(); i18n.subscribe(label);
  }
  return { city, goBack, get over() { return over; } };
}
