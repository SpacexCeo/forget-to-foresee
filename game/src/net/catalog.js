// Machine-readable action catalog: every player-facing action with its JSON Schema parameters,
// preconditions, costs, rejection reasons and implementation status. The room enforces exactly
// these schemas and preconditions, and computes `availableActions` from the same definitions.
// Rules outcomes always come from the engine (kind 'rules'); world actions (kind 'world') only
// read and write positions, discoveries and drafts and never change a rules outcome.

export const API_VERSION = 'v1';
export const CATALOG_VERSION = '1.0.0';

const CLAN = { type: 'string', enum: ['salt', 'ash', 'moss', 'amber', 'frost'], description: 'Clan id (not Iris).' };
const IDX4 = (what, names) => ({ type: 'integer', minimum: 0, maximum: 3, description: `${what}: ${names.map((n, i) => `${i} = ${n}`).join(', ')}.` });
const EMPTY = { type: 'object', properties: {}, additionalProperties: false };
export const SLOT_NAMES = ['place', 'action', 'power', 'delay'];
export const FORM_NAMES = ['arc', 'spike', 'loop', 'drop'];
export const MEANING_NAMES = [['Shell I', 'Shell II', 'Shell III', 'Shell IV'], ['gift', 'storm', 'silence', 'call'], ['10', '20', '40', '80'], ['+1 tick', '+2 ticks', '+3 ticks', '+4 ticks']];
export const PLACES = ['balcony', 'plaza', 'scroll', 'shard_pedestal', 'camp:iris', 'camp:salt', 'camp:ash', 'camp:moss', 'camp:amber', 'camp:frost', 'anchor_zone:1', 'anchor_zone:2', 'anchor_zone:3', 'anchor_zone:4', 'shell_entrance', 'guest_glass'];
export const INSPECT_TARGETS = ['scroll_table', 'shard_pedestal', 'anchor_zone:1', 'anchor_zone:2', 'anchor_zone:3', 'anchor_zone:4', 'camp:salt', 'camp:ash', 'camp:moss', 'camp:amber', 'camp:frost', 'camp:iris', 'guest_glass'];

/** Precondition ids → description. `mode: 'proximity'` ones are skipped when worldRules is 'free'. */
export const PRECONDITIONS = {
  role_controller: { description: 'Only the controller (the player guiding Iris) may run rules actions; helpers may only move, inspect, talk and enter or leave Shells.' },
  phase_intro: { description: 'The season is in phase "intro" (the owner key is not committed yet).' },
  not_in_transit: { description: 'The avatar is not walking (it has arrived at its last destination).' },
  on_island: { description: 'The avatar is on the island, not inside a Shell.' },
  in_shell: { description: 'The avatar is inside a Shell.' },
  near_anchor_zone: { mode: 'proximity', param: 'shell', description: 'The avatar stands in the anchor zone of the Shell given by `shell` (or by the logogram draft).' },
  near_camp: { mode: 'proximity', param: 'clan', description: 'The avatar stands in the camp of the clan given by `clan`.' },
  near_offer_camp: { mode: 'proximity', param: 'offerId', description: 'The avatar stands in the camp of the clan that made the offer.' },
  near_mediation_camp: { mode: 'proximity', param: 'clanA', description: 'The avatar stands in the camp of `clanA` or `clanB`.' },
  near_scroll: { mode: 'proximity', description: 'The avatar stands by the Scroll medallion in the plaza centre.' },
  near_shard_pedestal: { mode: 'proximity', description: 'The avatar stands by the memory-shard pedestal in the Iris camp, where auctions are held.' },
  near_glass: { mode: 'proximity', description: 'The avatar stands at the glass wall inside a Shell, where the Guest draws.' },
  near_target: { mode: 'proximity', param: 'target', description: 'The avatar is close enough to the inspected target.' },
  prophecy_visible: { param: 'prophecy', description: 'The prophecy (event index) is visible to this player: published, or seen in one of Iris\'s visions.' },
  logogram_exists: { param: 'logogram', description: 'The logogram draft exists and belongs to this player.' },
  engine_guards: { description: 'The engine\'s own guards accept the action (rejection reasons listed under errors.rules). Evaluated by the engine itself.' },
};

/** Error codes shared by all actions (HTTP status in parentheses). */
export const COMMON_ERRORS = {
  invalid_request: 'Malformed body: actionId, expectedVersion or type missing or invalid (400).',
  invalid_params: 'args do not match the action\'s JSON Schema (400).',
  unknown_action: 'No action with this type (400).',
  unauthorized: 'Missing or invalid bearer token (401).',
  forbidden: 'The player\'s role may not run this action (403).',
  not_found: 'Unknown session or resource (404).',
  version_conflict: 'expectedVersion is not the session\'s current version; nothing was applied (409).',
  idempotency_key_reused: 'This actionId was already used by this player for a different command (409).',
  action_rejected: 'A precondition, a world rule or an engine guard rejected the action; nothing was applied (422). Stored: a retry with the same actionId returns the same rejection.',
  not_implemented: 'The action is listed as planned (501).',
  rate_limited: 'Too many requests; see the Retry-After header (429).',
  payload_too_large: 'Request body over 16 KiB (413).',
};

