// Copies text for "Copy proof" and "Copy biography": the async Clipboard API, then the old selection fallback
// (http:// previews and older browsers). Resolves true only when a copy really happened.
export async function copyText(text, doc = globalThis.document) {
  const nav = globalThis.navigator;
  try {
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') { await nav.clipboard.writeText(text); return true; }
  } catch { /* permission denied or not focused: try the fallback */ }
  try {
    if (!doc || !doc.body) return false;
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    doc.body.append(ta);
    ta.select();
    const ok = typeof doc.execCommand === 'function' && doc.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}
