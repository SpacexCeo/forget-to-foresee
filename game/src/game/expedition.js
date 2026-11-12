// The story state machine (TZ §5.2): off → prologue → arrival → guide → gathering → gate_open → twist → onward.
// reduce(state, action, ctx) is pure and has no clock (ctx.now, ctx.feeC are passed in); an illegal transition returns
// {rejected} and changes nothing. Persisted by the view at STORY_KEY. Pure.
import { EXPEDITION } from './expedition-config.js';

export const STORY_KEY = 'ftf.story.v1';
export const PHASES = Object.freeze(['off', 'prologue', 'arrival', 'guide', 'gathering', 'gate_open', 'twist', 'onward']);
export const GUIDE_STEPS = Object.freeze(['talked', 'moved', 'struck', 'dashed']);

export const initialState = () => ({ v: 1, phase: 'off', guide: { talked: false, moved: false, struck: false, dashed: false }, guideTalks: 0, paidAt: null, passShown: false, passStatus: null, prologueSeen: false });

const clone = (s) => ({ ...s, guide: { ...s.guide } });
const rejected = (state, reason) => ({ state, events: [], rejected: reason });

/**
 * @param {object} state @param {{type: string}} action
 * @param {{now?: number, feeC?: number, demoFee?: boolean}} [ctx]
 * @returns {{state: object, events: object[], rejected?: string}}
 */
export function reduce(state, action, ctx = {}) {
  const s = state || initialState();
  const a = action || {};
  const feeC = ctx.feeC ?? EXPEDITION.PORTAL_FEE_C;
  switch (a.type) {
    case 'START': {
      if (s.phase !== 'off') return rejected(s, 'started');
      const n = clone(s); n.phase = a.skipPrologue || s.prologueSeen ? 'arrival' : 'prologue';
      return { state: n, events: [{ kind: 'story_started', data: { prologue: n.phase === 'prologue' } }] };
    }
    case 'ARRIVED': {
      if (s.phase !== 'prologue') return rejected(s, 'phase');
      const n = clone(s); n.phase = 'arrival'; n.prologueSeen = true;
      return { state: n, events: [] };
    }
    case 'GUIDE_STEP': {
      if (!GUIDE_STEPS.includes(a.id)) return rejected(s, 'step');
      if (!['arrival', 'guide', 'gathering', 'gate_open'].includes(s.phase)) return rejected(s, 'phase');
      const n = clone(s); const fresh = !n.guide[a.id]; n.guide[a.id] = true;
      if (a.id === 'talked') n.guideTalks += 1;
      if (n.phase === 'arrival' && a.id === 'talked') n.phase = 'guide';
      // the tutorial never blocks play: every step done, or the elder's second talk, opens the gathering
      if (n.phase === 'guide' && (GUIDE_STEPS.every((k) => n.guide[k]) || n.guideTalks >= 2)) n.phase = 'gathering';
      return { state: n, events: fresh ? [{ kind: 'guide_step', data: { id: a.id } }] : [] };
    }
    case 'SILK': {
      const bal = Number(a.balanceC) || 0;
      if (s.phase === 'gathering' && bal >= feeC) { const n = clone(s); n.phase = 'gate_open'; return { state: n, events: [] }; }
      if (s.phase === 'gate_open' && bal < feeC) { const n = clone(s); n.phase = 'gathering'; return { state: n, events: [] }; } // spent elsewhere
      return { state: s, events: [] };
    }
    case 'PAY_GATE': {
      if (s.phase !== 'gate_open') return rejected(s, 'phase');
      if ((Number(a.balanceC) || 0) < feeC) return rejected(s, 'no_silk');
      const n = clone(s); n.phase = 'twist'; n.paidAt = ctx.now ?? null;
      return { state: n, events: [{ kind: 'portal_paid', data: { feeC, demo: !!ctx.demoFee, ...(a.tx ? { tx: String(a.tx) } : {}) }, silkC: -feeC }] }; // tx: the pay_gate receipt (rev 4)
    }
    case 'TWIST_DONE': {
      if (s.phase !== 'twist') return rejected(s, 'phase');
      const n = clone(s); n.phase = 'onward';
      return { state: n, events: [{ kind: 'stipend_granted', data: {}, silkC: EXPEDITION.stipendC }] };
    }
    case 'PASS_SHOWN': { const n = clone(s); n.passShown = true; return { state: n, events: [] }; }
    case 'PASS_RESULT': { const n = clone(s); n.passStatus = String(a.status || ''); return { state: n, events: [] }; }
    default: return rejected(s, 'action');
  }
}

/** The goal shown in the objective line for a phase (locale keys story.step.*). */
export function storyStep(state) {
  switch (state && state.phase) {
    case 'arrival': return 'story.step.talk';
    case 'guide': return 'story.step.gate';
    case 'gathering': return 'story.step.hunt';
    case 'gate_open': return 'story.step.portal';
    default: return null;
  }
}
