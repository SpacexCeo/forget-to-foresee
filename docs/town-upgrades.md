# Upgrading the deployed ftf-town contract

`ftf-town.testnet` is live, with real balances, deeds and counters. Every contract change from now on must read the
state the deployed version wrote.

## Rules

- **Never change the layout of `Town`** (the stored root) or of any struct stored in a collection (`Account`, `Deed`,
  `Works`, `Season`, `Stall`, `StallPosition`, `Params`). Adding, removing or reordering a field breaks Borsh.
- **Add state under new keys.** Use a new `StorageKey` variant **appended at the end** of the enum (the variant index
  is the storage prefix), or a raw key (`env::storage_write`). Construct the collection when it is used, and flush
  it.
- **View return types** (`Pulse`, `GateRecord`…) are not stored, so they can grow freely.
- **A test proves it.** `contracts/town/tests/state-v1.hex` is the root state written by the deployed version
  (commit `d8d6720`) after genesis, a trade and a pledge. The test
  `the_deployed_state_still_deserialises_after_the_gate_upgrade` reads it with the new code and writes it back byte
  for byte. Keep that test, and add a `state-vN.hex` whenever a version is deployed.

## v2: the portal gate (City Economy rev 4 §2.13)

New, all outside the stored root:

| What | Where |
|---|---|
| `pay_gate(gate_id)` | Burns `gate_price` from the caller's own silk (never entry credit), once per account and gate. Refused for the town's own wallets (stalls, sub-accounts of the contract). Event `gate_paid {account, gate_id, price, season_id}` |
| `gate_paid_of(account)` / `gate_paid_for(account, gate_id)` | New collections `StorageKey::Gates` (account:gate → record) and `StorageKey::GateOf` (account → latest) |
| `gate_burned`, `gate_price`, `set_gate_price` (owner, 20–5,000 silk) | Raw keys `g:burned`, `g:count`, `g:price` (default 200 silk) |
| Pulse | New view fields `gate_burned`, `gates_paid` |

The gate burn is counted apart from `burned_silk`, so it does not feed the next season's mint-match (rev 4 §2.13.2).
The conservation check is minted − burned − gate burned = everything held. 49 unit tests pass.

**Deploy:** `bash contracts/scripts/town-upgrade.sh`. It builds the wasm, shows the pulse before, deploys **without**
an init call (no migration method is needed), and checks that accounts, minted silk and the season are unchanged and
that the new views answer.

**Rollback:** redeploy the previous wasm the same way. The v2 keys stay in storage unused and harm nothing.

**Not in v2** (rev 4 lists them; they would need more state): the per-account story caps, `story_day_cap` and
`story_locked` silk. They can come in v3 under new keys the same way.

## v3: paying the gate for a guest

The guests' browser keys are function-call keys of the guests contract, so they cannot sign `pay_gate` here. v3
adds:

- **`pay_gate_for(account_id, gate_id, request_hash)`**, for coordinators only (the relayer's coordinator account).
  It is called after the relayer has checked the guest's own signed portal request. The burn, the once-per-gate rule
  and the refusal for the town's wallets are the same as `pay_gate`. The event `gate_paid` adds `by` and
  `request_hash`.
- **Replay safety.** `request_hash` (the sha256 of the signed request, 64 hex characters) goes into a NEW collection,
  `StorageKey::GateRequests`, appended at the end, and a used hash is refused (`ERR_GATE_REQUEST`). View:
  `gate_request_used`.

The stored root and every stored struct, including v2's `GateRecord`, are unchanged, so v2's records read as before.
The v1-state fixture test still passes. 53 unit tests in total. Deploy with the same script:
`bash contracts/scripts/town-upgrade.sh` (no init call, no migration).

Before the relayer can use it, the owner adds the relayer's account to the coordinators:
`set_coordinators(["ftf-coordinator.testnet", "<relayer account>"])`. Coordinators can already register accounts and
credit silk inside the daily ceiling, so this adds no new power beyond the gate.
