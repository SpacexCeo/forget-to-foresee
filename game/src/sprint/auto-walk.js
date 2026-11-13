// STUB (A1 implements; sprint plan 3.2, 4.10): auto-path to a town point. Emits autowalk.started / arrived / cancelled.
import { emit } from './bus.js';
export function autoWalkTo({ pos, stopRadius = 2.2, label = '' } = {}) {
  emit('autowalk.started', { to: pos, label, stopRadius });
  return { cancel() { emit('autowalk.cancelled', { to: pos, reason: 'input' }); } };
}
