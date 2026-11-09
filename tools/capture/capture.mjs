#!/usr/bin/env node
// Forget to Foresee: deterministic video capture (docs/submission/trailer.md).
//
//   node tools/capture/capture.mjs <video> [options]        render one video (demo | trailer | clip-*)
//   node tools/capture/capture.mjs <video> --check          validate the script only (cameras, captions)
//   node tools/capture/capture.mjs --list                   list the videos and their shots
//
// Options: --out <dir> (default docs/media)  --work <dir> (frames, intermediates; default the OS temp dir)
//          --width --height --fps  --tier ultra|high|low  --parallel <n>  --shots a,b  --sample <n>
//          --base <url> (a running game dev server; default: start `vite` from game/)  --gpu  --smoke  --resume
//          --probe a-b (GPU diagnosis: frames a..b with each post pass off, target sizes; stops after b)
//          --draft (720p, low tier: what this container can do)   --final (1080p, ultra: for a GPU machine)
// Every shot is a fresh page: the game state comes from the shot's `setup`, the frames from its scripted
// camera and actions, so a re-render of one shot is exact and the shots can be rendered in parallel.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { renderShot } from './lib/browser.mjs';
import { renderPage } from './lib/page.mjs';
import { compositeUnder, compositePlate, lumaCheck } from './lib/compose.mjs';
import { mixVideo } from './lib/mix.mjs';
import { toSrt, toAss, checkCaptions } from './lib/subtitles.mjs';
import { assemble, timeline, ffprobe } from './lib/ffmpeg.mjs';
import { prepareFonts } from './lib/fonts.mjs';
import { compileCamera, minHeight, maxStep } from '../../game/src/cinematic/camera.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const GAME = join(ROOT, 'game');

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next != null && !next.startsWith('--')) { o[k] = next; i++; } else o[k] = true;
  }
  return o;
}

async function loadVideo(name) {
  const file = join(HERE, 'shots', name + '.mjs');
  if (!existsSync(file)) throw new Error('no video script ' + file);
  const m = await import('file://' + file);
  return m.default;
}

function listVideos() { return readdirSync(join(HERE, 'shots')).filter((f) => /\.mjs$/.test(f) && f !== 'common.mjs').map((f) => f.replace(/\.mjs$/, '')); }

/** Static checks: camera moves compile and stay above the ground, actions in range, captions readable. */
export function checkVideo(v) {
  const problems = [];
  const tl = timeline(v.shots.filter((s) => !s.hidden).map((s) => ({ duration: s.duration, transition: s.transition })));
  v.shots.forEach((s, i) => {
    if (!(s.duration > 0)) problems.push(`${s.name}: no duration`);
    const cams = Array.isArray(s.camera) ? s.camera : s.camera ? [{ from: 0, to: s.duration, ...s.camera }] : [];
    for (const c of cams) {
      try {
        const pose = compileCamera(c);
        if (pose) {
          const h = minHeight(pose);
          if (h < (c.minHeight ?? 1.2) && !c.allowLow) problems.push(`${s.name}: camera "${c.type}" dips to ${h.toFixed(2)} m`);
          const step = maxStep(pose);
          if (step > 2.5) problems.push(`${s.name}: camera "${c.type}" jumps ${step.toFixed(2)} m between samples`);
        }
      } catch (e) { problems.push(`${s.name}: camera ${e.message}`); }
      if (c.from != null && c.to != null && c.to > s.duration + 1e-6) problems.push(`${s.name}: camera segment ends after the shot`);
    }
    for (const a of s.actions || []) if (a.at != null && a.at > s.duration) problems.push(`${s.name}: action ${a.do} at ${a.at} is after the shot ends`);
    for (const ov of s.overlays || []) if (ov.to != null && ov.to > s.duration + 1.5) problems.push(`${s.name}: overlay ${ov.kind} ends at ${ov.to} after the shot`);
    void i;
  });
  problems.push(...checkCaptions(v.captions || [], tl.duration, v.reading));
  // In-picture captions of in-engine shots obey the same reading rule.
  if (v.reading) for (const s of v.shots) for (const ov of s.overlays || []) if (ov.kind === 'caption') problems.push(...checkCaptions([{ ...ov, text: ov.text.replace(/\*/g, '') }], s.duration + 1, v.reading).map((p) => `${s.name}: ${p}`));
  return { problems, duration: tl.duration, starts: tl.shots.map((s, i) => ({ name: v.shots.filter((x) => !x.hidden)[i].name, start: +s.start.toFixed(3) })) };
}

