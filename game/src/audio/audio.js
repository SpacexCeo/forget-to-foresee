// WebAudio runtime: buses (master/music/sfx, persisted), ducking under the Guest voice and stingers,
// HRTF panning for 3D sources, zone ambience beds and the tension-keyed music stems.
// Nothing touches WebAudio until unlock() (call it from a user gesture). See docs/audio.md.
import { AUDIO_MANIFEST } from './manifest.js';
import { createSafeStorage } from '../ui/storage.js';
import { loadVolumes, saveVolumes, sanitizeVolumes, sliderGain, dbToGain, tensionMix, zoneMix, ZONES as ZONES_WITH_HUM, resolveSound, guestPlan, listenerPose, BUSES } from './mix.js';

const defaultBase = () => {
  let b = '/';
  try { b = import.meta.env?.BASE_URL || '/'; } catch { /* node */ }
  return b.replace(/\/?$/, '/') + 'assets/audio/';
};

const DUCK_KINDS = new Set(['voice', 'sting']);
const VARY_KINDS = new Set(['sfx', 'step', 'ui']);
const DUCK = { music: dbToGain(-9), amb: dbToGain(-6) };

export function createAudio(opts = {}) {
  const manifest = opts.manifest || AUDIO_MANIFEST;
  const base = opts.base || defaultBase();
  const storage = opts.storage || createSafeStorage();
  const AC = opts.AudioContextClass || globalThis.AudioContext || globalThis.webkitAudioContext;
  const doFetch = opts.fetch || ((u) => globalThis.fetch(u));
  const rng = opts.rng || Math.random;

  let vols = loadVolumes(storage);
  let ctx = null, nodes = null, disposed = false;
  const buffers = new Map();       // name -> Promise<AudioBuffer|null>
  const active = new Set();
  const lastVariant = new Map();
  let duckCount = 0;
  let zone = null, bed = null, wind = null, tension = 0, music = null, musicStarting = false;
  const pendingLoops = [];
  let hums = [];                   // one positional amb_shell_hum per Shell (setShellHums)

  const now = () => ctx.currentTime;
  const ramp = (param, v, tc = 0.08) => { try { param.cancelScheduledValues(now()); param.setTargetAtTime(v, now(), tc); } catch { param.value = v; } };

  function buildGraph() {
    const g = () => ctx.createGain();
    const n = { master: g(), music: g(), sfx: g(), musicDuck: g(), ambDuck: g(), amb: g(), limiter: ctx.createDynamicsCompressor() };
    try { n.limiter.threshold.value = -3; n.limiter.ratio.value = 12; n.limiter.attack.value = 0.003; n.limiter.release.value = 0.15; } catch { /* optional */ }
    n.musicDuck.connect(n.music); n.music.connect(n.master);
    n.amb.connect(n.ambDuck); n.ambDuck.connect(n.sfx); n.sfx.connect(n.master);
    n.master.connect(n.limiter); n.limiter.connect(ctx.destination);
    for (const b of BUSES) n[b].gain.value = sliderGain(vols[b]);
    return n;
  }

  function load(name) {
    if (buffers.has(name)) return buffers.get(name);
    const meta = manifest.sounds[name];
    const p = (async () => {
      if (!meta || !ctx) return null;
      try {
        const res = await doFetch(base + meta.file);
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      } catch { return null; }
    })();
    buffers.set(name, p);
    return p;
  }

  function busFor(kind) { return kind === 'music' ? nodes.musicDuck : kind === 'amb' ? nodes.amb : nodes.sfx; }

  function duck(on) {
    duckCount = Math.max(0, duckCount + (on ? 1 : -1));
    const d = duckCount > 0;
    ramp(nodes.musicDuck.gain, d ? DUCK.music : 1, d ? 0.05 : 0.4);
    ramp(nodes.ambDuck.gain, d ? DUCK.amb : 1, d ? 0.05 : 0.4);
  }

  const setPannerPos = (pn, p) => {
    const [x, y, z] = Array.isArray(p) ? p : [p.x, p.y, p.z];
    if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } else pn.setPosition?.(x, y, z);
  };

  const dummy = (name) => ({ name, playing: false, stop() {}, setPosition() {}, setGain() {}, ended: Promise.resolve() });

  /** play(name|group, {pos, loop, gain, rate, delay}) -> handle {stop(fade), setPosition(p), setGain(g)} */
  function play(nameOrGroup, o = {}) {
    if (disposed) return dummy(nameOrGroup);
    const name = resolveSound(manifest, nameOrGroup, rng, lastVariant.get(nameOrGroup));
    if (!name) return dummy(nameOrGroup);
    if (name !== nameOrGroup) lastVariant.set(nameOrGroup, name);
    const meta = manifest.sounds[name];
    const loop = o.loop ?? !!meta.loop;
    if (!ctx) {
      if (!loop) return dummy(name);
      const h = { name, playing: false, inner: null, pos: o.pos, gain: o.gain,
        stop() { const i = pendingLoops.indexOf(entry); if (i >= 0) pendingLoops.splice(i, 1); h.inner?.stop(); },
        setPosition(p) { h.pos = p; h.inner?.setPosition(p); }, setGain(g) { h.gain = g; h.inner?.setGain(g); }, ended: Promise.resolve() };
      const entry = { h, nameOrGroup: name, o };
      pendingLoops.push(entry);
      return h;
    }
    const out = ctx.createGain();
    out.gain.value = o.gain ?? 1;
    let panner = null;
    if (o.pos) {
      panner = ctx.createPanner();
      Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: meta.ref ?? 3, maxDistance: 250, rolloffFactor: meta.rolloff ?? 1 });
      setPannerPos(panner, o.pos);
      out.connect(panner); panner.connect(busFor(meta.kind));
    } else out.connect(busFor(meta.kind));
    let src = null, stopped = false, resolveEnded;
    const ended = new Promise((r) => { resolveEnded = r; });
    const handle = {
      name, get playing() { return !!src && !stopped; },
      stop(fade = 0.05) {
        if (stopped) return; stopped = true;
        if (src) { ramp(out.gain, 0, fade / 3); try { src.stop(now() + fade); } catch { /* ok */ } } else finish();
      },
      setPosition(p) { if (panner) setPannerPos(panner, p); },
      setGain(g, tc = 0.1) { ramp(out.gain, g, tc); },
      ended, gainNode: out,
    };
    const ducks = DUCK_KINDS.has(meta.kind) && o.duck !== false;
    function finish() {
      active.delete(handle);
      if (ducks && handle._ducked) duck(false);
      try { out.disconnect(); panner?.disconnect(); } catch { /* ok */ }
      resolveEnded();
    }
    const t0 = ctx.currentTime;
    load(name).then((buf) => {
      if (!buf || stopped || disposed) { finish(); return; }
      const late = ctx.currentTime - t0;
      if (!loop && VARY_KINDS.has(meta.kind) && late > 0.3) { finish(); return; } // too late to matter
      src = ctx.createBufferSource();
      src.buffer = buf;
      if (loop) { src.loop = true; src.loopStart = 0; src.loopEnd = Math.min(buf.duration, meta.dur); }
      const vary = VARY_KINDS.has(meta.kind) ? 1 + (rng() - 0.5) * 0.06 : 1;
      src.playbackRate.value = (o.rate ?? 1) * vary;
      src.connect(out);
      src.onended = finish;
      if (ducks) { handle._ducked = true; duck(true); }
      src.start(ctx.currentTime + Math.max(0, (o.delay ?? 0) - late));
    });
    active.add(handle);
    return handle;
  }

  function applyZone() {
    if (!ctx || !zone) return;
    const m = zoneMix(zone);
    if (!wind) wind = play('amb_wind', { loop: true, gain: 0 });
    wind.setGain(m.wind, 0.8);
    if ((bed?.name ?? null) !== m.bed) {
      bed?.stop(2.5);
      bed = m.bed ? play(m.bed, { loop: true, gain: 0 }) : null;
      bed?.setGain(1, 0.8);
    }
    for (const h of hums) h.setGain(m.hum, 1.5);
  }

  async function startMusic() {
    if (music || musicStarting || !ctx) return;
    musicStarting = true;
    const names = ['mus_calm', 'mus_uneasy', 'mus_crisis'];
    const bufs = await Promise.all(names.map(load));
    if (disposed || bufs.some((b) => !b)) { musicStarting = false; return; }
    const at = ctx.currentTime + 0.1;
    music = {};
    names.forEach((nm, i) => {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(nodes.musicDuck);
      const s = ctx.createBufferSource(); s.buffer = bufs[i]; s.loop = true; s.loopEnd = Math.min(bufs[i].duration, manifest.sounds[nm].dur);
      s.connect(g); s.start(at);
      music[nm.slice(4)] = { src: s, gain: g };
    });
    musicStarting = false;
    applyTension();
  }

  function applyTension() {
    if (!music) return;
    const m = tensionMix(tension);
    for (const k of Object.keys(m)) ramp(music[k].gain.gain, m[k], 1.2);
  }

  let onVis = null;
  const api = {
    /** Create/resume the AudioContext; call from a click/keydown. Safe to call repeatedly. */
    async unlock() {
      if (disposed || !AC) return false;
      if (!ctx) {
        ctx = new AC({ latencyHint: 'interactive' });
        nodes = buildGraph();
        if (typeof document !== 'undefined' && document.addEventListener) {
          onVis = () => { if (document.hidden) ctx.suspend?.(); else ctx.resume?.(); };
          document.addEventListener('visibilitychange', onVis);
        }
        for (const nm of ['ui_click', 'ui_hover', 'ui_confirm', 'amb_wind']) load(nm);
        for (const e of pendingLoops.splice(0)) { const inner = play(e.nameOrGroup, { ...e.o, pos: e.h.pos, gain: e.h.gain }); e.h.inner = inner; }
        applyZone();
        if (opts.music !== false) startMusic();
      }
      try { await ctx.resume?.(); } catch { /* ignore */ }
      return true;
    },
    play,
    /** Schedule the Guest voice along a logogram: strokes = ['arc', ...] or [{stroke, dur}]. */
    speakStrokes(strokes, o = {}) { return guestPlan(manifest, strokes).map((s) => play(s.name, { ...o, rate: s.rate, delay: (o.delay ?? 0) + s.at })); },
    setTension(t) { tension = Math.min(100, Math.max(0, +t || 0)); if (ctx && !music) startMusic(); applyTension(); },
    setZone(z) { const m = zoneMix(z); if (zone && zoneMix(zone).zone === m.zone) return; zone = m.zone; applyZone(); },
    /**
     * One positional Shell hum per position ([x, y, z] of each Shell). Loops queue until unlock(); their
     * level follows the zone (`zoneMix(zone).hum`: full on the plaza and bridges, lower at a camp, off inside).
     */
    setShellHums(positions) {
      for (const h of hums) h.stop(1);
      // No loop is started while every zone's hum level is 0 (owner 09.11: no constant drone).
      const level = (z) => zoneMix(z).hum;
      if (!ZONES_WITH_HUM.some((z) => level(z) > 0)) { hums = []; return hums; }
      hums = (positions || []).map((pos) => play('amb_shell_hum', { pos, loop: true, gain: zone ? level(zone) : 1 }));
      return hums;
    },
    setListener(camera, target) {
      if (!ctx) return;
      const { pos, forward, up } = listenerPose(camera, target);
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = pos[0]; L.positionY.value = pos[1]; L.positionZ.value = pos[2];
        L.forwardX.value = forward[0]; L.forwardY.value = forward[1]; L.forwardZ.value = forward[2];
        L.upX.value = up[0]; L.upY.value = up[1]; L.upZ.value = up[2];
      } else { L.setPosition?.(...pos); L.setOrientation?.(...forward, ...up); }
    },
    setVolume(bus, v) {
      if (!BUSES.includes(bus)) return;
      vols = sanitizeVolumes({ ...vols, [bus]: v });
      saveVolumes(storage, vols);
      if (nodes) ramp(nodes[bus].gain, sliderGain(vols[bus]), 0.05);
    },
    getVolumes() { return { ...vols }; },
    /** Decodes sounds ahead of time; a group name loads every variant (steps must not miss their first beat). */
    preload(names) {
      if (!ctx) return Promise.resolve([]);
      const all = names.flatMap((n) => manifest.groups?.[n] || [n]).filter((n) => manifest.sounds?.[n]);
      return Promise.all(all.map(load));
    },
    get context() { return ctx; },
    get state() { return { unlocked: !!ctx, zone, tension, active: active.size, ducked: duckCount > 0, music: !!music, bed: bed?.name ?? null, hums: hums.length }; },
    _nodes: () => nodes, _music: () => music,
    dispose() {
      disposed = true;
      for (const h of [...active]) h.stop(0);
      if (music) for (const m of Object.values(music)) { try { m.src.stop(); } catch { /* ok */ } }
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      try { ctx?.close(); } catch { /* ok */ }
      ctx = null; nodes = null; music = null;
    },
  };
  return api;
}
