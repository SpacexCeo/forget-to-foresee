"""BVH reader and forward kinematics (numpy). Units and axes are the file's own (CMU: Y up, T-pose faces +Z)."""
import numpy as np

from .quat import from_euler, qmul, qrot


class Bvh:
    def __init__(self, path):
        self.names, self.parent, self.offset, self.channels = [], [], [], []
        self.end_offset = {}
        toks = open(path).read().split()
        i, stack, n_ch = 0, [], 0
        while toks[i] != 'MOTION':
            t = toks[i]
            if t in ('ROOT', 'JOINT'):
                self.names.append(toks[i + 1]); self.parent.append(stack[-1] if stack else -1)
                self.offset.append(None); self.channels.append([]); i += 2
            elif t == 'End':
                self.names.append(self.names[stack[-1]] + '_end'); self.parent.append(stack[-1])
                self.offset.append(None); self.channels.append([]); i += 2
            elif t == '{':
                stack.append(len(self.names) - 1); i += 1
            elif t == '}':
                stack.pop(); i += 1
            elif t == 'OFFSET':
                self.offset[stack[-1]] = [float(x) for x in toks[i + 1:i + 4]]; i += 4
            elif t == 'CHANNELS':
                n = int(toks[i + 1]); self.channels[stack[-1]] = toks[i + 2:i + 2 + n]; n_ch += n; i += 2 + n
            else:
                i += 1
        self.frames = int(toks[i + 2]); self.dt = float(toks[i + 5])
        data = np.array(toks[i + 6:i + 6 + self.frames * n_ch], float).reshape(self.frames, n_ch)
        self.offset = np.array(self.offset, float)
        self.index = {n: k for k, n in enumerate(self.names)}
        J = len(self.names)
        self.lrot = np.zeros((self.frames, J, 4)); self.lrot[..., 3] = 1
        self.lpos = np.broadcast_to(self.offset, (self.frames, J, 3)).copy()
        c = 0
        for j, ch in enumerate(self.channels):
            if not ch:
                continue
            block = data[:, c:c + len(ch)]; c += len(ch)
            pos = [k for k, n in enumerate(ch) if n.endswith('position')]
            rot = [k for k, n in enumerate(ch) if n.endswith('rotation')]
            if pos:
                p = np.zeros((self.frames, 3))
                for k in pos:
                    p[:, 'XYZ'.index(ch[k][0])] = block[:, k]
                self.lpos[:, j] = p + (self.offset[j] if self.parent[j] >= 0 else 0)
            if rot:
                self.lrot[:, j] = from_euler([ch[k][0] for k in rot], block[:, rot])
        self.fk()

    def fk(self):
        J = len(self.names)
        self.wrot = np.zeros_like(self.lrot); self.wpos = np.zeros_like(self.lpos)
        for j in range(J):
            p = self.parent[j]
            if p < 0:
                self.wrot[:, j] = self.lrot[:, j]; self.wpos[:, j] = self.lpos[:, j]
            else:
                self.wrot[:, j] = qmul(self.wrot[:, p], self.lrot[:, j])
                self.wpos[:, j] = self.wpos[:, p] + qrot(self.wrot[:, p], self.lpos[:, j])

    def pos(self, name):
        return self.wpos[:, self.index[name]]

    def rot(self, name):
        return self.wrot[:, self.index[name]]
