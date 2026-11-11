# Entry, nickname, menu, wheel of fortune and collectible items (owner, 11.11)

## Code (Opus)
1. **Entry sequence (in the town, no lobby):** a short animated arrival (camera settles on Iris at the gate, title and the ring sign draw in), then a **nickname** field styled as "creating your traveller profile". Honest label under it: "Local profile in this browser — no account, no wallet." The nickname appears in the profile, on the postcard and on hire cards.
2. **NFT at entry, honestly:** the client cannot sign or mint (no wallet, static site). So: show the **welcome card** of the player's profile as a labeled **"Unminted preview"**; on the judge path also show the real testnet tokens that exist (judge shards, the agent card if minted) with explorer links. Never a "Minted" state that did not happen on chain. (A real per-player testnet mint needs a coordinator relayer — owner decision, not in this plan.)
3. **Main menu (pause, Esc):** Profile · Inventory (On-chain / Off-chain) · Agents · Glossary · Guides · Settings · Lobby.
4. **Wheel of fortune:** one free spin per real day plus spins earned by play (quest steps, verified trials, level-ups). Never bought with real money and never with town silk directly. Prizes go to the Off-chain inventory: shard fragments (cosmetic set pieces), mechanical parts (for a future crafting/upgrade use — only show what they do if it runs), town silk, XP, cosmetic titles. Odds table visible on the wheel; deterministic from a shown seed; animated spin with ease-out, a tick sound, haptics; reduced motion = instant result. No casino wording ("jackpot", "bet").
5. **Inventory UI:** grid with item cards (icon, name, rarity, source, count), filters; the On-chain tab only lists chain-confirmed tokens.
Tests: wheel odds sum to 1 and match the table over 100 000 spins; free-spin daily gate; items land in inventory and persist; nickname length/charset rules; no "Minted" string without a chain confirmation.

## 3D (Fable, after Elise)
Model in Blender, original designs, our world (pearl, amber, bronze, the round-sign strokes):
- **Shard variants (8):** memory-shard set pieces in 4 rarities (common pearl, uncommon teal, rare violet, legendary amber), each a different crystal cut and inner glyph.
- **Mechanical parts (10):** gears, a spring coil, a brass lens, a valve, a cog-ring with glyphs, a chain link, a gauge, a crank, a rivet plate, a spindle — Shell-age machinery, bronze/iron/amber.
- **Wheel of fortune prop** (for the square or the Inn): a brass ring wheel with glyph segments and an amber pointer.
- Deliver small game GLBs (≤3k tris each, KTX2) plus transparent 256×256 and 128×128 icon renders for every item (one light setup, consistent), in game/public/assets/items/ with a JSON manifest (id, name key, rarity, icon path, glb path).
