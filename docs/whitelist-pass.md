# The whitelist pass, in plain language

**Status: built, not deployed.** Nothing here runs on mainnet until the owner has rehearsed on testnet and followed
[`docs/mainnet-pass-runbook.md`](mainnet-pass-runbook.md). Contract: [`contracts/whitelist-pass`](../contracts/whitelist-pass).
Claim API: [`docs/pass-claim-api.md`](pass-claim-api.md).

## What it is

When a player has earned 10,000 town silk through play and paid it at the Gate-Loom, the game offers a free
**whitelist pass**: a NEAR token sent to the wallet the player types in. No purchase, no wallet connection, no
signature, no seed phrase. The game's relayer checks the Gate payment by replaying the player's expedition log, then
mints the pass from a contract with every limit written on chain.

## What the pass gives (owner decision, 12.11)

**A free NFT mint at the official Forget to Foresee launch**, for whoever holds the pass at that time. Nothing else is
promised: **no monetary value, resale value, airdrop, token or return.**

## Rights follow the token holder

The pass is **transferable**: its holder can send it with any NEAR wallet. Whoever **holds** a pass when the launch mint
opens (at a snapshot block the owner announces in advance) has the free mint. **One free mint per holder wallet,
however many passes it holds.** Board rank, score and any Season 3 distribution belong to the **play account** and its bound
payout wallet, never to a pass holder: buying a pass buys no leaderboard position and no payout. We never list, price,
promote or help resell passes.

## What the contract can do

- Mint one pass per call, only from the **minter** account, with no deposit (the contract pays the storage).
- Refuse a mint beyond the total cap (1,000 at launch), beyond the daily cap (100 per UTC day), to a wallet that was
  **ever** minted a pass (also after it sent the pass away), or for a claim id already used.
- Refuse a mint or a transfer that would leave the contract less than 0.05 NEAR to pay for storage.
- Let a holder transfer the pass (`nft_transfer`, `nft_transfer_call`, the NEAR standard), also while minting is paused.
- Let the owner pause or resume **minting**, rotate the minter account, and set the shared image URL.

## What the contract cannot do

- No approvals: no marketplace can be given the right to move your pass, so there is no standing approval to phish.
  (Marketplaces that need approvals cannot list it; that is intended.)
- No royalties, no burn, no upgrade once the contract account's keys are deleted.
- The owner **cannot** mint, move NEAR out, freeze, seize or move anyone's pass.
- A stolen minter key can do nothing but call `mint_pass` within the caps and its gas allowance.

## Farm-then-sell: the threat model of a transferable pass

Because a pass can be sent, a claim can be farmed and sold. The controls cap the loss and raise the cost of each
claim; none makes it zero.

| Threat | Control | What is left, plainly |
|---|---|---|
| One player claims many passes with many guest accounts | one claim per guest (server index and the claim id on chain); one mint per wallet on chain, even after the pass moved | free guests and free implicit wallets exist: a farmer needs a new guest **and** a new wallet per claim |
| Cheap claims | each claim needs 10,000 silk earned through play and paid at the Gate (story income only, kill income capped), about 90 to 150 minutes of play per account (to verify by a play-test) | a script that plays by the rules at scale; bot labels and cluster flags help, they do not prove |
| Guest-creation floods | per-IP bucket and a daily cap on guest creation; optional captcha (off by default: a third party and a privacy cost) | a patient attacker with many IPs |
| Claim-rate abuse | per-IP and per-guest limits on the claim endpoint; suspicious claims can be held | as above |
| Flooding with fresh unfunded wallets | optional setting: implicit accounts must already exist (off by default) | farmers can fund wallets cheaply |
| Draining the budget | four layers: the minter key's hard gas allowance (one method), the contract balance and reserve, the on-chain caps, a server daily cap no higher than the contract's; kill switch (`FTF_PASS_ENABLED=0`, a `STOP` file, contract `pause`) | a stolen minter key mints at most up to these limits |
| Bulk holders gaining outsized influence | one free launch mint per holder wallet; the utility is fixed in advance | none by design |
| A holder who is not the player collects the free mint | by design the right follows the holder; rank and payouts stay with the play account | a buyer gets the free mint the seller earned (the owner's transferability decision) |
| Approval phishing | no approvals at all | users can still be tricked into sending a pass by hand |
| A resale price becomes an expectation | no price, resale or value in any copy; we never list or promote resale; flagged for counsel | a market can form regardless of what we say |

**Honest limit:** free guest identities and free wallets are not scarce. The caps and the budget bound the damage,
and the pass promises no monetary value. A future version that gates real value needs a stronger identity step.
