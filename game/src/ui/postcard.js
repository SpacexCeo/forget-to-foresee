// Share postcard: a 1200×630 image (Iris, the sign, one biography line, the link) drawn on demand on a 2D canvas when
// the player presses Share. Never per frame, and never a WebGL read-back: the 3D framebuffer is not touched. The dialog
// offers Download PNG and Copy text for an X post.

export const POSTCARD_W = 1200, POSTCARD_H = 630;
const BG = 'assets/ui/lobby_bg.jpg', IRIS = 'assets/ui/loading_iris.webp';

/** Splits `text` into lines no wider than `max` by `measure(str) -> px`. Pure. */
export function wrapLines(text, max, measure, maxLines = 4) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (measure(next) <= max || !cur) cur = next; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
  return lines;
}

/** The text for an X post: the line, the link, and the hackathon tags. No claims beyond the line itself. */
export function postcardText({ line, link }) {
  return `${line}\n\nForget to Foresee — a strategy game where the future costs a memory. Built at NEAR HACKATHON @NEARProtocol #NEARHackathon\n${link}`;
}

const loadImage = (doc, src) => new Promise((resolve) => {
  const view = doc.defaultView || globalThis;
  const img = new view.Image();
  img.onload = () => resolve(img); img.onerror = () => resolve(null);
  img.src = src;
});

/**
 * Draws the postcard. Resolves the canvas.
 * @param {{doc?: Document, kicker: string, title: string, line: string, link: string, signSvg?: string|null, base?: string}} o
 */
export async function renderPostcard({ doc = document, kicker, title, line, link, signSvg = null, base = '' }) {
  const c = doc.createElement('canvas'); c.width = POSTCARD_W; c.height = POSTCARD_H;
  const g = c.getContext('2d');
  const [bg, iris, sign] = await Promise.all([
    loadImage(doc, base + BG), loadImage(doc, base + IRIS),
    signSvg ? loadImage(doc, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(signSvg)) : Promise.resolve(null),
  ]);
  g.fillStyle = '#0e1416'; g.fillRect(0, 0, POSTCARD_W, POSTCARD_H);
  if (bg) { const s = Math.max(POSTCARD_W / bg.width, POSTCARD_H / bg.height); g.globalAlpha = 0.55; g.drawImage(bg, (POSTCARD_W - bg.width * s) / 2, (POSTCARD_H - bg.height * s) / 2, bg.width * s, bg.height * s); g.globalAlpha = 1; }
  const grad = g.createLinearGradient(0, 0, POSTCARD_W, 0); grad.addColorStop(0, 'rgba(10,14,16,.92)'); grad.addColorStop(0.62, 'rgba(10,14,16,.7)'); grad.addColorStop(1, 'rgba(10,14,16,.2)');
  g.fillStyle = grad; g.fillRect(0, 0, POSTCARD_W, POSTCARD_H);
  if (iris) { const h = 560, w = (iris.width / iris.height) * h; g.drawImage(iris, POSTCARD_W - w - 70, POSTCARD_H - h - 20, w, h); }
  if (sign) { g.save(); g.globalAlpha = 0.95; g.drawImage(sign, POSTCARD_W - 560, 70, 250, 250); g.restore(); }
  // text column
  const left = 70, max = 640;
  g.fillStyle = '#e9b44c'; g.font = '600 22px system-ui, sans-serif'; g.fillText(kicker.toUpperCase(), left, 92);
  g.fillStyle = '#f3ead6'; g.font = '600 54px Georgia, serif';
  let y = 160;
  for (const l of wrapLines(title, max, (s) => g.measureText(s).width, 2)) { g.fillText(l, left, y); y += 62; }
  g.font = '28px system-ui, sans-serif'; g.fillStyle = '#e6dcc5'; y += 14;
  for (const l of wrapLines(line, max, (s) => g.measureText(s).width, 5)) { g.fillText(l, left, y); y += 40; }
  g.fillStyle = '#e9b44c'; g.font = '22px ui-monospace, Consolas, monospace';
  g.fillText(link.replace(/^https?:\/\//, '').slice(0, 64), left, POSTCARD_H - 70);
  g.fillStyle = '#9d968a'; g.font = '18px system-ui, sans-serif';
  g.fillText('Forget to Foresee · built at NEAR HACKATHON', left, POSTCARD_H - 38);
  return c;
}

/**
 * The share dialog: the postcard, Download PNG, Copy text, Close.
 * @param {{doc?: Document, t: Function, kicker: string, title: string, line: string, link: string, signSvg?: string|null}} o
 */
export async function openPostcard({ doc = document, t, ...card }) {
  const canvas = await renderPostcard({ doc, ...card });
  const root = doc.createElement('div'); root.className = 'ftf-postcard';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', t('postcard.title'));
  root.style.cssText = 'position:fixed;inset:0;z-index:85;display:grid;place-items:center;background:rgba(6,10,12,.72)';
  const panel = doc.createElement('div');
  panel.style.cssText = 'width:min(760px,calc(100% - 24px));padding:16px;border-radius:14px;background:rgba(14,20,22,.96);border:1px solid rgba(233,180,76,.45);color:#f3ead6;font:15px/1.4 system-ui,sans-serif';
  canvas.style.cssText = 'width:100%;height:auto;border-radius:8px;display:block';
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', card.title + '. ' + card.line);
  const row = doc.createElement('div'); row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px';
  const btn = (key, fn, primary) => { const b = doc.createElement('button'); b.type = 'button'; b.textContent = t(key); b.style.cssText = `min-height:40px;padding:4px 14px;border-radius:8px;border:1px solid rgba(233,180,76,.6);cursor:pointer;font:500 15px system-ui,sans-serif;${primary ? 'background:rgba(233,180,76,.92);color:#1d1708' : 'background:rgba(233,180,76,.14);color:#f3ead6'}`; b.addEventListener('click', () => fn(b)); return b; };
  const close = () => root.remove();
  row.append(
    btn('postcard.download', () => canvas.toBlob((blob) => { if (!blob) return; const a = doc.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'forget-to-foresee-postcard.png'; doc.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }, 'image/png'), true),
    btn('postcard.copyText', async (b) => { try { await navigator.clipboard.writeText(postcardText(card)); b.textContent = t('postcard.copied'); } catch { b.textContent = t('postcard.copyFailed'); } }),
    btn('postcard.close', close));
  panel.append(canvas, row); root.append(panel);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());
  root.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  doc.body.append(root);
  row.firstChild.focus();
  return { root, canvas, close };
}
