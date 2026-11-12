#!/usr/bin/env bash
# Town items as NEP-245 multi-tokens on NEAR testnet (docs/town-items.md), idempotent. A NEW contract next to
# ftf-town (the deployed town contract is not touched): items.<town>, owner $SIGNER, minters = the 20 trader wallets
# (the stalls mint what they sell to players) and $SIGNER. Registers the first token ids: the five monster resources.
# Run by the lead after the owner's yes.
#   bash contracts/scripts/items-deploy.sh
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
TOWN=${TOWN:-ftf-town.testnet}
ITEMS=${ITEMS:-items.$TOWN}
echo "1/4 Building the wasm…"
IW=$(wasm town-items); echo "    $IW ($(wc -c < "$IW") bytes)"
echo "2/4 Account (a sub-account of $TOWN, signed by it)…"
if exists "$ITEMS"; then echo "    $ITEMS exists"; else
  near account create-account fund-myself "$ITEMS" "${ITEMS_FUND:-3} NEAR" autogenerate-new-keypair save-to-legacy-keychain sign-as "$TOWN" "${SIGN[@]}"; sleep 3
fi
echo "3/4 Contract…"
MINTERS=$(node -e 'import("'"$ROOT"'/relayer/market/catalog.js").then(c=>console.log(JSON.stringify([...c.TRADERS.map(k=>c.traderAccount(k,process.argv[1])),process.argv[2]])))' "$TOWN" "$SIGNER")
if has_code "$ITEMS"; then echo "    $ITEMS has code"; else
  near contract deploy "$ITEMS" use-file "$IW" with-init-call new json-args '{"owner_id":"'"$SIGNER"'","minters":'"$MINTERS"'}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
fi
echo "4/4 Token ids (the five monster resources first)…"
node -e 'import("'"$ROOT"'/relayer/market/catalog.js").then(c=>{for(const r of c.RESOURCES)console.log(JSON.stringify({token_id:r.id,title:r.id.replace(/_/g," "),description:"A monster resource from the hillside ("+r.from+"); sold at the town stalls.",kind:"resource",base:r.base}))})' | while read -r args; do
  near contract call-function as-transaction "$ITEMS" add_token json-args "$args" prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" "${SIGN[@]}"
done
node "$ROOT/contracts/scripts/day1-write.mjs" items="$ITEMS"
echo
echo "Done: $(view "$ITEMS" tokens '{}')"
