# Dragon companions owned by the heroine NFT (owner, 11.11)

## Idea
Small flying dragons follow the heroine. Each dragon is its own NFT, and it is owned **by the heroine's NFT**, not by a person: whoever owns the Elise token controls Elise's account, and Elise's account owns her dragons. Selling Elise sells her dragons with her. Elise is an **agentic NFT**: it has its own account (wallet) on NEAR testnet, holds items, and can progress.

## On-chain design (NEAR testnet, coordinator-minted; honest labels)
- `ftf-heroines.testnet` (new, or extend `contracts/agent-card`): NEP-171 + NEP-177 heroine tokens (Elise). On mint, the contract creates a **keyless sub-account per token** (e.g. `elise-1.ftf-heroines.testnet`) whose only controller is the contract; `act_as_token(token_id, call)` lets the current token owner make that account call other contracts (transfer an owned dragon, receive items). Transferring the heroine token moves that control — and therefore the dragons — to the new owner. This is the NFT-track pattern "an NFT tied to an account whose wallet moves on transfer".
- `ftf-companions.testnet`: NEP-171 dragon tokens (3 kinds), minted by the coordinator directly to the heroine's sub-account. Metadata: kind, level/xp (progress counters the coordinator can bump from play events), image = the GPT card.
- Views for the client: `heroine_account(token_id)`, `nft_tokens_for_owner(heroine_account)`.
- Scripts in `contracts/*/scripts/` for the owner: deploy, mint Elise #1, mint 1–3 dragons to Elise's account, bump a dragon's level. No keys in the repo; the client never signs.
- Tests: transfer of the heroine moves control of the dragons; a non-owner cannot act; dragons cannot be transferred except by the heroine account.

## Client
- Dragons fly near the heroine (follow with lag, idle loops, a little flutter; reduced motion = calmer).
- Inventory On-chain tab: the heroine card, and under it "Owned by Elise" with the dragon cards, each with explorer links, shown only when the chain read confirms them. Off-chain: Iris (default) and her local items.
- A 5-second cinematic for the X post (`?cinematic=companion`): Elise runs with her dragon → the camera flies into the dragon → quick transition to the on-chain view: the dragon's NFT card bound to Elise's card, labels "Owned by Elise · Agentic NFT · NEAR testnet", explorer link. Only true statements once the tokens are minted.

## Art
- GPT: design sheets for 3 original dragon kinds (small, friendly, our world's palette: pearl, teal, amber; round-sign markings) + three holographic minimal cards matching NFT-001 (name + image only).
- Fable (after Elise): 3 dragon models from the sheets, rigged (wings, tail, head), loops: fly, glide, idle hover, happy flip; ≤6k tris each + _m; or a CC0-licensed base reworked to the sheets, licence recorded in docs/art/manifest.md.
