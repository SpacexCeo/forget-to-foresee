// The citizens' quests and the starter guide as data (TZ §6.2; rev 4: rewards × P/10,000 = × 0.02). Rewards in WHOLE town silk (a log entry stores
// silkC = silk × 100). 'skitter' is the technical id; the player reads "stone spiders". `needs`: monster resources
// (game/resources.js) consumed at the turn-in (owner: every quest pays silk and asks for resources). Pure.
import { JOURNAL } from './journal-data.js';
const BASE = Object.freeze({
  q_welcome: Object.freeze({ id: 'q_welcome', giver: 'elder', title: 'quest.welcome.title', requires: [],
    objective: Object.freeze({ type: 'guide', steps: ['talked', 'moved'] }), reward: Object.freeze({ silk: 8, xp: 30 }), repeat: null }),
  q_spiders: Object.freeze({ id: 'q_spiders', giver: 'guard', title: 'quest.spiders.title', requires: ['q_welcome'],
    objective: Object.freeze({ type: 'kill', mob: 'skitter', count: 10 }),
    waypoint: Object.freeze({ kind: 'field', town: [-12, 52], radius: 14, label: 'quest.spiders.way' }),
    needs: Object.freeze({ spider_silk_thread: 5 }),
    reward: Object.freeze({ silk: 20, xp: 80 }), repeat: null }),
  q_part: Object.freeze({ id: 'q_part', giver: 'lamplighter', title: 'quest.part.title', requires: ['q_welcome'],
    objective: Object.freeze({ type: 'fetch', accept: { kind: 'part' }, count: 1, deliverTo: 'lamplighter' }),
    waypoint: Object.freeze({ kind: 'field', town: [-12, 52], radius: 14, label: 'quest.part.way' }),
    steps: ['quest.part.step1', 'quest.part.step2', 'quest.part.step3'],
    needs: Object.freeze({ chitin_plate: 2 }),
    reward: Object.freeze({ silk: 16, xp: 60, item: null }), repeat: null }),
  q_boss: Object.freeze({ id: 'q_boss', giver: 'shardkeeper', title: 'quest.boss.title', requires: ['q_spiders'],
    objective: Object.freeze({ type: 'kill', mob: 'crownrift', count: 1 }),
    waypoint: Object.freeze({ kind: 'field', town: [12, 102], radius: 10, label: 'quest.boss.way' }),
    needs: Object.freeze({ crown_shard: 1 }),
    reward: Object.freeze({ silk: 60, xp: 250, chest: 'rare' }), repeat: null }),
  b_spiders: Object.freeze({ id: 'b_spiders', giver: 'guard', title: 'quest.bounty.title', requires: ['q_spiders'],
    objective: Object.freeze({ type: 'kill', mob: 'skitter', count: 10 }),
    waypoint: Object.freeze({ kind: 'field', town: [-30, 66], radius: 14, label: 'quest.bounty.way' }),
    reward: Object.freeze({ silk: 6, xp: 40 }), repeat: Object.freeze({ mode: 'cooldown', minutes: 30, fullPerDay: 3, afterFullFactor: 0.1 }) }),
});
// The journal's side, daily and tournament quests (sprint §4.5) in rule shape: one counted event objective, accepted
// and completed by themselves (auto); dailies come back at 00:00 UTC. Their copy and hints live in journal-data.js.
const EVENT_OF = { read: 'read', open_chest: 'open_chest', trade: 'trade', wheel: 'wheel', learn_skill: 'learn_skill', enter_tournament: 'enter_tournament', enter_agent: 'enter_agent', gather: 'gather' };
const QUESTS_EXTRA = {};
for (const j of JOURNAL) {
  if (BASE[j.id]) continue;
  const o = j.objectives[0];
  QUESTS_EXTRA[j.id] = Object.freeze({ id: j.id, giver: j.giver, title: j.title, requires: j.requires, auto: true, level: j.level,
    objective: Object.freeze({ type: 'event', event: EVENT_OF[o.type], count: o.count }),
    reward: Object.freeze({ silk: j.rewards.silk, xp: j.rewards.xp, ...(j.rewards.title ? { title: j.rewards.title } : {}) }),
    repeat: j.daily ? Object.freeze({ mode: 'daily' }) : null });
}
export const QUESTS = Object.freeze({ ...BASE, ...QUESTS_EXTRA });
export const QUEST_IDS = Object.freeze(Object.keys(QUESTS));
/** The four story givers (existing townsfolk keys). */
export const GIVERS = Object.freeze(['elder', 'guard', 'lamplighter', 'shardkeeper']);
