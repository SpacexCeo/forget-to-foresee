#!/usr/bin/env node
// Contact sheet of a rendered video: one frame every `--every` seconds (default 1.5), 4 per row, each labelled with its
// time, into one JPEG. Usage: node tools/capture/contact-sheet.mjs <video.mp4> <out.jpg> [--every 1.5] [--cols 4]
import { execFileSync } from 'node:child_process';
const [video, out, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf('--' + k); return i >= 0 ? Number(rest[i + 1]) : d; };
const every = opt('every', 1.5), cols = opt('cols', 4);
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
const n = Math.max(1, Math.floor(dur / every));
const rows = Math.ceil(n / cols);
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const vf = `fps=1/${every},scale=480:-2,drawtext=fontfile=${font}:text='%{pts\\:hms}':x=8:y=8:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=6:margin=6:color=0x0b0f10`;
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(every / 2), '-i', video, '-vf', vf, '-frames:v', '1', '-q:v', '3', out], { stdio: 'inherit' });
console.log(`${out}: ${n} frames, every ${every} s, ${cols}x${rows}`);
