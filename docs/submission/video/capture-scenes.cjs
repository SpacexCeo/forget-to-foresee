// The v3 scenes for the "what we are building" cut, recorded from the real game on current main.
//   node scenes.cjs <wake|flyin|talk|fight|boss1|mp|quests|tournament|market|menu|pets|ride|boss2> [clip name]
const { launch, newPage, booted, gpu, recorder, keys, walkTo, ev } = require('./capture-lib.cjs');
const MP = process.env.MPBASE || 'http://127.0.0.1:4194/forget-to-foresee/';
const HERO = process.env.HERO || 'iris';
const TOWN = `?ff=all&play=direct&town=1&day1=0&hero=${HERO}&quest=0&tod=day&weather=clear&intro=off`;
const wait = (page, ms) => page.waitForTimeout(ms);
const log = [];
const tryDo = async (what, fn) => { try { const r = await fn(); log.push(what + ' ok' + (r ? ' ' + String(r).slice(0, 160) : '')); return true; } catch (e) { log.push(what + ' FAIL ' + String(e.message).slice(0, 120)); return false; } };
const text = (page, sel, n = 220) => page.evaluate(({ sel, n }) => { const e = document.querySelector(sel); return e ? (e.innerText || '').replace(/\s+/g, ' ').slice(0, n) : null; }, { sel, n });
const tp = (page, p, yaw) => page.evaluate(({ p, yaw }) => window.__ftf.player.teleport(p, yaw), { p, yaw });
// teleport onto the town's own ground at (x, z)
const gtp = (page, x, z, yaw, yh = null) => page.evaluate(({ x, z, yaw, yh }) => { const f = window.__ftf, T = f.town.scene; let g = null; try { g = T.groundAt(x, z, (yh == null ? f.player.pos[1] : yh) + 3); } catch {} f.player.teleport([x, (g == null ? (yh == null ? f.player.pos[1] : yh) : g) + 0.25, z], yaw); return g; }, { x, z, yaw, yh });
const folk = (page, key) => page.evaluate((key) => { const p = window.__ftf.town.scene.townsfolk.people.find((p) => p.key === key); if (!p) return null; const o = p.root || p.group || p.object; const w = o && o.position ? [o.position.x, o.position.y, o.position.z] : null; return { x: p.plan.x, z: p.plan.z, w }; }, key);
// a side camera for the fights: frames the heroine and her target; the HUD stays
const sideCam = (page) => page.evaluate(() => { const f = window.__ftf; window.__cam = null; if (f.rig.__wrapped) return; f.rig.__wrapped = true; const orig = f.rig.update.bind(f.rig); f.rig.update = (...a) => { orig(...a); const c = window.__cam; if (c) { f.rig.camera.position.set(...c.pos); f.rig.camera.lookAt(...c.look); f.rig.camera.updateMatrixWorld(true); } }; });

