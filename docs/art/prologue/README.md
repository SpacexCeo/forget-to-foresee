# The lab prologue (sprint plan section 9)

Stills from the running game: `stills.jpg` (20 moments from 1.5 s to the wake-up; `art/anim/prologue_shots.mjs`).
Turn it on with the flags `labPrologue` and `newPlayerIntro` (`?ff=labPrologue,newPlayerIntro&intro=1`).

What plays (38 s, reduced motion about 33 s, a skip lands within 1.2 s):
title card, the door, Iris jogs in (`run`), walks to the desk (`walk`), leans and reaches for the keyboard, her sleeve
presses the red glass key, the monitors show RESONATOR ARMED, the Glass Resonator spins up, the lights flicker, she
walks to it and half raises her hand, close-up at "Oh no...", the vortex opens and pulls her, papers and the lab coat
fly in, the time tunnel with the years counting back from 2048, whiteout, black, a heartbeat. Then the wake-up over
the live town: eyelids open on a blurred view that sharpens.

Where: `game/src/scenes/lab/` (the room, the device; `mount(ctx)` is the sprint seam), `game/src/cinematic/prologue/`
(shots and cues as data, the timeline, the vortex and tunnel, the sound, Iris's layered poses, the player).
Tests: `game/tests/prologue/timeline.test.mjs`.

How it is built: the prologue has its own canvas, renderer and scene over the game, so the town is never touched and
keeps loading behind it. Iris is her own model with her own clips; the poses are extra bone rotations on top
(nothing redrawn). Everything else is code: no downloads.

Not done against the plan:
- the wake-up is screen space only (4.5 s, not 9 s): no town camera move, no townsfolk ring, no sit-up;
- `focusOn` / `releaseCamera` only put the request on the bus: the town camera has no cinematic hook in this build;
- no chromatic aberration or radial blur pass (a vignette and the dolly zoom carry the pull);
- reduced motion is about 33 s, not 28 s;
- the capture is stills at wall-clock times, not the frame-stepped JSON shot scripts;
- the voice line is A4's: the `oh_no` cue carries `voice: 'voice_iris_oh_no'` and the subtitle text.
