// Round logograms drawn by code (canvas 2D): the same four stroke forms (arc, spike, loop, drop) and
// ring positions the tutorial teaches (0 = top, clockwise; core dots mark where reading starts).
// Used by the vision panel, the glass wall inside a Shell (as a texture the Guest "draws" with a
// progress value) and the glyph over the plaza. The Guests' ink is not human handwriting: strokes
// are laid down as luminous filaments that bleed outward, the ring closes last, and the whole sign
// slowly turns until its reading start sits at the top.

const FORM_PATHS = [
  // arc
  (ctx, R) => { ctx.beginPath(); ctx.moveTo(-0.3 * R, -1.02 * R); ctx.quadraticCurveTo(0, -1.25 * R, 0.3 * R, -1.02 * R); ctx.stroke(); },
  // spike
  (ctx, R) => { ctx.beginPath(); ctx.moveTo(-0.12 * R, -0.97 * R); ctx.lineTo(0, -1.3 * R); ctx.lineTo(0.12 * R, -0.97 * R); ctx.stroke(); },
  // loop
  (ctx, R) => { ctx.beginPath(); ctx.arc(0, -1.13 * R, 0.11 * R, 0, Math.PI * 2); ctx.stroke(); },
  // drop
  (ctx, R) => { ctx.beginPath(); ctx.moveTo(0, -1.31 * R); ctx.bezierCurveTo(0.12 * R, -1.12 * R, 0.12 * R, -1.0 * R, 0, -0.97 * R); ctx.bezierCurveTo(-0.12 * R, -1.0 * R, -0.12 * R, -1.12 * R, 0, -1.31 * R); ctx.fill(); ctx.stroke(); },
];

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * Draws a logogram centred in the canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{forms:number[], dots:number}} sign  forms by ring position (engine encoding)
 * @param {{size?:number, progress?:number, ink?:string, glow?:string, highlight?:number|null, labels?:boolean, turn?:boolean, background?:string|null, time?:number}} [o]
 *   progress 0..1: how much the Guest has drawn (strokes in reading order, then the ring);
 *   highlight: ring position to emphasise; labels: reading order numbers; turn: rotate the
 *   reading start to the top as the drawing completes.
 */
export function drawLogogram(ctx, sign, { size, progress = 1, ink = '#f3e7c4', glow = 'rgba(232, 190, 110, 0.85)', highlight = null, labels = false, turn = false, background = null, time = 0 } = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height, S = size || Math.min(W, H);
  const R = S * 0.3;
  ctx.save();
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
  ctx.translate(W / 2, H / 2);
  const p = Math.max(0, Math.min(1, progress));
  // Strokes 0..3 take the first 70 %, the ring 70..90 %, the turn 90..100 %.
  const turnT = turn ? ease((p - 0.9) / 0.1) : 0;
  ctx.rotate(-turnT * (sign.dots || 0) * (Math.PI / 2));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.shadowColor = glow; ctx.shadowBlur = S * 0.035;

  // The ring: drawn as two counter-running filaments that meet.
  const ringT = ease((p - 0.7) / 0.2);
  if (ringT > 0) {
    ctx.lineWidth = S * 0.012;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * ringT); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 - Math.PI * ringT, true); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Strokes in reading order, starting where the dots point.
  for (let k = 0; k < 4; k++) {
    const pos = ((sign.dots || 0) + k) % 4;
    const t = ease((p - k * 0.175) / 0.175);
    if (t <= 0) continue;
    const form = sign.forms[pos];
    ctx.save();
    ctx.rotate(pos * (Math.PI / 2));
    ctx.globalAlpha = t;
    const hl = highlight === pos;
    ctx.lineWidth = S * (hl ? 0.026 : 0.02);
    if (hl) { ctx.strokeStyle = '#ffd27a'; ctx.fillStyle = '#ffd27a'; }
    // Ink bleeding outward while it settles (alien, not a pen).
    const bleed = (1 - t) * 0.12;
    ctx.scale(1 + bleed, 1 + bleed);
    (FORM_PATHS[form] || FORM_PATHS[0])(ctx, R);
    if (labels) {
      ctx.shadowBlur = 0; ctx.globalAlpha = 0.9 * t;
      ctx.font = `600 ${Math.round(S * 0.06)}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.save(); ctx.translate(0, -0.7 * R); ctx.rotate(-pos * (Math.PI / 2) + turnT * (sign.dots || 0) * (Math.PI / 2));
      ctx.fillText(String(k + 1), 0, 0); ctx.restore();
    }
    ctx.restore();
  }
  // Core with its dots (they appear first: the Guest marks where to start).
  const coreT = ease(p / 0.08);
  if (coreT > 0) {
    ctx.globalAlpha = coreT;
    ctx.lineWidth = S * 0.008;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2); ctx.stroke();
    const n = sign.dots || 0;
    for (let d = 0; d < n; d++) {
      const pulse = 1 + 0.15 * Math.sin(time * 2 + d);
      ctx.beginPath(); ctx.arc((d - (n - 1) / 2) * R * 0.14, 0, R * 0.05 * pulse, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A small canvas with a finished logogram (vision panel, chronicle). */
export function logogramCanvas(sign, px = 120, opts = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  drawLogogram(c.getContext('2d'), sign, { ...opts, size: px });
  return c;
}
