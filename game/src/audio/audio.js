// The game's audio runtime on howler.js (MIT, github.com/goldfire/howler.js; docs/licenses/howler.md; owner 14.11:
// "an open-source game audio engine"). Howler owns the AudioContext, unlocks it on the first touch or click on phones
// and streams the licensed music beds (html5 Howls crossfaded with fade()); our graph hangs under Howler.masterGain:
// buses (master/music/sfx, persisted; master is Howler's global volume), ducking under the Guest voice and stingers,
// HRTF panning for 3D sources, zone ambience beds, the tension-keyed music stems, short dips under sound effects.
// howler is imported lazily inside unlock(), so it costs nothing before the first gesture. Without it (Node tests,
// an injected AudioContextClass) the same graph runs on a plain AudioContext and media elements. See docs/audio.md.
import { AUDIO_MANIFEST } from './manifest.js';
import { MUSIC_MANIFEST } from './music-manifest.js';
import { SAMPLE_OVERRIDES } from './sample-manifest.js';
import { SAMPLE_POLISH } from './sample-polish.js';
export { archipelagoMusic, markChapterDone } from './music.js'; // for the archipelago, which loads this module lazily
import { createSafeStorage } from '../ui/storage.js';
import { loadVolumes, saveVolumes, sanitizeVolumes, sliderGain, dbToGain, tensionMix, zoneMix, ZONES as ZONES_WITH_HUM, resolveSound, guestPlan, listenerPose, BUSES } from './mix.js';

const defaultBase = () => {
  let b = '/';
  try { b = import.meta.env?.BASE_URL || '/'; } catch { /* node */ }
  return b.replace(/\/?$/, '/') + 'assets/audio/';
};

const DUCK_KINDS = new Set(['voice', 'sting']);
const VARY_KINDS = new Set(['sfx', 'step', 'ui']);
export const MAX_ONE_SHOTS = 24;      // concurrent non-looping voices; more are dropped (inaudible in a mix anyway)
export const SAME_SOUND_GAP = 0.04;   // seconds; the same sample started again inside this gap is skipped
const DUCK = { music: dbToGain(-9), amb: dbToGain(-6) };
const SFX_DIP = dbToGain(-4); // music under a strike, a hit or a cast: a short dip so the effect reads

/** The generated sound manifest plus the licensed music beds (two generators, one lookup). */
export function withMusic(m, music = MUSIC_MANIFEST) {
  return { ...m, sounds: { ...m.sounds, ...(music?.sounds || {}) } };
}

/** The recorded replacements (CC0, art/audio/samples.py) over the synthesized sounds of the same names. */
export function withSamples(m, over = SAMPLE_OVERRIDES, polish = SAMPLE_POLISH) {
  const sounds = { ...m.sounds };
  for (const [name, o] of Object.entries(over || {})) if (sounds[name]) sounds[name] = { ...sounds[name], file: o.file, dur: o.dur, source: o.source };
  // the trailer pass (art/audio/samples_polish.py): overrides keep the old kind, new sounds bring theirs and their groups
  for (const [name, o] of Object.entries(polish?.sounds || {})) sounds[name] = sounds[name] ? { ...sounds[name], file: o.file, dur: o.dur, source: o.source } : { ...o };
  return { ...m, sounds, groups: { ...(m.groups || {}), ...(polish?.groups || {}) } };
}

