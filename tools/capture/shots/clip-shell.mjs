// Social clip 1 (14 s): the Shell. Fly in, the Guest draws the sign, Iris reads it for trial 3, the human
// stakes 10 silk. Gameplay with the HUD; captions carry the pitch.
import { JUDGE_URL, fadeIn, fadeOut } from './common.mjs';

const D = 14.0;

export default {
  title: 'Forget to Foresee: clip, read the sign (14 s)',
  width: 1920, height: 1080, fps: 60,
  music: { gain: 0.9, fadeOut: 1.5 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    {
      name: 'shell', duration: D, url: JUDGE_URL, ui: 'game',
      actions: [
        { at: 0.0, do: 'rig', dist: 22, yaw: 0.35 },
        { at: 0.8, do: 'click', selector: '.hub-shells button[data-shell="1"]' },
        { at: 11.2, do: 'key', code: 'KeyF' },
      ],
      overlays: [fadeIn(0.5), fadeOut(D, 0.8)],
    },
  ],
  captions: [
    { from: 0.6, to: 3.7, text: 'Fly into a Shell. The Guests draw a sign on the glass.' },
    { from: 4.0, to: 7.6, text: 'Four slots: Place, Action, Power, Delay. Iris guesses each one.' },
    { from: 8.2, to: 11.0, text: 'Her reading says trial 3. Change any slot you read differently.' },
    { from: 11.4, to: 13.6, text: 'Stake 10 silk on your reading.' },
  ],
};
