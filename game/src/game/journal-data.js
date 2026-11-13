// The quest journal's data (sprint §4.4-4.5): the 14 quests with their category, level, giver, copy, objectives,
// rewards, "how to get it" hints and map markers. Plain English, pure, frozen. The rules (quest-rules.js) read the
// rule-shaped view of the same quests from quests-data.js; this file is what the journal, the tracker and the markers
// show. Positions [x, z] are town-local metres (the frame of quests-data waypoint.town).
export const CATEGORIES = Object.freeze(['story', 'side', 'daily', 'tournament']);
export const OBJECTIVE_TYPES = Object.freeze(['kill', 'deliver', 'talk', 'reach', 'gather', 'read', 'open_chest', 'trade', 'wheel', 'learn_skill', 'enter_tournament', 'enter_agent']);
/** Display names when the locale has no folk.name.<key>. */
export const GIVER_NAMES = Object.freeze({ elder: 'Elder', guard: 'Guard', lamplighter: 'Lamplighter', shardkeeper: 'Shardkeeper', innkeeper: 'Innkeeper' });
export const TURN_IN_GIVERS = Object.freeze(Object.keys(GIVER_NAMES));

const F = Object.freeze;
const q = (o) => F({ autoComplete: false, repeat: null, daily: false, unlockLevel: o.level, track: true, hints: [], markers: [], requires: [], turnIn: o.giver, ...o,
  objectives: F(o.objectives.map((x) => F(x))), rewards: F({ silk: 0, xp: 0, items: [], chest: null, title: null, ...o.rewards }), hints: F((o.hints || []).map((h) => F(h))), markers: F((o.markers || []).map((m) => F(m))) });
const FIELD = { id: 'field_spiders', kind: 'quest-area', pos: [-12, 52], radius: 14, label: 'Stone spider field' };

