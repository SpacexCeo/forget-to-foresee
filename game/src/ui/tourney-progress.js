// The Tournament gate made visible (owner 14.11): until ten stone spiders are felled a small HUD chip shows the spider
// icon, "Stone spiders 3/10" and where to find them; each new spider pulses it. The moment the gate opens a short
// celebratory banner says the Tournament is open and where to register. Plain DOM, no play imports; the judge path
// (always open) never shows the chip. game/tourney-gate.js computes the gate.

/** createTourneyProgress({t, base}) -> {update({visible, gate, reduced})}. */
export function createTourneyProgress({ doc = globalThis.document, t, base = '/' }) {
  let chip = null, last = null, wasOpen = null, lastText = null;
  const make = () => {
    chip = doc.createElement('div'); chip.className = 'ftf-spiders'; chip.setAttribute('role', 'status'); chip.hidden = true;
    chip.style.cssText = 'position:fixed;left:50%;top:max(54px,env(safe-area-inset-top));transform:translateX(-50%);z-index:30;display:flex;align-items:center;gap:8px;padding:5px 12px 5px 6px;border-radius:999px;border:1px solid rgba(233,180,76,.55);background:rgba(18,26,27,.82);color:#f3ead6;font:600 13px/1.2 system-ui,sans-serif;pointer-events:none;transition:transform .25s,box-shadow .25s;max-width:calc(100vw - 32px)';
    const img = doc.createElement('img'); img.src = `${base}assets/ui/icons/open/spider_counter_48.webp`; img.alt = ''; img.width = 26; img.height = 26;
    const txt = doc.createElement('span'); txt.className = 'ftf-spiders-n';
    const hint = doc.createElement('span'); hint.className = 'ftf-spiders-hint'; hint.style.cssText = 'font-weight:400;color:#d8cfbd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    chip.append(img, txt, hint); doc.body.append(chip);
  };
  const celebrate = (reduced) => {
    const b = doc.createElement('div'); b.className = 'ftf-tourney-open'; b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;left:50%;top:22%;transform:translate(-50%,0) scale(.9);z-index:60;text-align:center;padding:16px 26px;border-radius:16px;border:2px solid #e9b44c;background:radial-gradient(circle at 50% 0,rgba(233,180,76,.35),rgba(18,26,27,.94) 70%);color:#f3ead6;box-shadow:0 0 40px rgba(233,180,76,.55);pointer-events:none;opacity:0;transition:opacity .35s,transform .35s;max-width:calc(100vw - 32px)';
    const h = doc.createElement('div'); h.textContent = t('town.tourney.openTitle'); h.style.cssText = 'font:700 22px/1.2 system-ui,sans-serif;letter-spacing:.06em;color:#ffd77a;text-transform:uppercase';
    const p = doc.createElement('div'); p.textContent = t('town.tourney.openBody'); p.style.cssText = 'margin-top:6px;font:15px/1.4 system-ui,sans-serif';
    b.append(h, p); doc.body.append(b);
    requestAnimationFrame(() => { b.style.opacity = '1'; b.style.transform = 'translate(-50%,0) scale(1)'; });
    setTimeout(() => { b.style.opacity = '0'; setTimeout(() => b.remove(), 400); }, reduced ? 4000 : 5200);
    try { globalThis.dispatchEvent(new CustomEvent('ftf:tourney-open')); } catch { /* no window */ }
  };
  return {
    update({ visible, gate, reduced = false }) {
      if (!gate) return;
      if (wasOpen === false && gate.open) celebrate(reduced); // opened this session: the moment, once
      wasOpen = gate.open;
      if (gate.open || !visible) { if (chip) chip.hidden = true; return; }
      if (!chip) make();
      chip.hidden = false;
      const text = t('town.spiders.chip', { n: gate.n, need: gate.need }), hintText = t('town.spiders.hint');
      if (last !== gate.n || lastText !== text + hintText) { // a new count, or the player switched language
        const bump = last != null && gate.n > last; last = gate.n; lastText = text + hintText;
        chip.querySelector('.ftf-spiders-n').textContent = text;
        chip.querySelector('.ftf-spiders-hint').textContent = hintText;
        if (bump && !reduced) { chip.style.transform = 'translateX(-50%) scale(1.15)'; chip.style.boxShadow = '0 0 18px rgba(233,180,76,.8)'; setTimeout(() => { chip.style.transform = 'translateX(-50%)'; chip.style.boxShadow = ''; }, 280); }
      }
    },
  };
}
