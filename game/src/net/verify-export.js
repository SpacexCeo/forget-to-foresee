// "Copy proof": everything a stranger needs to check a revealed sign without this game's code, as one JSON
// document (format `ftf-proof/1`). Full hashes, the exact byte recipe, the Merkle path, and nothing secret:
// only the revealed leaf's own salt and event, never another leaf's salt, the seed of a live season or Ash's phrase.
// Independent checkers: tools/verify/verify.mjs (Node, zero dependencies), tools/verify/verify.py (Python, stdlib),
// the sha256sum one-liner in `recipe.shell`, or the NEAR contract's free `check_leaf` view (docs/verify.md).
// No DOM here: the world HUD renders the button and copies `proofExportText(...)` (Task F, docs/collab-requests.md).
import { NEAR_DEPLOYMENT } from './near-deployment.js';
import { leafArgs } from './near.js';

export const PROOF_FORMAT = 'ftf-proof/1';
export const VERIFIER_SOURCE = 'https://github.com/SpacexCeo/forget-to-foresee/blob/main/tools/verify/verify.mjs';

const RECIPE = Object.freeze({
  leaf: "leaf = sha256(utf8('ftf:leaf:' + season.schema + '|' + season.id + '|' + leaf.index + '|' + leaf.canonicalEvent + '|' + leaf.salt)), lowercase hex",
  canonicalEvent: 'JSON.stringify({t, place, action, power, delay, dots}) in this key order, no spaces; place/action/power/dots 0-3, delay 1-4',
  node: "node = sha256(ascii(leftHex + rightHex)) over the 128 hex characters; for each step of merklePath in order: step.left ? sha256(step.h + node) : sha256(node + step.h); the last node of an odd level is paired with itself",
  root: 'the final node must equal season.scheduleRoot, which was shown before trial 1',
  salt: '32 CSPRNG bytes as 64 lowercase hex characters, drawn when the season was generated',
  shell: "printf '%s' 'ftf:leaf:<schema>|<seasonId>|<index>|<canonicalEvent>|<salt>' | sha256sum   # = leaf.leaf",
  ashKey: "sha256(utf8('ftf:key:' + schema + '|' + seasonId + '|' + phrase + '|' + salt)) = season.ashKeyCommitment (phrase and salt are revealed at tick 13 at the earliest)",
});

/** The shell one-liner for one leaf, ready to paste (single quotes in the event are impossible: it is JSON of digits). */
export function shellLine(season, leaf) {
  return `printf '%s' 'ftf:leaf:${season.schema}|${season.id}|${leaf.index}|${leaf.canonicalEvent}|${leaf.salt}' | sha256sum`;
}

/**
 * The season block shared by every export of one season. `obs.season` is the observation's season; `proof` any
 * proof record of it (for the schema tag); `fixedSeed` marks a demo season whose seed is public (`?demo=judge`).
 */
export function seasonBlock(obsSeason, proof, { fixedSeedHex = null, leafCount = null, entropy = null } = {}) {
  entropy = entropy ?? obsSeason.entropy ?? null;
  if (fixedSeedHex == null && entropy && entropy.protocol === 'fixed-seed' && entropy.seedHex) fixedSeedHex = entropy.seedHex;
  leafCount = leafCount ?? obsSeason.leafCount ?? null;
  const s = {
    id: obsSeason.seasonId,
    rules: obsSeason.rules,
    schema: schemaOf(proof),
    scheduleRoot: obsSeason.merkleRoot,
    leafCount,
    ashKeyCommitment: obsSeason.ashKeyCommitment ?? null,
    seedCommitment: obsSeason.seedCommitment ?? null,
    fixedSeed: fixedSeedHex != null,
  };
  if (fixedSeedHex != null) s.seedHex = fixedSeedHex; // public by construction (the judge demo); a live season never exports its seed
  if (entropy) s.entropy = entropy;
  return s;
}

function schemaOf(proof) {
  const m = /ftf:leaf:(v\d+)\|/.exec(proof && proof.schema ? proof.schema : '');
  return m ? m[1] : 'v2';
}

/** One revealed leaf with its path, from the room's `proof(index)` record. */
export function leafBlock(proof) {
  return {
    leaf: { index: proof.index, tick: proof.tick, canonicalEvent: proof.canonicalEvent, salt: proof.salt, leaf: proof.leaf },
    merklePath: proof.path.map((p) => ({ h: p.h, left: !!p.left })),
  };
}

/** The NEAR block: where the same root and leaf can be checked on testnet, when a deployment exists. */
export function nearBlock(status, leafState, deployment = NEAR_DEPLOYMENT) {
  if (!deployment || !deployment.contractId) return null;
  const out = {
    network: deployment.network,
    contractId: deployment.contractId,
    contract: `${deployment.explorer}/address/${deployment.contractId}`,
    season: status ? status.state : 'unknown',
    commitTx: status && status.commitTxUrl ? status.commitTxUrl : null,
    leaf: leafState ? leafState.state : 'unknown',
    revealTx: leafState && leafState.txUrl ? leafState.txUrl : null,
    rpc: deployment.rpcUrls,
    view: 'check_leaf(season_id, index, canonical_event, salt, merkle_path) is a free view call; get_season(season_id) returns the committed root',
  };
  return out;
}

