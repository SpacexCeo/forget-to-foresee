#!/usr/bin/env bash
# Upgrades the DEPLOYED ftf-town contract to the current build (v4: acting for players) without touching its state
# (docs/town-upgrades.md). Every upgrade so far (v2 pay_gate, v3 pay_gate_for, v4 *_for) adds methods and new storage keys only; the stored root (`Town`) is unchanged, so the deploy needs NO init and NO
# migration call. Run by the lead with the ftf-town key in ~/.near-credentials (legacy keychain).
#   bash contracts/scripts/town-upgrade.sh            # build, show the state before, deploy, check it after
set -euo pipefail
source "$(dirname "$0")/day1-lib.sh"
TOWN=${TOWN:-ftf-town.testnet}
counts() { view "$TOWN" pulse '{}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);console.log(JSON.stringify({trades:p.counters.trade,accounts:p.accounts,minted:p.minted_silk,burned:p.burned_silk,tvl:p.tvl_staked,season:p.season_id}))})'; }
echo "1/4 Building the wasm…"
TW=$(wasm town); echo "    $TW ($(wc -c < "$TW") bytes)"
echo "2/4 State before:"; BEFORE=$(counts); echo "    $BEFORE"
echo "3/4 Deploying without an init call (the state stays as it is)…"
near contract deploy "$TOWN" use-file "$TW" without-init-call network-config testnet sign-with-legacy-keychain send
sleep 3
echo "4/4 State after:"; AFTER=$(counts); echo "    $AFTER"
node -e 'const a=JSON.parse(process.argv[1]),b=JSON.parse(process.argv[2]);for(const k of ["accounts","minted","season"])if(a[k]!==b[k]){console.error("CHANGED: "+k);process.exit(1)}console.log("    state intact (trades may have grown while deploying)")' "$BEFORE" "$AFTER"
echo "    gate price: $(view "$TOWN" gate_price '{}')  gate_paid_of(nobody): $(view "$TOWN" gate_paid_of '{"account_id":"nobody.testnet"}')"
echo "    v4: act_limits(nobody): $(view "$TOWN" act_limits '{"account_id":"nobody.testnet"}')  act_request_used: $(view "$TOWN" act_request_used '{"request_hash":"0000000000000000000000000000000000000000000000000000000000000000"}')"
