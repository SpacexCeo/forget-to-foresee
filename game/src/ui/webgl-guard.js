// WebGL capability check before the heavy world chunk loads (audit QW-5). Without WebGL 2 the boot screen says so and
// offers the paths that need no GPU; with a software renderer (SwiftShader, llvmpipe, Microsoft Basic Render) a short
// note says what to expect. It never blocks a working GPU path. ?forceNoGL=1 forces the failure (QA).
const REPO = 'https://github.com/SpacexCeo/forget-to-foresee';
export const NO_GPU_LINKS = Object.freeze([
  { label: 'Run it without a GPU (README)', href: `${REPO}#no-gpu` },
  { label: 'The agent API in one minute', href: `${REPO}#agent-api` },
  { label: 'The 60-second video', href: `${REPO}/blob/main/docs/media/jury.mp4` },
]);
export const NO_GL_TEXT = 'This game needs a desktop browser with WebGL 2.';
export const SOFTWARE_TEXT = 'Software rendering detected: expect a low frame rate; the game still completes.';

/** True for renderer strings of software rasterizers. */
export function isSoftwareRenderer(renderer) {
  return /swiftshader|llvmpipe|softpipe|microsoft basic render|software rasterizer|mesa offscreen/i.test(String(renderer || ''));
}

/**
 * Probes a throwaway canvas. Returns {ok, renderer, software}.
 * @param {Document} doc @param {{force?: boolean}} [o]
 */
export function detectWebGL(doc, { force = false } = {}) {
  if (force) return { ok: false, renderer: null, software: false };
  let gl = null;
  try { gl = doc.createElement('canvas').getContext('webgl2'); } catch { gl = null; }
  if (!gl) return { ok: false, renderer: null, software: false };
  let renderer = null;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  } catch { renderer = null; }
  try { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } catch { /* ignore */ }
  return { ok: true, renderer, software: isSoftwareRenderer(renderer) };
}

/** The links under the failure message on the boot screen. */
export function appendNoGpuLinks(doc, root) {
  if (!root) return null;
  const ul = doc.createElement('ul'); ul.className = 'boot-nogl';
  for (const l of NO_GPU_LINKS) { const li = doc.createElement('li'); const a = doc.createElement('a'); a.href = l.href; a.textContent = l.label; a.target = '_blank'; a.rel = 'noopener'; li.append(a); ul.append(li); }
  const sub = root.querySelector ? root.querySelector('.boot-sub') : null;
  if (sub && sub.after) sub.after(ul); else root.append(ul);
  return ul;
}

/** A one-line note at the top of the page that fades after `ms`. */
export function showSoftwareNote(doc, ms = 12000) {
  const n = doc.createElement('div'); n.className = 'ftf-swnote'; n.setAttribute('role', 'status'); n.textContent = SOFTWARE_TEXT;
  const narrow = ((doc.defaultView && doc.defaultView.innerWidth) || 1280) < 700; // phones: at the bottom, clear of the HUD
  n.style.cssText = 'position:fixed;left:4vw;right:4vw;margin:0 auto;width:fit-content;max-width:640px;text-align:center;' + (narrow ? 'bottom:10px;' : 'top:10px;') + 'z-index:50;padding:6px 12px;border-radius:8px;background:rgba(10,14,16,.82);color:#f3efe6;font:13px/1.3 system-ui,sans-serif;pointer-events:none';
  doc.body.append(n);
  setTimeout(() => n.remove(), ms);
  return n;
}
