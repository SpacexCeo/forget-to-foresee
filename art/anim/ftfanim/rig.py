"""The target skeleton, read from a shipped character .glb (the exact rest pose three.js skins with).

World space is glTF's: Y up, the character faces +Z, its left is +X, metres. Bones point along their local +Y
(Blender bones exported by the glTF exporter).
"""
import json
import struct

import numpy as np

from .quat import qmul, qrot, qnorm

Y = np.array([0.0, 1.0, 0.0])


def read_glb_json(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF', path
    n = struct.unpack_from('<I', b, 12)[0]
    return json.loads(b[20:20 + n].decode())


class Rig:
    def __init__(self, glb_path):
        j = read_glb_json(glb_path)
        nodes = j['nodes']
        parent = {}
        for i, n in enumerate(nodes):
            for c in n.get('children', []):
                parent[c] = i
        joints = []
        for s in j.get('skins', []):
            for k in s['joints']:
                if k not in joints:
                    joints.append(k)
        # parents first
        depth = lambda k: 0 if k not in parent else 1 + depth(parent[k])
        joints.sort(key=depth)
        self.node_index = joints
        self.names = [nodes[k]['name'] for k in joints]
        self.index = {n: i for i, n in enumerate(self.names)}
        self.parent = [self.names.index(nodes[parent[k]]['name']) if parent.get(k) in joints else -1 for k in joints]
        self.rest_t = np.array([nodes[k].get('translation', [0, 0, 0]) for k in joints], float)
        self.rest_r = qnorm(np.array([nodes[k].get('rotation', [0, 0, 0, 1]) for k in joints], float))
        for k in joints:
            s = nodes[k].get('scale', [1, 1, 1])
            assert max(abs(x - 1) for x in s) < 1e-3, ('scaled bone', nodes[k]['name'], s)
        # transform of whatever sits above the root joint (the armature object); identity for our exports
        self.base_r = np.array([0, 0, 0, 1.0]); self.base_t = np.zeros(3)
        k = parent.get(joints[0])
        chain = []
        while k is not None:
            chain.append(nodes[k]); k = parent.get(k)
        for n in chain:  # nearest ancestor first: x' = R x + t accumulates outward
            r = np.array(n.get('rotation', [0, 0, 0, 1]), float); t = np.array(n.get('translation', [0, 0, 0]), float)
            s = n.get('scale', [1, 1, 1])
            assert max(abs(x - 1) for x in s) < 1e-3, ('scaled armature', n.get('name'), s)
            self.base_t = qrot(r, self.base_t) + t; self.base_r = qmul(r, self.base_r)
        self.rest_wr, self.rest_wp = self.fk(self.rest_r[None], None)
        self.rest_wr, self.rest_wp = self.rest_wr[0], self.rest_wp[0]
        self.children = [[c for c, p in enumerate(self.parent) if p == i] for i in range(len(self.names))]

    def fk(self, lrot, pelvis_pos=None, lpos=None):
        """World rotations and joint positions for local rotations [F, B, 4]. `pelvis_pos` [F, 3] overrides the
        pelvis joint's world position (root motion lives on the pelvis; the `root` bone never moves)."""
        F, B = lrot.shape[0], len(self.names)
        wr = np.zeros((F, B, 4)); wp = np.zeros((F, B, 3))
        pel = self.index.get('pelvis')
        for i in range(B):
            p = self.parent[i]
            pr = wr[:, p] if p >= 0 else np.broadcast_to(self.base_r, (F, 4))
            pp = wp[:, p] if p >= 0 else np.broadcast_to(self.base_t, (F, 3))
            wr[:, i] = qmul(pr, lrot[:, i])
            t = self.rest_t[i] if lpos is None else lpos[:, i]
            wp[:, i] = pp + qrot(pr, t)
            if i == pel and pelvis_pos is not None:
                wp[:, i] = pelvis_pos
        return wr, wp

    def to_local(self, wr):
        """Local rotations from world rotations [F, B, 4]."""
        from .quat import qinv
        out = np.zeros_like(wr)
        for i in range(len(self.names)):
            p = self.parent[i]
            pr = wr[:, p] if p >= 0 else np.broadcast_to(self.base_r, wr[:, i].shape)
            out[:, i] = qmul(qinv(pr), wr[:, i])
        return qnorm(out)

    def pelvis_local(self, pelvis_world):
        """The pelvis bone's local translation for a world position [F, 3] (its parent `root` stays at rest)."""
        from .quat import qinv
        p = self.parent[self.index['pelvis']]
        pr, pp = (self.rest_wr[p], self.rest_wp[p]) if p >= 0 else (self.base_r, self.base_t)
        return qrot(qinv(pr), pelvis_world - pp)

    def dir(self, name):
        """Rest world direction of a bone (towards its tail)."""
        return qrot(self.rest_wr[self.index[name]], Y)

    def length(self, a, b):
        return float(np.linalg.norm(self.rest_wp[self.index[b]] - self.rest_wp[self.index[a]]))
