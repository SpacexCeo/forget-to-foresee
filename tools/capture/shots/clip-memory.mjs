// Social clip 2 (12 s): the Price of Memory. Trial 4 on the island, the first reveal verified: M opens the memories, "Forget it for a
// vision" on The Shells' Call, the vision effect, two future signs appear and the shard goes to auction.
import { JUDGE_URL, fadeIn, fadeOut, SETUP } from './common.mjs';

const D = 12.0;

export default {
  title: 'Forget to Foresee: clip, the Price of Memory (12 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 0.9, fadeOut: 1.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      name: 'memory', duration: D, url: JUDGE_URL, ui: 'game',
      setup: [...SETUP.stakedInShellI, ...SETUP.trial2, ...SETUP.trial3card, ...SETUP.trial4],
      actions: [
        { at: 0.0, do: 'rig', dist: 16, yaw: 0.5 },
        { at: 1.4, do: 'key', code: 'KeyM' },
        { at: 4.2, do: 'forget', index: 1 },
      ],
      overlays: [fadeIn(0.5), fadeOut(D, 0.8)],
    },
  ],
  captions: [
    { from: 0.5, to: 3.6, text: 'To see the future early, your agent forgets a memory forever.' },
    { from: 4.6, to: 7.6, text: 'You choose which. The memory goes to auction as a shard.' },
    { from: 8.2, to: 11.4, text: 'Two future signs appear: a vision only Iris can read.' },
  ],
};
