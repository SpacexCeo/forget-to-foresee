// Developer HUD (F3): frame rate, draw calls and triangles against the spec budgets (desktop:
// 60 FPS, <= 120 draw calls, <= 500k triangles), physics and streaming state.
export const BUDGET = Object.freeze({ fps: 60, drawCalls: 120, triangles: 500000 });

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class DevHud {
  constructor(el) {
    this.el = el;
    this.visible = false;
    this.frames = 0; this.acc = 0; this.worst = 0;
    this.fps = 0; this.ms = 0; this.worstMs = 0;
    this.refresh = 0;
    el.hidden = true;
  }

  toggle() { this.visible = !this.visible; this.el.hidden = !this.visible; }

  frame(dt) {
    this.frames++; this.acc += dt; this.worst = Math.max(this.worst, dt);
    if (this.acc >= 0.5) {
      this.fps = this.frames / this.acc; this.ms = (this.acc / this.frames) * 1000; this.worstMs = this.worst * 1000;
      this.frames = 0; this.acc = 0; this.worst = 0;
    }
  }

  /** @param {{info:any, physics:any, streaming:any, camera:any}} s */
  update(dt, s) {
    this.refresh -= dt;
    if (!this.visible || this.refresh > 0) return;
    this.refresh = 0.25;
    const r = s.info.render, m = s.info.memory;
    const warn = (bad, text) => (bad ? `<b class="over">${text}</b>` : text);
    const st = s.streaming;
    const rows = st.list.map((a) => {
      const pct = a.state === 'loading' ? ` ${Math.round(a.progress * 100)}%` : '';
      return `<span class="st-${a.state}" title="${esc(a.error || '')}">${esc(a.name)}: ${a.state}${pct}</span>`;
    }).join('<br>');
    this.el.innerHTML = [
      `<div>${warn(this.fps < BUDGET.fps - 2, this.fps.toFixed(0) + ' FPS')} \u00b7 ${this.ms.toFixed(1)} ms avg \u00b7 ${this.worstMs.toFixed(1)} ms worst</div>`,
      `<div>draw calls ${warn(r.calls > BUDGET.drawCalls, r.calls)} / ${BUDGET.drawCalls}</div>`,
      `<div>triangles ${warn(r.triangles > BUDGET.triangles, r.triangles.toLocaleString('en-US'))} / ${BUDGET.triangles.toLocaleString('en-US')}</div>`,
      `<div>geometries ${m.geometries} \u00b7 textures ${m.textures}</div>`,
      `<div>physics 30 Hz \u00b7 ${s.physics.steps} step(s) this frame \u00b7 ${s.physics.substeps} substeps \u00b7 ${s.physics.colliders} collider tris \u00b7 ${s.physics.grounded ? 'grounded' : 'airborne'}</div>`,
      `<div>camera sweep ${(s.camera.lastSweep * 100).toFixed(0)}%${s.camera.inspect ? ' \u00b7 inspect' : ''}</div>`,
      s.lookdev ? `<div>quality ${esc(s.lookdev.tier)} \u00b7 pixel ratio ${s.lookdev.pixelRatio.toFixed(2)} \u00b7 post ${s.lookdev.post ? 'on' : 'off'}${s.lookdev.reducedMotion ? ' \u00b7 reduced motion' : ''}</div>` : '',
      `<div>assets: ${st.loaded} loaded \u00b7 ${st.loading} loading \u00b7 ${st.cold} cached \u00b7 ${st.absent} no file (greybox) \u00b7 ${st.failed} failed \u00b7 cache ${(st.cachedBytes / 1048576).toFixed(1)} MB</div>`,
      `<div class="assets">${rows}</div>`,
      s.events.length ? `<div class="events">${s.events.map((e) => esc(e.msg)).join('<br>')}</div>` : '',
    ].join('');
  }
}
