#!/usr/bin/env python3
"""Independent verifier for Forget to Foresee proof exports (format "ftf-proof/1"), Python 3.8+, standard library only.

    python3 tools/verify/verify.py proof.json     # or season.json; "-" reads stdin

Same checks as tools/verify/verify.mjs, in a second language and a second SHA-256 implementation (hashlib), so a
reader who trusts neither Node nor the game can still repeat the arithmetic. Ends with OK (exit 0) or FAIL (exit 1).
"""
import hashlib
import json
import re
import sys

HEX64 = re.compile(r"^[0-9a-f]{64}$")
failed = 0


def sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def short(h):
    return f"{h[:8]}…{h[-8:]}" if isinstance(h, str) and len(h) > 16 else str(h)


def check(cond, what, extra=""):
    global failed
    if not cond:
        failed += 1
    print(f"  {'✓' if cond else '✗'} {what}{'  ' + extra if extra else ''}")


def parse_canonical(s):
    m = re.match(r'^\{"t":(\d+),"place":(\d),"action":(\d),"power":(\d),"delay":(\d),"dots":(\d)\}$', s or "")
    if not m:
        return None
    t, place, action, power, delay, dots = (int(x) for x in m.groups())
    if place > 3 or action > 3 or power > 3 or dots > 3 or delay < 1 or delay > 4 or delay >= t:
        return None
    return {"t": t, "place": place, "action": action, "power": power, "delay": delay, "dots": dots}


def verify_leaf(season, leaf, path, label):
    print(f"{label}: index {leaf['index']}, tick {leaf.get('tick')}, event {leaf['canonicalEvent']}")
    ev = parse_canonical(leaf["canonicalEvent"])
    check(ev is not None, "canonical event has the exact byte form and v2 ranges")
    salt = leaf["salt"]
    check(bool(re.match(r"^[0-9a-f]{64,128}$", salt)) and len(salt) % 2 == 0, "salt is 32-64 bytes of lowercase hex", f"({len(salt) // 2} bytes)")
    preimage = f"ftf:leaf:{season['schema']}|{season['id']}|{leaf['index']}|{leaf['canonicalEvent']}|{salt}"
    recomputed = sha256(preimage)
    check(recomputed == leaf["leaf"], "sha256(preimage) equals the leaf hash", short(recomputed))
    well_formed = isinstance(path, list) and all(HEX64.match(s.get("h", "")) and isinstance(s.get("left"), bool) for s in path)
    check(well_formed, f"Merkle path has {len(path) if isinstance(path, list) else 0} well-formed steps")
    if season.get("leafCount") is not None:
        depth, n = 0, season["leafCount"]
        while n > 1:
            n = (n + 1) // 2
            depth += 1
        check(len(path) == depth, f"path length {len(path)} matches the depth of a {season['leafCount']}-leaf tree")
        idx, sides_ok = leaf["index"], True
        for s in path:
            sides_ok = sides_ok and (s["left"] == ((idx & 1) == 1))
            idx >>= 1
        check(sides_ok, "every step sits on the side its index implies")
    node = recomputed
    for s in path:
        node = sha256(s["h"] + node) if s["left"] else sha256(node + s["h"])
    check(node == season["scheduleRoot"], "folding the path lands on the schedule root", short(node))
    m = leaf.get("meaning")
    if ev and m:
        shells, actions, powers = ["I", "II", "III", "IV"], ["gift", "storm", "silence", "call"], [10, 20, 40, 80]
        same = (m.get("place") in (None, ev["place"] + 1) and str(m.get("action", actions[ev["action"]])).lower() == actions[ev["action"]]
                and m.get("power") in (None, powers[ev["power"]]) and m.get("delay") in (None, ev["delay"]))
        check(same, f"the stated meaning (Shell {shells[ev['place']]}, {actions[ev['action']]}, power {powers[ev['power']]}, delay {ev['delay']}) is what the bytes say")


