// The Tournament gate (owner 14.11): the Tournament (the altar's registration, the Season Cup and the on-chain entry)
// opens once the player has felled ten stone spiders outside the walls, so a newcomer learns the fight first. The count
// is the town ledger's own kill stats (game/town-economy.js stats.spidersKilled). The judge path (?judge=1) is never
// gated. Pure.

export const TOURNEY_SPIDERS = 10;

/** {open, n, need}: whether the Tournament is open for these stats, and the spider progress to show. */
export function tourneyGate(stats, { judge = false, need = TOURNEY_SPIDERS } = {}) {
  const n = Math.max(0, Math.floor(Number(stats && stats.spidersKilled) || 0));
  return { open: !!judge || n >= need, n: Math.min(n, need), need };
}
