// ffmpeg helpers: a PNG frame pipe into a near-lossless per-shot intermediate, the final assembly (concat
// or cross-dissolves, audio mux, loudness normalisation, caption burn-in), decoding sounds to float PCM for
// the mixer, and probing. ffmpeg 6.1 with libx264, libass and libopus is assumed (`ffmpeg -version`).
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('ffprobe failed: ' + r.stderr);
  return JSON.parse(r.stdout);
}

/** Decodes any audio file to interleaved stereo float32 at `rate` Hz. */
export function decodePcm(file, rate = 48000) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(rate), 'pipe:1'], { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error('ffmpeg decode failed for ' + file + ': ' + r.stderr);
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, b.length / 4);
}

/** 32-bit float WAV writer (stereo interleaved). */
export function writeWav(path, samples, rate = 48000, channels = 2) {
  const data = Buffer.from(samples.buffer, samples.byteOffset, samples.length * 4);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(channels, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * channels * 4, 28); h.writeUInt16LE(channels * 4, 32); h.writeUInt16LE(32, 34);
  h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

/**
 * Opens an ffmpeg process that takes PNG frames on stdin and writes a near-lossless H.264 4:4:4 intermediate.
 * Returns {write(buf), close()}; write() honours backpressure.
 */
export function openFramePipe(out, { fps = 60, crf = 6, preset = 'faster' } = {}) {
  const args = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-pix_fmt', 'yuv444p', '-r', String(fps), '-g', String(fps), out];
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'pipe'] });
  let err = '', failed = null;
  p.stderr.on('data', (d) => { err += d; });
  p.stdin.on('error', (e) => { failed = e; });
  const done = new Promise((resolve, reject) => { p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg intermediate failed (' + code + '): ' + err)))); });
  return {
    write(buf) { return new Promise((resolve, reject) => { if (failed) return reject(failed); if (!p.stdin.write(buf)) p.stdin.once('drain', resolve); else resolve(); }); },
    close() { p.stdin.end(); return done; },
  };
}

/**
 * Two PNG streams (the 3D frame from the canvas on fd 3, the UI layer with alpha on fd 4) composited into one
 * near-lossless intermediate. Returns {write(canvasPng, uiPng), close()}; write() honours backpressure on both pipes.
 */
export function openLayerPipe(out, { fps = 60, crf = 6, preset = 'faster' } = {}) {
  const args = ['-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:3',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:4',
    '-filter_complex', '[0:v][1:v]overlay=shortest=1:format=auto,format=yuv444p[v]', '-map', '[v]',
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-r', String(fps), '-g', String(fps), out];
  const p = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'pipe', 'pipe', 'pipe'] });
  let err = '', failed = null;
  p.stderr.on('data', (d) => { err += d; });
  const a = p.stdio[3], b = p.stdio[4];
  a.on('error', (e) => { failed = e; }); b.on('error', (e) => { failed = e; });
  const done = new Promise((resolve, reject) => { p.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg intermediate failed (' + code + '): ' + err)))); });
  done.catch(() => {}); // a killed pipe nobody closes must not crash the process; close() still rejects
  // ffmpeg probes input 0 (up to analyzeduration, dozens of frames) before it opens input 1, so waiting for
  // pipe 4 to drain after every frame would deadlock. Frames are queued in Node and only a large backlog waits.
  const drain = (stream) => new Promise((resolve, reject) => { if (failed) return reject(failed); stream.once('drain', resolve); });
  return {
    async write(canvasPng, uiPng) {
      if (failed) throw failed;
      a.write(canvasPng); b.write(uiPng);
      while (!failed && a.writableLength + b.writableLength > 256 * 1024 * 1024) await drain(a.writableLength >= b.writableLength ? a : b);
      if (failed) throw failed;
    },
    close() { a.end(); b.end(); return done; },
    /** Hard stop (a hung shot): the partial intermediate is discarded by the caller. */
    kill() { try { p.kill('SIGKILL'); } catch { /* gone */ } },
  };
}

export function run(args, label = 'ffmpeg') {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-v', 'error', '-stats', ...args], { stdio: ['ignore', 'inherit', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(label + ' failed (' + code + '): ' + err))));
  });
}

/** Escapes a path for use inside an ffmpeg filter argument. */
export const filterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,').replace(/\[/g, '\\[').replace(/\]/g, '\\]');

/**
 * Joins the shot intermediates in order. Each entry {file, duration, transition?: {type:'dissolve'|'fadeblack', duration}}
 * (the transition leads INTO that shot from the previous one). Returns the final offsets per shot.
 */
export function timeline(shots) {
  let t = 0; const out = [];
  shots.forEach((s, i) => {
    const tr = i ? (s.transition && s.transition.duration) || 0 : 0;
    t -= tr;
    out.push({ ...s, start: t });
    t += s.duration;
  });
  return { shots: out, duration: t };
}

/**
 * Final assembly: video from the intermediates (cuts, or xfade for dissolves), audio from the mixed wav,
 * loudness-normalised, optional ASS burn-in, H.264 High 4:2:0 for X and players.
 */
export async function assemble({ shots, audioWav, out, fps = 60, width, height, ass = null, fontsDir = null, crf = 17, preset = 'slow', grain = 0 }) {
  const tl = timeline(shots);
  const inputs = [];
  tl.shots.forEach((s) => inputs.push('-i', s.file));
  if (audioWav) inputs.push('-i', audioWav);
  const chain = [];
  let last = '[0:v]';
  if (tl.shots.length > 1) {
    const anyFade = tl.shots.some((s, i) => i && s.transition && s.transition.duration);
    if (anyFade) {
      let acc = tl.shots[0].duration;
      for (let i = 1; i < tl.shots.length; i++) {
        const tr = tl.shots[i].transition || {};
        const d = tr.duration || 0.0001;
        const kind = tr.type === 'fadeblack' ? 'fadeblack' : tr.type === 'wipe' ? 'wipeleft' : 'fade';
        const offset = Math.max(0, acc - d);
        const outLabel = i === tl.shots.length - 1 ? '[vx]' : `[x${i}]`;
        chain.push(`${last}[${i}:v]xfade=transition=${kind}:duration=${d.toFixed(4)}:offset=${offset.toFixed(4)}${outLabel}`);
        last = outLabel;
        acc = offset + tl.shots[i].duration;
      }
    } else {
      chain.push(tl.shots.map((_, i) => `[${i}:v]`).join('') + `concat=n=${tl.shots.length}:v=1:a=0[vx]`);
      last = '[vx]';
    }
  }
  const post = [];
  if (ass) post.push(`ass=${filterPath(ass)}${fontsDir ? ':fontsdir=' + filterPath(fontsDir) : ''}`);
  if (grain > 0) post.push(`noise=alls=${grain}:allf=t+u`);
  post.push('format=yuv420p');
  chain.push(`${last}${post.join(',')}[vout]`);
  const args = [...inputs, '-filter_complex', chain.join(';'), '-map', '[vout]'];
  if (audioWav) args.push('-map', `${tl.shots.length}:a`, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
  args.push('-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-level', '4.2', '-r', String(fps),
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', '-shortest', out);
  await run(args, 'assemble ' + out);
  return tl;
}
