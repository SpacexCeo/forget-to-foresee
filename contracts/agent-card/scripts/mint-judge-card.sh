#!/usr/bin/env bash
# One command for the owner: create ftf-agents.testnet, deploy the agent-card contract and mint the judge season's
# Iris card to lambada_eth.testnet. Testnet only. Safe to re-run: every step checks whether it is already done.
# Signing uses the keys already in this machine's NEAR keychain (lambada_eth.testnet; the new contract account's
# key is created by the faucet step). Run from Git Bash:  bash contracts/agent-card/scripts/mint-judge-card.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CONTRACT=ftf-agents.testnet
OWNER=lambada_eth.testnet
SEASON=793f6c05e89839f2
TOKEN="$SEASON-agent-iris"
JUDGE="judge/$SEASON"
RPC=https://test.rpc.fastnear.com

# Windows: gcc writes linker response files to %TEMP%, which ld cannot read under C:\Windows\TEMP (docs/agent-nft.md)
mkdir -p target/tmp
export TMP="$PWD/target/tmp" TEMP="$PWD/target/tmp" TMPDIR="$PWD/target/tmp"

rpc() { curl -s -X POST "$RPC" -H 'Content-Type: application/json' -d "$1"; }
exists() { rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"'"$CONTRACT"'"}}' | grep -q '"code_hash"'; }
has_code() { rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"'"$CONTRACT"'"}}' | grep -q '"code_hash":"[^1]'; }
minted() {
  local args; args=$(printf '{"token_id":"%s"}' "$TOKEN" | base64 | tr -d '\n')
  rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"'"$CONTRACT"'","method_name":"get_agent","args_base64":"'"$args"'"}}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s).result;const v=r&&r.result?JSON.parse(Buffer.from(r.result).toString()):null;process.exit(v?0:1)}catch{process.exit(1)}})'
}

echo "1/5 Checking the generated mint arguments against the real engine…"
node scripts/judge-agent-args.mjs --check

if exists; then echo "2/5 $CONTRACT exists"; else
  echo "2/5 Creating $CONTRACT through the testnet faucet…"
  near account create-account sponsor-by-faucet-service "$CONTRACT" autogenerate-new-keypair save-to-keychain network-config testnet create
  sleep 3
fi

if has_code; then echo "3/5 Contract already deployed"; else
  echo "3/5 Building and deploying the contract…"
  cargo near deploy build-non-reproducible-wasm --no-abi "$CONTRACT" with-init-call new json-args \
    '{"owner_id":"'"$OWNER"'","coordinators":["'"$OWNER"'"],"season_contract":"ftf-seasons.testnet","shard_contract":"ftf-shards.testnet"}' \
    prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
  sleep 3
fi

echo "4/5 Dry run: the contract recomputes the state hash…"
want=$(node -e 'console.log(require("./'"$JUDGE"'/summary.json").stateHash)')
got=$(near contract call-function as-read-only "$CONTRACT" preview_agent file-args "$JUDGE/preview-agent.json" network-config testnet now 2>&1 | tr -d '\r' | grep -o '[0-9a-f]\{64\}' | head -1 || true)
if [ "$got" != "$want" ]; then echo "STOP: preview hash '$got' differs from summary.json '$want'"; exit 1; fi
echo "    state hash $got ✓"

if minted; then echo "5/5 $TOKEN is already minted"; else
  echo "5/5 Minting $TOKEN to $OWNER…"
  near contract call-function as-transaction "$CONTRACT" mint_agent file-args "$JUDGE/mint-agent.json" \
    prepaid-gas '100.0 Tgas' attached-deposit '0.5 NEAR' sign-as "$OWNER" network-config testnet sign-with-keychain send
  sleep 3
  minted || { echo "STOP: the token is not visible yet; re-run this script in a minute"; exit 1; }
fi

echo
echo "Done: https://testnet.nearblocks.io/address/$CONTRACT?tab=nfts"
echo "The game finds the card by itself (game/src/net/agent-nft.js reads $CONTRACT); nothing else to edit."