/**
 * Builds the export of one revealed sign.
 * @param {object} o
 * @param {object} o.obs           the current observation (season, chronicle)
 * @param {object} o.proof         the room's proof record for `index` (`GET /sessions/:id/proof/:index`)
 * @param {string} [o.fixedSeedHex] the demo seed when the session was created with one (public), else null
 * @param {object} [o.near]        the NEAR watcher (optional): its status and leaf state are recorded
 * @param {object} [o.deployment]
 * @param {() => Date} [o.now]
 */
export function proofExport({ obs, proof, fixedSeedHex = null, near = null, deployment = NEAR_DEPLOYMENT, entropy = null, now = () => new Date() }) {
  if (!obs || !obs.season || !proof) throw new Error('proofExport needs an observation and a proof record');
  if (proof.seasonId && proof.seasonId !== obs.season.seasonId) throw new Error('proof belongs to another season');
  const season = seasonBlock(obs.season, proof, { fixedSeedHex, entropy: entropy ?? obs.season.entropy ?? null });
  const { leaf, merklePath } = leafBlock(proof);
  const chron = (obs.chronicle || []).find((c) => c.index === proof.index);
  if (chron) leaf.meaning = chron.meaning;
  return {
    format: PROOF_FORMAT,
    game: 'Forget to Foresee',
    season,
    leaf,
    merklePath,
    contractArgs: leafArgs(proof), // exactly what the NEAR contract's reveal_leaf / check_leaf take
    recipe: { ...RECIPE, shell: shellLine(season, leaf) },
    near: nearBlock(near && near.status, near ? near.leaf(proof.index) : null, deployment),
    verify: { node: 'node tools/verify/verify.mjs proof.json', python: 'python3 tools/verify/verify.py proof.json', source: VERIFIER_SOURCE },
    exportedAt: now().toISOString(),
  };
}

/** Every revealed sign of the season in one document (`leaves[]` share the season block). */
export function seasonExport({ obs, proofs, fixedSeedHex = null, near = null, deployment = NEAR_DEPLOYMENT, entropy = null, now = () => new Date() }) {
  if (!obs || !obs.season) throw new Error('seasonExport needs an observation');
  const sorted = [...proofs].filter(Boolean).sort((a, b) => a.index - b.index);
  const season = seasonBlock(obs.season, sorted[0] || null, { fixedSeedHex, entropy: entropy ?? obs.season.entropy ?? null });
  const leaves = sorted.map((p) => {
    const b = leafBlock(p);
    const chron = (obs.chronicle || []).find((c) => c.index === p.index);
    if (chron) b.leaf.meaning = chron.meaning;
    const ls = near ? near.leaf(p.index) : null;
    return { ...b, shell: shellLine(season, b.leaf), near: ls ? { leaf: ls.state, revealTx: ls.txUrl || null } : undefined };
  });
  return {
    format: PROOF_FORMAT,
    game: 'Forget to Foresee',
    season,
    leaves,
    recipe: RECIPE,
    near: nearBlock(near && near.status, null, deployment),
    verify: { node: 'node tools/verify/verify.mjs season.json', python: 'python3 tools/verify/verify.py season.json', source: VERIFIER_SOURCE },
    exportedAt: now().toISOString(),
  };
}

/** Pretty JSON for the clipboard or a file. */
export const proofExportText = (doc) => JSON.stringify(doc, null, 2) + '\n';

/** A file name for a download: `ftf-proof-<seasonId>-leaf-<index>.json` or `ftf-season-<seasonId>.json`. */
export function proofFileName(doc) {
  return doc.leaf ? `ftf-proof-${doc.season.id}-leaf-${doc.leaf.index}.json` : `ftf-season-${doc.season.id}.json`;
}

/**
 * Convenience for the HUD: fetch the proof through the session's transport and build the export.
 * `session` is a PlaySession (obs, transport.proof); `near` its NEAR watcher if any.
 */
export async function buildProofExport(session, index, { near = null, fixedSeedHex = null } = {}) {
  const r = await session.transport.proof(index);
  if (!r || r.status !== 200) throw new Error('proof not available: ' + (r && r.body && r.body.error ? r.body.error.code : 'no answer'));
  return proofExport({ obs: session.obs, proof: r.body.proof, near, fixedSeedHex });
}

export async function buildSeasonExport(session, { near = null, fixedSeedHex = null } = {}) {
  const indexes = (session.obs.chronicle || []).map((c) => c.index);
  const proofs = [];
  for (const i of indexes) { const r = await session.transport.proof(i); if (r && r.status === 200) proofs.push(r.body.proof); }
  return seasonExport({ obs: session.obs, proofs, near, fixedSeedHex });
}
