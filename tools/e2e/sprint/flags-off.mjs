// Every sprint flag off (the default): the game boots and plays like main; no sprint module loads.
import { open, booted, telemetry, assert } from './lib.mjs';
export default async function (base) {
  const { browser, page, errors } = await open(base + '?day1=0&quest=0');
  try {
    assert(await booted(page), 'boot did not finish');
    await page.waitForTimeout(3000);
    const t = await telemetry(page);
    const m = await page.evaluate(() => (window.__ftfTelemetry || []).find((e) => e.name === 'sprint.mounted'));
    assert(m && m.payload.modules.length === 0, 'flags off but sprint modules mounted: ' + JSON.stringify(m && m.payload));
    assert(!t.includes('error.shown'), 'error.shown with flags off');
    assert(errors.length === 0, errors.join(' | '));
    return 'flags off: booted, 0 sprint modules, no errors';
  } finally { await browser.close(); }
}
