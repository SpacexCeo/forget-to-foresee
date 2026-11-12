# Town contract: threat model and what enforces it

For `contracts/town` (`ftf-town.testnet`), from §2.6 of the owner's spec. Testnet only: no mainnet and no real value
before a separate security review. Every row names the code or test that enforces it. "Not built" means the
mitigation belongs to a later piece.

| # | Threat | Mitigation in the contract | Test (`contracts/town/src/tests.rs`) |
|---|---|---|---|
| T1 | Stake → sweep → claim → unstake in one epoch to capture a distribution | A deed's weight is "incoming" in its epoch and starts earning at the next boundary (`roll`, activation index); a 2-day cooldown without rewards; the 0.25-wool deed fee | `deed_lifecycle_rewards_from_fees_only` (same-epoch distribute pays 0) |
| T2 | Rounding drift, rewards above the pot | u128 fixed point (index × 1e18) rounded down; `pay_pending` never pays more than the works' credited `rewards`; the sweep split's remainder is burned | `long_random_run_conserves_everything` (Σ claimable ≤ credited every day; wool and silk conserved) |
| T3 | Double withdraw / replay | State machine active → unbonding → burned; `finish_unbond` and `exit_early` burn the deed | `double_finish_unbond_fails`, `unbonding_waits_the_cooldown` |
| T4 | Inconsistent state through callbacks | All state is written before any promise; the position lives under the token id; `nft_resolve_transfer` moves only the owner's pledge totals back | `transfer_call_rollback_restores_the_owner_and_the_books` |
| T5 | Seller starts unbonding during a sale | The state travels with the deed (`get_deed`); the new owner cannot `exit_early` for a day. The escrow `expected_state_hash` is not built (P2) | `a_new_owner_cannot_exit_early_for_a_day` |
| T6 | Whale capture, splitting | Per-account cap min(4,000, max(400, 5 % of TVL)), per-works 1,500, receiver check on transfer; reward is linear in weight, so splitting gains nothing | `per_account_cap_floor`, `caps_follow_tvl_and_the_per_works_ceiling`, `receiver_cap_is_checked_on_transfer` |
| T7 | Wash trading to harvest rewards | 0.12 % fee on every trade; a washer gets back at most 65 % × 88 % of it times its weight share | `wash_trading_loses_more_than_it_earns`; JS: `town-rules.test.mjs` |
| T8 | Sandwiching, price manipulation | `min_out` on every swap; per-account daily swap cap of 5 % of the input reserve; the sweep buys at most 1 % of the silk reserve a day | `min_out_holds`, `daily_swap_cap_is_five_percent_of_the_input_reserve`, `amm_keeps_k_and_sends_a_fifth_of_the_fee_to_stakers` |
| T9 | Sybil farming of tournament wool | Not built (the tournament payout is P1). Only coordinators register accounts; wool enters only by genesis and capped `credit_wool` | `only_coordinators_credit_wool` |
| T10 | Coordinator abuse | `credit_wool` has a daily ceiling and logs every credit; testnet key only | `wool_credit_has_a_daily_ceiling` |
| T11 | Leak of the 20 trader keys on the relayer | Each key can call only `trade` on `ftf-town.testnet`; it owns no deeds; the account holds ~0.3 NEAR. **Deviation:** the deploy script defaults to `ALLOWANCE=unlimited` so gas refunds never stall a busy key; set `ALLOWANCE='1 NEAR'` to cap it and rotate keys with `market-keys.mjs` | contract: `strangers`-style checks (`counterparty_must_be_registered`); relayer: `town-traders.test.mjs` |
| T12 | Metadata / storage griefing | Deed metadata is built from numbers and fixed words only; the staker attaches the deed's storage deposit (refunded on burn); `reference` ≤ 32 characters with quotes stripped | `a_deed_needs_its_storage_deposit` |
| T13 | Admin changes the rules under players | `set_params` only within bounds (`Params::valid`), epoch length fixed after deploy, event with the parameter hash. "Only between seasons" is not built (no season settlement yet) | `params_are_bounded` |

Other invariants tested:

- `k` never decreases.
- The pool can never be emptied.
- Genesis runs once.
- A paused town refuses trades, swaps and pledges (claims and unbonding still work).
- A season's schedule root never changes, and deeds carry it.

Gas: the measured host gas for `trade` is 0.61 Tgas, and the full estimate is 2.5–2.7 Tgas. Measuring it in a
sandbox or on testnet is still open (acceptance 13).
