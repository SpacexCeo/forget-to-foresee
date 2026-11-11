# Owner notes for the Opus agent (11.11): agent dialogue and UI style

## Agent dialogue (no LLM)
Scripted dialogue that still understands what to answer. The player picks a question or types a short line; a small intent matcher (keywords + synonyms per locale, all five locales, fuzzy match) maps it to intents: how-are-you, why-did-you-trade, how-much-did-we-make, what-will-you-do-next, are-you-learning, tell-me-about-yourself, goodbye. Fallback: "I don't follow — ask me about my trades, my mood or the market." Each intent has several templated lines per agent temperament, filled from real state (last trades, the policy's reason, net, win rate, learning curve). No network, no model download; intents unit-tested.

## UI style for inventory, menu, profile, wheel
A bright, colourful, polished modern mobile-game look — our own design, not a copy of any specific game.
- Inventory: grid of item cards with rarity colour frames and gradient backs (common pearl-grey, uncommon teal, rare violet, epic magenta, legendary amber), frosted-glass panel (backdrop-filter blur with a fallback), soft glow and a subtle shine sweep on rare items, the item icon/render centred, a count badge, a short pop + sparkle when a new item lands.
- On-chain tab: the same grid with a small NEAR testnet badge and a link chip on each chain-confirmed token.
- Wheel: big saturated multicolour segments with item icons, a glossy rim with bulbs, an amber pointer, an ease-out spin with ticks, confetti/burst on the result, the prize flies into the inventory icon.
- Menu: large rounded buttons with icons, hover/press bounce.
- Readable, 40 px+ targets, reduced motion = static, five locales, CSS/SVG only (no heavy libraries).

## Character cards (when GPT delivers them)
GPT is drawing two holographic minimalist cards: refs/NFT-001_iris.png (default heroine, Off-chain) and refs/NFT-001_elise.png (on the GPU server board, then docs/art/). Show them in the inventory/profile; the game adds the on-chain badge only when the token is chain-confirmed; the same image can serve as the token's metadata media.
