#!/usr/bin/env bash
# Testnet only. Deploys season-commit, commits a fixed-seed game season (default: the judge demo season) and
# reveals every leaf on-chain, recording each transaction hash. Nothing here touches mainnet or real funds:
# the accounts come from the testnet faucet, the deposits are refundable storage deposits in testnet NEAR.
#
# Usage:
#   scripts/deploy-judge-season.sh <CONTRACT_ID> <COORDINATOR_ID> [seedHex] [keychain]
#     CONTRACT_ID     e.g. ftf-seasons.testnet (created through the faucet below if it does not exist)
#     COORDINATOR_ID  the account that signs commit_season / commit_ash_key (may equal CONTRACT_ID)
#     seedHex         32 lowercase hex characters; default cc161d308faa67539af44205b56b6d4f (?demo=judge)
#     keychain        "keychain" (OS keychain, default) or "legacy-keychain" (~/.near-credentials; containers, CI)
#   Steps already done are skipped (an existing account, an existing deployment, an already committed season,
#   an already revealed leaf), so the script can be re-run after a failure.
# Output: target/judge-deploy/<seasonId>.json (ids, hashes); then `node scripts/write-deployment.mjs` turns it
# into game/src/net/near-deployment.js for the client.
set -euo pipefail

CONTRACT_ID="${1:?CONTRACT_ID (e.g. ftf-seasons.testnet)}"
COORDINATOR_ID="${2:?COORDINATOR_ID}"
SEED="${3:-cc161d308faa67539af44205b56b6d4f}"
KEYCHAIN="${4:-keychain}"
NET="network-config testnet"
SIGN="sign-with-${KEYCHAIN}"
cd "$(dirname "$0")/.."

for id in "$CONTRACT_ID" "$COORDINATOR_ID"; do
  case "$id" in *.testnet) ;; *) echo "refusing: $id is not a .testnet account" >&2; exit 2 ;; esac
done

# 0. Arguments for the season, exactly as the game builds them.
node scripts/judge-season-args.mjs "$SEED"
SEASON_ID=$(node -e "const s=require('fs').readdirSync('target/judge-args').find(d=>JSON.parse(require('fs').readFileSync('target/judge-args/'+d+'/summary.json')).seedHex==='$SEED');console.log(s)")
ARGS="target/judge-args/$SEASON_ID"
OUT_DIR=target/judge-deploy; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/$SEASON_ID.json"
ROOT=$(node -pe "JSON.parse(require('fs').readFileSync('$ARGS/summary.json')).scheduleRoot")
LEAF_COUNT=$(node -pe "JSON.parse(require('fs').readFileSync('$ARGS/summary.json')).leafCount")
echo "season $SEASON_ID root $ROOT ($LEAF_COUNT leaves) -> $CONTRACT_ID as $COORDINATOR_ID"

# Transaction hash of a near-cli-rs transaction result (its output names the hash on one line).
tx_hash() { grep -oE 'Transaction ID: [A-Za-z0-9]+' | head -1 | awk '{print $3}'; }
exists() { near account view-account-summary "$1" $NET now >/dev/null 2>&1; }

# 1. Accounts (faucet-sponsored; the key goes to the keychain, never to the repository).
for id in "$CONTRACT_ID" "$COORDINATOR_ID"; do
  if exists "$id"; then echo "account $id exists"; else
    echo "creating $id through the testnet faucet"
    near account create-account sponsor-by-faucet-service "$id" autogenerate-new-keypair "save-to-${KEYCHAIN}" $NET create
  fi
done

# 2. Build + deploy + init (skipped when the account already runs a contract).
if near contract call-function as-read-only "$CONTRACT_ID" get_owner json-args '{}' $NET now >/dev/null 2>&1; then
  echo "contract already deployed on $CONTRACT_ID"
  DEPLOY_TX=$(node -pe "try{JSON.parse(require('fs').readFileSync('$OUT')).deployTx||''}catch{''}")
else
  DEPLOY_TX=$(cargo near deploy build-non-reproducible-wasm --no-abi "$CONTRACT_ID" with-init-call new \
    json-args "{\"owner_id\":\"$COORDINATOR_ID\",\"coordinators\":[\"$COORDINATOR_ID\"]}" \
    prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' $NET $SIGN send 2>&1 | tee /dev/stderr | tx_hash)
fi

call() { # call <method> <args-file> <signer>  -> prints the tx hash
  near contract call-function as-transaction "$CONTRACT_ID" "$1" file-args "$2" prepaid-gas '30.0 Tgas' attached-deposit '0.01 NEAR' sign-as "$3" $NET $SIGN send 2>&1 | tee /dev/stderr | tx_hash
}
view() { near contract call-function as-read-only "$CONTRACT_ID" "$1" file-args "$2" $NET now 2>/dev/null; }

# 3. Commit the schedule root and the Ash key (coordinator).
if view get_season "$ARGS/season.json" | grep -q '"schedule_root"'; then
  echo "season $SEASON_ID already committed"; COMMIT_TX=$(node -pe "try{JSON.parse(require('fs').readFileSync('$OUT')).commitTx||''}catch{''}")
else
  COMMIT_TX=$(call commit_season "$ARGS/commit-season.json" "$COORDINATOR_ID")
fi
if view get_ash_key "$ARGS/season.json" | grep -q '"commitment"'; then
  echo "Ash key already committed"; ASH_TX=$(node -pe "try{JSON.parse(require('fs').readFileSync('$OUT')).ashKeyTx||''}catch{''}")
else
  ASH_TX=$(call commit_ash_key "$ARGS/commit-ash-key.json" "$COORDINATOR_ID")
fi

# 4. Reveal every leaf on-chain (anyone may; the coordinator signs here). Dry run first, free.
REVEALS="{"
for ((i = 0; i < LEAF_COUNT; i++)); do
  if view get_revealed_leaf "$ARGS/reveal-$i.json" | grep -q '"leaf"'; then
    echo "leaf $i already revealed"; H=$(node -pe "try{(JSON.parse(require('fs').readFileSync('$OUT')).revealTx||{})['$i']||''}catch{''}")
  else
    view check_leaf "$ARGS/reveal-$i.json" | grep -q '"valid": *true' || { echo "check_leaf $i rejected the proof" >&2; exit 3; }
    H=$(call reveal_leaf "$ARGS/reveal-$i.json" "$COORDINATOR_ID")
  fi
  REVEALS="$REVEALS\"$i\":\"$H\","
done
REVEALS="${REVEALS%,}}"

# 5. Record (no secrets: account ids and public transaction hashes only).
node -e "
const fs=require('fs');const out={network:'testnet',contractId:'$CONTRACT_ID',ownerId:'$COORDINATOR_ID',coordinatorId:'$COORDINATOR_ID',
seedHex:'$SEED',seasonId:'$SEASON_ID',scheduleRoot:'$ROOT',leafCount:$LEAF_COUNT,deployTx:'$DEPLOY_TX',commitTx:'$COMMIT_TX',ashKeyTx:'$ASH_TX',
revealTx:$REVEALS,recordedAt:new Date().toISOString()};fs.writeFileSync('$OUT',JSON.stringify(out,null,2)+'\n');console.log('wrote $OUT');"
echo "now: node scripts/write-deployment.mjs   # -> game/src/net/near-deployment.js"
