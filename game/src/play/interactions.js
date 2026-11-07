// Context interactions: where the player stands → what they can do there. Pure functions over the
// room's observation and its action list (GET actions: every candidate with `available` and the
// preconditions or engine guards that fail). No rule is evaluated here: availability and reasons
// come from the room, proximity radii from the room's own world map (src/net/world-map.js).
import { campAt, nearScroll, nearShardPedestal, anchorZoneAt } from '../net/world-map.js';

/** Precondition failures the play layer fixes by itself (it replays the walk before sending). */
const DEFERRABLE = new Set(['not_near', 'in_transit']);
const ROMAN = ['I', 'II', 'III', 'IV'];

/**
 * The hotspot at a client position. Island coordinates equal room coordinates; inside a Shell the
 * client passes the glass position of the interior it renders (`shellSpots.glass`).
 * @returns {{kind:'camp', clan:string}|{kind:'pedestal'}|{kind:'scroll'}|{kind:'anchor', shell:number}|{kind:'glass'}|{kind:'shell'}|null}
 */
export function hotspotAt({ zone, pos, shellSpots = null }) {
  if (zone === 'shell') {
    const g = shellSpots && shellSpots.glass;
    if (g && Math.hypot(pos[0] - g[0], pos[2] - g[1]) <= (shellSpots.radius ?? 4)) return { kind: 'glass' };
    return { kind: 'shell' };
  }
  if (nearShardPedestal(pos)) return { kind: 'pedestal' };
  if (nearScroll(pos)) return { kind: 'scroll' };
  const shell = anchorZoneAt(pos);
  if (shell) return { kind: 'anchor', shell };
  const clan = campAt(pos);
  if (clan) return { kind: 'camp', clan };
  return null;
}

export const sameArgs = (a, b) => JSON.stringify(sortKeys(a || {})) === JSON.stringify(sortKeys(b || {}));
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

/**
 * Availability of one command from the room's action list: {available: true|false|null, reason}.
 * null = the room did not list this exact argument set; the option is still offered and the room
 * decides when it is sent.
 */
export function availability(actions, type, args) {
  const a = (actions || []).find((x) => x.type === type && sameArgs(x.args, args));
  if (!a) return { available: null, reason: null };
  if (a.available) return { available: true, reason: null };
  const blocking = (a.failed || []).filter((f) => !DEFERRABLE.has(f.reason));
  return blocking.length ? { available: false, reason: blocking[0].reason } : { available: true, reason: null };
}

const listed = (actions, type) => (actions || []).filter((x) => x.type === type);

/**
 * Options at a hotspot, in display order (the first available one is the E key).
 * Option: {id, label:{key,args}, cmd:{type,args}|null, panel:string|null, available, reason, tone}
 */
