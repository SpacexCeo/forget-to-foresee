// Shared helpers for the sprint e2e (headless Chromium; software GL in CI is slow, so steps wait on state, not time).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
function loadPw() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright/index.js']) { try { return require(p); } catch { /* next */ } }
  throw new Error('playwright is not installed (npm i --no-save playwright)');
}
export const pw = loadPw();
export async function open(url, { device = null } = {}) {
  const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext(device ? { ...pw.devices[device] } : { viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [], failed = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!/favicon|rpc|nearblocks|relayer|fastnear|jsdelivr/.test(u)) failed.push(u.slice(0, 160)); });
  return { browser, context, page, errors, failed };
}
export async function booted(page, ms = 300000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(() => !!(window.__ftfBootMarks || {}).done).catch(() => false)) return true; await page.waitForTimeout(1000); }
  return false;
}
export const telemetry = (page) => page.evaluate(() => (window.__ftfTelemetry || []).map((e) => e.name));
export function assert(cond, msg) { if (!cond) throw new Error(msg); }
