// A short draft of the jury video's two pillars (the agents, the memory shard) for the owner's look approval
// (docs/submission/jury-video.md). The same page scenes as shots/jury.mjs, with the game's music and sounds.
const page = (name, duration, actions = []) => ({ name, page: name, duration, actions });
const cue = (at, name, gain = 0.8) => ({ at, do: 'cue', name, gain });
export default {
  title: 'Forget to Foresee: jury video, the two pillars (draft)',
  width: 1920, height: 1080, fps: 60,
  reading: { maxWps: 3, minHold: 1.5 },
  music: { gain: 1.0, fadeOut: 1.0 },
  output: { crf: 17, preset: 'slow', grain: 0 },
  shots: [
    page('pillar-agents', 2.0, [{ at: 0, do: 'music', tension: 45 }, cue(0.1, 'guest_arc', 0.6)]),
    page('agents', 6.0, [cue(1.0, 'bid_tick_2', 0.7), cue(1.9, 'ui_notify', 0.5), cue(3.0, 'ui_error', 0.7)]),
    page('pillar-nft', 2.0, [{ at: 0, do: 'music', tension: 38 }, cue(0.1, 'memory_dissolve', 0.7)]),
    page('shard', 3.0, [cue(0.55, 'memory_dissolve', 0.9), cue(1.0, 'vision_whoosh', 0.7), cue(2.1, 'bid_tick_1', 0.7)]),
    page('nft', 5.5, [cue(0.1, 'vision_whoosh', 0.6), cue(1.9, 'ui_confirm', 0.5)]),
  ],
  captions: [
    { from: 0.2, to: 1.95, text: 'The Agents' },
    { from: 2.2, to: 4.4, text: 'Silk, a memory, a temper.' },
    { from: 4.6, to: 7.95, text: 'They trade… and break trust.' },
    { from: 8.2, to: 9.95, text: 'The Memory Shard' },
    { from: 10.2, to: 12.95, text: '…to see the future first.' },
    { from: 13.2, to: 15.9, text: 'Bound to the sealed season.' },
    { from: 16.1, to: 18.45, text: 'Minted on NEAR testnet.' },
  ],
};
