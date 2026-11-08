// Per-viewer projection: the single source of what a player may see, for both the browser UI and the
// agent API. It starts from the engine's own clientProjection() (which already strips the seed, RNG,
// truth, other clans' prizes, Ash's phrase, unpublished events, offer honesty and AI valuations) and
// then keeps only fields that player is entitled to, by role:
//   controller (the player guiding Iris): Iris's inventory, memories, relationships, dictionary,
//     offers, auctions, visions; never the language permutation, AI mastery, AI anchors and pacts,
//     salts, fragment meanings or anything the engine treats as hidden.
//   helper (another player in the room): public world state only (tick, phase, tension, broken links,
//     the Scroll, revealed chronicle, published signs, avatars). No silk, memories, offers or visions.
// Output is English with stable IDs; no engine-internal key names leak through.
import { withState } from './engine-host.js';
import { CLAN_IDS } from './world-map.js';
import { MEANING_NAMES } from './catalog.js';
import * as T from './text.js';

const r2 = (v) => Math.round(v * 100) / 100;
const clan = (i) => CLAN_IDS[i] ?? null;
const revealedIdx = (p) => new Set(p.chron.map((c) => c.idx));

function meaningObj(m) { return { place: m[0] + 1, action: MEANING_NAMES[1][m[1]], power: [10, 20, 40, 80][m[2]], delay: m[3] + 1 }; }

function seasonPublic(p, E, role, entropy = null) {
  // Under ftf-seed/1 the season is sealed at start_season (room entropy committed first, player nonce after), so
  // before that the root and ids are provisional and are not shown; the commitment is.
  const sealed = !entropy || entropy.protocol !== 'ftf-seed/1' || entropy.sealed;
  const s = {
    seasonId: sealed ? p.seasonId ?? null : null,
    rules: p.rulesVersion,
    merkleRoot: sealed ? p.root : null,
    leafCount: p.events.length,
    seedCommitment: sealed ? p.seedCommit : null,
    entropy,
    ashKeyCommitment: sealed ? p.pepelKey.hash : null,
    ownerKeyCommitment: p.pKey ? p.pKey.hash : null,
    tick: p.tick, ticks: E.TICKS, contributionDeadline: E.DEADLINE, crisisTick: E.CRISIS,
    phase: p.phase, tension: p.H, outcome: p.outcome,
    outcomeText: p.outcome ? T.t('outcome.' + p.outcome) : null,
    votes: p.phase === 'end' && p.votes ? p.votes.map((v, i) => ({ clan: clan(i), accept: !!v })) : null,
    heir: role === 'controller' ? p.heir : undefined,
  };
  return s;
}

function scroll(p) {
  return p.frag.map((f) => {
    const o = { clan: clan(f.owner), status: f.st, contributedAt: f.st === 'scroll' ? f.at : null };
    if (f.st === 'scroll') { o.forms = f.forms; o.dots = f.dots; o.keySign = !!f.key; } // the glyph is visible on the Scroll; its meaning is not
    return o;
  });
}

function edges(p, E, full) {
  const out = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const e = { a: clan(i), b: clan(j), broken: E.isBroken(i, j) };
    if (full) e.meanTrust = Math.round((p.T[i][j] + p.T[j][i]) / 2);
    out.push(e);
  }
  return out;
}

function chronicle(p) {
  return p.chron.map((c) => ({ tick: c.t, index: c.idx, forms: c.forms, dots: c.dots, meaning: meaningObj(c.m), irisReadSlots: c.ok }));
}
const proofs = (p) => p.proofs.map((x) => ({ tick: x.t, index: x.idx, leaf: x.leaf, verified: !!x.ok }));