async function fightPack(page, rec, name, pi, maxS, dist, side = true, melee = false) {
  await page.evaluate(() => window.__ftf.town.mobs.ready);
  await tp(page, [0, 1199, 44], 0); await wait(page, 2000);
  await page.evaluate(({ pi, dist }) => { const f = window.__ftf, pack = f.town.mobs.brain.packs[pi]; const p = [pack.home[0] + dist, pack.home[1] + 1.2, pack.home[2] + 1.0]; f.player.teleport(p, Math.atan2(pack.home[0] - p[0], pack.home[2] - p[2])); f.town.mobs.iris.hp = 100; }, { pi, dist });
  if (side) await sideCam(page);
  await wait(page, 1500);
  const r = await rec(name); const t0 = Date.now(); let lastAct = 0, deadAt = 0, kills = 0, n = 0;
  while (Date.now() - t0 < maxS * 1000) {
    const s = await page.evaluate(({ pi, side }) => {
      const f = window.__ftf, b = f.town.mobs.brain, p = f.player.pos, live = b.mobs.filter((m) => m.pack === b.packs[pi] && m.state !== 'gone');
      const alive = live.filter((x) => x.state !== 'dead').sort((a, c) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(c.pos[0] - p[0], c.pos[2] - p[2]));
      const m = alive[0] || live[0];
      if (!m) return { done: true };
      if (side) {
        const mx = (m.pos[0] + p[0]) / 2, mz = (m.pos[2] + p[2]) / 2, R = m.T.radius; let dx = p[0] - m.pos[0], dz = p[2] - m.pos[2], l = Math.hypot(dx, dz);
        if (l > 1.6 + R * 0.6 || !window.__dir) window.__dir = [dx / (l || 1), dz / (l || 1)]; [dx, dz] = window.__dir; l = 1;
        const D = 5.8 + R * 3.4;
        const want = [mx - dz * D + dx * 1.2, Math.max(p[1], m.pos[1]) + 2.0 + R * 1.5, mz + dx * D + dz * 1.2], look = [mx, Math.max(p[1], m.pos[1]) + 1.0 + R * 0.5, mz];
        const c = window.__cam || (window.__cam = { pos: want.slice(), look: look.slice() });
        for (let i = 0; i < 3; i++) { c.pos[i] += (want[i] - c.pos[i]) * 0.08; c.look[i] += (look[i] - c.look[i]) * 0.14; }
      }
      if (f.town.mobs.iris.hp < 35) f.town.mobs.iris.hp = 70;   // the take is about the fight, not a wipe
      return { left: alive.length, total: live.length, d: Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]), state: m.state, radius: m.T.radius, pos: m.pos.slice(), hp: m.hp, windup: m.state === 'windup' ? m.t / (m.T.windup * m.T.impact) : 0 };
    }, { pi, side });
    if (s.done) break;
    if (s.left === 0) { if (!deadAt) deadAt = Date.now(); if (Date.now() - deadAt > 2600) break; await wait(page, 40); continue; }
    const now = Date.now();
    if (now - lastAct >= 300) {
      lastAct = now; n++;
      if (s.d > (melee ? 2.0 : 3.4) + s.radius && (melee || n % 3 !== 0)) { await keys(page, new Set(['KeyW'])); await page.evaluate((s) => { const f = window.__ftf, p = f.player.pos; f.player.heading = Math.atan2(s.pos[0] - p[0], s.pos[2] - p[2]); f.rig.yaw = f.player.heading; }, s); }
      else {
        await keys(page, new Set());
        await page.evaluate((s) => {
          const f = window.__ftf, M = f.town.mobs, p = f.player.pos;
          f.player.heading = Math.atan2(s.pos[0] - p[0], s.pos[2] - p[2]);
          if (s.windup > 0.65 && s.d < 4 + s.radius) { M.dash([Math.cos(f.player.heading), -Math.sin(f.player.heading)]); return; }
          if (s.d < 2.4 + s.radius) { M.strike(); return; }
          if (s.melee && s.n % 6 !== 0) return;
          const c = f.town.casting; if (c && (c.aimAt('lance', s.pos) && c.release())) return; if (c) { c.aimAt('snare', s.pos); c.release(); }
        }, { ...s, melee, n });
      }
    }
    await wait(page, 40);
  }
  await keys(page, new Set()); await wait(page, 900);
  log.push('kills ' + (await page.evaluate(() => (window.__ftf.town.monsters && window.__ftf.town.monsters.kills) || 0)));
  return r.stop();
}

