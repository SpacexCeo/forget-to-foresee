#!/usr/bin/env node
// Example autonomous agent: plays one full season of Forget to Foresee through the HTTP API, with
// no browser. It only uses public endpoints (no imports from the game), so it doubles as a
// reference client for agents written in any language.
//
//   node server/src/main.js &                       # start the API (default http://127.0.0.1:8787)
//   node server/examples/agent.mjs [--url http://127.0.0.1:8787] [--rules v3] [--time-scale 500]
//
// Policy (deliberately simple and honest): start the season, walk to the Scroll and contribute the
// fragment, stake a few anchors on readable prophecies (walking to each anchor zone), accept the
// Guests' answer in the vote, and end ticks until the season has an outcome. Every command carries
// a fresh idempotency key and the observed version; a 409 version_conflict re-reads and retries.

const PROXIMITY_PLACE = {
  near_scroll: () => 'scroll',
  near_shard_pedestal: () => 'shard_pedestal',
  near_camp: (a) => 'camp:' + a.clan,
  near_mediation_camp: (a) => 'camp:' + a.clanA,
  near_anchor_zone: (a) => (a.shell ? 'anchor_zone:' + a.shell : null),
};

export async function playSeason({ url = 'http://127.0.0.1:8787', rules = 'v3', timeScale = 500, maxAnchors = 3, maxSteps = 600, log = () => {}, fetchImpl = fetch } = {}) {
  const base = url.replace(/\/$/, '') + '/v1';
  let token = null, n = 0;
  const call = async (method, path, body) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 429 && attempt < 5) { await sleep(1000 * Number(res.headers.get('retry-after') || 1)); continue; }
      return { status: res.status, body: await res.json() };
    }
  };
  const created = await call('POST', '/sessions', { rules, timeScale, name: 'example-agent' });
  if (created.status !== 201) throw new Error('create failed: ' + JSON.stringify(created.body));
  token = created.body.token;
  const id = created.body.sessionId;
  log(`session ${id} (rules ${rules}, timeScale ${timeScale})`);

  const stats = { commands: 0, rejected: 0, conflicts: 0, moves: 0, anchors: 0, contributed: false, voted: false };
  const act = async (type, args = {}) => {
    for (let tries = 0; tries < 3; tries++) {
      const obs = (await call('GET', `/sessions/${id}/observation`)).body.observation;
      const r = await call('POST', `/sessions/${id}/commands`, { actionId: `agent-${id}-${++n}`, expectedVersion: obs.version, type, args });
      stats.commands++;
      if (r.status === 409 && r.body.error.code === 'version_conflict') { stats.conflicts++; continue; }
      if (r.status !== 200) { stats.rejected++; log(`  ${type} rejected: ${r.body.error.reason || r.body.error.code}`); }
      return r;
    }
    return null;
  };
  const moveTo = async (to) => { stats.moves++; log(`  walk to ${to}`); return act('move', { to }); };
  /** Place to walk to when an action fails only on proximity, else null. */
  const travelFor = (a) => {
    if (!a.failed.length || !a.failed.every((f) => f.source === 'precondition')) return null;
    const p = a.failed.map((f) => PROXIMITY_PLACE[f.id]).find(Boolean);
    return p ? p(a.args) : null;
  };

  let obs;
  for (let step = 0; step < maxSteps; step++) {
    obs = (await call('GET', `/sessions/${id}/observation`)).body.observation;
    if (obs.season.outcome) break;
    if (obs.you.walking) { await sleep(25); continue; }
    const actions = (await call('GET', `/sessions/${id}/actions`)).body.actions;
    const ready = (type) => actions.find((a) => a.type === type && a.available);
    const any = (type) => actions.filter((a) => a.type === type);

    if (ready('start_season')) { log('start season'); await act('start_season', {}); continue; }
    const vote = actions.find((a) => a.type === 'cast_vote' && a.args.accept === true);
    if (vote && vote.available) { log('vote: accept'); await act('cast_vote', { accept: true }); stats.voted = true; continue; }
    if (vote && travelFor(vote)) { await moveTo(travelFor(vote)); continue; }

    const contribute = any('contribute_fragment')[0];
    if (!stats.contributed && contribute) {
      if (contribute.available) { log(`tick ${obs.season.tick}: contribute fragment`); const r = await act('contribute_fragment', {}); if (r && r.status === 200) stats.contributed = true; continue; }
      const place = travelFor(contribute);
      if (place) { await moveTo(place); continue; }
    }

    if (stats.anchors < maxAnchors) {
      const anchors = any('place_anchor').filter((a) => a.args.shell && a.args.tick > obs.season.tick);
      const now = anchors.find((a) => a.available);
      if (now) { log(`tick ${obs.season.tick}: anchor Shell ${now.args.shell} @ tick ${now.args.tick}`); const r = await act('place_anchor', now.args); if (r && r.status === 200) { stats.anchors++; continue; } }
      const reachable = anchors.find((a) => travelFor(a));
      if (reachable && !now) { await moveTo(travelFor(reachable)); continue; }
    }

    if (ready('end_tick')) { log(`tick ${obs.season.tick}: end tick`); await act('end_tick', {}); continue; }
    // Nothing to do (e.g. waiting on a phase change): pick any available action to keep moving.
    const fallback = actions.find((a) => a.available && a.type !== 'move');
    if (!fallback) throw new Error('agent stuck: no available action at tick ' + obs.season.tick);
    await act(fallback.type, fallback.args);
  }
  const history = (await call('GET', `/sessions/${id}/history`)).body.history;
  const proofs = obs.chronicle?.length ? (await call('GET', `/sessions/${id}/proofs/${obs.chronicle[0].index}`)).body : null;
  return { sessionId: id, outcome: obs.season.outcome, tick: obs.season.tick, silk: obs.iris?.silk, stats, historyLength: history.length, firstProofVerified: proofs?.proof?.verified ?? null };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('agent.mjs')) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  playSeason({ url: opt('url', 'http://127.0.0.1:8787'), rules: opt('rules', 'v3'), timeScale: Number(opt('time-scale', 500)), log: (s) => console.log(s) })
    .then((r) => { console.log(JSON.stringify(r, null, 2)); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
