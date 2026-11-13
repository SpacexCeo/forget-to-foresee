// The first ten minutes (sprint plan 8.6), as far as the merged features allow: each step that needs a feature not
// merged yet reports "skip" instead of failing; the final run (flags on) must pass every step.
import { open, booted, telemetry, assert } from './lib.mjs';
export default async function (base) {
  const { browser, page, errors } = await open(base + '?test=1&intro=1&ff=all');
  const steps = [];
  try {
    assert(await booted(page), 'boot did not finish'); steps.push('1 boot ok');
    const t = await telemetry(page);
    steps.push(t.includes('prologue.started') ? '2 prologue ok' : '2 prologue skip (not merged)');
    steps.push(t.includes('npe.step') ? '4 dialogue ok' : '4 dialogue skip (not merged)');
    assert(errors.length === 0, errors.join(' | '));
    return 'first-ten: ' + steps.join(', ');
  } finally { await browser.close(); }
}
