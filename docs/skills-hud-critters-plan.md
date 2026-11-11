# Skill bar HUD, items/food/energy, critters in the quest (owner, 11.11)

## Skill bar (bottom HUD)
- A bottom panel of square skill buttons. Each button is FULLY filled with its icon art (edge to edge, rounded corners); the key is a small label on a dark rounded plate in one corner (e.g. "1", "Q", "E", "RMB"; gamepad glyph on pad, hidden on touch where the button itself is tapped). Cooldown = a radial sweep over the art + the remaining seconds; disabled = desaturated.
- Slots fill as the player obtains skills (starts with 1–2; a "new skill" pop and a slot unlock animation). Same bright, polished look as the inventory (docs/ui-style-and-dialogue.md).
- Next to it: quick slots for items/food (consumables with counts) and an **energy** bar (spent by skills/sprint, restored by food and rest).
- Phone: a compact arc of 4 big buttons near the right thumb + a "more" toggle.

## Critters in the town quest
- One quest step sends the heroine just outside the gate to drive off a couple of small wild critters that raid the market stalls (2–3 small creatures from the existing fauna, or simple original ones). Light, non-graphic: a hit makes them squeak and puff into sparkles and run off/vanish; they drop a small item (food or a part) into the inventory.
- First skills on the bar: a basic strike (key 1) and a dash (key 2); energy cost and cooldown; hit feedback (flash, small shake, sound).
- Tests: skill unlock fills the next slot, cooldown/energy rules, drops land in inventory, quest step completes after the critters are driven off.

## Art
- GPT: icon sheet for skills (strike, dash, and 6 future ones), consumables (bread, fruit, tea, energy tonic) and the energy bar, in our palette — square, edge-to-edge art, no text.
- Fable later if new critter models are needed.
