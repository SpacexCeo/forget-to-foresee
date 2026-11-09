#!/usr/bin/env bash
# Testnet only. The owner runs these by hand, one at a time, from contracts/agent-card (generated; do not edit).
set -euo pipefail
cd "$(dirname "$0")/../.."
# create the contract account (faucet; skip if it exists)
near account create-account sponsor-by-faucet-service ftf-agents.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
# build, deploy and initialize (from contracts/agent-card)
cargo near deploy build-non-reproducible-wasm --no-abi ftf-agents.testnet with-init-call new json-args '{"owner_id":"lambada_eth.testnet","coordinators":["lambada_eth.testnet"],"season_contract":"ftf-seasons.testnet","shard_contract":"ftf-shards.testnet"}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
# check the coordinators
near contract call-function as-read-only ftf-agents.testnet get_coordinators json-args '{}' network-config testnet now
# free dry run: the contract validates the state and returns its hash (must equal summary.json stateHash)
near contract call-function as-read-only ftf-agents.testnet preview_agent file-args judge/793f6c05e89839f2/preview-agent.json network-config testnet now
# mint the card (storage deposit; the unused part is refunded)
near contract call-function as-transaction ftf-agents.testnet mint_agent file-args judge/793f6c05e89839f2/mint-agent.json prepaid-gas '100.0 Tgas' attached-deposit '0.5 NEAR' sign-as lambada_eth.testnet network-config testnet sign-with-keychain send
# read the card back
near contract call-function as-read-only ftf-agents.testnet get_agent json-args '{"token_id":"793f6c05e89839f2-agent-iris"}' network-config testnet now
# compare its schedule_root with the committed season
near contract call-function as-read-only ftf-seasons.testnet get_season json-args '{"season_id":"793f6c05e89839f2"}' network-config testnet now
