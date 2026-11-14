// The shared town (docs/multiplayer.md): connects to the presence service, draws the other players and shows the
// chat. Positions travel in town coordinates (world minus TOWN_ORIGIN). boot-world.js creates it once Iris has
// entered the town, never on the judge link; when the service is not reachable the town stays single-player and the
// chip says so.
// The action feed (owner 13.11: "I want to see my friend's actions"): a level gained, a quest handed in, a chest opened,
// a boss beaten and a market trade are told to the room as compact whitelisted events (never text); the chat panel
// lists them as grey lines and marks the ones of friends (play/friends.js).
import { createPresence, createDemoPresence, presenceUrl, animFor, COMBAT, COMBAT_HOLD } from '../net/presence.js';
import { IMPACT } from '../render/hit-fx-core.js';
import { createHitFx } from '../render/hit-fx.js';

const ZERO = Object.freeze([0, 0, 0]);
import { createRemotePlayers } from './remote-players.js';
import { createChatPanel } from '../ui/chat-panel.js';
import { createChatBubbles, chatFeed, SELF } from './chat-bubbles.js';
import { TOWN_ORIGIN } from '../scenes/town-layout.js';
import { createFriends } from './friends.js';
import { watchFeats } from './feats.js';


/**
 * @param {{scene: THREE.Scene, t: Function, storage?: Storage, name?: string, skin?: string, phone?: boolean, url?: string, bots?: number,
 *          me?: string|null, ledger?: object, chests?: object}} o me: the account the friends list is saved for; ledger, chests: watched for the action feed
 * @returns {object|null} null when no presence URL is configured and no ?bots=N demo was asked for
 */
