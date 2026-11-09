#!/usr/bin/env python3
"""Prepare a near.social post with one image, without signing anything.

near.social (https://near.social/skill.md) stores every write as a FastData KV
transaction to the NEAR account `social`; images go to FastFS first. This script
does the offline half of that recipe:

  1. re-encodes the image as WebP (at most 2048 px on the long side, under 1 MiB,
     so one `__fastdata_fastfs` transaction carries it);
  2. computes the content-addressed path `media/<sha256>.webp`;
  3. writes the borsh `FastfsData::Simple` payload to `out/upload-0.bin`;
  4. writes the `__fastdata_kv` arguments (the post with its media entry) to
     `out/post-args.json`;
  5. prints the near-cli-rs commands that sign and send both transactions with the
     owner's own keychain, plus the URLs to poll afterwards.

The private key never touches this script: signing stays in near-cli-rs.

Usage:
  python tools/near-social/post.py --account you.near --image shot.png --text-file post.txt
  python tools/near-social/post.py --account you.near --image shot.png --text "gm #near"

Requires Pillow (`pip install pillow`).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
import time
from pathlib import Path

MIB = 1 << 20
MAX_SIDE = 2048


def _bytes(x: bytes) -> bytes:
    """Borsh `Vec<u8>` / `String`: little-endian u32 length, then the bytes."""
    return struct.pack("<I", len(x)) + x


def encode_webp(src: Path, dst: Path) -> tuple[int, int]:
    """Re-encode `src` as WebP into `dst`, under 1 MiB and 2048 px. Returns (w, h)."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover
        sys.exit("Pillow is required: pip install pillow")
    im = Image.open(src)
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    w, h = im.size
    scale = min(1.0, MAX_SIDE / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    for quality in (92, 88, 84, 80, 75, 70, 60, 50):
        im.save(dst, "WEBP", quality=quality, method=6)
        if dst.stat().st_size <= MIB:
            return im.size
    sys.exit(f"could not fit {src} under 1 MiB as WebP; crop or shrink it first")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--account", required=True, help="NEAR mainnet account that signs, e.g. you.near")
    ap.add_argument("--image", required=True, type=Path, help="PNG/JPEG/WebP to attach")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", help="post text (plain text, at most 25,000 chars)")
    group.add_argument("--text-file", type=Path, help="file with the post text")
    ap.add_argument("--alt", default="", help="alt text for the image")
    ap.add_argument("--out", type=Path, default=Path(__file__).with_name("out"), help="output folder")
    ap.add_argument("--post-id", type=int, default=None, help="post id (Unix ms); default: now")
    args = ap.parse_args()

    text = args.text if args.text is not None else args.text_file.read_text(encoding="utf-8").strip()
    if not text or len(text) > 25_000:
        sys.exit("post text must be 1 to 25,000 characters")

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    webp = out / "image.webp"
    w, h = encode_webp(args.image, webp)
    data = webp.read_bytes()
    path = f"media/{hashlib.sha256(data).hexdigest()}.webp"
    mime = "image/webp"

    # FastfsData::Simple { path: String, mime_type: Option<String>, data: Vec<u8> }
    payload = b"\x00" + _bytes(path.encode()) + b"\x01" + _bytes(mime.encode()) + _bytes(data)
    (out / "upload-0.bin").write_bytes(payload)

    post_id = args.post_id or int(time.time() * 1000)
    post_args = {
        f"post/{post_id}": {
            "text": text,
            "media": [
                {
                    "src": f"fastfs://{args.account}/social/{path}",
                    "mime": mime,
                    "w": w,
                    "h": h,
                    "alt": args.alt,
                }
            ],
        }
    }
    (out / "post-args.json").write_text(json.dumps(post_args, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    rel = out.as_posix()
    print(f"image: {webp} ({len(data)} bytes, {w}x{h})")
    print(f"path:  {path}")
    print(f"post:  {args.account}/{post_id}")
    print()
    print("# 1. Upload the image (the receipt shows as failed: expected, `social` has no contract)")
    print(
        f"near contract call-function as-transaction social __fastdata_fastfs file-args {rel}/upload-0.bin "
        f"prepaid-gas '1 Ggas' attached-deposit '0 NEAR' sign-as {args.account} network-config mainnet "
        f"sign-with-keychain send"
    )
    print()
    print("# 2. Wait until the upload is indexed (indexed: true), then until the image returns 200")
    print("curl -s https://api2.near.social/v1/tx/<TX_HASH_1>")
    print(f"curl -s -o /dev/null -w '%{{http_code}}\\n' 'https://main.fastfs.io/{args.account}/social/{path}?v={post_id}'")
    print()
    print("# 3. Publish the post")
    print(
        f"near contract call-function as-transaction social __fastdata_kv file-args {rel}/post-args.json "
        f"prepaid-gas '1 Ggas' attached-deposit '0 NEAR' sign-as {args.account} network-config mainnet "
        f"sign-with-keychain send"
    )
    print()
    print("# 4. Confirm and open")
    print("curl -s https://api2.near.social/v1/tx/<TX_HASH_2>")
    print(f"https://near.social/{args.account}/post/{post_id}")


if __name__ == "__main__":
    main()
