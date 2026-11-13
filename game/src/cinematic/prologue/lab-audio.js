// The prologue's sound, synthesised (no files): room tone, the key's click, the device's rising hum, the whoosh of
// the pull, a heartbeat. One AudioContext, made on first use; silent when the browser has none or refuses to start.
// Under it a music bed (`musicUrl`, the owner's pick 13.11: "Computations in a Snowstorm", art/audio/build_music.py)
// streams from the title card and fades out with the whiteout.
export const LAB_MUSIC_VOLUME = 0.32;
export const LAB_MUSIC_FADE_S = 2.5;
export function createLabAudio({ reduced = false, musicUrl = null, makeAudio = (url) => new globalThis.Audio(url), clock = () => performance.now() } = {}) {
  let ac = null, master = null, hum = null, humGain = null, bed = null, fade = 0;
  const bedTo = (target, seconds) => { // a small volume ramp on the bed (HTMLAudio has no gain automation)
    if (!bed) return; clearInterval(fade); const from = bed.volume, t0 = clock(), ms = Math.max(1, seconds * 1000);
    fade = setInterval(() => { if (!bed) return clearInterval(fade); const k = Math.min(1, (clock() - t0) / ms); bed.volume = from + (target - from) * k;
      if (k >= 1) { clearInterval(fade); if (target === 0) { try { bed.pause(); } catch { /* gone */ } bed = null; } } }, 50);
  };
  const startBed = () => {
    if (bed || !musicUrl) return;
    try { bed = makeAudio(musicUrl); bed.loop = true; bed.volume = 0; const p = bed.play(); if (p && p.catch) p.catch(() => { bed = null; }); bedTo(reduced ? LAB_MUSIC_VOLUME * 0.6 : LAB_MUSIC_VOLUME, LAB_MUSIC_FADE_S); } catch { bed = null; }
  };
  const ctx = () => {
    if (ac) return ac;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext; if (!AC) return null;
    try { ac = new AC(); master = ac.createGain(); master.gain.value = reduced ? 0.12 : 0.2; master.connect(ac.destination); if (ac.state === 'suspended') ac.resume().catch(() => {}); } catch { ac = null; }
    return ac;
  };
  const tone = (freq, dur, type = 'sine', gain = 0.5, to = null) => { const a = ctx(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq; if (to) o.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur); g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur); o.connect(g).connect(master); o.start(); o.stop(a.currentTime + dur + 0.05); };
  const noise = (dur, gain = 0.5, from = 400, to = 4000) => { const a = ctx(); if (!a) return; const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(from, a.currentTime); f.frequency.exponentialRampToValueAtTime(to, a.currentTime + dur); const g = a.createGain(); g.gain.setValueAtTime(0.001, a.currentTime); g.gain.linearRampToValueAtTime(gain, a.currentTime + dur * 0.6); g.gain.linearRampToValueAtTime(0.001, a.currentTime + dur); s.connect(f).connect(g).connect(master); s.start(); };
  return {
    cue(id) {
      if (id === 'title') { tone(60, 2.6, 'sine', 0.35); startBed(); }
      else if (id === 'key_press') { tone(1800, 0.05, 'square', 0.3); tone(80, 1.6, 'sine', 0.4, 160); }
      else if (id === 'device_on') { const a = ctx(); if (a && !hum) { hum = a.createOscillator(); humGain = a.createGain(); hum.type = 'sawtooth'; hum.frequency.value = 70; humGain.gain.value = 0.0; hum.connect(humGain).connect(master); hum.start(); } }
      else if (id === 'vortex_start') noise(4.2, 0.6);
      else if (id === 'whiteout') { bedTo(0, LAB_MUSIC_FADE_S); if (hum) { try { hum.stop(); } catch { /* already stopped */ } hum = null; } }
      else if (id === 'heartbeat') { tone(55, 0.18, 'sine', 0.7); }
    },
    /** The hum follows the device's power 0..1. */
    power(p) { if (hum && ac) { hum.frequency.value = 70 + 120 * p; humGain.gain.value = 0.25 * p; } },
    /** The music bed's element (tests, the skip). */
    get bed() { return bed; },
    dispose() { clearInterval(fade); try { if (bed) bed.pause(); if (hum) hum.stop(); if (ac) ac.close(); } catch { /* closed */ } ac = null; hum = null; bed = null; },
  };
}
