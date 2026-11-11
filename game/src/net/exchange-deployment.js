// Foresight Exchange windows (docs/agent-market-plan.md Scope A): public constants only. `?demo=judge&exchange=1`
// always plays JUDGE_WINDOW on the committed snapshot; nothing is fetched at runtime.
import SNAPSHOT from '../game/exchange/snapshot-v1.js';

export { SNAPSHOT };
export const SNAPSHOTS = Object.freeze({ [SNAPSHOT.id]: SNAPSHOT });
export const JUDGE_WINDOW = Object.freeze({ snapshotId: SNAPSHOT.id, startIndex: 12, barCount: 4 });
export const DEFAULT_WINDOW = Object.freeze({ snapshotId: SNAPSHOT.id, startIndex: 0, barCount: 8 });
