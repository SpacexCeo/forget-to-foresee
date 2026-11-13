// The companion slot while players cannot have pets (owner 13.11): a dimmed slot with a padlock and the tooltip
// "Companions: locked. The Hatchkeeper decides who is ready." Nothing can be equipped: it is not a button and
// accepts no drop. Used by the character panel (C) and the profile.

/** @param {Document} doc @param {(k: string) => string} t */
export function lockedCompanionSlot(doc, t) {
  const tip = t('companion.locked');
  const slot = doc.createElement('div'); slot.className = 'ftf-companion-slot is-locked';
  slot.dataset.locked = 'true'; slot.setAttribute('role', 'img'); slot.setAttribute('aria-label', t('companion.slot') + ': ' + tip); slot.title = tip;
  slot.style.cssText = 'display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:8px 12px;border-radius:10px;border:1px dashed #3a3f55;background:rgba(255,255,255,.03);color:#aab1c5;opacity:.6;cursor:not-allowed;max-width:100%;box-sizing:border-box';
  const lock = doc.createElement('span'); lock.className = 'ftf-companion-lock'; lock.textContent = '🔒'; lock.setAttribute('aria-hidden', 'true'); lock.style.fontSize = '22px';
  const txt = doc.createElement('span'); txt.textContent = tip; txt.style.cssText = 'font-size:13px;white-space:normal';
  slot.append(lock, txt);
  // a Hatchkeeper pet owned by this heroine unlocks the slot (boot-world dispatches 'ftf:pet' after the chain read)
  const win = doc.defaultView || globalThis;
  const onPet = (e) => {
    const d = e && e.detail; if (!d || !d.kind) return;
    const name = t('hatch.kind.' + d.kind), text = t('companion.yours', { name });
    slot.classList.remove('is-locked'); slot.dataset.locked = 'false'; slot.title = text; slot.setAttribute('aria-label', t('companion.slot') + ': ' + text);
    slot.style.opacity = '1'; slot.style.cursor = 'default'; slot.style.borderStyle = 'solid'; slot.style.color = '#f3ead8';
    lock.textContent = '🐉'; txt.textContent = text;
  };
  if (win && win.addEventListener) win.addEventListener('ftf:pet', onPet);
  if (win && win.__ftfPet) onPet({ detail: win.__ftfPet }); // already known
  for (const ev of ['dragover', 'drop']) if (slot.addEventListener) slot.addEventListener(ev, (e) => { if (e.preventDefault) e.stopPropagation(); }); // nothing can be equipped
  return slot;
}
