# Pitch

## Games track

Forget to Foresee is a browser 3D strategy game in which Iris pays for prophecy with her own memories. Every
prophecy of a season is committed to NEAR testnet before the first move and revealed with a Merkle proof anyone can
check, so the game cannot cheat its player. Around it lives a hill town whose economy runs on chain: scripted traders
trade real testnet transactions, a player's free Day 1 mint gives them a guest account and an Elise NFT that owns its
own account and its dragons, and the townsfolk speak through a model in a TEE whose signature the browser checks.
No wallet, no gas prompt, nothing to buy.

- **Provable fairness:** the season's 15 signs are on `ftf-seasons.testnet`, revealed and re-hashed by the contract;
  `node tools/verify/verify.mjs proof.json` checks a proof copied from the game.
- **A live on-chain world:** 20 scripted trader wallets on `ftf-town.testnet`, 7,716 trades on chain by 13.11
  (`/api/market/stats`).
- **Onboarding without a wallet:** 46 guest accounts and heroine NFTs minted through the relayer by 13.11
  (`/api/health`, `heroine.ftf-coordinator.testnet`).

## Other tracks it fits

- **NFT:** memory shards bound to the season's Merkle leaf; an NFT that owns an account and owns dragon NFTs; holder
  access that unlocks a perk by reading any testnet account.
- **AI agents:** townsfolk speech, the trade advisor and the clans' strategy from `Qwen/Qwen3-VL-30B-A3B-Instruct` on
  NEAR AI Cloud (TEE, verified answers); an agent HTTP API on which any program can play a whole season.
- **Social:** a shared town with chat in rooms of 15, a human board and a separate scripted-NPC board.

## Mainnet plan (a plan only; nothing is deployed on mainnet)

What would change:
- Deploy the same contracts under a new mainnet root account; season-commit, memory-shard, character-nft and
  token-account need no code change. Town and items go out only after the player market (v5 / v2) is audited.
- Keys: the owner's full-access key on a hardware wallet for the root; on the server only function-call keys, one per
  role (guest creator, coordinator `*_for`, chest opener, `nft_mint` minters), each with an allowance; a kill switch
  stays (`FTF_TOWN_KILL`). No key in the repository.
- Traders: off on mainnet by default; at 3.06 Tgas a trade a full day of 24,000 trades costs about 6.7 NEAR of gas,
  so the trader count and rate would be cut to a budget the owner sets.
- Day 1 guests: about 0.05 NEAR each in storage and funding, capped per day (200 today); a per-day budget and abuse
  limits before opening.
- TEE: NEAR AI Cloud billed per request; the scripted fallback stays, so a budget cap does not break the game.
- Legal: silk stays without value and play silk stays unbuyable; no sale or prize of real value without a legal and
  security review and an explicit owner decision.
