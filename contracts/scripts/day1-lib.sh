#!/usr/bin/env bash
# Shared helpers for the Day 1 scripts (testnet only). Sourced, not run.
SIGNER=${SIGNER:-ftf-coordinator.testnet}
RPC=${RPC:-https://test.rpc.fastnear.com}
HEROINE=${HEROINE:-heroine.$SIGNER}
COMPANIONS=${COMPANIONS:-companions.$SIGNER}
GUESTS=${GUESTS:-guests.$SIGNER}
AGENTS=${AGENTS:-agents.$SIGNER}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# Signing: the keys in ~/.near-credentials (the near CLI's legacy keychain).
SIGN=(network-config testnet sign-with-legacy-keychain send)

rpc() { curl -s -X POST "$RPC" -H 'Content-Type: application/json' -d "$1"; }
view_account() { rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"'"$1"'"}}'; }
exists() { view_account "$1" | grep -q '"code_hash"'; }
has_code() { view_account "$1" | grep -q '"code_hash":"[^1]'; }
# view <contract> <method> <json args>: prints the JSON result (or nothing)
view() {
  local args; args=$(printf '%s' "$3" | base64 | tr -d '\n')
  rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"'"$1"'","method_name":"'"$2"'","args_base64":"'"$args"'"}}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s).result;if(r&&r.result)process.stdout.write(Buffer.from(r.result).toString())}catch{}})'
}
# wasm <crate>: builds the crate with cargo-near and prints the .wasm path
wasm() {
  (cd "$ROOT/contracts/$1" && cargo near build non-reproducible-wasm --no-abi >&2)
  find "$ROOT/contracts/$1/target/near" -name '*.wasm' | head -1
}
# create <account> <NEAR>: a sub-account of $SIGNER, its key saved to the legacy keychain (skipped when it exists)
create() {
  if exists "$1"; then echo "    $1 exists"; return; fi
  near account create-account fund-myself "$1" "$2 NEAR" autogenerate-new-keypair save-to-legacy-keychain sign-as "$SIGNER" "${SIGN[@]}"
  sleep 3
}
# Windows Git Bash: linker temp files (as in contracts/agent-card/scripts/mint-judge-card.sh)
mkdir -p "$ROOT/contracts/target/tmp"; export TMP="$ROOT/contracts/target/tmp" TEMP="$ROOT/contracts/target/tmp" TMPDIR="$ROOT/contracts/target/tmp"
