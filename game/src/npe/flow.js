// The intro flow (sprint 7.4) as a pure reducer plus persistence: idle -> prologue -> wakeup -> dialogue -> card ->
// handoff -> done. The DOM and the 3D calls live in npe/index.js; this file has no side effects beyond `storage`.
export const NPE_KEY = 'ftf.npe.v1';
export const PHASES = Object.freeze(['idle', 'prologue', 'wakeup', 'dialogue', 'card', 'handoff', 'done']);

export function loadNpe(storage) {
  try { const r = JSON.parse((storage && storage.getItem(NPE_KEY)) || 'null'); if (r && r.v === 1) return r; } catch { /* fresh */ }
  return { v: 1, prologueSeen: false, dialogueSeen: false, cardSeen: false, stipend: false };
}
export function saveNpe(storage, rec) { try { if (storage) storage.setItem(NPE_KEY, JSON.stringify({ ...rec, v: 1 })); } catch { /* memory only */ } }
/** Settings -> "Replay intro": forget the saved state (the caller reloads with ?intro=1). */
export function clearNpe(storage) { try { if (storage) storage.removeItem(NPE_KEY); } catch { /* */ } }

/** Whether the intro runs on this load: `?intro=1` forces it, `?intro=0` never; otherwise the flag and the saved state. */
export function shouldRun({ flag, search = '', rec }) {
  let q = null; try { q = new URLSearchParams(search).get('intro'); } catch { q = null; }
  if (q === '0') return false;
  if (q === '1') return true;
  return !!flag && !rec.dialogueSeen;
}

/**
 * The state machine. State: {phase, line, rec, award} where `award` is true on the one transition that pays the
 * stipend (the caller pays and clears it). Events: start, prologue_done, prologue_skip, wakeup_done, line_done
 * {last}, skip_all, start_card, later, handoff_done.
 */
export function initial(rec) { return { phase: 'idle', line: 0, rec: { ...rec }, award: false, skipped: false }; }
export function reduce(s, e) {
  const n = { ...s, award: false };
  switch (s.phase) {
    case 'idle': return e.type === 'start' ? { ...n, phase: 'prologue' } : s;
    case 'prologue':
      if (e.type === 'prologue_done' || e.type === 'prologue_skip') return { ...n, phase: 'wakeup', rec: { ...s.rec, prologueSeen: true } };
      return s;
    case 'wakeup':
      if (e.type === 'wakeup_done' || e.type === 'prologue_skip') return { ...n, phase: 'dialogue', line: 0 };
      return s;
    case 'dialogue':
      if (e.type === 'line_done') {
        if (!e.last) { const m = { ...n, line: s.line + 1 }; return e.award ? payOnce(m) : m; } // W17 pays the welcome
        return payOnce({ ...n, phase: 'card' });
      }
      if (e.type === 'skip_all') return payOnce({ ...n, phase: 'card', skipped: true });
      return s;
    case 'card':
      if (e.type === 'start_card') return { ...n, phase: 'handoff', rec: { ...n.rec, dialogueSeen: true, cardSeen: true } };
      if (e.type === 'later') return { ...n, phase: 'handoff', rec: { ...n.rec, dialogueSeen: true, cardSeen: false } };
      return s;
    case 'handoff': return e.type === 'handoff_done' ? { ...n, phase: 'done' } : s;
    default: return s;
  }
}
/** The stipend is paid at most once per profile (ftf.npe.v1.stipend), whether the dialogue ended or was skipped. */
function payOnce(s) { return s.rec.stipend ? s : { ...s, award: true, rec: { ...s.rec, stipend: true } }; }
