#!/usr/bin/env bash
# The wheel's grand prize on NEAR testnet (docs/wheel-skin.md), idempotent:
#   skins.<signer>   skin-nft, series "sheriffchenko", hard cap 100, one per account
# Signed by $SIGNER (default ftf-coordinator.testnet) with the keys in ~/.near-credentials. Needs near CLI and cargo-near.
#   bash contracts/scripts/skin-deploy.sh
#   MINTER_PUB=ed25519:... bash contracts/scripts/skin-deploy.sh   # also add the relayer's mint_skin-only key
# The minter key is made on the relayer's server: node relayer/scripts/chest-key.mjs FTF_SKIN_KEY (prints the public key).
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
SKINS=${SKINS:-skins.$SIGNER}

echo "1/4 Building the wasm…"
SW=$(wasm skin-nft); echo "    $SW"
echo "2/4 Account…"
create "$SKINS" "${SKIN_FUND:-3}"
echo "3/4 Contract…"
if has_code "$SKINS"; then echo "    $SKINS has code"; else
  near contract deploy "$SKINS" use-file "$SW" with-init-call new json-args '{"owner_id":"'"$SIGNER"'","skin":"sheriffchenko","title":"Sheriffchenko","cap":100,"media":null}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
fi
echo "4/4 Minter key…"
if [ -n "${MINTER_PUB:-}" ]; then
  if rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key","finality":"final","account_id":"'"$SKINS"'","public_key":"'"$MINTER_PUB"'"}}' | grep -q '"permission"'; then echo "    already added"; else
    near account add-key "$SKINS" grant-function-call-access --allowance "${ALLOWANCE:-1} NEAR" --contract-account-id "$SKINS" --function-names mint_skin use-manually-provided-public-key "$MINTER_PUB" "${SIGN[@]}"
  fi
  near contract call-function as-transaction "$SKINS" add_minter json-args '{"account_id":"'"$SKINS"'"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" network-config testnet sign-with-legacy-keychain send
else echo "    skipped (set MINTER_PUB)"; fi
node "$ROOT/contracts/scripts/day1-write.mjs" skins="$SKINS"
echo
echo "Done: $(view "$SKINS" skin_info '{}')"
