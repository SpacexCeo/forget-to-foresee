// Post steps for the jury video's motion-graphics shots (docs/submission/jury-video.md):
//  - compositeUnder: a page rendered with alpha laid over another rendered shot that is scaled into a box
//    (the split screen: the browser half under the page's frame and labels);
//  - lumaCheck: the flicker check on an encoded file, measured by ffmpeg (signalstats YAVG per frame). It runs on every
//    intermediate and on the final file, so a page shot passes the same luma test as an in-engine shot.
import { execFileSync } from 'node:child_process';

export function compositeUnder({ page, under, box, width, height, fps, duration, out }) {
  const { x, y, w, h, from = 0 } = box;
  const filter = `color=c=black:s=${width}x${height}:r=${fps}:d=${duration}[bg];` +
    `[1:v]trim=start=${from}:duration=${duration},setpts=PTS-STARTPTS,scale=${w}:${h}:flags=lanczos[u];` +
    `[bg][u]overlay=${x}:${y}:shortest=1[b];[b][0:v]overlay=0:0:format=auto,format=yuv444p[v]`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', page, '-i', under, '-filter_complex', filter, '-map', '[v]', '-t', String(duration),
    '-c:v', 'libx264', '-preset', 'faster', '-crf', '6', '-r', String(fps), out], { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** Per-frame mean luma (0..255) of a video file. */
export function lumaSeries(file) {
  const txt = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=480:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { maxBuffer: 256 << 20 }).toString();
  return [...txt.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Fails on more than `allowJumps` frame-to-frame jumps over `threshold` (cuts count as one jump each). */
export function lumaCheck(file, { threshold = 24, allowJumps = 3 } = {}) {
  const y = lumaSeries(file);
  let jumps = 0, maxJump = 0; const at = [];
  for (let i = 1; i < y.length; i++) { const d = Math.abs(y[i] - y[i - 1]); maxJump = Math.max(maxJump, d); if (d > threshold) { jumps++; at.push(i); } }
  return { ok: jumps <= allowJumps, frames: y.length, jumps, at: at.slice(0, 12), maxJump: +maxJump.toFixed(1), min: +Math.min(...y).toFixed(1), max: +Math.max(...y).toFixed(1) };
}