/** Published, not yet revealed signs; visions only for the controller. */
function prophecies(p, E, withVisions) {
  const rev = revealedIdx(p);
  const V = withVisions ? E.dictVotes() : null;
  const out = [];
  p.events.forEach((e, i) => {
    if (!e.forms || rev.has(i) || e.t != null) return; // revealed events carry t; unpublished carry only the leaf
    const published = e.pub <= p.tick;
    if (!published && !withVisions) return;
    const o = { index: i, publishedAt: e.pub, forms: e.forms, dots: e.dots, vision: !published };
    if (withVisions) {
      const rd = E.readGlyph(e.forms, e.dots, V);
      o.reading = { offset: rd.r, slots: rd.sl.map((x) => ({ meaning: x.m, confidence: r2(x.conf), certain: !!x.cert })) };
      o.impliedAnchor = { shell: rd.sl[0].m + 1, tick: e.pub + rd.sl[3].m + 1 };
    }
    out.push(o);
  });
  return out;
}

function dictionary(p, E) {
  const V = E.dictVotes();
  const cells = [];
  for (let s = 0; s < 4; s++) for (let f = 0; f < 4; f++) {
    const k = s + '_' + f, pin = p.pins[k], g = E.guess(s, f, V);
    cells.push({ slot: s, form: f, known: pin ? pin.m : null, source: pin ? T.pinSource(pin.src) : null, excluded: (p.no[k] || []).slice(), guess: { meaning: g.m, confidence: r2(g.conf) } });
  }
  return {
    readingRule: p.rule,
    confidentCells: E.confidentCells(),
    cells,
    boughtWords: p.bought.map((b) => ({ slot: b.s, form: b.f, meaning: b.m, from: clan(b.from), exposedAsLie: !!b.revealed })),
  };
}

function memories(p) {
  return p.mem.map((m) => ({
    id: m.id, kind: m.kind, weight: m.w, about: m.about != null ? clan(m.about) : null,
    text: T.memoryText(m.text), effectIfForgotten: T.effectTextEn(m),
    ...(m.kind === 'debt' ? { amount: m.data.amount, dueTick: m.data.due } : {}),
    ...(m.kind === 'promise' ? { byTick: m.data.by } : {}),
  }));
}

function offers(p) {
  return p.offers.map((o) => {
    const base = { id: o.id, from: clan(o.from), kind: o.kind, ...T.offerText(o) };
    if (o.kind === 'sell') Object.assign(base, { price: o.price, slot: o.s, form: o.f, meaning: o.m });
    if (o.kind === 'loan') Object.assign(base, { price: o.n, repay: o.back, dueTick: o.due });
    if (o.kind === 'pact') Object.assign(base, { price: 0, byTick: o.by });
    if (o.kind === 'escrow') Object.assign(base, { price: o.price });
    if (o.kind === 'gift') base.price = 0;
    return base;
  });
}

function auctions(p, E, shards = p.shards, shardMeta = null) {
  return shards.map((sh) => {
    const top = E.topBid(sh), mine = sh.bids.find((b) => b.c === 0);
    const win = sh.winner != null ? sh.bids.find((b) => b.c === sh.winner) : null;
    const meta = shardMeta && shardMeta.has(sh.id) ? shardMeta.get(sh.id) : undefined;
    return {
      id: sh.id, from: clan(sh.from), title: T.shardTitle(sh.title), closesAtTick: sh.exp, open: !sh.done,
      topBid: top ? { clan: clan(top.c), amount: top.amt } : null, yourBid: mine ? mine.amt : null,
      result: sh.done ? T.shardResult(sh.result) : null, winner: sh.winner != null ? clan(sh.winner) : null,
      // Shard-NFT fields (docs/shard-nft.md): what was forgotten, when, the price paid, the sign the vision opened.
      kind: sh.mem ? sh.mem.kind : sh.kind ?? null,
      memory: sh.mem ? { kind: sh.mem.kind, weight: sh.mem.w } : null,
      forgottenAtTick: Math.max(1, sh.exp - 2),
      price: win ? win.amt : null,
      unlocked: meta ? { index: meta.index, leaf: meta.leaf } : null,
      tokenId: p.seasonId ? `${p.seasonId}-${sh.id}` : null,
    };
  });
}