async function startDevServer(log) {
  const port = 5179;
  const p = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--clearScreen', 'false'], { cwd: GAME, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite did not start')), 60_000);
    const onData = (d) => { if (String(d).includes('Local:')) { clearTimeout(timer); resolve(); } };
    p.stdout.on('data', onData); p.stderr.on('data', (d) => log(String(d).trim()));
    p.on('exit', (c) => reject(new Error('vite exited ' + c)));
  });
  log(`dev server on http://localhost:${port}`);
  return { base: `http://localhost:${port}`, stop: () => p.kill() };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k], k); } }));
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);
  if (args.list) { for (const n of listVideos()) { const v = await loadVideo(n); console.log(`${n}: ${v.title} · ${v.shots.length} shots · ${checkVideo(v).duration.toFixed(1)} s · ${v.shots.map((s) => s.name).join(', ')}`); } return; }
  const name = args._[0];
  if (!name) { console.log('usage: node tools/capture/capture.mjs <video> [--check] [--draft|--final] ...  (--list for the videos)'); process.exit(2); }
  const video = await loadVideo(name);
  const check = checkVideo(video);
  if (args.check) {
    console.log(JSON.stringify(check, null, 1));
    process.exit(check.problems.length ? 1 : 0);
  }
  if (check.problems.length) { console.error('script problems:\n  ' + check.problems.join('\n  ')); process.exit(1); }

  const preset = args.final ? { width: 1920, height: 1080, tier: 'ultra' } : args.draft ? { width: 1280, height: 720, tier: 'low' } : {};
  const width = Number(args.width || preset.width || video.width || 1920), height = Number(args.height || preset.height || video.height || 1080);
  const fps = Number(args.fps || video.fps || 60), tier = args.tier || preset.tier || 'ultra';
  const parallel = Number(args.parallel || 2);
  const outDir = resolve(args.out || (args.smoke ? join(tmpdir(), 'ftf-capture', 'smoke-out') : join(ROOT, 'docs/media')));
  const work = resolve(args.work || join(tmpdir(), 'ftf-capture'), name + `-${width}x${height}-${tier}`);
  mkdirSync(work, { recursive: true }); mkdirSync(outDir, { recursive: true });
  let shots = video.shots;
  if (args.shots) { const want = String(args.shots).split(','); shots = shots.filter((s) => want.includes(s.name)); }
  if (args.smoke) shots = shots.map((s) => ({ ...s, duration: Math.min(s.duration, 1.5), actions: (s.actions || []).filter((a) => a.at == null || a.at <= 1.5) }));
  log(`${video.title}: ${shots.length} shots at ${width}x${height}@${fps} tier ${tier}, work ${work}`);

  const server = args.base ? { base: args.base, stop() {} } : await startDevServer(log);
  const results = [];
  try {
    const list = await pool(shots, parallel, async (shot) => {
      const jsonPath = join(work, shot.name + '.json');
      if (args.resume && existsSync(jsonPath) && existsSync(join(work, shot.name + '.mp4'))) { log(`[${shot.name}] reusing ${jsonPath}`); return JSON.parse(readFileSync(jsonPath, 'utf8')); }
      // A failed shot (watchdog kill, context loss, a frame that stays bad) is rendered again in a fresh browser.
      const attempts = Number(process.env.FTF_SHOT_ATTEMPTS || 3);
      for (let k = 1; ; k++) {
        try { return await renderOnce(); } catch (e) {
          if (k >= attempts || args.probe) throw e;
          log(`[${shot.name}] attempt ${k} failed: ${String(e.message).split('\n')[0]} · retrying (${k + 1}/${attempts})`);
        }
      }
      function renderOnce() { if (shot.page) return renderPage({ shot, baseUrl: server.base, outDir: work, opts: { width, height, fps, sampleEvery: Number(args.sample || 0), log } }); return renderShot({ shot, baseUrl: server.base, outDir: work, opts: { width, height, fps, tier, gpu: !!args.gpu, sampleEvery: Number(args.sample || 0), log, probe: args.probe ? { from: Number(String(args.probe).split('-')[0]), to: Number(String(args.probe).split('-')[1] ?? String(args.probe).split('-')[0]) } : null } }); }
    });
    results.push(...list);
  } finally { server.stop(); }
  // Page shots with `plate` or `under` were rendered with alpha: composite each over its (hidden) source shot(s).
  for (const s of shots) if (s.page && (s.plate || s.under)) {
    const src = s.under ? shots.find((x) => x.name === s.under.shot) : null;
    if (s.under && !src) throw new Error(`${s.name}: under-shot ${s.under.shot} is not in this render`);
    if (s.plate) {
      const pl = shots.find((x) => x.name === s.plate.shot);
      if (!pl) throw new Error(`${s.name}: plate shot ${s.plate.shot} is not in this render`);
      compositePlate({ page: join(work, s.name + '.mkv'), plate: join(work, pl.name + '.mp4'), under: src ? join(work, src.name + '.mp4') : null, box: s.under || null,
        width, height, fps, duration: s.duration, out: join(work, s.name + '.mp4'), from: s.plate.from ?? 0, slow: s.plate.slow ?? 1, dim: s.plate.dim ?? 0.58, blur: s.plate.blur ?? 2 });
      log(`[${s.name}] composited over plate ${pl.name}${src ? ` and ${src.name}` : ''}`);
    } else {
      compositeUnder({ page: join(work, s.name + '.mkv'), under: join(work, src.name + '.mp4'), box: s.under, width, height, fps, duration: s.duration, out: join(work, s.name + '.mp4') });
      log(`[${s.name}] composited over ${src.name}`);
    }
  }
  for (const r of results) if (r && r.shot) { const f = join(work, r.shot + '.mp4'); if (existsSync(f)) { r.luma = lumaCheck(f, { allowJumps: shots.find((x) => x.name === r.shot)?.allowJumps ?? 3 }); if (!r.luma.ok) throw new Error(`luma check failed on ${r.shot}: ${JSON.stringify(r.luma)}`); } }
  if (args.shots) { log('partial render finished (no assembly): ' + results.map((r) => `${r.shot} ${r.frames}f`).join(', ')); writeFileSync(join(work, 'partial.json'), JSON.stringify(results, null, 1)); return; }

  // Assembly: timeline → mix → captions → encode (clean + captioned).
  const visible = shots.map((s, i) => [s, results[i]]).filter(([s]) => !s.hidden);
  shots = visible.map(([s]) => s); results.splice(0, results.length, ...visible.map(([, r]) => r));
  const tl = timeline(shots.map((s, i) => ({ name: s.name, file: join(work, s.name + '.mp4'), duration: s.duration, transition: s.transition, cues: results[i].cues, camLog: results[i].camLog })));
  log(`timeline ${tl.duration.toFixed(2)} s: ` + tl.shots.map((s) => `${s.name}@${s.start.toFixed(1)}`).join(' '));
  const wav = join(work, name + '.wav');
  const mix = mixVideo({ shots: tl.shots, duration: tl.duration, assetsDir: join(GAME, 'public/assets/audio'), cacheDir: join(dirname(work), 'pcm-cache'), out: wav, music: video.music || {} });
  log(`mix: ${mix.events} sound events from ${mix.cues} cues, peak ${mix.peak.toFixed(3)}`);
  const captions = video.captions || [];
  const srt = join(outDir, name + '.srt');
  writeFileSync(srt, toSrt(captions));
  const fontsDir = join(dirname(work), 'fonts');
  prepareFonts(['source-sans-3-latin-400-normal', 'source-sans-3-latin-500-normal', 'source-sans-3-latin-600-normal'].map((f) => join(GAME, 'node_modules/@fontsource/source-sans-3/files', f + '.woff')).concat(['libre-caslon-text-latin-400-normal', 'libre-caslon-text-latin-700-normal'].map((f) => join(GAME, 'node_modules/@fontsource/libre-caslon-text/files', f + '.woff'))), fontsDir);
  const ass = join(work, name + '.ass');
  writeFileSync(ass, toAss(captions, { width, height }));
  const clean = join(outDir, name + '.mp4'), captioned = join(outDir, name + '-captions.mp4');
  const enc = { fps, width, height, crf: video.output?.crf ?? 17, preset: video.output?.preset ?? 'slow', grain: video.output?.grain ?? 0 };
  await assemble({ shots: tl.shots, audioWav: wav, out: clean, ...enc });
  await assemble({ shots: tl.shots, audioWav: wav, out: captioned, ass, fontsDir, ...enc });
  const finalLuma = lumaCheck(clean, { allowJumps: tl.shots.length + 2 + shots.reduce((n, s) => n + (s.allowJumps ?? 0), 0) });
  log(`final luma: ${JSON.stringify(finalLuma)}`);
  const report = { finalLuma, video: name, title: video.title, width, height, fps, tier, duration: tl.duration, shots: results.map((r) => ({ shot: r.shot, frames: r.frames, secondsPerFrame: r.secondsPerFrame, loaded: r.loaded, setupFrames: r.setupFrames, errors: r.errors, consoleErrors: r.consoleErrors, hashes: r.hashes })), mix, files: {} };
  for (const f of [clean, captioned, srt]) { const st = statSync(f); const pr = f.endsWith('.mp4') ? ffprobe(f) : null; report.files[f] = { bytes: st.size, mb: +(st.size / 1048576).toFixed(1), duration: pr ? +pr.format.duration : null, video: pr ? pr.streams.find((s) => s.codec_type === 'video') : null }; }
  writeFileSync(join(work, name + '.report.json'), JSON.stringify(report, null, 1));
  copyFileSync(join(work, name + '.report.json'), join(outDir, name + '.report.json'));
  log('done:\n' + Object.entries(report.files).map(([f, v]) => `  ${f}: ${v.mb} MB${v.duration ? ` · ${v.duration.toFixed(2)} s · ${v.video.width}x${v.video.height} ${v.video.r_frame_rate}` : ''}`).join('\n'));
  const errs = results.flatMap((r) => r.errors.map((e) => r.shot + ': ' + e));
  if (errs.length) log('runner errors:\n  ' + errs.join('\n  '));
}

main().catch((e) => { console.error(e); process.exit(1); });
