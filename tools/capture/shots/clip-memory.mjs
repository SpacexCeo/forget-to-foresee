// Social clip 2 (10 s): the Price of Memory. Opens on the act: the memories open on trial 4 of the judge path, "Forget
// it for a vision" on The Shells' Call at 0.6 s, the vision floods in, two future signs appear, the shard goes to
// auction (the log); a chapter card in the game's type closes it.
import { WALK_URL, BEAUTY_HIDE, fadeIn, fadeOut, WALK, chapterCard, dim } from './common.mjs';

export default {
  title: 'Forget to Foresee: clip, the Price of Memory (10 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 0.9, fadeOut: 1.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      name: 'memory', duration: 7.0, url: WALK_URL, ui: 'game',
      setup: [...WALK.staked, ...WALK.trial4, { do: 'key', code: 'KeyM' }, { do: 'frames', n: 12 }],
      actions: [{ at: 0.0, do: 'rig', dist: 10, yaw: 0.45 }, { at: 0.6, do: 'forget', index: 1 }, { at: 0.6, do: 'music', tension: 58 }, { at: 4.0, do: 'key', code: 'Escape' }],
      overlays: [fadeIn(0.3)],
    },
    {
      name: 'card', duration: 3.0, url: WALK_URL, ui: 'clean', hide: BEAUTY_HIDE,
      camera: { type: 'orbit', center: [0, 0, 0], radius: [24, 20], height: [7, 9], yawFrom: 60, yawTo: 80, lookHeight: 5, fov: [38, 34], ease: 'inOutSine' },
      overlays: [{ kind: 'letterbox', ratio: 2.2 }, dim(-1, 4, 0.7), chapterCard('The price of memory', 'Forget one forever to see the future', 0.0, 3.0), fadeOut(3.0, 0.6)],
    },
  ],
  captions: [
    { from: 0.3, to: 3.4, text: 'Iris forgets a memory forever, and sees the future early.' },
    { from: 3.6, to: 6.8, text: 'Two signs before anyone else. The memory goes to auction.' },
  ],
};
