# Demo video: recording runbook (owner, on the GPU machine)

This container renders WebGL only through a software renderer (about 5-8 fps), so no final clips are produced here; record with this runbook.

### 11.6 Recording instructions (for me on my GPU machine; A5 writes them as `record-runbook.md`)

**Before recording**
1. Use a clean Chrome profile at 100% zoom, a 1920 × 1080 display at 100% scaling, bookmarks bar hidden, notifications off (Focus assist on), the browser in **F11 fullscreen**, the tab title and address bar not visible. Quit chat apps. Plug in the power. Close every other tab except the NearBlocks tab.
2. Prepare the demo guest account (8.5), reload, and confirm the chip shows 200 or more silk on chain.
3. Settings: graphics high, reduced motion **off**, subtitles on, UI scale 100%, master volume 70%, effects 80%, music 40%.
4. Do one dry run of every shot; write down the take numbers in `docs/submission/video/takes.md`.

**OBS Studio settings**
- Canvas and output resolution **1920 × 1080**, **60 fps** (30 fps is acceptable for the X cut if the file is too large).
- Source: **Window Capture** of the browser (or Display Capture), cursor captured; **Game Capture** is not needed.
- Video encoder: NVENC H.264 (or x264 "veryfast" on CPU), **CQP 18** (or CBR 20,000 Kbps), keyframe interval 2 s, profile High, B-frames 2.
- Recording format **MKV** (remux to MP4 after, so a crash loses nothing). Audio 48 kHz, 320 kbps.
- Audio tracks: track 1 game and system audio (desktop capture), track 2 microphone (the voice-over recorded separately later is also fine). Meter the game at about −18 dBFS peaks so the voice sits above it.

**Cursor**
- Show the cursor, enlarge it to 150% (OS setting) and use OBS "cursor highlight" or a click-ripple tool; move it slowly in straight lines; pause 0.5 s on a button before clicking; never wiggle. Hide the cursor during pure gameplay moments (WASD) in the edit if it distracts.

**Voice-over**
- Record in a quiet room with a USB microphone, 48 kHz, 24-bit, peaks around −12 dBFS, pop filter, mouth 10 cm from the capsule; read the table in 11.4 line by line, two takes per line; normalise to **−16 LUFS integrated, true peak −1 dBTP**.
- If I use a text-to-speech draft first (A5 provides `vo-draft.wav` when a TTS tool exists on the box), the final should still be my voice or a clearly labelled synthetic voice (state it in the description).

**Music**
- Choose a track whose licence allows use in a public video: **CC0**, my own, or a licence that permits it (for example the Pixabay Content License, YouTube Audio Library, or a Creative Commons track with the required credit). **Avoid any copyrighted commercial music.** Record the title, author, URL, licence and the exact credit line in `docs/submission/video/music.md`, and put the credit in the video description.
- Level −26 LUFS under the voice (duck 8 dB while I speak), fade out over the last 3 seconds.

**Editing and export**
- Cuts on action, no transitions longer than 0.3 s, no zooms beyond 120%; lower-thirds in `--font-title` 28 px gold on a dark bar; hold each on-chain page for at least 3 seconds so a viewer can read the hash.
- Export **H.264 High, yuv420p, 1920 × 1080, 60 fps (or 30 fps for X), 16 to 20 Mbps, AAC 192 kbps stereo**, `faststart`. Check the X upload size limit at posting time **[VERIFY]**. Produce: `ftf-demo-master-2m42.mp4`, `ftf-demo-x-2m04.mp4` (burned-in captions), `captions.srt`, a 1280 × 720 thumbnail (Iris at the Gate-Loom with the title).
- Final checks: every shot of 11.3 visible, every pass check met, no secret or personal data on screen, no real-money wording, the "Demo data" chip only where a seed is intentionally on, the voice and the subtitle "Oh no..." in sync, loudness −16 LUFS.

**What I will do myself:** record, choose the music, approve the cut, upload, and post on X with the required text (built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon`); A5 only drafts the post and the description.
