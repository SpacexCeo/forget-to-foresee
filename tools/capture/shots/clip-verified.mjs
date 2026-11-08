// Social clip 3 (14 s): Verified ✓. Trial 3: Moss's loan card is declined, the trial ends, the Gift lands
// on Shell II as the human read it, the reveal is checked against the sealed root, and Signs & Visions
// shows the resolved sign with "Verified ✓".
import { JUDGE_URL, fadeIn, fadeOut, SETUP } from './common.mjs';

const D = 14.0;

export default {
  title: 'Forget to Foresee: clip, Verified (14 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 0.9, fadeOut: 1.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      name: 'verified', duration: D, url: JUDGE_URL, ui: 'game',
      // trial 2 with the vision → into Shell I → leave → trial 3 with Moss's card waiting
      setup: [...SETUP.stakedInShellI, ...SETUP.trial2, ...SETUP.forgot,
        { do: 'fly', shell: 1 }, { do: 'until', pred: 'inShell', max: 400 }, { do: 'until', pred: 'hubIdle', max: 200 }, { do: 'frames', n: 30 },
        { do: 'key', code: 'KeyT' }, { do: 'until', pred: 'cardOpen', max: 600 }, { do: 'frames', n: 10 }],
      actions: [
        { at: 0.0, do: 'rig', dist: 18, yaw: 0.4 },
        { at: 1.6, do: 'card', choice: 'decline' },
        { when: 'trial', value: 4, do: 'key', code: 'KeyT' },
        { at: 7.0, do: 'key', code: 'KeyV' },
        { at: 8.0, do: 'click', selector: '.wh-signs__chip[data-filter="resolved"]' },
      ],
      overlays: [fadeIn(0.5), fadeOut(D, 0.8)],
    },
  ],
  captions: [
    { from: 0.4, to: 3.4, text: 'The clans lend, trade and break trust: agents with wallets and memory.' },
    { from: 3.7, to: 6.9, text: 'Trial 3 ends. The Gift lands on Shell II, as you read it.' },
    { from: 7.4, to: 11.0, text: 'Every reveal is checked against the Merkle root sealed before trial 1.' },
    { from: 11.4, to: 13.6, text: 'Verified ✓' },
  ],
};