export function createAudio(opts = {}) {
  const manifest = opts.manifest || withSamples(withMusic(AUDIO_MANIFEST));
  const base = opts.base || defaultBase();
  const storage = opts.storage || createSafeStorage();
  const AC = opts.AudioContextClass || globalThis.AudioContext || globalThis.webkitAudioContext;
  const doFetch = opts.fetch || ((u) => globalThis.fetch(u));
  const rng = opts.rng || Math.random;

  let vols = loadVolumes(storage);
  let ctx = null, nodes = null, disposed = false;
  const buffers = new Map();       // name -> Promise<AudioBuffer|null>
  const active = new Set();
  const lastStart = new Map();   // sound name -> ctx.currentTime of its last start (repeat guard)
  const lastVariant = new Map();
  let duckCount = 0;
  let zone = null, bed = null, wind = null, tension = 0, music = null, musicStarting = false;
  let musicBed = null, wantBed = null, musicLevel = 1; // the licensed bed playing {name, h}, the one asked for, its level
  // Beds stream through two <audio> elements (a 5-minute piece decoded whole would take ~65 MB); both are primed in
  // the unlock gesture so later crossfades may start them (iOS), and they alternate so two beds can overlap.
  const El = opts.MediaElement === undefined ? globalThis.Audio : opts.MediaElement;
  let streams = null, nextStream = 0;
  const pendingLoops = [];
  let hums = [];                   // one positional amb_shell_hum per Shell (setShellHums)
  // howler (browser only): when an AudioContextClass is injected (tests) the plain path runs
  const useHowler = opts.engine !== false && !opts.AudioContextClass && typeof window !== 'undefined';
  let H = null, unlocking = null;  // {Howler, Howl} once loaded

  const now = () => ctx.currentTime;
  const ramp = (param, v, tc = 0.08) => { try { param.cancelScheduledValues(now()); param.setTargetAtTime(v, now(), tc); } catch { param.value = v; } };

  function buildGraph() {
    const g = () => ctx.createGain();
    const n = { master: g(), music: g(), sfx: g(), musicDuck: g(), musicDip: g(), ambDuck: g(), amb: g(), limiter: ctx.createDynamicsCompressor() };
    try { n.limiter.threshold.value = -3; n.limiter.ratio.value = 12; n.limiter.attack.value = 0.003; n.limiter.release.value = 0.15; } catch { /* optional */ }
    n.musicDuck.connect(n.musicDip); n.musicDip.connect(n.music); n.music.connect(n.master);
    n.amb.connect(n.ambDuck); n.ambDuck.connect(n.sfx); n.sfx.connect(n.master);
    n.master.connect(n.limiter); n.limiter.connect(H ? H.Howler.masterGain : ctx.destination);
    for (const b of BUSES) n[b].gain.value = sliderGain(vols[b]);
    if (H) { n.master.gain.value = 1; H.Howler.volume(sliderGain(vols.master)); }   // master = Howler's global volume (beds too)
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

  /** A short dip of the music under one sound effect (retriggers cleanly: the newest effect sets the release). */
  function dipMusic() {
    const p = nodes?.musicDip?.gain; if (!p) return;
    const t = now();
    try { p.cancelScheduledValues(t); p.setTargetAtTime(SFX_DIP, t, 0.02); p.setTargetAtTime(1, t + 0.25, 0.4); } catch { /* optional */ }
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
    // Voice budget: a crowded town (townsfolk steps, mobs, hits) used to start dozens of one-shots at once and
    // the audio thread dropped out. Cap concurrent one-shots and skip a repeat of the same sound within 40 ms.
    if (ctx && !loop) {
      let shots = 0;
      for (const h of active) if (!h.loop) shots++;
      if (shots >= MAX_ONE_SHOTS) return dummy(name);
      const t = ctx.currentTime, prev = lastStart.get(name);
      if (prev !== undefined && t - prev < SAME_SOUND_GAP) return dummy(name);
      lastStart.set(name, t);
    }
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
      // equalpower, not HRTF: HRTF convolution per voice is the most expensive node in Web Audio and starved
      // the audio thread on integrated GPUs/phones once many positional sounds overlapped.
      Object.assign(panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: meta.ref ?? 3, maxDistance: 250, rolloffFactor: meta.rolloff ?? 1 });
      setPannerPos(panner, o.pos);
      out.connect(panner); panner.connect(busFor(meta.kind));
    } else out.connect(busFor(meta.kind));
    let src = null, stopped = false, resolveEnded;
    const ended = new Promise((r) => { resolveEnded = r; });
    const handle = {
      name, loop, get playing() { return !!src && !stopped; },
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
      if (meta.kind === 'sfx' && o.dip !== false) dipMusic();
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
    for (const k of Object.keys(m)) ramp(music[k].gain.gain, musicBed ? 0 : m[k], 1.2); // a licensed bed replaces the stems
  }

  function primeStreams() {
    if (streams || !El || !ctx.createMediaElementSource) return;
    try {
      streams = [0, 1].map(() => {
        const el = new El(); el.crossOrigin = 'anonymous'; el.loop = true; el.preload = 'auto';
        const out = ctx.createGain(); out.gain.value = 0;
        const src = ctx.createMediaElementSource(el); src.connect(out); out.connect(nodes.musicDuck);
        try { const p = el.play(); if (p && p.catch) p.catch(() => {}); el.pause(); } catch { /* primed or not, carry on */ }
        return { el, out, owner: null };
      });
    } catch { streams = null; }
  }

  /** The streamed bed's level (the music slider and the duck act on the bus it is wired into, see howlBed). */
  function bedVolume(tc = 0.1) {
    if (!H || !musicBed || !musicBed.h.howl) return;
    const howl = musicBed.h.howl; howl.fade(howl.volume(), musicBed.h.level, Math.max(30, tc * 3000));
  }

  /** A looping bed streamed by howler (html5 Howl), faded in and out with Howl.fade. */
  function howlBed(name) {
    const meta = manifest.sounds[name];
    const howl = new H.Howl({ src: [base + meta.file], html5: true, loop: true, volume: 0, preload: true });
    const h = { name, stopped: false, howl, level: 0 };
    // howler streams the file through an <audio> element; it is wired into the music bus so the slider, the duck and
    // the dips act on it like on every other sound (one source node per element, made once)
    howl.on('play', () => {
      for (const snd of howl._sounds || []) {
        const el = snd._node; if (!el || el._ftfWired || !ctx.createMediaElementSource) continue;
        try { el.crossOrigin = 'anonymous'; const src = ctx.createMediaElementSource(el); src.connect(nodes.musicDuck); el._ftfWired = src; } catch { /* plays outside the graph */ }
      }
    });
    howl.play();
    Object.assign(h, {
      get playing() { return !h.stopped; },
      setGain(g, tc = 0.1) { h.level = g; howl.fade(howl.volume(), g, Math.max(30, tc * 3000)); },
      stop(fade = 0.05) {
        if (h.stopped) return; h.stopped = true;
        howl.fade(howl.volume(), 0, Math.max(30, fade * 1000));
        setTimeout(() => { try { howl.unload(); } catch { /* gone */ } }, fade * 1000 + 150);
      },
      ended: Promise.resolve(),
    });
    return h;
  }

  /** A looping bed streamed from its file (falls back to a decoded buffer without media elements, e.g. in Node). */
  function streamBed(name) {
    const meta = manifest.sounds[name];
    if (H) return howlBed(name);
    if (!streams) return play(name, { loop: true, gain: 0 });
    const s = streams[nextStream]; nextStream = 1 - nextStream;
    const h = { name, stopped: false };
    s.owner = h;
    clearTimeout(s.timer);
    ramp(s.out.gain, 0, 0.01);
    s.el.src = base + meta.file;
    try { s.el.currentTime = 0; } catch { /* not loaded yet */ }
    try { const p = s.el.play(); if (p && p.catch) p.catch(() => {}); } catch { /* autoplay refused */ }
    Object.assign(h, {
      get playing() { return !h.stopped; },
      setGain(g, tc = 0.1) { if (s.owner === h) ramp(s.out.gain, g, tc); },
      stop(fade = 0.05) {
        if (h.stopped) return; h.stopped = true;
        if (s.owner !== h) return;
        ramp(s.out.gain, 0, fade / 3);
        s.timer = setTimeout(() => { if (s.owner === h) { try { s.el.pause(); } catch { /* ok */ } s.owner = null; } }, fade * 1000 + 100);
      },
      ended: Promise.resolve(),
    });
    return h;
  }

  /** Crossfades to the wanted licensed bed (or out of it, back to the stems when they run). */
  function applyBed(fade) {
    if (!ctx || (musicBed?.name ?? null) === wantBed) return;
    musicBed?.h.stop(fade);
    musicBed = wantBed ? { name: wantBed, h: streamBed(wantBed) } : null;
    musicBed?.h.setGain(musicLevel, fade / 3);
    bedVolume(fade / 3);
    applyTension();
  }

  let onVis = null;
  const api = {
    /** Create/resume the AudioContext; call from a click/keydown. Safe to call repeatedly. */
    async unlock() {
      if (disposed) return false;
      if (!ctx && useHowler && !H) {
        // howler is fetched on the first gesture; a second click while it loads waits for the same promise
        unlocking ||= import('howler').then((m) => {
          const lib = m.Howler ? m : (m.default || m);
          if (lib.Howler) { lib.Howler.autoSuspend = false; lib.Howler._mobileUnloaded = true; lib.Howler.volume(lib.Howler.volume()); }   // volume() sets up its context
          if (lib.Howler && lib.Howler.usingWebAudio && lib.Howler.ctx) H = { Howler: lib.Howler, Howl: lib.Howl };
        }).catch(() => { /* the plain path below */ });
        await unlocking;
        if (disposed) return false;
      }
      if (!ctx && !H && !AC) return false;
      // Howler's first unlock calls Howler.unload() when the device runs at a sample rate other than 44100 Hz
      // (a Mobile Safari workaround; most desktops run at 48000 Hz). That CLOSES the context our graph was built
      // on and makes a new one, so every game sound went silent right after the arrival scene. Opt out of it,
      // and if the shared context was closed anyway, rebuild the graph on the live one.
      if (H && H.Howler) H.Howler._mobileUnloaded = true;
      if (ctx && H && ctx.state === 'closed' && H.Howler.ctx && H.Howler.ctx !== ctx) {
        try { nodes?.limiter.disconnect(); } catch { /* ok */ }
        ctx = null; buffers.clear();
      }
      if (!ctx) {
        ctx = H ? H.Howler.ctx : new AC({ latencyHint: 'interactive' });
        nodes = buildGraph();
        if (typeof document !== 'undefined' && document.addEventListener) {
          onVis = () => { if (document.hidden) ctx.suspend?.(); else ctx.resume?.(); };
          document.addEventListener('visibilitychange', onVis);
        }
        for (const nm of ['ui_click', 'ui_hover', 'ui_confirm', 'amb_wind']) load(nm);
        for (const e of pendingLoops.splice(0)) { const inner = play(e.nameOrGroup, { ...e.o, pos: e.h.pos, gain: e.h.gain }); e.h.inner = inner; }
        applyZone();
        if (!H) primeStreams();
        applyBed(1.5);
        if (opts.music !== false) startMusic();
      }
      try { await ctx.resume?.(); } catch { /* ignore */ }
      return true;
    },
    play,
    /** Schedule the Guest voice along a logogram: strokes = ['arc', ...] or [{stroke, dur}]. */
    speakStrokes(strokes, o = {}) { return guestPlan(manifest, strokes).map((s) => play(s.name, { ...o, rate: s.rate, delay: (o.delay ?? 0) + s.at })); },
    setTension(t) { tension = Math.min(100, Math.max(0, +t || 0)); if (ctx && !music) startMusic(); applyTension(); },
    /** The licensed music bed (a manifest name, or null for none); crossfades over `fade` s, queued until unlock. */
    setMusic(name, fade = 2.5) { wantBed = name && manifest.sounds[name] ? name : null; applyBed(fade); },
    /** The bed's level (1 normal; a little above while monsters chase her), eased over `tc` s. */
    setMusicLevel(l, tc = 1.5) { musicLevel = Math.max(0, +l || 0); musicBed?.h.setGain(musicLevel, tc); },
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
      if (H && bus === 'master') H.Howler.volume(sliderGain(vols.master));
      else if (nodes) ramp(nodes[bus].gain, sliderGain(vols[bus]), 0.05);
    },
    getVolumes() { return { ...vols }; },
    /** Decodes sounds ahead of time; a group name loads every variant (steps must not miss their first beat). */
    preload(names) {
      if (!ctx) return Promise.resolve([]);
      const all = names.flatMap((n) => manifest.groups?.[n] || [n]).filter((n) => manifest.sounds?.[n]);
      return Promise.all(all.map(load));
    },
    get context() { return ctx; },
    get engine() { return H ? 'howler' : ctx ? 'webaudio' : null; },
    get state() { return { unlocked: !!ctx, engine: H ? 'howler' : ctx ? 'webaudio' : null, zone, tension, active: active.size, ducked: duckCount > 0, music: !!music, musicBed: musicBed?.name ?? null, bed: bed?.name ?? null, hums: hums.length }; },
    _nodes: () => nodes, _music: () => music,
    dispose() {
      disposed = true;
      for (const h of [...active]) h.stop(0);
      if (music) for (const m of Object.values(music)) { try { m.src.stop(); } catch { /* ok */ } }
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      if (musicBed?.h.howl) { try { musicBed.h.howl.unload(); } catch { /* ok */ } }
      if (!H) { try { ctx?.close(); } catch { /* ok */ } } else { try { nodes?.limiter.disconnect(); } catch { /* ok */ } }   // Howler's context is shared: leave it open
      if (streams) for (const s of streams) { clearTimeout(s.timer); try { s.el.pause(); s.el.removeAttribute('src'); } catch { /* ok */ } }
      ctx = null; nodes = null; music = null; musicBed = null; streams = null;
    },
  };
  return api;
}