export function contextOptions(spot, obs, actions) {
  if (!spot || !obs) return [];
  const out = [];
  const add = (id, labelKey, labelArgs, cmd, extra = {}) => {
    const av = cmd ? availability(actions, cmd.type, cmd.args) : { available: true, reason: null };
    out.push({ id, label: { key: labelKey, args: labelArgs || {} }, cmd, panel: null, tone: 'normal', ...av, ...extra });
  };
  const phase = obs.season.phase, tick = obs.season.tick;
  switch (spot.kind) {
    case 'camp': {
      const clan = spot.clan;
      if (clan === 'iris') { add('inspect', 'opt.lookCamp', { who: { $agentId: clan } }, { type: 'inspect', args: { target: 'camp:iris' } }); break; }
      for (const o of (obs.offers || []).filter((x) => x.from === clan)) {
        add('accept:' + o.id, 'opt.accept', { offer: { key: o.key, args: o.args }, price: o.price ?? 0 }, { type: 'accept_offer', args: { offerId: o.id } }, { tone: 'primary', offer: o });
        add('decline:' + o.id, 'opt.decline', {}, { type: 'decline_offer', args: { offerId: o.id } }, { offer: o });
      }
      add('talk', 'opt.talk', { who: { $agentId: clan } }, { type: 'talk', args: { clan } }, { panel: 'dialogue' });
      for (const a of listed(actions, 'mend').filter((x) => x.args.clan === clan)) add('mend', 'opt.mend', { who: { $agentId: clan } }, { type: 'mend', args: a.args }, { tone: 'primary' });
      if (clan === 'ash') for (const a of listed(actions, 'speak_key')) add('speak_key', 'opt.speakKey', {}, { type: 'speak_key', args: a.args }, { tone: 'primary' });
      for (const a of listed(actions, 'mediate').filter((x) => x.args.clanA === clan || x.args.clanB === clan)) add('mediate:' + a.args.clanA + a.args.clanB, 'opt.mediate', { a: { $agentId: a.args.clanA }, b: { $agentId: a.args.clanB } }, { type: 'mediate', args: a.args });
      add('inspect', 'opt.lookCamp', { who: { $agentId: clan } }, { type: 'inspect', args: { target: 'camp:' + clan } });
      break;
    }
    case 'pedestal': {
      for (const sh of (obs.auctions || []).filter((x) => x.open && x.from !== 'iris')) {
        add('bid:' + sh.id, 'opt.bid', { title: sh.title, amount: (sh.topBid ? sh.topBid.amount : 0) + 3, closes: sh.closesAtTick }, { type: 'bid_shard', args: { auctionId: sh.id } }, { tone: 'primary' });
      }
      add('inspect', 'opt.lookPedestal', {}, { type: 'inspect', args: { target: 'shard_pedestal' } });
      break;
    }
    case 'scroll': {
      if (phase === 'vote') {
        add('vote:yes', 'opt.voteGift', {}, { type: 'cast_vote', args: { accept: true } }, { tone: 'primary' });
        add('vote:no', 'opt.voteReject', {}, { type: 'cast_vote', args: { accept: false } }, { tone: 'primary' });
      }
      if (obs.iris && obs.iris.fragment.status === 'held') add('contribute', 'opt.contribute', { prize: obs.iris.fragment.prize.amount, tick: obs.iris.fragment.prize.tick }, { type: 'contribute_fragment', args: {} }, { tone: 'primary' });
      add('inspect', 'opt.readScroll', {}, { type: 'inspect', args: { target: 'scroll_table' } });
      break;
    }
    case 'anchor': {
      const n = spot.shell;
      const mine = new Set(((obs.iris && obs.iris.anchors) || []).filter((a) => a.shell === n).map((a) => a.tick));
      const seen = new Set();
      for (const a of listed(actions, 'place_anchor').filter((x) => x.args.shell === n)) {
        seen.add(a.args.tick);
        add('anchor:' + a.args.tick, 'opt.anchorVision', { shell: ROMAN[n - 1], tick: a.args.tick }, { type: 'place_anchor', args: { shell: n, tick: a.args.tick } }, { tone: 'primary' });
      }
      if (phase === 'play') {
        for (let t = tick; t <= Math.min(17, tick + 3); t++) {
          if (seen.has(t) || mine.has(t)) continue;
          add('anchor:' + t, 'opt.anchorTick', { shell: ROMAN[n - 1], tick: t }, { type: 'place_anchor', args: { shell: n, tick: t } });
        }
      }
      add('enter', 'opt.enterShell', { shell: ROMAN[n - 1] }, { type: 'enter_shell', args: { shell: n } });
      add('inspect', 'opt.lookZone', { shell: ROMAN[n - 1] }, { type: 'inspect', args: { target: 'anchor_zone:' + n } });
      break;
    }
    case 'glass': {
      add('watch', 'opt.watch', {}, { type: 'inspect', args: { target: 'guest_glass' } }, { tone: 'primary' });
      const asks = listed(actions, 'ask_guests');
      const anyAsk = asks.some((a) => availability(actions, a.type, a.args).available);
      out.push({ id: 'ask', label: { key: 'opt.ask', args: {} }, cmd: null, panel: 'ask', tone: 'primary', available: asks.length ? anyAsk : null, reason: asks.length && !anyAsk ? firstReason(actions, asks) : null });
      add('exit', 'opt.exitShell', {}, { type: 'exit_shell', args: {} });
      break;
    }
    case 'shell':
      add('exit', 'opt.exitShell', {}, { type: 'exit_shell', args: {} });
      break;
    default: break;
  }
  return out;
}

function firstReason(actions, list) {
  for (const a of list) { const av = availability(actions, a.type, a.args); if (av.reason) return av.reason; }
  return null;
}

/** Index of the option the E key runs: the first available primary option, else the first available one. */
export function defaultOption(options) {
  const i = options.findIndex((o) => o.available !== false && o.tone === 'primary');
  return i >= 0 ? i : options.findIndex((o) => o.available !== false);
}

/** Named room place for a hotspot (used when a walk replay is refused and the room must route). */
export function placeForSpot(spot) {
  if (!spot) return null;
  switch (spot.kind) {
    case 'camp': return 'camp:' + spot.clan;
    case 'pedestal': return 'shard_pedestal';
    case 'scroll': return 'scroll';
    case 'anchor': return 'anchor_zone:' + spot.shell;
    case 'glass': return 'guest_glass';
    case 'shell': return 'shell_entrance';
    default: return null;
  }
}
