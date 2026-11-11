#!/usr/bin/env bash
# Day 1 contracts on NEAR testnet, in one idempotent run (every step checks whether it is already done):
#   heroine.<signer>     character-nft, token accounts on (Elise; per-token accounts; act_as_token)
#   companions.<signer>  character-nft, token accounts off (dragons, minted to a heroine token's account)
#   guests.<signer>      guests (create_guest: guest account + free Elise mint), a minter of the heroine contract
# Signed by $SIGNER (default ftf-coordinator.testnet) with the keys in ~/.near-credentials. Needs near CLI and cargo-near.
#   bash contracts/scripts/day1-deploy.sh
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
ELISE_MEDIA=${ELISE_MEDIA:-https://spacexceo.github.io/forget-to-foresee/assets/nft/elise.webp}
DAILY_CAP=${DAILY_CAP:-200}

echo "1/7 Building the wasm files…"
TA=$(wasm token-account); NFT=$(wasm character-nft); GU=$(wasm guests)
echo "    $TA"; echo "    $NFT"; echo "    $GU"

echo "2/7 Accounts…"
create "$HEROINE" "${HEROINE_FUND:-6}"
create "$COMPANIONS" "${COMPANIONS_FUND:-5}"
create "$GUESTS" "${GUESTS_FUND:-6}"

deploy() { # deploy <account> <wasm> <init json>
  if has_code "$1"; then echo "    $1 has code"; return; fi
  near contract deploy "$1" use-file "$2" with-init-call new json-args "$3" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
}
echo "3/7 Heroine contract…"
deploy "$HEROINE" "$NFT" '{"owner_id":"'"$SIGNER"'","name":"Forget to Foresee: Heroines","symbol":"FTFHERO","token_accounts":true,"minters":["'"$GUESTS"'"],"icon":null,"base_uri":null}'
echo "4/7 Companions contract…"
deploy "$COMPANIONS" "$NFT" '{"owner_id":"'"$SIGNER"'","name":"Forget to Foresee: Companions","symbol":"FTFDRAGON","token_accounts":false,"minters":[],"icon":null,"base_uri":null}'
echo "5/7 Guests contract…"
deploy "$GUESTS" "$GU" '{"owner_id":"'"$SIGNER"'","heroine":"'"$HEROINE"'","daily_cap":'"$DAILY_CAP"',"elise_media":"'"$ELISE_MEDIA"'"}'

echo "6/7 Heroine settings: guests is a minter, the token-account code is stored…"
if view "$HEROINE" minters '{}' | grep -q "\"$GUESTS\""; then echo "    $GUESTS is a minter"; else
  near contract call-function as-transaction "$HEROINE" add_minter json-args '{"account_id":"'"$GUESTS"'"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" "${SIGN[@]}"
fi
CODE_ARGS="$ROOT/contracts/target/tmp/set-account-code.json"
node -e 'const fs=require("fs");fs.writeFileSync(process.argv[2],JSON.stringify({code:fs.readFileSync(process.argv[1]).toString("base64")}))' "$TA" "$CODE_ARGS"
near contract call-function as-transaction "$HEROINE" set_account_code file-args "$CODE_ARGS" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" "${SIGN[@]}"

echo "7/7 Writing the public ids to game/src/net/day1-deployment.js…"
node "$ROOT/contracts/scripts/day1-write.mjs" heroine="$HEROINE" companions="$COMPANIONS" guests="$GUESTS"
echo
echo "Done. Stats: $(view "$GUESTS" stats '{}')"
echo "Next: bash contracts/scripts/day1-guest-key.sh"