const rules = (o) => ({ kind: 'rules', status: 'implemented', roles: ['controller'], mutates: true, ...o, preconditions: ['role_controller', ...(o.preconditions || []), 'engine_guards'] });
const world = (o) => ({ kind: 'world', status: 'implemented', roles: ['controller', 'helper'], mutates: true, ...o });
const planned = (o) => ({ status: 'planned', roles: ['controller'], mutates: true, preconditions: [], costs: {}, errors: { rules: [], world: [] }, params: { type: 'object' }, ...o });

export const ACTIONS = [
  /* ---------- rules actions (engine-backed) ---------- */
  rules({
    type: 'start_season', engine: 'startGame', summary: 'Commit the owner key (a secret phrase) and start play. An empty phrase uses the default.',
    params: { type: 'object', properties: { phrase: { type: 'string', maxLength: 64, description: 'Your secret owner phrase; only its salted commitment is shown to others.' } }, additionalProperties: false },
    preconditions: ['phase_intro'], costs: {}, errors: { rules: [], world: [] },
  }),
  rules({
    type: 'set_reading_rule', engine: 'setRule', summary: 'Choose how Iris reads a logogram: where slot 1 starts on the ring. Free.',
    params: { type: 'object', required: ['rule'], properties: { rule: { type: 'string', enum: ['unknown', 'top', 'dots'], description: '"top" = start at the top; "dots" = start at the position given by the core dots; "unknown" = try all four.' } }, additionalProperties: false },
    costs: {}, errors: { rules: ['bad_rule'], world: [] },
  }),
  rules({
    type: 'place_anchor', engine: 'placeAnchor', summary: 'Stake 10 silk on a (Shell, tick). A Gift there pays a share (earlier anchors weigh more), a Storm burns the stake, otherwise it is returned.',
    params: { oneOf: [
      { type: 'object', required: ['shell', 'tick'], properties: { shell: { type: 'integer', minimum: 1, maximum: 4 }, tick: { type: 'integer', minimum: 1, maximum: 17 } }, additionalProperties: false },
      { type: 'object', required: ['logogram'], properties: { logogram: { type: 'string', pattern: '^logo-[0-9]+$', description: 'Use the Shell and tick implied by an assembled logogram draft.' } }, additionalProperties: false },
    ] },
    preconditions: ['logogram_exists', 'not_in_transit', 'on_island', 'near_anchor_zone'], costs: { attention: 1, silk: 10, note: 'The 10 silk stake returns unless a Storm hits the anchor.' },
    errors: { rules: ['phase', 'no_ap', 'no_silk', 'bad_tick', 'duplicate'], world: ['unknown_logogram'] },
  }),
  rules({
    type: 'ask_guests', engine: 'askGuests', summary: 'Ask the Guest behind the glass whether a stroke form in a slot means a given meaning. Yes pins the word; no rules the meaning out.',
    params: { type: 'object', required: ['slot', 'form', 'meaning'], properties: { slot: IDX4('Slot', SLOT_NAMES), form: IDX4('Stroke form', FORM_NAMES), meaning: { type: 'integer', minimum: 0, maximum: 3, description: 'Meaning index within the slot (see MEANING_NAMES in the catalog).' } }, additionalProperties: false },
    preconditions: ['not_in_transit', 'in_shell', 'near_glass'], costs: { attention: 1, silk: 5 },
    errors: { rules: ['phase', 'already_known', 'already_excluded', 'no_ap', 'no_silk'], world: [] },
  }),
  rules({
    type: 'sacrifice_memory', engine: 'forget', summary: 'Forget a memory forever to see the future (a vision of upcoming signs) or, with purpose "key", Ash\'s secret phrase. The memory becomes a shard sold at auction.',
    params: { type: 'object', required: ['memoryId'], properties: { memoryId: { type: 'integer', minimum: 1 }, purpose: { type: 'string', enum: ['vision', 'key'], description: 'Default "vision".' } }, additionalProperties: false },
    preconditions: [], costs: { attention: 1, memory: 'the chosen memory, forever' },
    errors: { rules: ['phase', 'no_memory', 'no_ap', 'key_closed', 'need_language', 'memory_too_light', 'debt_due'], world: [] },
  }),
  rules({
    type: 'speak_key', engine: 'speakKey', summary: 'Speak Ash\'s secret phrase (learned in a Key vision); the hash is checked against Ash\'s commitment and Ash returns.',
    params: EMPTY, preconditions: ['not_in_transit', 'near_camp'], fixedArgs: { clan: 'ash' }, costs: { attention: 1 },
    errors: { rules: ['phase', 'key_unavailable', 'no_ap'], world: [] },
  }),
  rules({
    type: 'mend', engine: 'mend', summary: 'Make peace with a clan whose link with Iris is broken. Pays 10 silk to the clan.',
    params: { type: 'object', required: ['clan'], properties: { clan: CLAN }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_camp'], costs: { attention: 1, silk: 10 },
    errors: { rules: ['phase', 'not_broken', 'remembers_betrayal', 'no_trust', 'no_ap', 'no_silk'], world: [] },
  }),
  rules({
    type: 'mediate', engine: 'mediate', summary: 'Council action: reconcile two clans whose link is broken. Both must trust Iris (40+).',
    params: { type: 'object', required: ['clanA', 'clanB'], properties: { clanA: CLAN, clanB: CLAN }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_mediation_camp'], costs: { attention: 1, silk: 15 },
    errors: { rules: ['phase', 'not_broken', 'isolated', 'no_trust', 'no_ap', 'no_silk'], world: [] },
  }),
  rules({
    type: 'accept_offer', engine: 'acceptOffer', summary: 'Trade: accept a clan\'s offer (buy a word, lend silk, a free word, a pact, an escrow). Offers expire at the end of the tick.',
    params: { type: 'object', required: ['offerId'], properties: { offerId: { type: 'integer', minimum: 1 } }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_offer_camp'], costs: { silk: 'the offer price (sell: price, loan: amount lent, escrow: price; gift and pact: 0)' },
    errors: { rules: ['phase', 'no_offer', 'no_silk'], world: [] },
  }),
  rules({
    type: 'decline_offer', engine: 'declineOffer', summary: 'Decline a clan\'s offer (that clan\'s trust in Iris drops by 2).',
    params: { type: 'object', required: ['offerId'], properties: { offerId: { type: 'integer', minimum: 1 } }, additionalProperties: false },
    preconditions: [], costs: { trust: '-2 trust from the offering clan' }, errors: { rules: ['no_offer'], world: [] },
  }),
  rules({
    type: 'bid_shard', engine: 'bid', summary: 'Trade: bid on a memory-shard auction (top bid + 3 silk, paid only if you win when it closes).',
    params: { type: 'object', required: ['auctionId'], properties: { auctionId: { type: 'integer', minimum: 1 } }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_shard_pedestal'], costs: { silk: 'top bid + 3, charged when the auction closes and you lead' },
    errors: { rules: ['phase', 'no_auction', 'own_shard', 'already_leading', 'no_silk'], world: [] },
  }),
  rules({
    type: 'contribute_fragment', engine: 'contributeMine', summary: 'Give Iris\'s fragment of the message to the Scroll (deadline tick 16). Forfeits the personal prize.',
    params: EMPTY, preconditions: ['not_in_transit', 'on_island', 'near_scroll'], costs: { fragment: 'Iris\'s fragment, forever' },
    errors: { rules: ['phase', 'too_late', 'no_fragment'], world: [] },
  }),
  rules({
    type: 'end_tick', engine: 'endTick', summary: 'End the current tick: the tick\'s event is revealed and checked against the Merkle root, then the next tick starts.',
    params: EMPTY, preconditions: [], costs: {}, errors: { rules: ['phase'], world: [] },
  }),
  rules({
    type: 'cast_vote', engine: 'castVote', summary: 'Council decision at tick 17: accept the Guests\' message as a gift, or reject it. The five clans vote too.',
    params: { type: 'object', required: ['accept'], properties: { accept: { type: 'boolean' } }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_scroll'], costs: {}, errors: { rules: ['phase'], world: [] },
  }),
  rules({
    type: 'set_heir', engine: 'setHeir', summary: 'After the finale: forget everything for an Heir (true) or keep the memory (false).',
    params: { type: 'object', required: ['heir'], properties: { heir: { type: 'boolean' } }, additionalProperties: false },
    preconditions: [], costs: {}, errors: { rules: ['phase'], world: [] },
  }),

  /* ---------- world actions (positions, discovery, dialogue, drafts) ---------- */
  world({
    type: 'move', summary: 'Walk to a named place along the walk graph, or along explicit waypoints. The server simulates the 30 Hz kinematic capsule at walking speed (1.7 m/s): walls block, edges cannot be crossed, and arrival takes the simulated walking time.',
    params: { oneOf: [
      { type: 'object', required: ['to'], properties: { to: { type: 'string', enum: PLACES } }, additionalProperties: false },
      { type: 'object', required: ['path'], properties: { path: { type: 'array', minItems: 1, maxItems: 32, items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number', minimum: -200, maximum: 200 } }, description: 'Waypoints [x, z] in meters, walked in order from the current position.' } }, additionalProperties: false },
    ] },
    preconditions: ['not_in_transit'], costs: { time: 'path length / 1.7 m/s of simulated time' },
    errors: { rules: [], world: ['unknown_place', 'wrong_zone', 'not_walkable', 'path_blocked', 'path_unsafe', 'path_too_long'] },
  }),
  world({
    type: 'inspect', summary: 'Look closely at an object. Records discoveries (clues): chronicle entries at the Scroll, the Guest\'s signs at the glass, auctions at the pedestal, camp state.',
    params: { type: 'object', required: ['target'], properties: { target: { type: 'string', enum: INSPECT_TARGETS } }, additionalProperties: false },
    preconditions: ['not_in_transit', 'near_target'], costs: {}, errors: { rules: [], world: ['wrong_zone'] }, mutates: true,
  }),
  world({
    type: 'talk', summary: 'Talk to a clan in its camp. The clan answers with template dialogue built only from what Iris can know: greeting by trust, current offers (with their offerIds), promises. Helpers get greetings only.',
    params: { type: 'object', required: ['clan'], properties: { clan: CLAN }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_camp'], costs: {}, errors: { rules: [], world: [] }, mutates: false,
  }),
  world({
    type: 'enter_shell', summary: 'Enter a Shell from its anchor zone (zone n belongs to Shell n). Inside: the glass wall with the Guest.',
    params: { type: 'object', required: ['shell'], properties: { shell: { type: 'integer', minimum: 1, maximum: 4 } }, additionalProperties: false },
    preconditions: ['not_in_transit', 'on_island', 'near_anchor_zone'], costs: {}, errors: { rules: [], world: [] },
  }),
  world({
    type: 'exit_shell', summary: 'Leave the Shell; you come out in its anchor zone.',
    params: EMPTY, preconditions: ['not_in_transit', 'in_shell'], costs: {}, errors: { rules: [], world: [] },
  }),
  world({
    type: 'assemble_logogram', roles: ['controller'], summary: 'Four-slot logogram assembly: propose a reading (place, action, power, delay) for a visible prophecy. Returns, per slot, the stroke form at that ring position and how it agrees with Iris\'s dictionary, and the implied anchor (Shell, tick). A draft only: the rules effect happens when you place_anchor with it.',
    params: { type: 'object', required: ['prophecy', 'slots'], properties: {
      prophecy: { type: 'integer', minimum: 0, maximum: 14, description: 'Event index from observation.prophecies.' },
      slots: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'integer', minimum: 0, maximum: 3 }, description: 'Meaning index per slot [place, action, power, delay].' },
      offset: { type: 'integer', minimum: 0, maximum: 3, description: 'Ring position where slot 1 starts; default: Iris\'s current reading.' },
    }, additionalProperties: false },
    preconditions: ['role_controller', 'prophecy_visible'], costs: {}, errors: { rules: [], world: ['not_visible'] },
  }),

  /* ---------- planned (not backed by rules yet; commands return 501) ---------- */
  planned({ type: 'propose_trade', kind: 'rules', summary: 'Planned: player-initiated trade proposals to a clan. The engine models only clan-initiated offers (accept_offer / decline_offer) today.' }),
  planned({ type: 'chat', kind: 'world', roles: ['controller', 'helper'], summary: 'Planned: free-text dialogue with a clan (LLM with a template fallback, never computing outcomes). Today: talk returns template dialogue.' }),
  planned({ type: 'helper_contribute', kind: 'rules', roles: ['helper'], summary: 'Planned: shared-room helpers (QR) holding and contributing fragments. The engine has one human player today.' }),
  planned({ type: 'mint_final_card', kind: 'chain', summary: 'Planned, and never available to agents: minting the final card is a voluntary testnet action the human signs in their own wallet. The API has no signing or transfer endpoints.' }),
];

export const ACTIONS_BY_TYPE = new Map(ACTIONS.map((a) => [a.type, a]));

/** The public catalog document (GET /v1/actions). */
export function catalogDocument(rulesVersions = []) {
  return {
    apiVersion: API_VERSION,
    catalogVersion: CATALOG_VERSION,
    rulesVersions,
    preconditions: PRECONDITIONS,
    commonErrors: COMMON_ERRORS,
    enums: { slots: SLOT_NAMES, forms: FORM_NAMES, meanings: MEANING_NAMES, clans: ['iris', 'salt', 'ash', 'moss', 'amber', 'frost'], places: PLACES, inspectTargets: INSPECT_TARGETS },
    actions: ACTIONS.map(({ engine, fixedArgs, ...a }) => ({ ...a, backedBy: a.status === 'planned' ? null : a.kind === 'rules' ? `engine.${engine}` : 'world layer (no rules outcome)' })),
  };
}