export const JOURNAL = F([
  q({ id: 'q_welcome', category: 'story', sort: 10, level: 1, giver: 'elder', title: 'A Stranger at the Shell', summary: 'The Elder wants to speak with you.',
    description: 'You came through the glass into a town that does not know you. The Elder by the big shell in the square can tell you how to get home.',
    objectives: [{ id: 'talk', type: 'talk', npc: 'elder', count: 1, text: 'Talk to the Elder' }, { id: 'walk', type: 'reach', count: 1, text: 'Walk to the lantern post' }],
    rewards: { silk: 8, xp: 30 }, hints: [{ text: 'The Elder stands by the big shell in the town square. Press E when you are close.', marker: null }] }),
  q({ id: 'q_spiders', category: 'story', sort: 20, level: 1, giver: 'guard', requires: ['q_welcome'], title: 'Stone Spiders on the Road', summary: 'Thin out the stone spiders that block the road.',
    description: 'Stone spiders have webbed the road north of the town. The Guard cannot leave the gate. Clear ten of them and bring back five strands of spider silk thread.',
    objectives: [{ id: 'kill', type: 'kill', mob: 'skitter', count: 10, text: 'Kill stone spiders' }, { id: 'deliver', type: 'deliver', resource: 'spider_silk_thread', count: 5, to: 'guard', text: 'Bring spider silk thread' }],
    rewards: { silk: 20, xp: 80 }, hints: [{ text: 'Stone spiders live in the field north-west of the gate (yellow circle on the map). Each can drop spider silk thread.', marker: 'field_spiders' }], markers: [FIELD] }),
  q({ id: 'q_part', category: 'story', sort: 30, level: 1, giver: 'lamplighter', requires: ['q_welcome'], title: 'The Missing Spare Part', summary: 'The Lamplighter needs a spare part for the lamp-loom.',
    description: 'The lamp-loom on the main street stopped when a part cracked in the cold. Bring the Lamplighter any spare part and two chitin plates to fix it.',
    objectives: [{ id: 'part', type: 'gather', item: 'part', count: 1, text: 'Find a spare part' }, { id: 'deliver', type: 'deliver', resource: 'chitin_plate', count: 2, to: 'lamplighter', text: 'Bring chitin plates' }],
    rewards: { silk: 16, xp: 60 }, hints: [{ text: 'A spare part drops from stone spiders: after six misses the seventh always drops one. Chests and the daily wheel give parts too.', marker: 'field_spiders' }], markers: [FIELD] }),
  q({ id: 'q_boss', category: 'story', sort: 40, level: 3, giver: 'shardkeeper', requires: ['q_spiders'], title: 'The Crownrift', summary: 'Something large guards the old ridge.',
    description: 'A crowned shadow has taken the lookout on the old ridge and no lamp reaches past it. The Shardkeeper wants it gone and asks for the shard from its crown.',
    objectives: [{ id: 'kill', type: 'kill', mob: 'crownrift', count: 1, text: 'Defeat the Crownrift' }, { id: 'deliver', type: 'deliver', resource: 'crown_shard', count: 1, to: 'shardkeeper', text: 'Bring a crown shard' }],
    rewards: { silk: 60, xp: 250, chest: 'rare' }, hints: [{ text: 'The Crownrift waits at the ridge south-east (red marker). Bring friends or learn a few skills first (press N).', marker: 'ridge' }],
    markers: [{ id: 'ridge', kind: 'quest-area', pos: [12, 102], radius: 10, label: 'The old ridge' }] }),
  q({ id: 's_sign', category: 'side', sort: 50, level: 1, giver: 'innkeeper', title: "The Innkeeper's Sign", summary: 'Optional: the innkeeper on the lower street has a sign to read.',
    description: 'The innkeeper painted a sign for travellers and wants someone new to read it before the next guests arrive.',
    objectives: [{ id: 'read', type: 'read', count: 1, text: 'Read the sign' }], rewards: { silk: 2, xp: 20 }, autoComplete: true,
    hints: [{ text: 'Walk down the lower street to the inn. Press E at the wooden sign.', marker: null }] }),
  q({ id: 's_chest', category: 'side', sort: 60, level: 1, giver: 'guard', title: 'Something Heavy', summary: 'Open your first chest.',
    description: 'Monsters outside the walls drop chests. The Guard wants to know you can carry one home and open it.',
    objectives: [{ id: 'open', type: 'open_chest', count: 1, text: 'Open a chest' }], rewards: { silk: 3, xp: 40 }, autoComplete: true,
    hints: [{ text: 'Monsters drop chests. Walk over one to pick it up, press I, then Open.', marker: null }] }),
  q({ id: 's_trade', category: 'side', sort: 70, level: 2, giver: 'lamplighter', title: 'Fair Exchange', summary: 'Sell a resource for silk.',
    description: 'The town runs on fair trades. The Lamplighter wants you to sell one resource for silk at the Market.',
    objectives: [{ id: 'trade', type: 'trade', count: 1, text: 'Complete a trade' }], rewards: { silk: 5, xp: 60 }, autoComplete: true,
    hints: [{ text: 'Press B to open the Market. Sell a resource to a player or a stall.', marker: null }] }),
  q({ id: 's_wheel', category: 'side', sort: 80, level: 1, giver: 'innkeeper', title: 'A Turn of the Wheel', summary: 'Spin the daily wheel once.',
    description: 'The wheel by the inn gives small prizes for fun. It promises nothing of real value.',
    objectives: [{ id: 'spin', type: 'wheel', count: 1, text: 'Spin the wheel' }], rewards: { silk: 2, xp: 25 }, autoComplete: true,
    hints: [{ text: 'Press B, open the Games tab and press Spin. One spin a day is free.', marker: null }] }),
  q({ id: 's_voice', category: 'side', sort: 90, level: 2, giver: 'elder', title: 'Find Your Voice', summary: 'Learn your first skill.',
    description: 'The Elder says a linguist fights with words as much as with her staff. Learn your first skill.',
    objectives: [{ id: 'learn', type: 'learn_skill', count: 1, text: 'Learn a skill' }], rewards: { xp: 60 }, autoComplete: true,
    hints: [{ text: 'At level 2 you get a skill point. Press N and pick one.', marker: null }] }),
  q({ id: 'b_spiders', category: 'daily', sort: 100, level: 1, giver: 'guard', requires: ['q_spiders'], title: 'Spider Bounty', summary: 'The Guard pays for every ten spiders. Repeats.',
    description: 'The spiders come back every dusk. The Guard pays a bounty for every ten, up to three times a day at full pay.',
    objectives: [{ id: 'kill', type: 'kill', mob: 'skitter', count: 10, text: 'Kill stone spiders' }], rewards: { silk: 6, xp: 40 },
    repeat: { mode: 'cooldown', minutes: 30 }, daily: false,
    hints: [{ text: 'Same field as the spider quest. The bounty resets 30 minutes after you hand it in, up to 3 a day at full pay.', marker: 'field_spiders' }], markers: [FIELD] }),
  q({ id: 'd_gather', category: 'daily', sort: 110, level: 1, giver: 'lamplighter', title: 'Daily Gathering', summary: 'Collect 5 resources of any kind.',
    description: 'The lamp-loom eats thread and plate. Collect any five resources today.',
    objectives: [{ id: 'gather', type: 'gather', item: 'resource', count: 5, text: 'Collect resources' }], rewards: { silk: 4, xp: 30 }, autoComplete: true, daily: true, repeat: { mode: 'daily' },
    hints: [{ text: 'Spiders and other monsters drop resources. Look for glowing drops on the ground.', marker: 'field_spiders' }], markers: [FIELD] }),
  q({ id: 'd_deal', category: 'daily', sort: 120, level: 2, giver: 'innkeeper', title: 'Daily Deal', summary: 'Make one trade today.',
    description: 'The innkeeper keeps a tally of the day\'s trades. Make one.',
    objectives: [{ id: 'trade', type: 'trade', count: 1, text: 'Complete a trade' }], rewards: { silk: 4, xp: 30 }, autoComplete: true, daily: true, repeat: { mode: 'daily' },
    hints: [{ text: 'Press B. A trade with a stall counts.', marker: null }] }),
  q({ id: 't_enter', category: 'tournament', sort: 130, level: 3, giver: 'elder', title: 'The Season Cup', summary: 'Enter the Season Cup.',
    description: 'Every season the clans meet at the Tournament altar. The Elder wants you to enter.',
    objectives: [{ id: 'enter', type: 'enter_tournament', count: 1, text: 'Enter the tournament' }], rewards: { xp: 100, title: 'Contender' }, autoComplete: true,
    hints: [{ text: 'Open the tournament card (the trophy button on the HUD) and press Enter. The entry costs a little silk and part of it is removed forever.', marker: null }] }),
  q({ id: 't_agent', category: 'tournament', sort: 140, level: 3, giver: 'shardkeeper', title: 'Bring a Champion', summary: 'Enter an AI agent in the tournament.',
    description: 'Programs can play the season too. The Shardkeeper wants to see one of yours enter the Cup.',
    objectives: [{ id: 'agent', type: 'enter_agent', count: 1, text: 'Enter an agent' }], rewards: { xp: 100, title: 'Handler' }, autoComplete: true,
    hints: [{ text: "Agents enter through the game's agent API. Open the tournament card and press Add an agent.", marker: null }] }),
]);
export const JOURNAL_BY_ID = F(Object.fromEntries(JOURNAL.map((x) => [x.id, x])));

