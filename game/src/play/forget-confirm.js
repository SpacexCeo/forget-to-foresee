// The step between "Forget it" and the memory burn (spec appendix G: cancel before a memory burn).
// The Memories panel asks first: which memory, what forgetting it changes for Iris, what she gains,
// that it cannot be undone. Only "Forget this memory" sends sacrifice_memory; "Keep it" sends
// nothing. Pure: reads the per-viewer observation only, so the engine rules stay untouched.

/**
 * The confirmation for forgetting memory `ask.id` with `ask.purpose` ('vision' | 'key'), or null when
 * there is nothing to confirm (no request, or the memory is gone, e.g. after the season moved on).
 * Returns { memory, purpose, title, gain, cost, canConfirm, reason }: title/gain/cost are { key, args }
 * for the play locale; reason is the engine's rejection code the confirm button would hit, if known.
 */
export function forgetConfirmModel(obs, ask) {
  if (!ask || !obs) return null;
  const memory = (obs.memories || []).find((m) => m.id === ask.id);
  if (!memory) return null;
  const purpose = ask.purpose === 'key' ? 'key' : 'vision';
  const attention = obs.iris ? obs.iris.attention : 0;
  let reason = null;
  if (!obs.season || obs.season.phase !== 'play') reason = 'phase';
  else if (attention < 1) reason = 'no_ap';
  else if (purpose === 'key' && !(obs.iris.keyVision && obs.iris.keyVision.open)) reason = 'key_closed';
  return {
    memory,
    purpose,
    title: { key: 'forget.ask', args: { title: memory.text } },
    // the engine's vision opens the next `weight` unpublished signs (fewer near the season's end)
    gain: purpose === 'key' ? { key: 'forget.gain.key', args: {} } : { key: 'forget.gain.vision', args: { n: memory.weight } },
    cost: { key: 'forget.cost', args: {} },
    canConfirm: reason == null,
    reason,
  };
}
