#!/usr/bin/env python3
"""Mobile variant of a KTX2 .glb: drops the top mip level of every KTX2 texture larger than MAX.

The KTX2 files already carry the full mip chain, so the 2048 level of a 4096 texture is the same
data the GPU would sample at a distance; removing level 0 is lossless for that level and quarters
the GPU memory. Works for BasisLZ/ETC1S (supercompression 1: the per-level image descriptors in the
supercompression global data are dropped too) and for UASTC (+ Zstandard). Geometry and the rest
of the glb are copied byte for byte.

Usage: glb_mobile.py in.glb out.glb [max=2048] [inspect_max]
(inspect_max caps the textures whose name contains `_inspect`, e.g. 1024: phones rarely inspect up close)
"""
import json, struct, sys

def u32(b, o): return struct.unpack_from('<I', b, o)[0]
def u64(b, o): return struct.unpack_from('<Q', b, o)[0]

def drop_top_level(k):
    assert k[:12] == b'\xabKTX 20\xbb\r\n\x1a\n', 'not KTX2'
    vk, tsz, w, h, d, layers, faces, levels, scheme = struct.unpack_from('<9I', k, 12)
    dfd_off, dfd_len, kvd_off, kvd_len = struct.unpack_from('<4I', k, 48)
    sgd_off, sgd_len = struct.unpack_from('<2Q', k, 64)
    lv = [struct.unpack_from('<3Q', k, 80 + 24 * i) for i in range(levels)]
    assert levels > 1 and d == 0 and faces == 1
    nl = levels - 1
    dfd = k[dfd_off:dfd_off + dfd_len]
    kvd = k[kvd_off:kvd_off + kvd_len]
    sgd = k[sgd_off:sgd_off + sgd_len]
    if scheme == 1:  # BasisLZ: header (20 bytes) + imageDescs (20 bytes each, level-major)
        per_level = max(1, layers)
        hdr, descs = sgd[:20], sgd[20:20 + 20 * levels * per_level]
        rest = sgd[20 + 20 * levels * per_level:]
        sgd = hdr + descs[20 * per_level:] + rest
    head = bytearray(k[:12] + struct.pack('<9I', vk, tsz, max(1, w >> 1), max(1, h >> 1), d, layers, faces, nl, scheme))
    pos = 80 + 24 * nl
    n_dfd_off = pos; pos += len(dfd)
    n_kvd_off = pos if kvd else 0; pos += len(kvd)
    if sgd:
        pos += (-pos) % 8
    n_sgd_off = pos if sgd else 0; pos += len(sgd)
    # mip data, smallest level first (as in the source); keep the source's per-level alignment rule
    align = 1 if scheme else 16
    order = sorted(range(1, levels), key=lambda i: lv[i][0])
    blobs, offs = [], {}
    for i in order:
        pos += (-pos) % align
        offs[i] = pos
        blob = k[lv[i][0]:lv[i][0] + lv[i][1]]
        blobs.append((pos, blob)); pos += len(blob)
    out = bytearray(pos)
    out[:len(head)] = head
    struct.pack_into('<4I', out, 48, n_dfd_off, len(dfd), n_kvd_off, len(kvd))
    struct.pack_into('<2Q', out, 64, n_sgd_off, len(sgd))
    for j, i in enumerate(range(1, levels)):
        struct.pack_into('<3Q', out, 80 + 24 * j, offs[i], lv[i][1], lv[i][2])
    out[n_dfd_off:n_dfd_off + len(dfd)] = dfd
    if kvd: out[n_kvd_off:n_kvd_off + len(kvd)] = kvd
    if sgd: out[n_sgd_off:n_sgd_off + len(sgd)] = sgd
    for p, blob in blobs: out[p:p + len(blob)] = blob
    return bytes(out), w >> 1

def main(src, dst, mx=2048, inspect_mx=None):
    b = open(src, 'rb').read()
    jl = u32(b, 12); j = json.loads(b[20:20 + jl])
    bin_off = 20 + jl + 8; bl = u32(b, 20 + jl)
    binb = b[bin_off:bin_off + bl]
    changed = 0
    views = j['bufferViews']
    replace = {}
    for im in j.get('images', []):
        if im.get('mimeType') != 'image/ktx2': continue
        v = views[im['bufferView']]
        assert v.get('buffer', 0) == 0
        k = binb[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        cap = inspect_mx if (inspect_mx and '_inspect' in im.get('name', '')) else mx
        while u32(k, 20) > cap:
            k, _ = drop_top_level(k); changed += 1
        replace[im['bufferView']] = k
    # Every region of the embedded buffer 0: plain views on buffer 0, and meshopt views whose
    # compressed bytes live in buffer 0 (their own `buffer` is the data-less fallback buffer).
    regions = []
    for i, v in enumerate(views):
        mo = (v.get('extensions') or {}).get('EXT_meshopt_compression')
        if mo is not None and mo.get('buffer', 0) == 0:
            regions.append((mo.get('byteOffset', 0), i, 'ext', mo['byteLength']))
        if v.get('buffer', 0) == 0:
            regions.append((v.get('byteOffset', 0), i, 'view', v['byteLength']))
    regions.sort()
    chunks, pos = [], 0
    for off, i, kind, ln in regions:
        data = replace[i] if (kind == 'view' and i in replace) else binb[off:off + ln]
        pos += (-pos) % 16
        if kind == 'view':
            views[i]['byteOffset'] = pos; views[i]['byteLength'] = len(data)
        else:
            views[i]['extensions']['EXT_meshopt_compression']['byteOffset'] = pos
        chunks.append((pos, data)); pos += len(data)
    pos += (-pos) % 4
    j['buffers'][0]['byteLength'] = pos
    newbin = bytearray(pos)
    for p, data in chunks: newbin[p:p + len(data)] = data
    js = json.dumps(j, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(newbin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(newbin), b'BIN\x00')); f.write(newbin)
    print(f'{src} -> {dst}: {changed} levels dropped, {len(b)/1e6:.1f} MB -> {total/1e6:.1f} MB')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 2048,
         int(sys.argv[4]) if len(sys.argv) > 4 else None)