/**
 * The locale keys of the journal's player-facing copy, with the English text as the value (pure). Ids stay the keys, so
 * saved state never holds text: jq.<id>.title, .summary, .desc, .obj.<objective>, .hint.<n>, .rewardTitle, and
 * jq.marker.<marker> for the map areas. play/locales/en-quests.js spreads this; the other locales translate it.
 */
export function journalTextKeys(list = JOURNAL) {
  const out = {};
  for (const x of list) {
    const p = 'jq.' + x.id + '.';
    out[p + 'title'] = x.title; out[p + 'summary'] = x.summary; out[p + 'desc'] = x.description;
    for (const o of x.objectives) out[p + 'obj.' + o.id] = o.text;
    x.hints.forEach((h, n) => { out[p + 'hint.' + n] = h.text; });
    if (x.rewards.title) out[p + 'rewardTitle'] = x.rewards.title;
    for (const m of x.markers) out['jq.marker.' + m.id] = m.label;
  }
  return out;
}

/** Schema check (pure): [] when every quest is valid, else a list of problems. */
export function validateJournal(list = JOURNAL) {
  const out = [], seen = new Set();
  for (const x of list) {
    const bad = (m) => out.push(`${x.id}: ${m}`);
    if (!x.id || seen.has(x.id)) bad('id missing or repeated'); seen.add(x.id);
    if (!CATEGORIES.includes(x.category)) bad('category');
    if (!TURN_IN_GIVERS.includes(x.turnIn) || !TURN_IN_GIVERS.includes(x.giver)) bad('giver');
    if (!Array.isArray(x.objectives) || !x.objectives.length) bad('objectives');
    for (const o of x.objectives || []) { if (!OBJECTIVE_TYPES.includes(o.type)) bad('objective type ' + o.type); if (!(Number.isInteger(o.count) && o.count >= 1)) bad('objective count'); }
    const ids = new Set((x.markers || []).map((m) => m.id));
    for (const h of x.hints || []) { if (h.marker && !ids.has(h.marker)) bad('hint marker ' + h.marker); if (String(h.text).length > 140) bad('hint over 140 characters'); }
    if (String(x.description || '').length > 220) bad('description over 220 characters');
    for (const r of x.requires || []) if (!list.some((y) => y.id === r)) bad('requires ' + r);
  }
  return out;
}
