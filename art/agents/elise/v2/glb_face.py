"""Adds the model's own `idle` clip to a .glb: only a morph-weight track (blinks). The game plays the face tracks of
the model's own idle as an always-on layer under the side-car body clips (faceLayerClip in anim-library.js).
    python3 glb_face.py <in.glb> <out.glb>"""
import json, struct, sys
src, dst = sys.argv[1], sys.argv[2]; d = open(src, 'rb').read()
jl = struct.unpack_from('<I', d, 12)[0]; J = json.loads(d[20:20 + jl]); bo = 20 + jl; bl = struct.unpack_from('<I', d, bo)[0]; B = bytearray(d[bo + 8:bo + 8 + bl])
node = next(i for i, n in enumerate(J['nodes']) if 'mesh' in n); names = J['meshes'][J['nodes'][node]['mesh']]['extras']['targetNames']; N = len(names); bi = names.index('blink')
keys = [(0, 0), (1.80, 0), (1.86, 1), (1.91, 1), (2.01, 0), (4.90, 0), (4.96, 1), (5.00, 1), (5.09, 0), (5.22, 0), (5.28, 1), (5.32, 1), (5.42, 0), (6.4, 0)]
def add(raw, comp, count, typ, mn=None, mx=None):
    while len(B) % 4: B.append(0)
    J['bufferViews'].append({'buffer': 0, 'byteOffset': len(B), 'byteLength': len(raw)}); B.extend(raw)
    acc = {'bufferView': len(J['bufferViews']) - 1, 'componentType': comp, 'count': count, 'type': typ}
    if mn is not None: acc['min'] = mn; acc['max'] = mx
    J['accessors'].append(acc); return len(J['accessors']) - 1
t = add(struct.pack('<%df' % len(keys), *[k[0] for k in keys]), 5126, len(keys), 'SCALAR', [0.0], [keys[-1][0]])
w = add(struct.pack('<%df' % (len(keys) * N), *[float(k[1]) if j == bi else 0.0 for k in keys for j in range(N)]), 5126, len(keys) * N, 'SCALAR')
J.setdefault('animations', []).append({'name': 'idle', 'samplers': [{'input': t, 'output': w, 'interpolation': 'LINEAR'}], 'channels': [{'sampler': 0, 'target': {'node': node, 'path': 'weights'}}]})
while len(B) % 4: B.append(0)
J['buffers'][0]['byteLength'] = len(B); js = json.dumps(J, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
open(dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(B)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(B), b'BIN\0') + bytes(B))
print('face clip: idle,', len(keys), 'keys,', N, 'targets', names)
