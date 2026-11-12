#!/usr/bin/env bash
# Builds the whitelist pass wasm and prints its size, SHA-256 (hex, and base58 as NEAR's view_account code_hash shows
# it) and the exported methods, so the deployed code can be checked against this build (docs/mainnet-pass-runbook.md).
# Read-only: builds locally, signs nothing, deploys nothing.
#
# The deployable build is cargo-near's (as every contract here: contracts/*/README.md), which produces a wasm the NEAR
# runtime accepts. Without cargo-near this falls back to a plain cargo build for a local check of size and exports
# only: do not deploy that file.
set -euo pipefail
cd "$(dirname "$0")/.."
if cargo near --version >/dev/null 2>&1; then
  cargo near build non-reproducible-wasm --no-abi
  W=target/near/whitelist_pass.wasm
  echo "build: cargo-near (deployable)"
else
  RUSTFLAGS='-C link-arg=-s' cargo build --target wasm32-unknown-unknown --release
  W=target/wasm32-unknown-unknown/release/whitelist_pass.wasm
  echo "build: plain cargo (cargo-near not installed): LOCAL CHECK ONLY, do not deploy this file"
fi
echo "wasm: $W"
echo "size: $(wc -c < "$W") bytes"
echo "sha256: $(sha256sum "$W" | cut -d' ' -f1)"
node scripts/wasm-info.mjs "$W"
