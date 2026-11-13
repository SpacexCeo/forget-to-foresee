# Iris's voice lines (placeholder)

**AI-generated placeholder voice.** Replace it by recording a real take with the same file names; nothing else
changes. Used by the new-player intro (`game/src/npe/voice.js`, sprint section 7.6).

| File | Line | Length | Where |
|---|---|---|---|
| `game/public/assets/audio/voice/iris_oh_no.ogg` | "Oh no..." | about 1.1 s | the lab prologue, when the device wakes |
| `game/public/assets/audio/voice/iris_gasp.ogg` | "Ah!" | about 0.4 s | in the vortex (optional) |
| `game/public/assets/audio/voice/iris_hmm.ogg` | "Hmm..." | about 0.9 s | at the computer (optional) |

## How they were made

- Tool: [Piper](https://github.com/rhasspy/piper) text-to-speech (`pip install piper-tts`, version from PyPI on 13 Nov 2026).
- Voice model: `en_US-ljspeech-high` from `rhasspy/piper-voices` on Hugging Face, a US English female voice.
- Licence: the model card says it was trained on the [LJ Speech dataset](https://keithito.com/LJ-Speech-Dataset/),
  whose licence is **public domain**. (The first choice, `en_US-amy-medium`, was dropped because its model card only
  says "License: See URL".)
- Commands:

```bash
echo "Oh, no..." | piper -m en_US-ljspeech-high.onnx --length-scale 1.6 --noise-scale 0.6 -f iris_oh_no.wav
echo "Ah!"        | piper -m en_US-ljspeech-high.onnx --length-scale 1.4 --noise-scale 0.6 -f iris_gasp.wav
echo "Hmm, hmm..." | piper -m en_US-ljspeech-high.onnx --length-scale 1.4 --noise-scale 0.6 -f iris_hmm.wav
# trim silence at both ends, normalise to -16 LUFS, mono 44.1 kHz, 0.15 s tail, Ogg Vorbis q4
ffmpeg -i in.wav -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=0.15" -ac 1 -ar 44100 -c:a libvorbis -q:a 4 out.ogg
```

The takes were checked for length only; nobody has listened to them yet. If one sounds wrong, regenerate it with
another `--length-scale` or record it.

## Runtime fallback

The file plays if it loads. If it is missing, fails to decode or the browser blocks playback, the browser's speech
synthesis says the line with a female English voice (`/female|zira|samantha|aria|jenny|libby|sonia|google uk
english female/i`, pitch 1.15, rate 0.9). With no voice at all the line is silent. The subtitle always shows the
line, and the voice never holds up the cinematic.
