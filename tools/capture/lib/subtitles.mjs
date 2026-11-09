// Caption files for a video: SubRip (.srt, for X and players) and ASS (.ass, styled, what ffmpeg burns in).
// Captions are [{from, to, text}] in final-timeline seconds. The ASS style uses the game's body face,
// Source Sans 3 (converted from the bundled woff by fonts.mjs), with a soft dark outline so it reads over
// bright sky and dark stone alike.

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function srtTime(s) {
  const ms = Math.round(s * 1000);
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
export function assTime(s) {
  const cs = Math.round(s * 100);
  return `${Math.floor(cs / 360000)}:${pad(Math.floor(cs / 6000) % 60)}:${pad(Math.floor(cs / 100) % 60)}.${pad(cs % 100)}`;
}

export function toSrt(captions) {
  return captions.map((c, i) => `${i + 1}\n${srtTime(c.from)} --> ${srtTime(c.to)}\n${c.text.replace(/\\N/g, '\n')}\n`).join('\n') + '\n';
}

/**
 * @param {Array<{from:number,to:number,text:string,style?:string}>} captions
 * @param {{width:number,height:number,font?:string,size?:number,marginV?:number}} o
 */
export function toAss(captions, { width, height, font = 'Source Sans 3', size, marginV } = {}) {
  const fs = size ?? Math.round(height * 0.042);
  const mv = marginV ?? Math.round(height * 0.075);
  const outline = Math.max(1, Math.round(height / 540));
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${font},${fs},&H00EFE9DF,&H00FFFFFF,&H6E060A0B,&HA0000000,0,0,0,0,100,100,0.6,0,1,${outline},${Math.round(outline * 1.5)},2,${Math.round(width * 0.1)},${Math.round(width * 0.1)},${mv},1
Style: Quiet,${font},${Math.round(fs * 0.86)},&H00C9C6B8,&H00FFFFFF,&H6E060A0B,&HA0000000,0,1,0,0,100,100,0.4,0,1,${outline},${Math.round(outline * 1.5)},2,${Math.round(width * 0.1)},${Math.round(width * 0.1)},${mv},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = captions.map((c) => `Dialogue: 0,${assTime(c.from)},${assTime(c.to)},${c.style || 'Caption'},,0,0,0,,{\\fad(220,260)}${c.text}`);
  return head + lines.join('\n') + '\n';
}

/** Overlapping or out-of-order captions are a script bug; returns the problems found. */
export function checkCaptions(captions, duration, reading = null) {
  const out = [];
  const sorted = [...captions].sort((a, b) => a.from - b.from);
  sorted.forEach((c, i) => {
    if (!(c.to > c.from)) out.push(`caption ${i} has no duration: ${JSON.stringify(c)}`);
    if (c.to > duration + 0.01) out.push(`caption ${i} ends after the video (${c.to} > ${duration})`);
    if (i && c.from < sorted[i - 1].to - 1e-6) out.push(`caption ${i} overlaps the previous one (${c.from} < ${sorted[i - 1].to})`);
    const words = c.text.split(/\s+/).length;
    if ((c.to - c.from) < words / (reading?.maxWps ?? 4.2)) out.push(`caption ${i} is too fast to read (${words} words in ${(c.to - c.from).toFixed(1)} s)`);
    if (reading?.minHold && (c.to - c.from) < reading.minHold - 1e-6) out.push(`caption ${i} is held ${(c.to - c.from).toFixed(2)} s, under ${reading.minHold} s`);
  });
  return out;
}
