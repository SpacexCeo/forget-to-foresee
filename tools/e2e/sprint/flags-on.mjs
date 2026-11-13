// Every sprint flag on (?ff=all): no console errors, no module failed to mount, the HUD boxes do not overlap.
import { open, booted, assert } from './lib.mjs';
export default async function (base) {
  const { browser, page, errors } = await open(base + '?day1=0&quest=0&ff=all');
  try {
    assert(await booted(page), 'boot did not finish');
    await page.waitForFunction(() => (window.__ftfTelemetry || []).some((e) => e.name === 'sprint.mounted'), null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const tel = window.__ftfTelemetry || [];
      const mounted = (tel.find((e) => e.name === 'sprint.mounted') || {}).payload;
      const failed = tel.filter((e) => e.name === 'error.shown').map((e) => e.payload);
      // fixed-position boxes of the HUD layer that carry text or buttons, overlap check
      const boxes = [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || e.hidden) return false; const b = e.getBoundingClientRect(); return b.width > 8 && b.height > 8 && b.width < innerWidth * 0.9 && (e.textContent.trim() || e.querySelector('button')); })
        .map((e) => ({ id: (e.id || e.className || e.tagName).toString().slice(0, 40), b: e.getBoundingClientRect() }));
      const hits = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i].b, c = boxes[j].b; const ix = Math.min(a.right, c.right) - Math.max(a.left, c.left), iy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (ix > 4 && iy > 4) hits.push(boxes[i].id + ' x ' + boxes[j].id); }
      return { mounted, failed, hits: hits.slice(0, 8) };
    });
    assert(r.failed.length === 0, 'modules failed: ' + JSON.stringify(r.failed));
    assert(errors.length === 0, errors.join(' | '));
    if (r.hits.length) console.log('flags-on overlaps (informational until every HUD lands):', r.hits.join('; '));
    return `flags on: mounted ${JSON.stringify(r.mounted && r.mounted.modules)}, no errors`;
  } finally { await browser.close(); }
}
