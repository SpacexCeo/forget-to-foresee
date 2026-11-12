#!/usr/bin/env bash
# The town market on NEAR testnet (docs/market.md), idempotent:
#   market.<signer>          the market contract (25 goods, 20 traders, town silk balances)
#   tf-<key>.<signer> x 20   one account per trader (13 townsfolk + 7 clan agents), each with a trade-only key whose
#                            private part lives only on the relayer's server (relayer/scripts/market-keys.mjs)
# Signed by $SIGNER (default ftf-coordinator.testnet) with the keys in ~/.near-credentials. Needs near CLI and cargo-near.
#   TRADER_KEYS=market-public.json bash contracts/scripts/market-deploy.sh     # deploy + traders + keys
#   MODE=topup TOPUP=0.3 MIN=0.1 bash contracts/scripts/market-deploy.sh       # refill traders below MIN NEAR
# market-public.json is what `node relayer/scripts/market-keys.mjs` prints on the server (accounts + public keys only).
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
MARKET=${MARKET:-market.$SIGNER}
near_of() { view_account "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(Number(BigInt(JSON.parse(s).result.amount)/10n**20n)/1e4))}catch{process.stdout.write("0")}})'; }

if [ "${MODE:-}" = topup ]; then
  for acc in $(node -e 'import("'"$ROOT"'/relayer/market/catalog.js").then(c=>console.log(c.TRADERS.map(k=>c.traderAccount(k,process.argv[1])).join(" ")))' "$SIGNER"); do
    bal=$(near_of "$acc")
    if node -e 'process.exit(Number(process.argv[1]) < Number(process.argv[2]) ? 0 : 1)' "$bal" "${MIN:-0.1}"; then
      echo "    $acc has $bal NEAR -> +${TOPUP:-0.3}"
      near tokens "$SIGNER" send-near "$acc" "${TOPUP:-0.3} NEAR" "${SIGN[@]}"
    else echo "    $acc has $bal NEAR"; fi
  done
  echo "Coordinator: $(near_of "$SIGNER") NEAR"; exit 0
fi

[ -n "${TRADER_KEYS:-}" ] && [ -f "$TRADER_KEYS" ] || { echo "Set TRADER_KEYS=<file printed by relayer/scripts/market-keys.mjs>"; exit 1; }
echo "1/5 Building the wasm…"
MW=$(wasm market); echo "    $MW ($(wc -c < "$MW") bytes)"
echo "2/5 Market account…"
create "$MARKET" "${MARKET_FUND:-2}"
echo "3/5 Contract…"
if has_code "$MARKET"; then echo "    $MARKET has code"; else
  ITEMS=$(node -e 'import("'"$ROOT"'/relayer/market/catalog.js").then(c=>console.log(JSON.stringify(c.ITEMS.map(({id,base})=>({id,base})))))')
  near contract deploy "$MARKET" use-file "$MW" with-init-call new json-args '{"owner_id":"'"$SIGNER"'","items":'"$ITEMS"'}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
fi
echo "4/5 Traders…"
LIST=$(node -e 'const j=require(require("path").resolve(process.argv[1]));for(const t of j.traders){if(!/^ed25519:[1-9A-HJ-NP-Za-km-z]{40,50}$/.test(t.public_key))throw new Error("not a public key: "+t.key);console.log(t.account+" "+t.public_key)}' "$TRADER_KEYS")
ACCS=()
while read -r acc pub; do
  ACCS+=("\"$acc\"")
  create "$acc" "${TRADER_FUND:-0.2}"
  if rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key","finality":"final","account_id":"'"$acc"'","public_key":"'"$pub"'"}}' | grep -q '"permission"'; then echo "    $acc trade key present"; else
    near account add-key "$acc" grant-function-call-access --allowance unlimited --contract-account-id "$MARKET" --function-names trade use-manually-provided-public-key "$pub" "${SIGN[@]}"
  fi
done <<< "$LIST"
echo "5/5 Register traders…"
near contract call-function as-transaction "$MARKET" add_traders json-args '{"traders":['"$(IFS=,; echo "${ACCS[*]}")"'],"balance":1000}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" "${SIGN[@]}"
node "$ROOT/contracts/scripts/day1-write.mjs" market="$MARKET"
echo
echo "Done: $(view "$MARKET" stats '{}')"
echo "Coordinator: $(near_of "$SIGNER") NEAR. Then on the server: FTF_MARKET=1 in relayer/.env and restart (docs/handoff/relayer-tee-deploy.md step 3b)."
