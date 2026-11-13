# GPT request: item, reward and NFT images (chest reveal + inventory)

For the owner: one **Batch** block = one ChatGPT request. Paste the **Style** paragraph first in a new chat once, then
the batches one by one. Ask for each image as a separate 512x512 transparent PNG named exactly as listed.

## Where the list comes from

- Items: `game/public/assets/items/manifest.json` (18 items: 8 shards, 10 mechanical parts; 2 props are not loot).
- Chest outcomes: `relayer/lib/chest-deck.js` (season deck of 10,000): `silk` 5 / 10 / 25, `xp` 10 / 25, `item`
  (common/uncommon/rare items), and 1,000 `nft` slots = the uncommon, rare and legendary items minted as NFTs.
- The reveal (`game/src/play/chest-open.js`, `outcomeView`) shows the item icon inside a rarity frame
  (`assets/cards/loot/frame_<rarity>.webp`, NFT = `frame_mythic`). Silk and XP today show text glyphs (◈ ✦): they get
  real images in this request. The chest bag lists sealed boxes by tier (`common` / `rare` / `legendary`).

## Style (paste first)

> You will make a consistent set of fantasy game item icons. Style: stylised painterly fantasy, soft hand-painted
> shading with gentle glossy highlights, like a polished mobile RPG item render; one object, centred, three-quarter
> view from slightly above, filling about 80% of the frame, soft contact shadow only, no background, transparent PNG
> 512x512, no text, no letters, no logos, no border, no frame. Palette: pearl, teal, violet and amber crystals; warm
> brass and dark iron for mechanical parts. Every icon must read clearly at 64 px. Keep exactly the same lighting
> (key light from top left), camera angle and level of detail across the whole set.

Match the existing renders: `game/public/assets/items/icons/shard_violet_cluster_256.png`, `part_gauge_256.png`
(attach one or two of them to the chat as the style reference).

## Rarity colour language

The frame is added by the game, so icons carry rarity only through material and a faint rim light:

| Rarity | Colour (reveal glow) | Material cue |
|---|---|---|
| common | `#cfc6ad` parchment | plain pearl, dull iron |
| uncommon | `#2fc4b2` teal | teal crystal, clean brass |
| rare | `#5fb6ff` blue / violet | violet crystal, polished brass with glass |
| legendary | `#ffc46b` amber | amber crystal, gold with glowing glyphs |
| NFT (mythic) | `#ffe7a8` pale gold | the same item plus a soft pale-gold halo and floating motes |

## Batch 1: shards (8)

> Following the style above, make 8 separate icons:
> `shard_pearl_drop` — one teardrop-shaped milky pearl crystal (common);
> `shard_pearl_tablet` — a flat rectangular pearl crystal tablet with bevelled edges (common);
> `shard_teal_twin` — two teal crystal prisms grown together (uncommon);
> `shard_teal_octa` — a single teal octahedron crystal (uncommon);
> `shard_violet_cluster` — a cluster of three violet crystal points with a small circular glyph (rare);
> `shard_violet_spire` — one tall thin violet crystal spire (rare);
> `shard_amber_crown` — a ring of amber crystal points like a crown, inner glow (legendary);
> `shard_amber_blade` — a long amber crystal shaped like a blade, inner glow (legendary).

## Batch 2: mechanical parts (8)

> Same style, 8 separate icons:
> `part_gear` — a dark iron cog with eight teeth (common); `part_spring_coil` — a steel coil spring (common);
> `part_chain_link` — three linked iron chain links (common); `part_rivet_plate` — a small iron plate with four
> rivets (common); `part_spindle` — a brass spindle with thread wound on it (uncommon); `part_crank` — a brass crank
> handle with a wooden grip (uncommon); `part_valve` — a brass pipe valve with a round wheel (uncommon);
> `part_gauge` — a brass pressure gauge with a cream dial and needle, no numbers (rare).

## Batch 3: last parts + rewards (8)

> Same style, 8 separate icons:
> `part_brass_lens` — a polished brass ring holding a clear glass lens (rare);
> `part_glyph_cogring` — a golden cog ring engraved with glowing amber glyphs (legendary);
> `reward_silk_5` — three small silver-white silk thread coins with a woven pattern (common);
> `reward_silk_10` — a small stack of woven silk coins with a loose glowing thread (uncommon, teal rim light);
> `reward_silk_25` — a pouch spilling woven silk coins, threads glowing blue (rare);
> `reward_xp_10` — a small four-point star of soft light (common);
> `reward_xp_25` — a larger teal four-point star of light with sparkles around it (uncommon);
> `nft_seal` — a pale-gold wax seal with a woven-thread emblem, soft halo (mythic; shown when the NFT item is unknown).

## Batch 4: chests (3)

> Same style, 3 separate icons of a closed treasure chest, same shape for all three:
> `chest_common` — weathered wood, iron bands, parchment-coloured lock;
> `chest_rare` — dark wood, polished brass bands, a blue-violet crystal in the lock;
> `chest_legendary` — dark wood with gold bands, amber crystal lock, faint amber light leaking from the seam.

## Batch 5 and 6: NFT variants (12 = the items the deck mints)

Only if time allows; otherwise the game reuses the item icon inside the mythic frame. Same object as the plain icon,
plus a pale-gold halo and a few floating motes. Name = `nft_<item id>`.

> Batch 5: `nft_shard_teal_twin`, `nft_shard_teal_octa`, `nft_part_spindle`, `nft_part_crank`, `nft_part_valve`,
> `nft_shard_violet_cluster`. Batch 6: `nft_shard_violet_spire`, `nft_part_gauge`, `nft_part_brass_lens`,
> `nft_shard_amber_crown`, `nft_shard_amber_blade`, `nft_part_glyph_cogring`.
> "Same style; redraw each item exactly as before but with a soft pale-gold halo behind it and a few floating golden motes."

## How we import

1. Owner saves the PNGs as `<id>.png` into `F:\Hackaton-art-requests\in\items\` and tells the lead.
2. A worker (server, not the laptop) trims, centres and resizes: `<id>_256.png` and `<id>_128.png` into
   `game/public/assets/items/icons/` (replacing the shard/part renders only if the owner prefers the new look).
3. Rewards, chests and `nft_*` are new: add them to `manifest.json` as `kind: "reward" | "chest" | "nft"` entries
   (no `glb`), then point `outcomeView` silk/xp at `reward_silk_<n>` / `reward_xp_<n>` instead of the glyphs, and the
   chest bag at `chest_<tier>`. Owner of `play/game-menu.js` inventory/NFT tabs is on `BOARD.md`; coordinate.
4. Check: `node --test game/tests/client/chest.test.mjs game/tests/client/chests.test.mjs`, then the full `npm test`
   and a built-page boot on the server; look at the reveal on a phone width.
