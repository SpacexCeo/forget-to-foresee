#!/usr/bin/env bash
# The web client's only key: a function-call access key of guests.<signer>, limited to create_guest, with a small
# allowance (it cannot move funds). Generates the keypair locally, adds the PUBLIC key to the guests account, writes
# the public part + account id to game/src/net/day1-deployment.js and the PRIVATE part only to a local file:
#   game/.env.local   VITE_FTF_GUEST_KEY=ed25519:...   (git-ignored; for Pages: the repository secret FTF_GUEST_KEY)
# Re-running with an existing game/.env.local reuses that key. Allowance: $ALLOWANCE (default 2 NEAR, ~200 guests of gas).
#   bash contracts/scripts/day1-guest-key.sh
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
ALLOWANCE=${ALLOWANCE:-2}
ENV_FILE="$ROOT/game/.env.local"

if [ -f "$ENV_FILE" ] && grep -q '^VITE_FTF_GUEST_KEY=' "$ENV_FILE"; then
  SECRET=$(grep '^VITE_FTF_GUEST_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)
  echo "1/3 Reusing the key in game/.env.local"
else
  echo "1/3 Generating an ed25519 keypair…"
  SECRET=$(node "$ROOT/contracts/scripts/day1-keygen.mjs")
  touch "$ENV_FILE"; grep -v '^VITE_FTF_GUEST_KEY=' "$ENV_FILE" > "$ENV_FILE.tmp" || true; mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "VITE_FTF_GUEST_KEY=$SECRET" >> "$ENV_FILE"
fi
PUB=$(node "$ROOT/contracts/scripts/day1-keygen.mjs" --public "$SECRET")
echo "    public key $PUB"

echo "2/3 Adding it to $GUESTS (create_guest only, allowance $ALLOWANCE NEAR)…"
if rpc '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_access_key","finality":"final","account_id":"'"$GUESTS"'","public_key":"'"$PUB"'"}}' | grep -q '"permission"'; then echo "    already added"; else
  near account add-key "$GUESTS" grant-function-call-access --allowance "$ALLOWANCE NEAR" --contract-account-id "$GUESTS" --function-names create_guest use-manually-provided-public-key "$PUB" "${SIGN[@]}"
fi

echo "3/3 Writing the public part to game/src/net/day1-deployment.js…"
node "$ROOT/contracts/scripts/day1-write.mjs" guestKeyAccount="$GUESTS" guestKeyPublic="$PUB"
echo
echo "The private key is in game/.env.local (git-ignored). For the Pages build add it as the repository secret"
echo "FTF_GUEST_KEY (Settings → Secrets and variables → Actions); .github/workflows/pages.yml passes it to the build."