def verify_entropy(season):
    e = season.get("entropy")
    if not e or e.get("protocol") == "fixed-seed":
        print("season entropy: " + (f"fixed public seed {season.get('seedHex')} (demo season: anyone can regenerate it, nobody can claim it was random)" if season.get("fixedSeed") else "not exported"))
        return
    if e.get("protocol") == "none":
        print("season entropy: no seed protocol (legacy rules mode)")
        return
    print(f"season entropy: protocol {e.get('protocol')}")
    if e.get("protocol") != "ftf-seed/1":
        check(False, "unknown entropy protocol")
        return
    check(bool(HEX64.match(e.get("commitment") or "")), "room entropy commitment present (shown before the nonce was sent)", short(e.get("commitment")))
    nonce = e.get("nonce")
    check(isinstance(nonce, str) and len(nonce) <= 128, "player nonce recorded as empty (the player gave none)" if nonce == "" else "player nonce present", json.dumps(nonce)[:60])
    if e.get("roomEntropy") is None:
        print("  · room entropy not revealed yet (the season has not ended): commitment and nonce are recorded, derivation checked after the reveal")
        return
    check(bool(HEX64.match(e["roomEntropy"])), "room entropy is 32 bytes of hex")
    check(sha256(f"ftf:entropy:v1|{e['roomEntropy']}") == e["commitment"], 'sha256("ftf:entropy:v1|" + roomEntropy) equals the commitment')
    seed = sha256(f"ftf:seed:v1|{e['roomEntropy']}|{nonce}|{e.get('beacon') or ''}")[:32]
    check(seed == e.get("seedHex"), 'seed = sha256("ftf:seed:v1|" + roomEntropy + "|" + nonce + "|" + beacon)[0:32]', seed)
    print(f"  · regenerate the schedule from this seed with the published rules: cd game && node scripts/replay-season.mjs {seed} <this file>")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h"):
        print("usage: python3 tools/verify/verify.py <proof.json | ->\n  Checks a Forget to Foresee proof export (format ftf-proof/1). Exit 0 = OK, 1 = FAIL.")
        sys.exit(0 if len(sys.argv) >= 2 else 2)
    text = sys.stdin.read() if sys.argv[1] == "-" else open(sys.argv[1], encoding="utf-8").read()
    doc = json.loads(text)
    if doc.get("format") != "ftf-proof/1":
        print(f"FAIL: unknown format {doc.get('format')!r}")
        sys.exit(1)
    s = doc["season"]
    print(f"{doc.get('game', 'ftf')} proof export, season {s['id']} (rules {s.get('rules')}, commitment schema {s['schema']})")
    print(f"schedule root {s['scheduleRoot']}")
    check(bool(HEX64.match(s.get("scheduleRoot") or "")), "schedule root is a full 32-byte hash")
    check(bool(re.match(r"^[0-9a-f]{8,64}$", s.get("id") or "")), "season id is lowercase hex")
    if doc.get("leaf"):
        verify_leaf(s, doc["leaf"], doc.get("merklePath"), "leaf")
    elif doc.get("leaves"):
        for item in doc["leaves"]:
            verify_leaf(s, item["leaf"], item.get("merklePath"), "leaf")
    else:
        check(False, "the export has neither a leaf nor leaves")
    ash = s.get("ashKey")
    if ash and ash.get("phrase") is not None:
        check(sha256(f"ftf:key:{s['schema']}|{s['id']}|{ash['phrase']}|{ash['salt']}") == s.get("ashKeyCommitment"), "Ash's revealed phrase and salt hash to the key commitment")
    verify_entropy(s)
    near = doc.get("near")
    if near and near.get("contractId"):
        print(f"NEAR testnet: contract {near['contractId']}, season {near.get('season')}" + (f", leaf {near['leaf']}" if near.get("leaf") else ""))
    print(f"FAIL ({failed} check{'s' if failed > 1 else ''} failed)" if failed else "OK")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
