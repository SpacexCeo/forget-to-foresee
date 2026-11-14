// Iris's voice lines in the intro (sprint 7.6) with a fallback chain: the recorded file -> the browser's speech
// synthesis with a female English voice -> silence (the subtitle always carries the line). Never blocks: play()
// resolves with how it played ('file' | 'speech' | 'silent') and never rejects. The volume follows the master slider
// (audio/mix.js). The files are an AI-generated placeholder (docs/audio/voice.md).
import { loadVolumes, sliderGain } from '../audio/mix.js';

export const VOICE_LINES = Object.freeze({
  iris_oh_no: { file: 'assets/audio/voice/iris_oh_no.ogg', text: 'Oh no...' },
  iris_gasp: { file: 'assets/audio/voice/iris_gasp.ogg', text: 'Ah!' },
  iris_hmm: { file: 'assets/audio/voice/iris_hmm.ogg', text: 'Hmm...' },
});
/** A cue's voice key as VOICE_LINES names it (shots may write it with the audio manifest's 'voice_' prefix). */
export const voiceId = (v) => String(v || '').replace(/^voice_/, '');
export const FEMALE = /female|zira|samantha|aria|jenny|libby|sonia|google uk english female/i;

/** The voice to use for the fallback: a female English voice if the browser has one, else any English voice, else null. */
export function pickVoice(voices) {
  const en = (voices || []).filter((v) => /^en(-|_|$)/i.test(v.lang || ''));
  return en.find((v) => FEMALE.test(v.name || '')) || en[0] || null;
}

/**
 * @param {{base?: string, storage?: object, Audio?: Function, speech?: object, Utterance?: Function, timeoutMs?: number}} o
 */
export function createVoice({ base = '/', storage = globalThis.localStorage, Audio = globalThis.Audio, speech = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, timeoutMs = 4000 } = {}) {
  const gain = () => { try { return sliderGain(loadVolumes(storage).master); } catch { return 0.64; } };
  function viaSpeech(text) {
    return new Promise((resolve) => {
      try {
        if (!speech || !Utterance || typeof speech.speak !== 'function') return resolve('silent');
        const v = pickVoice(typeof speech.getVoices === 'function' ? speech.getVoices() : []);
        if (!v) return resolve('silent');
        const u = new Utterance(text); u.voice = v; u.lang = v.lang; u.pitch = 1.15; u.rate = 0.9; u.volume = gain();
        let done = false; const end = (how) => { if (!done) { done = true; resolve(how); } };
        u.onend = () => end('speech'); u.onerror = () => end('silent');
        speech.speak(u); setTimeout(() => end('speech'), timeoutMs);
      } catch { resolve('silent'); }
    });
  }
  function viaFile(src) {
    return new Promise((resolve) => {
      try {
        if (!Audio) return resolve(false);
        const a = new Audio(src); a.volume = Math.min(1, gain());
        let done = false; const end = (ok) => { if (!done) { done = true; resolve(ok); } };
        a.addEventListener('ended', () => end(true)); a.addEventListener('error', () => end(false));
        const p = a.play(); if (p && typeof p.then === 'function') p.then(() => setTimeout(() => end(true), timeoutMs), () => end(false));
      } catch { resolve(false); }
    });
  }
  return {
    /** Plays a line by id; resolves 'file' | 'speech' | 'silent'. */
    async play(id) {
      const line = VOICE_LINES[voiceId(id)]; if (!line) return 'silent';
      if (await viaFile(String(base).replace(/\/?$/, '/') + line.file)) return 'file';
      return viaSpeech(line.text);
    },
  };
}
