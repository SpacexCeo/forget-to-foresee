# Town contract: threat model and what enforces it

For `contracts/town` (`ftf-town.testnet`), from §2.6 of the owner's spec, adapted to one currency (silk, owner 12.11). Testnet only: no mainnet and no real value
before a separate security review. Every row names the code or test that enforces it. "Not built" means the
mitigation belongs to a later piece.

| # | Threat | Mitigation in the contract | Test (`contracts/town/src/tests.rs`) |
|---|---|---|---|
| T1 | Stake → sweep → claim → unstake in one epoch to capture a distribution | A deed's weight is "incoming" in its epoch and starts earning at the next boundary (`roll`, activation index); a 2-day cooldown without rewards; the 0.5-silk deed fee | `deed_lifecycle_rewards_from_fees_only` (same-epoch distribute pays 0) |
| T2 | Rounding drift, rewards above the pot | u128 fixed point (index × 1e18) rounded down; `pay_pending` never pays more than the works' credited `rewards`; the sweep and entry splits' remainders are burned | `long_random_run_conserves_everything` (Σ claimable ≤ credited every day; silk conserved, settlement included) |
| T3 | Double withdraw / replay | State machine active → unbonding → burned; `finish_unbond` and `exit_early` burn the deed | `double_finish_unbond_fails`, `unbonding_waits_the_cooldown` |
| T4 | Inconsistent state through callbacks | All state is written before any promise; the position lives under the token id; `nft_resolve_transfer` moves only the owner's pledge totals back | `transfer_call_rollback_restores_the_owner_and_the_books` |
| T5 | Seller starts unbonding during a sale | The state travels with the deed (`get_deed`); the new owner cannot `exit_early` for a day. The escrow `expected_state_hash` is not built (P2) | `a_new_owner_cannot_exit_early_for_a_day` |
| T6 | Whale capture, splitting | Per-account cap min(8,000, max(800, 5 % of TVL)) silk, per-works 3,000, receiver check on transfer; reward is linear in weight, so splitting gains nothing | `per_account_cap_floor`, `caps_follow_tvl_and_the_per_works_ceiling`, `receiver_cap_is_checked_on_transfer` |
| T7 | Wash trading to harvest rewards | 0.12 % fee on every trade; a washer gets back at most 65 % × 88 % of it times its weight share | `wash_trading_loses_more_than_it_earns`; JS: `town-rules.test.mjs` |
| T8 | Sandwiching, price manipulation | No pool any more (one currency, owner 12.11): no swaps, no price to move; the sweep only splits treasury silk | `sweep_splits_the_fees_and_mints_nothing` |
| T9 | Sybil farming of the tournament purse | Entry costs 40 silk (20 % burned); one entry per account and season; entry credit only from coordinators inside the daily ceiling; the purse mint is bounded by min(cap, floor + 0.8 × last season's burn, 24 × entrants), so sybils dilute honest players rather than inflate; one payout ≤ 4 % of the pot | `one_entry_per_season`, `settle_cannot_exceed_purse_plus_ceiling`, `one_payout_is_capped`, `the_mint_ceiling_follows_last_seasons_burn` |
| T10 | Coordinator abuse | `credit_silk`/`credit_entry` share a daily ceiling and log every credit; `settle_season` cannot pay beyond the purse plus the season's mint ceiling, logs the payout-list hash and closes for good; testnet key only | `silk_credit_has_a_daily_ceiling`, `a_settled_season_stays_closed` |
| T11 | Leak of the 20 trader keys on the relayer | Each key can call only `trade` on `ftf-town.testnet`; it owns no deeds; the account holds ~0.3 NEAR. **Deviation:** the deploy script defaults to `ALLOWANCE=unlimited` so gas refunds never stall a busy key; set `ALLOWANCE='1 NEAR'` to cap it and rotate keys with `market-keys.mjs` | contract: `counterparty_must_be_registered`; relayer: `town-traders.test.mjs` |
| T12 | Metadata / storage griefing | Deed metadata is built from numbers and fixed words only; the staker attaches the deed's storage deposit (refunded on burn); `reference` ≤ 32 characters with quotes stripped | `a_deed_needs_its_storage_deposit` |
| T13 | Admin changes the rules under players | `set_params` only within bounds (`Params::valid`), epoch length fixed after deploy, event with the parameter hash. "Only between seasons" is not built (no season settlement yet) | `params_are_bounded` |

Other invariants tested:

- Genesis runs once.
- A paused town refuses trades, pledges and entries (claims and unbonding still work).
- A season's schedule root never changes, and deeds carry it.

Gas: the measured host gas for `trade` is 0.61 Tgas, and the full estimate is 2.5–2.7 Tgas. Measuring it in a
sandbox or on testnet is still open (acceptance 13): `node tools/town/sandbox-gas.mjs <near-sandbox> <town.wasm>`
reports the burnt gas per trade, the NEAR it costs and the storage before/after (the worker's container could not
run the sandbox binary).