const SCENES = {
  // a fresh player: the lab prologue, then Iris wakes up in the town
  wake: { q: `?play=direct&town=1&day1=0&quest=0&hero=iris&tod=day&weather=clear`, o: { seen: false }, boot: false, run: async (page, rec) => {
    for (let i = 0; i < 240; i++) { await wait(page, 500); if (await page.evaluate(() => !!document.querySelector('.npe-skip, .npe-sub, .npe-title') || !!(window.__ftfBootMarks && window.__ftfBootMarks.done))) break; }
    const r = await rec('wake');
    for (let i = 0; i < 16; i++) { await wait(page, 5000); log.push(Math.round(r.t()) + 's ' + JSON.stringify(await page.evaluate(() => ({ sub: (document.querySelector('.npe-sub') || {}).innerText || null, skip: !!document.querySelector('.npe-skip'), title: (document.querySelector('.npe-title') || {}).innerText || null, boot: !!(window.__ftfBootMarks && window.__ftfBootMarks.done), dlg: [...document.querySelectorAll('[class*=npe-]')].map((e) => e.className).slice(0, 6).join('|') })))); }
    return r.stop();
  } },
  // the camera flight over the town when she first arrives
  flyin: { q: TOWN.replace('&intro=off', ''), o: { extra: {} }, boot: false, run: async (page, rec) => {
    for (let i = 0; i < 240; i++) { await wait(page, 250); if (await page.evaluate(() => !!(window.__ftfBootMarks && window.__ftfBootMarks.done))) break; }
    const r = await rec('flyin'); await wait(page, 9000); await keys(page, new Set(['KeyW'])); await wait(page, 5000); await keys(page, new Set()); return r.stop();
  } },
  // townsfolk bark as she passes; she talks to two of them
  talk: { q: TOWN, run: async (page, rec) => {
    const r = await rec('talk');
    for (const key of ['courier', 'wayfarer', 'innkeeper', 'baker']) {
      const f = await folk(page, key); if (!f) { log.push('no ' + key); continue; }
      const w = f.w || [f.x, 0, f.z];
      log.push(key + ' ground ' + (await gtp(page, w[0] + 4.2, w[2] + 3.4, Math.atan2(-4.2, -3.4), w[1])) + ' w ' + JSON.stringify(f.w)); await wait(page, 900); f.x = w[0]; f.z = w[2];
      await walkTo(page, [f.x + 1.5, 0, f.z + 1.2], 0.6, 3500); await wait(page, 1800);
      log.push(key + ' prompt: ' + (await text(page, '.ftf-town-prompt', 60)) + ' bark: ' + (await text(page, '.ftf-bark, [class*=bark]', 90)));
      const talked = await page.evaluate(() => { const fl = window.__ftf.town.flow; return fl.talkNpc ? String(fl.talkNpc.key || fl.talkNpc) : null; }).catch(() => null);
      if (talked) { await page.keyboard.press('KeyE'); await wait(page, 5200); log.push(key + ' panel: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=dialog], [class*=dlg], [class*=talk], [class*=panel]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 120)).slice(0, 3).join(' || ')))); await page.keyboard.press('Escape'); await page.evaluate(() => { const fl = window.__ftf.town.flow; if (fl.closePanel) fl.closePanel(); }); await wait(page, 700); }
    }
    return r.stop();
  } },
  fight: { q: TOWN, run: (page, rec) => fightPack(page, rec, process.argv[3] || 'fight', Number(process.env.PACK || 0), Number(process.env.SECS || 26), 8) },
  fight2: { q: TOWN, run: (page, rec) => fightPack(page, rec, 'fight2', 1, 30, 7, true, true) },
  fight3: { q: TOWN, run: (page, rec) => fightPack(page, rec, 'fight3', 4, 30, 7, false, true) },
  fight4: { q: TOWN, run: (page, rec) => fightPack(page, rec, 'fight4', 2, 30, 8, true, true) },
  fight5: { q: TOWN, run: (page, rec) => fightPack(page, rec, 'fight5', 3, 34, 9, true, true) },
  boss1: { q: TOWN, run: (page, rec) => fightPack(page, rec, process.argv[3] || 'boss1', 5, Number(process.env.SECS || 34), 11) },
  quests: { q: TOWN.replace('quest=0', 'quest=1'), run: async (page, rec) => {
    const r = await rec('quests'); await wait(page, 1200);
    await page.keyboard.press('KeyJ'); await wait(page, 2200);
    if (!(await page.locator('.fj').count())) { await ev(page, 'ftf:journal-toggle'); await wait(page, 1500); }
    const rows = await page.locator('.fj-row').count(); log.push('rows ' + rows + ' journal: ' + (await text(page, '.fj', 260)));
    for (let i = 0; i < Math.min(rows, 3); i++) { await tryDo('row ' + i, () => page.locator('.fj-row').nth(i).click({ timeout: 2500 })); await wait(page, 2000); }
    await page.keyboard.press('Escape'); await ev(page, 'ftf:close-windows'); await wait(page, 800);
    await page.keyboard.press('KeyM'); await wait(page, 4500); log.push('map: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=map]')].filter((e) => e.offsetParent).map((e) => e.className).slice(0, 5).join('|'))));
    await page.keyboard.press('Escape'); await wait(page, 600);
    // the quest giver with the gold mark
    const f = await folk(page, 'scribe'); if (f) { const w = f.w || [f.x, 0, f.z]; f.x = w[0]; f.z = w[2]; await gtp(page, f.x + 3.6, f.z + 3.0, Math.atan2(-3.6, -3.0), w[1]); await wait(page, 900); await walkTo(page, [f.x + 1.5, 0, f.z + 1.2], 0.6, 3000); await wait(page, 1200); await page.keyboard.press('KeyE'); await wait(page, 5000); log.push('scribe: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=dialog], [class*=dlg], [class*=talk], [class*=quest]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 120)).slice(0, 3).join(' || ')))); }
    return r.stop();
  } },
  tournament: { q: TOWN.replace('town=1', 'town=altar'), run: async (page, rec) => {
    const r = await rec('tournament'); await wait(page, 3000);
    await ev(page, 'ftf:tournament-open'); await wait(page, 3000);
    log.push('cup: ' + (await text(page, '.cup', 300)));
    await tryDo('exhibition', () => page.getByRole('button', { name: /exhibition/i }).first().click({ timeout: 4000 }));
    for (let i = 0; i < 4; i++) { await wait(page, 3500); log.push('cup ' + i + ': ' + (await text(page, '.cup', 200))); }
    return r.stop();
  } },
  market: { q: TOWN, run: async (page, rec) => {
    const g = await folk(page, 'guard');
    if (g) { const w = g.w || [g.x, 0, g.z]; await gtp(page, w[0] + 2.6, w[2] - 2.0, Math.atan2(-2.6, 2.0), w[1]); await wait(page, 2200); }
    const r = await rec('market'); await wait(page, 1200);
    await ev(page, 'ftf:stall-open', { npc: 'guard' }); await wait(page, 6500);
    log.push('stall: ' + (await text(page, '.sp', 300)));
    await ev(page, 'ftf:close-windows'); await page.locator('.sp button').filter({ hasText: /^[×✕x]$/ }).first().click({ timeout: 1500 }).catch(() => {}); await wait(page, 700);
    await ev(page, 'ftf:market-open'); await wait(page, 3000);
    await tryDo('sell tab', () => page.locator('.mk2 button, .mk2 [role=tab]').filter({ hasText: /^Sell/ }).first().click({ timeout: 2000 })); await wait(page, 3000);
    log.push('market: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=mk], [class*=market]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 160)).slice(0, 3).join(' || '))));
    await ev(page, 'ftf:close-windows'); await wait(page, 700);
    await ev(page, 'ftf:menu-open', { tab: 'town' }); await wait(page, 4500);
    log.push('ledger: ' + (await text(page, '.gm', 300)));
    await page.mouse.move(960, 600); await page.mouse.wheel(0, 500); await wait(page, 2500); await page.mouse.wheel(0, 500); await wait(page, 2500);
    return r.stop();
  } },
  ledger: { q: TOWN, run: async (page, rec) => {
    const r = await rec('ledger'); await wait(page, 1000);
    await ev(page, 'ftf:menu-open', { tab: 'town' }); await wait(page, 5000);
    await page.mouse.move(960, 600); for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 260); await wait(page, 1600); }
    log.push('ledger: ' + (await text(page, '.gm', 500)));
    return r.stop();
  } },
  mkt: { q: TOWN, run: async (page, rec) => {
    const r = await rec('mkt'); await wait(page, 1000);
    await ev(page, 'ftf:market-open'); await wait(page, 4000);
    for (const tab of ['Sell', 'Games', 'Buy']) { await tryDo('tab ' + tab, () => page.locator('.mk2').getByText(tab, { exact: true }).first().click({ timeout: 2000 })); await wait(page, 2600); }
    log.push('mk2: ' + (await text(page, '.mk2', 400)));
    return r.stop();
  } },
  hatch: { q: TOWN, run: async (page, rec) => {
    const h = await page.evaluate(() => { const o = window.__ftf.scene.getObjectByName('hatchkeeper'); return o ? [o.position.x, o.position.y, o.position.z, o.rotation.y] : null; });
    log.push('hatchkeeper ' + JSON.stringify(h)); const fx = Math.sin(h[3]), fz = Math.cos(h[3]);
    log.push('ground ' + (await gtp(page, h[0] + fx * 7, h[2] + fz * 7, Math.atan2(-fx, -fz), h[1]))); await wait(page, 2000);
    const r = await rec('hatch');
    await page.evaluate(() => { window.__ftf.rig.distTarget = 3.2; });
    await walkTo(page, [h[0] + fx * 1.6, 0, h[2] + fz * 1.6], 0.5, 6000); await wait(page, 5000);
    await page.keyboard.press('KeyE'); await wait(page, 5000);
    log.push('hatch: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=hatch]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 200)).slice(0, 2).join(' || '))) + ' prompt ' + (await text(page, '.ftf-town-prompt', 80)));
    return r.stop();
  } },
  // the game menu: NFTs, chests in the inventory, the wheel
  menu: { q: TOWN, run: async (page, rec) => {
    await page.evaluate(() => { const c = window.__ftf.town.chests; for (const tier of ['rare', 'common', 'epic']) { try { c.add({ tier }); } catch {} } });
    const r = await rec('menu'); await wait(page, 800);
    for (const tab of ['nfts', 'inventory', 'profile']) {
      await ev(page, 'ftf:menu-open', { tab }); await wait(page, 3800); log.push(tab + ': ' + (await text(page, '.gm', 200)));
      if (tab === 'nfts') { await tryDo('card', () => page.locator('.gm [class*=card]').first().click({ timeout: 2000 })); await wait(page, 3000); await page.keyboard.press('Escape'); await wait(page, 500); }
      if (tab === 'inventory') { await tryDo('chest', () => page.locator('.gm [class*=chest]').first().click({ timeout: 2000 })); await wait(page, 4500); }
      await page.keyboard.press('Escape'); await ev(page, 'ftf:close-windows'); await wait(page, 600);
    }
    log.push('windows: ' + (await page.evaluate(() => [...document.querySelectorAll('.gm-tab')].map((e) => e.dataset.tab).join(','))));
    return r.stop();
  } },
  chest: { q: TOWN + '&chestpreview=' + (process.env.CHEST || 'nft'), run: async (page, rec) => {
    const r = await rec('chest'); await wait(page, 1200);
    await tryDo('preview', () => page.locator('button.ftf-town-prompt').filter({ hasText: /preview/i }).first().click({ timeout: 3000 }));
    for (let i = 0; i < 4; i++) { await wait(page, 2500); log.push('reveal: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=chest], [class*=reveal], [class*=co-]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 100)).slice(0, 2).join(' || ')))); if (i === 1) await page.mouse.click(960, 560).catch(() => {}); }
    return r.stop();
  } },
  wheel: { q: TOWN, run: async (page, rec) => {
    await wait(page, 500);
    const r = await rec('wheel'); await wait(page, 1500);
    await ev(page, 'ftf:open-window', { id: 'wheel' }); await wait(page, 1500);
    if (!(await page.locator('.wv-go').count())) { await ev(page, 'ftf:menu-open', { tab: 'wheel' }); await wait(page, 1500); }
    log.push('wheel: ' + (await page.locator('.wv-go').count()) + ' ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=wv]')].filter((e) => e.offsetParent).map((e) => e.className).slice(0, 6).join('|'))));
    await tryDo('spin', () => page.locator('.wv-go').first().click({ timeout: 2500 })); await wait(page, 9000);
    return r.stop();
  } },
  // a dragon companion follows her through the town; then the Hatchkeeper's stall with its three dragons
  pets: { q: TOWN + '&companion=' + (process.env.PET || 'nacre'), run: async (page, rec) => {
    const r = await rec('pets'); await wait(page, 1500);
    log.push('companions: ' + (await page.evaluate(() => { const c = window.__ftf.town.companions; return c ? JSON.stringify(Object.keys(c)) + ' ' + (c.list ? JSON.stringify(c.list) : '') : null; })));
    await keys(page, new Set(['KeyW'])); await wait(page, 3500); await keys(page, new Set(['KeyW', 'KeyD'])); await wait(page, 1800); await keys(page, new Set(['KeyW'])); await wait(page, 2500); await keys(page, new Set()); await wait(page, 2500);
    const h = await page.evaluate(() => { const o = window.__ftf.scene.getObjectByName('hatchkeeper'); return o ? [o.position.x, o.position.y, o.position.z, o.rotation.y] : null; });
    log.push('hatchkeeper ' + JSON.stringify(h));
    if (h) { const fx = Math.sin(h[3]), fz = Math.cos(h[3]); log.push('ground ' + (await gtp(page, h[0] + fx * 7, h[2] + fz * 7, Math.atan2(-fx, -fz), h[1]))); await page.evaluate(() => { const r = window.__ftf.rig; r.distTarget = 3.4; }); await wait(page, 2500); await walkTo(page, [h[0] + fx * 1.5, 0, h[2] + fz * 1.5], 0.5, 6000); await wait(page, 5000); }
    await page.keyboard.press('KeyE'); await wait(page, 4500);
    log.push('hatch: ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=hatch]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 160)).slice(0, 2).join(' || '))));
    return r.stop();
  } },
  ride: { q: `?ff=glassShoal&shoal=ride&hero=${HERO}&play=direct&town=1&day1=0&quest=0`, run: async (page, rec) => {
    await wait(page, 1500); const r = await rec('ride');
    for (let i = 0; i < 6; i++) { await wait(page, 4000); log.push('mode ' + (await page.evaluate(() => window.__ftf.glassShoal && window.__ftf.glassShoal.mode))); }
    return r.stop();
  } },
  // boss two: the ice serpent on the Glass Shoal, fought with the real keys; the phases are helped along so one take shows them
  boss2: { q: `?ff=glassShoal&shoal=arena&hero=${HERO}&play=direct&town=1&day1=0&quest=0`, boot: false, run: async (page, rec) => {
    for (let i = 0; i < 150; i++) { await wait(page, 1000); if (await page.evaluate(() => !!(window.__ftf && window.__ftf.glassShoal && window.__ftf.glassShoal.mode === 'arena' && window.__ftf.glassShoal.arena))) break; }
    await wait(page, 2500);
    const st = () => page.evaluate(() => { const s = window.__ftf.glassShoal.arena.state; return { hp: Math.round(s.boss.hp), phase: s.boss.phase, state: s.boss.state, t: +(s.boss.t || 0).toFixed(2), atk: s.boss.attack && s.boss.attack.kind, me: Math.round(s.hero.hp), won: s.won, pos: s.pos.map(Math.round) }; });
    const s0 = await st(); log.push('start ' + JSON.stringify(s0)); const max = s0.hp;
    const r = await rec(process.argv[3] || 'boss2'); const t0 = Date.now(); let lastPhase = s0.phase, dodges = 0;
    await page.keyboard.down('KeyW'); for (let k = 0; k < 24; k++) { await wait(page, 500); const s = await st(); if (Math.hypot(s.pos[0], s.pos[1] + 10) < 13) break; } await page.keyboard.up('KeyW');
    const hitTo = async (frac) => { for (let i = 0; i < 80; i++) { const s = await st(); if (s.hp <= max * frac || s.won) break; await page.evaluate(() => window.__ftf.glassShoal.arena.debugHit(300)); await wait(page, 50); } };
    const SECS = Number(process.env.SECS || 75); let pushed = 0;
    for (let i = 0; Date.now() - t0 < SECS * 1000; i++) {
      const s = await st(); const t = (Date.now() - t0) / 1000;
      if (s.won) break;
      if (s.phase !== lastPhase) { log.push('phase ' + s.phase + ' at ' + t.toFixed(1)); lastPhase = s.phase; }
      if (t > 22 && pushed === 0) { await hitTo(0.64); pushed = 1; continue; }
      if (t > 42 && pushed === 1) { await hitTo(0.31); pushed = 2; continue; }
      if (t > 52 && pushed === 2) { await page.evaluate(() => { const a = window.__ftf.glassShoal.arena; if (a.debugCharge) a.debugCharge(); }); await page.keyboard.press('KeyR'); pushed = 3; continue; }
      if (t > 64 && pushed === 3) { await hitTo(0.03); pushed = 4; continue; }
      if (s.state === 'telegraph' && s.t < 0.2 && s.t > 0) { await page.keyboard.press('Space'); dodges++; await wait(page, 250); continue; }
      if (Math.hypot(s.pos[0], s.pos[1] + 10) > 8 && s.state !== 'telegraph') { await page.keyboard.down('KeyW'); await wait(page, 250); await page.keyboard.up('KeyW'); continue; }
      await page.keyboard.press(i % 5 === 4 ? 'KeyQ' : 'KeyF'); await wait(page, 60);
    }
    let s = await st(); log.push('end ' + JSON.stringify(s) + ' dodges ' + dodges);
    if (!s.won) { await page.evaluate(() => window.__ftf.glassShoal.arena.debugWin()); }
    await wait(page, 4000); await page.keyboard.press('KeyE'); await wait(page, 6000);
    log.push('card: ' + (await text(page, '.sl-card', 200)));
    return r.stop();
  } },
};

