// WOFF 1.0 → TTF/OTF conversion, so the bundled @fontsource faces (Libre Caslon Text, Source Sans 3) can be
// used by ffmpeg's libass when captions are burned in. WOFF is the same sfnt tables, each zlib-compressed,
// behind a small directory; nothing else changes. No dependencies.
import { inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export function woffToSfnt(buf) {
  if (buf.readUInt32BE(0) !== 0x774f4646) throw new Error('not a WOFF 1.0 file'); // 'wOFF'
  const flavor = buf.readUInt32BE(4);
  const numTables = buf.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    tables.push({ tag: buf.subarray(o, o + 4), offset: buf.readUInt32BE(o + 4), compLength: buf.readUInt32BE(o + 8), origLength: buf.readUInt32BE(o + 12), checksum: buf.readUInt32BE(o + 16) });
  }
  let maxPow2 = 1, entrySelector = 0;
  while (maxPow2 * 2 <= numTables) { maxPow2 *= 2; entrySelector++; }
  const searchRange = maxPow2 * 16;
  const header = Buffer.alloc(12);
  header.writeUInt32BE(flavor, 0); header.writeUInt16BE(numTables, 4); header.writeUInt16BE(searchRange, 6); header.writeUInt16BE(entrySelector, 8); header.writeUInt16BE(numTables * 16 - searchRange, 10);
  const dir = Buffer.alloc(numTables * 16);
  const datas = [];
  let offset = 12 + numTables * 16;
  tables.forEach((t, i) => {
    const raw = buf.subarray(t.offset, t.offset + t.compLength);
    const data = t.compLength < t.origLength ? inflateSync(raw) : Buffer.from(raw);
    const pad = (4 - (data.length % 4)) % 4;
    t.tag.copy(dir, i * 16); dir.writeUInt32BE(t.checksum, i * 16 + 4); dir.writeUInt32BE(offset, i * 16 + 8); dir.writeUInt32BE(data.length, i * 16 + 12);
    datas.push(data, Buffer.alloc(pad));
    offset += data.length + pad;
  });
  return Buffer.concat([header, dir, ...datas]);
}

/** Converts the listed .woff files into `outDir` (skips ones already there). Returns the output paths. */
export function prepareFonts(woffPaths, outDir) {
  mkdirSync(outDir, { recursive: true });
  return woffPaths.map((p) => {
    const out = join(outDir, basename(p).replace(/\.woff$/, '.ttf'));
    if (!existsSync(out)) writeFileSync(out, woffToSfnt(readFileSync(p)));
    return out;
  });
}
