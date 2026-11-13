// The shared town (docs/multiplayer.md): connects to the presence service, draws the other players and shows the
// chat. Positions travel in town coordinates (world minus TOWN_ORIGIN). boot-world.js creates it once Iris has
// entered the town, never on the judge link; when the service is not reachable the town stays single-player and the
// chip says so.
// The action feed (owner 13.11: "I want to see my friend's actions"): a level gained, a quest handed in, a chest opened,
// a boss beaten and a market trade are told to the room as compact whitelisted events (never text); the chat panel
// lists them as grey lines and marks the ones of friends (play/friends.js).
import { createPresence, createDemoPresence, presenceUrl, animFor } from '../net/presence.js';
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
export function createMultiplayer({ scene, camera = null, THREE = null, t, storage = null, name = '', skin = 'iris', account = null, lv = null, phone = false, url = presenceUrl(), bots = 0, me = account, ledger = null, chests = null }) {
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
  return {
    presence,
    /** Other heroines' positions (town-local metres): the townsfolk walk round them (play/townsfolk-plan.js bodiesAround). */
    bodies: () => presence.positions().filter((r) => r.p).map((r) => r.p),
    /** Per frame while the town is shown. pos is world metres; speed is the ground speed in m/s. */
    update(dt, { pos, heading, speed = 0, grounded = true, reducedMotion = false }) {
      local[0] = pos[0] - TOWN_ORIGIN[0]; local[1] = pos[1] - TOWN_ORIGIN[1]; local[2] = pos[2] - TOWN_ORIGIN[2];
      presence.update({ p: local, h: heading, a: animFor(speed, grounded) });
      const list = presence.positions().map((r) => (r.p ? { ...r, p: [r.p[0] + TOWN_ORIGIN[0], r.p[1] + TOWN_ORIGIN[1], r.p[2] + TOWN_ORIGIN[2]] } : r));
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
    stop() { unwatch(); presence.stop(); remote.clear(); panel.destroy(); if (bubbles) bubbles.clear(); },
  };
}
