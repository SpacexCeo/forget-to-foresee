// Transfer only the refreshed standing leg channels into the shipped compressed GLB.
// Meshes, textures, skin weights, morphs, walking, running and other channels retain their original bytes.
// Usage: node apply-stance-animation.mjs original-compressed.glb refreshed-raw.glb output.glb
import fs from 'node:fs';
import assert from 'node:assert/strict';

function read(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const offset = 20 + jsonLength;
  assert.equal(bytes.readUInt32LE(offset + 4), 0x004e4942);
  return { json, bin: bytes.subarray(offset + 8, offset + 8 + bytes.readUInt32LE(offset)) };
}

const [original, updated, destination] = process.argv.slice(2);
if (!destination) throw new Error('Expected original GLB, refreshed GLB and output GLB.');
const target = read(original);
const source = read(updated);
const before = structuredClone(target.json);
const chunks = [target.bin];
let byteLength = target.bin.length;
const imported = new Map();
function copyAccessor(index) {
  if (imported.has(index)) return imported.get(index);
  const accessor = structuredClone(source.json.accessors[index]);
  assert.ok(!accessor.sparse, 'Sparse animation data is not supported.');
  const view = source.json.bufferViews[accessor.bufferView];
  assert.equal(view.buffer, 0);
  assert.ok(!view.extensions, 'Use the uncompressed refreshed export.');
  const padding = (4 - byteLength % 4) % 4;
  if (padding) { chunks.push(Buffer.alloc(padding)); byteLength += padding; }
  const start = view.byteOffset || 0;
  const data = source.bin.subarray(start, start + view.byteLength);
  const newView = { ...view, buffer: 0, byteOffset: byteLength };
  chunks.push(data);
  byteLength += data.length;
  accessor.bufferView = target.json.bufferViews.length;
  target.json.bufferViews.push(newView);
  const result = target.json.accessors.length;
  target.json.accessors.push(accessor);
  imported.set(index, result);
  return result;
}

const standing = new Set(['idle', 'talk', 'think', 'gesture_offer', 'celebrate', 'defeat']);
const bones = new Set(['pelvis', ...['thigh', 'shin', 'foot', 'toe'].flatMap(part => ['L', 'R'].map(side => `${part}_${side}`))]);
let replaced = 0;
for (const animation of target.json.animations) {
  if (!standing.has(animation.name)) continue;
  const fresh = source.json.animations.find(item => item.name === animation.name);
  assert.ok(fresh, `Missing refreshed animation ${animation.name}`);
  let count = 0;
  for (const channel of animation.channels) {
    const name = target.json.nodes[channel.target.node].name;
    if (!bones.has(name) || !['rotation', 'translation'].includes(channel.target.path)) continue;
    if (channel.target.path === 'translation' && name !== 'pelvis') continue;
    const replacement = fresh.channels.find(item => source.json.nodes[item.target.node].name === name && item.target.path === channel.target.path);
    assert.ok(replacement, `Missing ${animation.name}/${name}/${channel.target.path}`);
    const sampler = fresh.samplers[replacement.sampler];
    const oldTimes = target.json.accessors[animation.samplers[channel.sampler].input];
    const newTimes = source.json.accessors[sampler.input];
    if (oldTimes.max && newTimes.max) assert.ok(Math.abs(oldTimes.max[0] - newTimes.max[0]) < 1e-5, 'Clip duration changed.');
    channel.sampler = animation.samplers.length;
    animation.samplers.push({ ...sampler, input: copyAccessor(sampler.input), output: copyAccessor(sampler.output) });
    count++;
  }
  assert.equal(count, 10, `Unexpected channel coverage for ${animation.name}`);
  replaced += count;
}
assert.equal(replaced, 60);
for (const property of ['meshes', 'skins', 'images', 'textures', 'materials', 'nodes']) assert.deepEqual(target.json[property], before[property]);
for (const name of ['walk', 'run']) assert.deepEqual(target.json.animations.find(item => item.name === name), before.animations.find(item => item.name === name));
target.json.buffers[0].byteLength = byteLength;
const binary = Buffer.concat(chunks);
assert.ok(binary.subarray(0, target.bin.length).equals(target.bin), 'Original model data changed.');
const json = Buffer.from(JSON.stringify(target.json));
const paddedJson = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
const paddedBin = Buffer.concat([binary, Buffer.alloc((4 - binary.length % 4) % 4)]);
const header = Buffer.alloc(20);
header.write('glTF');
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + paddedJson.length + paddedBin.length, 8);
header.writeUInt32LE(paddedJson.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(paddedBin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(destination, Buffer.concat([header, paddedJson, binHeader, paddedBin]));
console.log(JSON.stringify({ destination, replacedChannels: replaced, originalModelBytesPreserved: target.bin.length, geometryAndTexturesUnchanged: true, walkAndRunUnchanged: true }));
