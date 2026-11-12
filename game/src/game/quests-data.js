// The citizens' quests and the starter guide as data (TZ §6.2). Rewards in WHOLE town silk (a log entry stores
// silkC = silk × 100). 'skitter' is the technical id; the player reads "stone spiders". `needs`: monster resources
// (game/resources.js) consumed at the turn-in (owner: every quest pays silk and asks for resources). Pure.
export const QUESTS = Object.freeze({
  q_welcome: Object.freeze({ id: 'q_welcome', giver: 'elder', title: 'quest.welcome.title', requires: [],
    objective: Object.freeze({ type: 'guide', steps: ['talked', 'moved'] }), reward: Object.freeze({ silk: 400, xp: 30 }), repeat: null }),
  q_spiders: Object.freeze({ id: 'q_spiders', giver: 'guard', title: 'quest.spiders.title', requires: ['q_welcome'],
    objective: Object.freeze({ type: 'kill', mob: 'skitter', count: 10 }),
    waypoint: Object.freeze({ kind: 'field', town: [-12, 52], radius: 14, label: 'quest.spiders.way' }),
    needs: Object.freeze({ spider_silk_thread: 5 }),
    reward: Object.freeze({ silk: 1000, xp: 80 }), repeat: null }),
  q_part: Object.freeze({ id: 'q_part', giver: 'lamplighter', title: 'quest.part.title', requires: ['q_welcome'],
    objective: Object.freeze({ type: 'fetch', accept: { kind: 'part' }, count: 1, deliverTo: 'lamplighter' }),
    waypoint: Object.freeze({ kind: 'field', town: [-12, 52], radius: 14, label: 'quest.part.way' }),
    steps: ['quest.part.step1', 'quest.part.step2', 'quest.part.step3'],
    needs: Object.freeze({ chitin_plate: 2 }),
    reward: Object.freeze({ silk: 800, xp: 60, item: null }), repeat: null }),
  q_boss: Object.freeze({ id: 'q_boss', giver: 'shardkeeper', title: 'quest.boss.title', requires: ['q_spiders'],
    objective: Object.freeze({ type: 'kill', mob: 'crownrift', count: 1 }),
    waypoint: Object.freeze({ kind: 'field', town: [12, 102], radius: 10, label: 'quest.boss.way' }),
    needs: Object.freeze({ crown_shard: 1 }),
    reward: Object.freeze({ silk: 3000, xp: 250, chest: 'rare' }), repeat: null }),
  b_spiders: Object.freeze({ id: 'b_spiders', giver: 'guard', title: 'quest.bounty.title', requires: ['q_spiders'],
    objective: Object.freeze({ type: 'kill', mob: 'skitter', count: 10 }),
    waypoint: Object.freeze({ kind: 'field', town: [-30, 66], radius: 14, label: 'quest.bounty.way' }),
    needs: Object.freeze({ spider_silk_thread: 4 }),
    reward: Object.freeze({ silk: 300, xp: 40 }), repeat: Object.freeze({ mode: 'cooldown', minutes: 30, fullPerDay: 3, afterFullFactor: 0.1 }) }),
});
export const QUEST_IDS = Object.freeze(Object.keys(QUESTS));
/** The four story givers (existing townsfolk keys). */
export const GIVERS = Object.freeze(['elder', 'guard', 'lamplighter', 'shardkeeper']);
