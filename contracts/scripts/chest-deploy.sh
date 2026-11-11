#!/usr/bin/env bash
# Loot chests on NEAR testnet (docs/chests.md), idempotent:
#   chests.<signer>   loot-chest (season deck commit, TEE + block seed, openings, loot NFTs)
# Signed by $SIGNER (default ftf-coordinator.testnet) with the keys in ~/.near-credentials. Needs near CLI and cargo-near.
#   bash contracts/scripts/chest-deploy.sh                      # deploy + commit the season deck
#   OPENER_PUB=ed25519:... bash contracts/scripts/chest-deploy.sh   # also add the relayer's opener key (open_chest only)
# The opener key is generated on the relayer's server (node relayer/scripts/chest-key.mjs prints only its public part),
# so no private key travels. The seed is fixed separately, after the commit: node tools/chest/seed.mjs (docs/chests.md).
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
CHESTS=${CHESTS:-chests.$SIGNER}
SEASON=${SEASON:-s1}

echo "1/5 Building the wasm…"
CW=$(wasm loot-chest); echo "    $CW"
echo "2/5 Account…"
create "$CHESTS" "${CHEST_FUND:-15}"
echo "3/5 Contract…"
if has_code "$CHESTS"; then echo "    $CHESTS has code"; else
  near contract deploy "$CHESTS" use-file "$CW" with-init-call new json-args '{"owner_id":"'"$SIGNER"'","season":"'"$SEASON"'"}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
fi
echo "4/5 Deck commit…"
if view "$CHESTS" season_info '{}' | grep -q '"root":"[0-9a-f]'; then echo "    already committed"; else
  ARGS=$(node "$ROOT/tools/chest/deck.mjs" --season "$SEASON" --commit-args)
  near contract call-function as-transaction "$CHESTS" commit_deck json-args "$ARGS" prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" network-config testnet sign-with-legacy-keychain send
fi
echo "5/5 Opener key…"
if [ -n "${OPENER_PUB:-}" ]; then
  if rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key","finality":"final","account_id":"'"$CHESTS"'","public_key":"'"$OPENER_PUB"'"}}' | grep -q '"permission"'; then echo "    already added"; else
    near account add-key "$CHESTS" grant-function-call-access --allowance "${ALLOWANCE:-3} NEAR" --contract-account-id "$CHESTS" --function-names open_chest use-manually-provided-public-key "$OPENER_PUB" "${SIGN[@]}"
  fi
  near contract call-function as-transaction "$CHESTS" add_opener json-args '{"account_id":"'"$CHESTS"'"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as "$SIGNER" network-config testnet sign-with-legacy-keychain send
else echo "    skipped (set OPENER_PUB)"; fi
node "$ROOT/contracts/scripts/day1-write.mjs" chests="$CHESTS"
echo
echo "Done: $(view "$CHESTS" season_info '{}')"