function relationships(p, E) {
  return {
    clans: [1, 2, 3, 4, 5].map((j) => ({
      clan: clan(j), trustInIris: Math.round(p.T[j][0]), irisTrust: Math.round(p.T[0][j]), linkBroken: E.isBroken(0, j),
      isolated: !!p.isolated[j], silk: p.silk[j], fragment: p.frag[j].st, remembersBetrayal: E.hasBetrayal(j),
    })),
    edges: edges(p, E, true),
  };
}

function irisSelf(p, S, E) {
  const f = p.frag[0];
  const k = E.keyVisionStatus();
  return {
    silk: p.silk[0], attention: p.ap, maxAttention: E.maxAP(), firstWordForgotten: !!p.wild,
    escrow: p.escrow || 0,
    fragment: {
      status: f.st, forms: f.forms, dots: f.dots, keySign: !!f.key, contributedAt: f.at,
      prize: { amount: p.V[0], tick: p.tV[0], ...(f.prize != null ? { promised: f.prize, paid: !!f.prizePaid } : {}) },
    },
    ownerKey: p.pKey ? { phrase: p.pKey.phrase, commitment: p.pKey.hash } : null,
    ashKey: S.pepelKeyKnown ? { known: true, phrase: S.pepelKey.phrase } : { known: false },
    keyVision: { open: k.open, confidentCells: k.cells, needCells: k.needCells, heavyMemory: k.heavyMemory },
    anchors: p.anchors.filter((a) => a.c === 0).map((a) => ({ shell: a.place + 1, tick: a.t, placedAt: a.at, stake: a.stake })),
    forgotten: p.forgot.map((x) => ({ text: T.memoryText(x.text), fate: T.fateText(x.fate) })),
  };
}

/**
 * Builds the observation of `viewer` ({playerId, role}) from the room's engine state and world data.
 * `world` = {members, you, session, version, simTime, availableActions, clues, logograms, entropy, shardLog, shardMeta}.
 */
export function project(state, viewer, world) {
  return withState(state, (E) => {
    const p = E.clientProjection(state);
    const isController = viewer.role === 'controller';
    const obs = {
      apiVersion: 'v1',
      session: world.session,
      version: world.version,
      simTime: world.simTime,
      you: world.you,
      members: world.members,
      season: seasonPublic(p, E, viewer.role, world.entropy ?? null),
      scroll: scroll(p),
      chronicle: chronicle(p),
      proofs: proofs(p),
      prophecies: prophecies(p, E, isController),
    };
    if (isController) {
      obs.iris = irisSelf(p, state, E);
      obs.inventory = { silk: p.silk[0], fragment: p.frag[0].st, anchors: obs.iris.anchors, boughtWords: undefined };
      obs.memories = memories(p);
      obs.relationships = relationships(p, E);
      obs.dictionary = dictionary(p, E);
      obs.inventory.boughtWords = obs.dictionary.boughtWords;
      obs.offers = offers(p);
      obs.auctions = auctions(p, E, p.shards, world.shardMeta || null);
      obs.shards = auctions(p, E, world.shardLog || p.shards, world.shardMeta || null);
      obs.logograms = world.logograms;
      obs.log = p.feed.slice(0, 30).map(T.logEntry);
    } else {
      obs.relationships = { edges: edges(p, E, false), isolated: p.isolated.map((v, i) => (v ? clan(i) : null)).filter(Boolean) };
    }
    obs.clues = world.clues;
    obs.availableActions = world.availableActions;
    return obs;
  });
}

/** A compact public summary of the season used for public events (all members). */
export function publicDigest(state) {
  return withState(state, (E) => {
    const p = E.clientProjection(state);
    return { tick: p.tick, phase: p.phase, tension: p.H, outcome: p.outcome, frag: p.frag.map((f) => f.st), chronLen: p.chron.length, broken: p.broken.slice().sort(), isolated: p.isolated.slice() };
  });
}

export { meaningObj };