// two players in one town on a presence server on this box: she chats, the other heroine answers and walks up
async function mpScene(browser) {
  const q = (hero) => `?ff=all&play=direct&town=1&day1=0&hero=${hero}&quest=0&tod=day&weather=clear&intro=off&demo=0`;
  const A = await newPage(browser, q('iris'), { nick: 'Lambada', base: MP }); const B = await newPage(browser, q('elise'), { nick: 'Raen', base: MP });
  await Promise.all([booted(A.page, 3000), booted(B.page, 3000)]);
  const a = A.page, b = B.page;
  const ap = await a.evaluate(() => window.__ftf.player.pos);
  log.push('B ground ' + (await gtp(b, ap[0] + 1.6, ap[2] - 7.5, 0, ap[1]))); await wait(b, 2500);
  const room = (page) => page.evaluate(() => { const c = document.querySelector('.ftf-chat-chip'), m = window.__ftf.mp; let n = null; try { n = m.presence.positions().length; } catch (e) { n = 'ERR ' + e.message; } return { chip: c ? c.getAttribute('data-n') + '/' + c.getAttribute('data-on') + '/' + c.textContent : null, others: n, mp: !!m }; });
  log.push('A ' + JSON.stringify(await room(a)) + ' B ' + JSON.stringify(await room(b)));
  const r = await recorder(a, 'mp');
  const walkB = (async () => { await wait(b, 800); await b.keyboard.down('KeyS'); for (let i = 0; i < 80; i++) { await wait(b, 100); const z = await b.evaluate(() => window.__ftf.player.pos[2]); if (z > ap[2] - 2.4) break; } await b.keyboard.up('KeyS'); log.push('B at ' + JSON.stringify(await b.evaluate(() => window.__ftf.player.pos.map((v) => +v.toFixed(1))))); })();
  await wait(a, 2000);
  const say = async (page, line) => {
    await page.keyboard.press('Enter'); await wait(page, 500);
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    if (focused !== 'INPUT') { await page.locator('.ftf-chat-chip').first().click({ timeout: 2000, force: true }); await wait(page, 400); await page.locator('.ftf-chat-row input').first().click({ timeout: 2000 }); }
    await page.keyboard.type(line, { delay: 40 }); await wait(page, 300); await page.keyboard.press('Enter'); await wait(page, 200);
    return focused;
  };
  await tryDo('A says', () => say(a, 'gm! anyone up for the Shoal boss?'));
  await walkB; await wait(a, 2000);
  await tryDo('B says', () => say(b, 'on my way, bring your dragon'));
  await wait(a, 3500);
  await tryDo('A says 2', () => say(a, 'meet at the gate'));
  await wait(a, 2500);
  log.push('panel: ' + (await a.evaluate(() => [...document.querySelectorAll('.ftf-chat-log, [class*=chat-panel], [class*=ftf-chat]')].filter((e) => e.offsetParent).map((e) => e.className + '=' + (e.innerText || '').replace(/\s+/g, ' ').slice(0, 200)).slice(0, 3).join(' || '))));
  for (const pg of [a, b]) if ((await pg.evaluate(() => document.activeElement && document.activeElement.tagName)) === 'INPUT') await pg.keyboard.press('Escape');
  // both walk up the stairs together
  await a.keyboard.down('KeyW'); await b.keyboard.down('KeyW'); await wait(a, 5000); await a.keyboard.up('KeyW'); await b.keyboard.up('KeyW');
  return r.stop();
}

(async () => {
  const name = process.argv[2]; const browser = await launch();
  try {
    if (name === 'mp') { console.log(JSON.stringify({ stats: await mpScene(browser), log })); return; }
    const S = SCENES[name];
    const { page, errs } = await newPage(browser, S.q, S.o || {});
    // NOHUD=1: only the 3D canvas is drawn (for the boot reel and the cinematic shots)
    if (process.env.NOHUD) await page.addStyleTag({ content: 'body *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    if (S.boot !== false) await booted(page);
    const stats = await S.run(page, (n) => recorder(page, n + (process.env.SUFFIX || '')));
    console.log(JSON.stringify({ stats, gpu: await gpu(page), log, errs: errs.slice(0, 3) }));
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 500), JSON.stringify(log)); process.exit(1); });
