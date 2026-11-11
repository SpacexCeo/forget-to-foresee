#!/usr/bin/env bash
# Runs every test suite of the repository from a clean clone and prints one table (audit QW-7).
#   bash scripts/verify-all.sh [--skip-rust] [--write]
# Prerequisites: Node.js 20+ and npm; for the contracts also Rust (pinned by contracts/*/rust-toolchain.toml),
# pkg-config and OpenSSL headers. Missing pieces are reported in one line each.
set -u
cd "$(dirname "$0")/.."
skip_rust=0; for a in "$@"; do [ "$a" = "--skip-rust" ] && skip_rust=1; done
missing=0
need() { if ! command -v "$1" >/dev/null 2>&1; then echo "missing: $1 — $2"; missing=1; fi; }
need node "install Node.js 20 or newer (https://nodejs.org)"
need npm "comes with Node.js"
if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]'); [ "$major" -ge 20 ] || { echo "missing: Node.js >= 20 (found $(node -v))"; missing=1; }
fi
if [ "$skip_rust" = 0 ]; then
  need cargo "install Rust with rustup (https://rustup.rs); the toolchain version is pinned per contract; or pass --skip-rust"
  need pkg-config "apt-get install pkg-config libssl-dev (Debian/Ubuntu); or pass --skip-rust"
  if command -v pkg-config >/dev/null 2>&1 && ! pkg-config --exists openssl; then echo "missing: OpenSSL headers — apt-get install libssl-dev; or pass --skip-rust"; missing=1; fi
fi
[ "$missing" = 0 ] || exit 2
[ -d game/node_modules ] || (cd game && npm ci --no-audit --no-fund >/dev/null) || { echo "npm ci failed in game/"; exit 2; }
exec node scripts/stats.mjs "$@"
