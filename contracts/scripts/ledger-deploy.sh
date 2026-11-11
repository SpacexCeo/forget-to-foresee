#!/usr/bin/env bash
# The agent-ledger contract on NEAR testnet (docs/agent-track-record-plan.md), idempotent:
#   ledger.<signer>   agent-ledger (players record their agents' closed hires; anyone re-runs and verifies them)
# Signed by $SIGNER (default ftf-coordinator.testnet) with the keys in ~/.near-credentials. Needs near CLI and cargo-near.
#   bash contracts/scripts/ledger-deploy.sh
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
LEDGER=${LEDGER:-ledger.$SIGNER}

echo "1/4 Building the wasm…"
LW=$(wasm agent-ledger); echo "    $LW"
echo "2/4 Account…"
create "$LEDGER" "${LEDGER_FUND:-3}"
echo "3/4 Contract…"
if has_code "$LEDGER"; then echo "    $LEDGER has code"; else
  near contract deploy "$LEDGER" use-file "$LW" with-init-call new json-args '{"owner_id":"'"$SIGNER"'"}' prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' "${SIGN[@]}"
  sleep 3
fi
echo "4/4 Writing the public id to game/src/net/day1-deployment.js…"
node "$ROOT/contracts/scripts/day1-write.mjs" ledger="$LEDGER"
echo
echo "Done. Records so far: $(view "$LEDGER" stats '{}')"
