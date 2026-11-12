#!/usr/bin/env bash
# The town economy on NEAR testnet (docs/town-economy.md, docs/security-town.md), idempotent. Run by the lead after
# the owner's yes; nothing here runs from an agent.
#   ftf-town.testnet        the town contract (created through the testnet faucet if missing)
#   tf-<key>.<signer> x 20  the scripted trader accounts, each with a trade-only key whose private part lives only on
#                           the relayer's server (node relayer/scripts/market-keys.mjs prints the public keys)
# Signed by $SIGNER (default ftf-coordinator.testnet) with ~/.near-credentials. Needs near CLI and cargo-near.
#   TRADER_KEYS=market-public.json bash contracts/scripts/town-deploy.sh          # deploy + traders + keys + genesis
#   MODE=topup TOPUP=0.3 MIN=0.1 bash contracts/scripts/town-deploy.sh            # refill traders below MIN NEAR
#   MODE=day bash contracts/scripts/town-deploy.sh                                # the daily sweep_fees + distribute
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
TOWN=${TOWN:-ftf-town.testnet}
near_of() { view_account "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(Number(BigInt(JSON.parse(s).result.amount)/10n**20n)/1e4))}catch{process.stdout.write("0")}})'; }
call() { near contract call-function as-transaction "$TOWN" "$1" json-args "$2" prepaid-gas "${3:-100.0} Tgas" attached-deposit '0 NEAR' sign-as "$SIGNER" "${SIGN[@]}"; }

if [ "${MODE:-}" = topup ]; then
  for acc in $(node -e 'import("'"$ROOT"'/relayer/market/catalog.js").then(c=>console.log(c.TRADERS.map(k=>c.traderAccount(k,process.argv[1])).join(" ")))' "$SIGNER"); do
    bal=$(near_of "$acc")
    if node -e 'process.exit(Number(process.argv[1]) < Number(process.argv[2]) ? 0 : 1)' "$bal" "${MIN:-0.1}"; then
      echo "    $acc has $bal NEAR -> +${TOPUP:-0.3}"; near tokens "$SIGNER" send-near "$acc" "${TOPUP:-0.3} NEAR" "${SIGN[@]}"
    else echo "    $acc has $bal NEAR"; fi
  done
  echo "Coordinator: $(near_of "$SIGNER") NEAR"; exit 0
fi
if [ "${MODE:-}" = day ]; then call sweep_fees '{}' 50.0; call distribute '{}' 50.0; echo "$(view "$TOWN" pulse '{}')"; exit 0; fi

[ -n "${TRADER_KEYS:-}" ] && [ -f "$TRADER_KEYS" ] || { echo "Set TRADER_KEYS=<file printed by relayer/scripts/market-keys.mjs>"; exit 1; }
echo "1/6 Building the wasm…"
TW=$(wasm town); echo "    $TW ($(wc -c < "$TW") bytes)"
echo "2/6 Town account…"
if exists "$TOWN"; then echo "    $TOWN exists"; else
  case "$TOWN" in
    *."$SIGNER") create "$TOWN" "${TOWN_FUND:-6}" ;;
    *) near account create-account sponsor-by-faucet-service "$TOWN" autogenerate-new-keypair save-to-legacy-keychain network-config testnet create; sleep 3 ;;
  esac
fi
echo "3/6 Contract…"
if has_code "$TOWN"; then echo "    $TOWN has code"; else
  near contract deploy "$TOWN" use-file "$TW" with-init-call new json-args '{"owner_id":"'"$SIGNER"'","coordinators":["'"$SIGNER"'"],"params":null}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
fi
echo "4/6 Traders…"
LIST=$(node -e 'const j=require(require("path").resolve(process.argv[1]));for(const t of j.traders){if(!/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(t.public_key))throw new Error("not a public key: "+t.key);console.log(t.account+" "+t.public_key)}' "$TRADER_KEYS")
ACCS=()
while read -r acc pub; do
  ACCS+=("\"$acc\"")
  create "$acc" "${TRADER_FUND:-0.3}"
  if rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key","finality":"final","account_id":"'"$acc"'","public_key":"'"$pub"'"}}' | grep -q "\"receiver_id\":\"$TOWN\""; then echo "    $acc trade key present"; else
    near account add-key "$acc" grant-function-call-access --allowance "${ALLOWANCE:-unlimited}" --contract-account-id "$TOWN" --function-names trade use-manually-provided-public-key "$pub" "${SIGN[@]}"
  fi
done <<< "$LIST"
echo "5/6 Genesis (1,000 silk per trader; micro-units)…"
if [ "$(view "$TOWN" pulse '{}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).minted_silk)}catch{process.stdout.write("0")}})')" != "0" ]; then echo "    done before"; else
  call genesis '{"traders":['"$(IFS=,; echo "${ACCS[*]}")"'],"silk_each":"1000000000"}' 200.0
fi
echo "6/6 Game deployment file…"
node "$ROOT/contracts/scripts/day1-write.mjs" town="$TOWN"
echo
echo "Done: $(view "$TOWN" pulse '{}')"
echo "Coordinator: $(near_of "$SIGNER") NEAR. On the server: FTF_TOWN=1 (dry run) in relayer/.env, restart, check /api/market/stats; then FTF_TOWN_SEND=1 after the owner's yes."
