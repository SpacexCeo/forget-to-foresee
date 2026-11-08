#!/usr/bin/env bash
# Testnet only. Deploys memory-shard and mints the shards of the canonical judge playthrough, recording every
# transaction hash. Nothing here touches mainnet or real funds: faucet accounts, refundable storage deposits.
#
# Usage:
#   scripts/deploy-judge-shards.sh <CONTRACT_ID> <COORDINATOR_ID> [RECEIVER_ID] [seedHex] [keychain|legacy-keychain] [SEASON_CONTRACT_ID]
#     CONTRACT_ID         e.g. ftf-shards.testnet (created through the faucet if missing)
#     COORDINATOR_ID      signs the mints (may equal the season-commit coordinator); owner of the collection
#     RECEIVER_ID         the account that receives the shards (default: COORDINATOR_ID, standing in for the AI clans)
#     seedHex             default cc161d308faa67539af44205b56b6d4f (?demo=judge)
#     SEASON_CONTRACT_ID  the season-commit contract to reference (default ftf-seasons.testnet)
#   Re-runnable: existing accounts, an existing deployment and already minted shards are skipped.
# Output: target/judge-deploy/<seasonId>.json; then `node ../season-commit/scripts/write-deployment.mjs`.
set -euo pipefail
CONTRACT_ID="${1:?CONTRACT_ID}"; COORDINATOR_ID="${2:?COORDINATOR_ID}"; RECEIVER_ID="${3:-$COORDINATOR_ID}"
SEED="${4:-cc161d308faa67539af44205b56b6d4f}"; KEYCHAIN="${5:-keychain}"; SEASON_CONTRACT="${6:-ftf-seasons.testnet}"
NET="network-config testnet"; SIGN="sign-with-${KEYCHAIN}"
cd "$(dirname "$0")/.."
for id in "$CONTRACT_ID" "$COORDINATOR_ID" "$RECEIVER_ID" "$SEASON_CONTRACT"; do
  case "$id" in *.testnet) ;; *) echo "refusing: $id is not a .testnet account" >&2; exit 2 ;; esac
done

node scripts/judge-shards-args.mjs "$SEED" --receiver "$RECEIVER_ID"
SEASON_ID=$(node -e "const fs=require('fs');console.log(fs.readdirSync('target/judge-shards').find(d=>JSON.parse(fs.readFileSync('target/judge-shards/'+d+'/summary.json')).seedHex==='$SEED'))")
ARGS="target/judge-shards/$SEASON_ID"; OUT_DIR=target/judge-deploy; mkdir -p "$OUT_DIR"; OUT="$OUT_DIR/$SEASON_ID.json"
IDS=$(node -pe "JSON.parse(require('fs').readFileSync('$ARGS/summary.json')).shards.map(s=>s.shard_id).join(' ')")
echo "season $SEASON_ID, shards: $IDS -> $CONTRACT_ID (receiver $RECEIVER_ID)"

tx_hash() { grep -oE 'Transaction ID: [1-9A-HJ-NP-Za-km-z]+|/(transactions|txns)/[1-9A-HJ-NP-Za-km-z]+' | head -1 | sed -E 's#.*(: |/)##'; }
exists() { near account view-account-summary "$1" $NET now >/dev/null 2>&1; }
prev() { node -pe "try{const r=JSON.parse(require('fs').readFileSync('$OUT'));$1}catch{''}"; }

for id in "$CONTRACT_ID" "$COORDINATOR_ID"; do
  if exists "$id"; then echo "account $id exists"; else
    near account create-account sponsor-by-faucet-service "$id" autogenerate-new-keypair "save-to-${KEYCHAIN}" $NET create
  fi
done
exists "$RECEIVER_ID" || { echo "receiver $RECEIVER_ID does not exist" >&2; exit 3; }

if near contract call-function as-read-only "$CONTRACT_ID" get_owner json-args '{}' $NET now >/dev/null 2>&1; then
  echo "contract already deployed on $CONTRACT_ID"; DEPLOY_TX=$(prev "r.deployTx||''")
else
  DEPLOY_TX=$(cargo near deploy build-non-reproducible-wasm --no-abi "$CONTRACT_ID" with-init-call new \
    json-args "{\"owner_id\":\"$COORDINATOR_ID\",\"coordinators\":[\"$COORDINATOR_ID\"],\"season_contract\":\"$SEASON_CONTRACT\"}" \
    prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' $NET $SIGN send 2>&1 | tee /dev/stderr | tx_hash)
fi

MINTS="{"
for i in $IDS; do
  TOKEN="$SEASON_ID-$i"
  if near contract call-function as-read-only "$CONTRACT_ID" get_shard json-args "{\"token_id\":\"$TOKEN\"}" $NET now 2>/dev/null | grep -q '"token_id"'; then
    echo "shard $TOKEN already minted"; H=$(prev "(r.mintTx||{})['$i']||''")
  else
    # Free preview first: the contract validates the data and renders the same image the game shows.
    near contract call-function as-read-only "$CONTRACT_ID" preview_shard json-args "$(node -pe "JSON.stringify({shard: JSON.parse(require('fs').readFileSync('$ARGS/mint-$i.json')).shard})")" $NET now >/dev/null
    H=$(near contract call-function as-transaction "$CONTRACT_ID" mint_shard file-args "$ARGS/mint-$i.json" prepaid-gas '50.0 Tgas' attached-deposit '0.1 NEAR' sign-as "$COORDINATOR_ID" $NET $SIGN send 2>&1 | tee /dev/stderr | tx_hash)
  fi
  MINTS="$MINTS\"$i\":\"$H\","
done
MINTS="${MINTS%,}}"

node -e "
const fs=require('fs');const s=JSON.parse(fs.readFileSync('$ARGS/summary.json'));
const out={network:'testnet',contractId:'$CONTRACT_ID',ownerId:'$COORDINATOR_ID',coordinatorId:'$COORDINATOR_ID',receiverId:'$RECEIVER_ID',seasonContract:'$SEASON_CONTRACT',
seedHex:'$SEED',seasonId:'$SEASON_ID',scheduleRoot:s.scheduleRoot,deployTx:'$DEPLOY_TX',mintTx:$MINTS,tokens:s.shards.map(x=>x.tokenId),recordedAt:new Date().toISOString()};
fs.writeFileSync('$OUT',JSON.stringify(out,null,2)+'\n');console.log('wrote $OUT');"
echo "now: node ../season-commit/scripts/write-deployment.mjs   # -> game/src/net/near-deployment.js"