export function createMultiplayer({ scene, camera = null, THREE = null, t, storage = null, name = '', skin = 'iris', account = null, lv = null, phone = false, url = presenceUrl(), bots = 0, me = account, ledger = null, chests = null, hitFx: fxIn = null, win = globalThis }) {
  const hitFx = fxIn || (THREE && scene ? createHitFx({ THREE, parent: scene }) : null);
  if (!url && !bots) return null; // no service deployed: the town is single-player, as before
  let panel = null;
  // ?bots=N with no service: demo walkers simulated here (never sent anywhere); with a service the real room wins
  const presence = url ? createPresence({ url, name, skin, account, lv, storage, onChange: () => panel && panel.render() }) : createDemoPresence({ count: bots, onChange: () => panel && panel.render() });
  const friends = storage ? createFriends({ storage, me }) : null;
  panel = createChatPanel({ t, presence, phone, isFriend: (m) => !!friends && friends.has(m) });
  const unwatch = url ? watchFeats({ act: (k, v) => presence.act(k, v), ledger, chests }) : () => {};
  const remote = createRemotePlayers({ scene, phone, aiLabel: t('mp.ai') });
  // chat lines over the speakers' heads (owner 13.11); only when the game passes its camera
  const bubbles = camera && THREE ? createChatBubbles({ camera, THREE }) : null, feed = chatFeed(), heads = new Map();
  const local = [0, 0, 0], from = [0, 0, 0];
  let since = 0;
  // our strikes and casts (play/iris-avatar.js 'ftf:iris-action'): the room sees the move and its effect (presence v2)
  let combat = null, clock = 0;
  const onAction = (e) => { const d = e && e.detail; if (!d || d.phase !== 'start' || !COMBAT[d.clip]) return; combat = { clip: d.clip, at: clock }; presence.fx(COMBAT[d.clip].fx); };
  if (win && win.addEventListener) win.addEventListener('ftf:iris-action', onAction);
  // the others' strikes and casts, drawn where the server has them (the pooled hit effects; no camera shake for theirs)
  const offFx = presence.on('fx', (f) => {
    if (!hitFx) return;
    const O = presence.area === 'isles' ? ZERO : TOWN_ORIGIN, x = f.p[0] + O[0], y = f.p[1] + O[1], z = f.p[2] + O[2];
    if (Math.hypot(x - from[0], z - from[2]) > 60) return;
    const fx = Math.sin(f.h), fz = Math.cos(f.h), I = IMPACT[f.k] || IMPACT.strike;
    if (f.k === 'strike' || f.k === 'strike3' || f.k === 'super') hitFx.slash([x, y + 1.1, z], f.h, f.k === 'super' ? 2.6 : 1.7, I.color, 1, f.k === 'strike3' ? -0.5 : 0.15, 0.22);
    if (f.k === 'super' || f.k === 'strike3') hitFx.burst([x + fx * 1.6, y + 0.9, z + fz * 1.6], I.color, f.k === 'super' ? 9 : 5, 0.5);
    else if (f.k === 'lance') for (let i = 1; i <= 4; i++) hitFx.burst([x + fx * i * 2.4, y + 1.2, z + fz * i * 2.4], I.color, 3, 0.35);
    else if (f.k === 'snare') hitFx.burst([x + fx * 8, y + 0.4, z + fz * 8], I.color, 8, 0.6);
    else if (f.k === 'dash') hitFx.burst([x, y + 0.3, z], 0xdfe8ff, 4, 0.4);
  });
  // the shared town-hill spiders (presence v2): the link play/mobs.js MobBrain.share() reads
  const bites = [], loot = new Map();
  const offBite = presence.on('bite', (b) => bites.push(b.mob));
  const offDeath = presence.on('death', (d) => { loot.set(d.mob, !!d.mine); if (loot.size > 64) loot.delete(loot.keys().next().value); });
  const mobLink = {
    live: () => presence.status === 'online' && presence.has('mobs'),
    rows: () => { const m = new Map(); for (const r of presence.mobs()) m.set(r.id, r); return m; },
    hit: (id, src, n) => presence.hit(id, src, n),
    lootOf: (id) => { const v = loot.get(id); loot.delete(id); return !!v; },
    takeBites: () => bites.splice(0),
  };
  return {
    presence, mobLink,
    /** Other heroines' positions (town-local metres): the townsfolk walk round them (play/townsfolk-plan.js bodiesAround). */
    bodies: () => presence.positions().filter((r) => r.p).map((r) => r.p),
    /** Per frame while the town is shown. pos is world metres; speed is the ground speed in m/s. */
    update(dt, { pos, heading, speed = 0, grounded = true, reducedMotion = false, area = 'town' }) {
      // the town travels in town-local metres; the isles (a season) in world metres (presence v2 rooms per area)
      // an older server knows no areas: it would put the isles into the town room, so there we stay quiet and draw no one
      if (area === 'isles' && !(presence.has && presence.has('area')) && presence.area !== 'isles') { remote.update(0, [], pos); return; }
      if (area !== presence.area && presence.setArea) presence.setArea(area);
      const O = area === 'town' ? TOWN_ORIGIN : ZERO;
      local[0] = pos[0] - O[0]; local[1] = pos[1] - O[1]; local[2] = pos[2] - O[2];
      clock += dt; if (hitFx) hitFx.update(reducedMotion ? 0 : dt);
      const fighting = combat && clock - combat.at < COMBAT_HOLD;
      presence.update({ p: local, h: heading, a: fighting ? COMBAT[combat.clip].a : animFor(speed, grounded) });
      const list = presence.positions().map((r) => (r.p ? { ...r, p: [r.p[0] + O[0], r.p[1] + O[1], r.p[2] + O[2]] } : r));
      from[0] = pos[0]; from[1] = pos[1]; from[2] = pos[2];
      remote.update(dt, list, from, reducedMotion);
      if (bubbles) {
        const at = performance.now() / 1000;
        for (const c of feed(presence.chat)) bubbles.push(c.key, c.text, at);
        heads.clear(); heads.set(SELF, pos); for (const r of list) if (r.p) heads.set(r.id, r.p);
        bubbles.update(at, heads);
      }
      if ((since += dt) > 1) { since = 0; panel.render(); } // the chip's count and status
    },
    /** The remote player under a ray (THREE.Raycaster), or null: {id, name, skin, account, lv, ai}. */
    pick: (raycaster) => remote.pick(raycaster),
    setVisible(on) { panel.el.hidden = !on; if (!on) { remote.update(0, [], from); if (bubbles) bubbles.clear(); } },
    stop() { unwatch(); offFx(); offBite(); offDeath(); if (win && win.removeEventListener) win.removeEventListener('ftf:iris-action', onAction); presence.stop(); if (hitFx && !fxIn) hitFx.dispose(); remote.clear(); panel.destroy(); if (bubbles) bubbles.clear(); },
  };
}
