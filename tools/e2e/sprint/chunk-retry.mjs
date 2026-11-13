// A blocked chunk (the first two requests of the world chunk fail) does not end on the broken-load screen.
import { open, booted, assert } from './lib.mjs';
export default async function (base) {
  const { browser, page } = await open(null);
  try {
    let blocked = 0;
    await page.route(/\/assets\/(boot-world|scenes|client-core)[^/]*\.js$/, (route) => { if (blocked < 2) { blocked++; return route.abort('failed'); } return route.continue(); });
    await page.goto(base + '?day1=0&quest=0');
    const ok = await booted(page);
    const broken = await page.evaluate(() => /Something went wrong while loading/.test(document.body.innerText));
    assert(!broken, 'the broken-load screen showed');
    assert(ok, 'boot did not finish after the retries');
    return `chunk retry: ${blocked} request(s) blocked, the game loaded`;
  } finally { await browser.close(); }
}
