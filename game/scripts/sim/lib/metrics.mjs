/** Small statistics helpers for the simulation report. */

export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export function sd(xs) { if (xs.length < 2) return NaN; const m = mean(xs); return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); }
/** Half-width of the 95% confidence interval of the mean. */
export const ci95 = (xs) => 1.96 * sd(xs) / Math.sqrt(xs.length);
export function quantile(xs, q) { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * q; const lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
/** Gini coefficient of a non-negative vector (0 = equal, 1 = one holder owns everything). */
export function gini(xs) {
  const s = [...xs].sort((a, b) => a - b), n = s.length, tot = s.reduce((a, b) => a + b, 0);
  if (!n || tot <= 0) return 0;
  let acc = 0; for (let i = 0; i < n; i++) acc += (2 * (i + 1) - n - 1) * s[i];
  return acc / (n * tot);
}
export const share = (xs, pred) => (xs.length ? xs.filter(pred).length / xs.length : NaN);
export const count = (xs, key) => xs.reduce((o, x) => { const k = key(x); o[k] = (o[k] || 0) + 1; return o; }, {});
export const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : 'n/a');
export const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'n/a');
export const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a');
export const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + '%' : 'n/a');

/** Markdown table from a header row and rows of cells. */
export function table(head, rows) {
  const line = (r) => '| ' + r.join(' | ') + ' |';
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}