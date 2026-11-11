"""Writes a side-car .glb that holds only a skeleton (names and rest transforms) and animation clips. three.js binds
the clips to a character by bone name, so the file plays on the model it was baked for without touching the model."""
import json
import struct

import numpy as np


def write_clips_glb(path, rig, clips, fps=30, extras=None):
    """clips: [{name, local: [F, B, 4], pelvis: [F, 3] local translations or None, bones: names to key, loop: bool}]"""
    nodes = []
    for i, n in enumerate(rig.names):
        nodes.append({'name': n, 'translation': [round(float(x), 6) for x in rig.rest_t[i]], 'rotation': [round(float(x), 6) for x in rig.rest_r[i]]})
    for i, p in enumerate(rig.parent):
        if p >= 0:
            nodes[p].setdefault('children', []).append(i)
    roots = [i for i, p in enumerate(rig.parent) if p < 0]
    blob = bytearray(); views, accessors, anims = [], [], []

    def add(arr, typ, minmax=False):
        arr = np.ascontiguousarray(arr, dtype='<f4')
        while len(blob) % 4:
            blob.append(0)
        views.append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': arr.nbytes})
        blob.extend(arr.tobytes())
        acc = {'bufferView': len(views) - 1, 'componentType': 5126, 'count': int(arr.shape[0]), 'type': typ}
        if minmax:
            acc['min'] = [float(arr.min())]; acc['max'] = [float(arr.max())]
        accessors.append(acc)
        return len(accessors) - 1

    for c in clips:
        F = c['local'].shape[0]
        t_acc = add(np.arange(F, dtype=np.float32) / c.get('fps', fps), 'SCALAR', True)
        samplers, channels = [], []
        for name in c['bones']:
            i = rig.index[name]
            q = c['local'][:, i].copy()
            d = np.sum(q[1:] * q[:-1], -1)
            q[1:] *= np.cumprod(np.where(d < 0, -1.0, 1.0))[:, None]
            samplers.append({'input': t_acc, 'output': add(q, 'VEC4'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': i, 'path': 'rotation'}})
        if c.get('pelvis') is not None:
            samplers.append({'input': t_acc, 'output': add(c['pelvis'], 'VEC3'), 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': rig.index['pelvis'], 'path': 'translation'}})
        anim = {'name': c['name'], 'samplers': samplers, 'channels': channels}
        if c.get('extras'):
            anim['extras'] = c['extras']
        anims.append(anim)
    gltf = {'asset': {'version': '2.0', 'generator': 'ftfanim'}, 'scene': 0, 'scenes': [{'nodes': roots}], 'nodes': nodes,
            'animations': anims, 'buffers': [{'byteLength': len(blob)}], 'bufferViews': views, 'accessors': accessors}
    if extras:
        gltf['extras'] = extras
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    while len(blob) % 4:
        blob.append(0)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(blob), b'BIN\x00')); f.write(bytes(blob))
