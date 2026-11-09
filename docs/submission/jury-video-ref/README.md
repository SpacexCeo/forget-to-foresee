# Jury video: owner's look references (09.11)

AI-generated frames supplied by the owner as the target look for the one-minute jury video. Reference only:
they are not game assets, they do not ship in the build, and the video must never present them as gameplay.

1. `01-world-with-overlays.webp`: the world as the hero, with UI anchored in it (chapter title top left, a ringed
   marker on the island, a glass data card bottom right, a progress rail top right).
2. `02-world-plate.webp`: the same world without UI: mist, floating islands with waterfalls, an iridescent nacre
   sphere and arch, white blossoms in the foreground, warm points of light.
3. `03-agents-cards.webp`: "I · The Agents / Memory · Prophecy · Betrayal": six large glass cards, each clan with
   its own material motif (Salt crystals, Iris petal, Frost snowflake, Moss clover, Ash smoke, Amber orb).
4. `04-agents-events.webp`: the three real events as visual events between tilted cards: silk spools, a crystal shard
   passing from Iris to Frost for 13 silk, Salt's "It is a weapon", Ash cheating Amber for 16 with a crack.
5. `05-memory-shard-title.webp`: "II · The Memory Shard / Memory is the price of prophecy": a nacre crystal with
   orbit rings over dark clouds.

Three more frames from the owner (sent mid-message, not saved as files; described here):

6. **Memory Shard, fracture:** chapter lockup top left "The Memory Shard / Prophecy · Memory · Weight" in a thin
   ring; Iris breadcrumb top right ("Iris · Memory" with a five-dot progress rail, the current dot gold). Centre: a
   nacre-glass sphere splitting into large curved iridescent shards with thin gold edges, smaller flakes flying
   outward, a vertical beam of soft gold light, concentric ground rings below; inside, two round sigils (the two
   future signs) in gold line. Caption under it: "to see the future *first*" (italic, "first" in gold), between
   thin gold rules. The cloaked figure on the cliff at left, blossoms, floating islands and a pale moon at right.
7. **Memory Shard, token:** lockup "The Memory Shard / On-chain proof of origin" top centre. A large frosted-glass
   panel with rounded corners and a soft light edge: left, the token's ink-ring sigil (pale blue ring, three dots,
   tick marks) wrapped by a nacre ribbon with petals; right, "Minted on NEAR testnet" (NEAR in bold), then gold
   letter-spaced labels MEMORY / FORGOTTEN · SOLD / SEASON ROOT / OPENED LEAF with values in a serif ("Iris · A Call
   · weight 2", "trial 4 · Frost, 13 silk"), and a dotted line labelled "same" to a small glass tag "leaf #3 /
   ftf-seasons".
8. **Interface style sheet (trailer):** chapter title lockups (serif display title inside a thin ring with a small
   top circle; caps subtitle with wide tracking; "Chapter II · Bound to the *Sealed Season*" with the italic part in
   gold); circular sigils (ring + four diamond ticks + dots); a clan card sample (frosted glass, clan name in its
   colour, caps temper, "59 silk at the start" with the number in gold bold, a material vignette on the right); a
   token frame sample; a glass info panel sample; accent tags (rounded pills with a small dot: `• Salt: "It is a
   weapon"`, `• Frost wins the shard · 13`, `leaf #3`, "Iris · Memory" with the iris-petal icon); thin dividers with
   a centre circle or diamond; reticles. Palette: charcoal, deep grey-green, slate, nacre/iridescent, pearl white,
   amber gold. Type scale: Display (chapters), Title (sections), UI/label (system), Accent caps (meta). Material
   notes: glass/depth/soft bloom; nacre/iridescent accents; mist/atmosphere (layered); amber/selective emphasis.

## Layer assets from the owner (09.11, `layers/`)

Separated elements for compositing (AI-generated; RGBA with transparency except the plate):
- `plate-archipelago.webp` (1672x941, RGB): a clean environment plate without UI. Not our game's island: use only
  behind a chapter title or transition, never as gameplay.
- `lockup-agents-and-seal-rail.webp` (1672x941, RGBA): the "The Agents / Memory · Prophecy · Betrayal" ring lockup
  and the "Bound to the Sealed Season" rail with the third dot lit. Reference for the programmatic lockup; the
  final text must be rendered by us.
- `card-salt.webp`, `card-iris.webp`, `card-frost.webp` (1086x1448, RGBA): tilted gold-edged clan cards with their
  material art (Salt crystal spires, Iris violet petals, Frost snowflake over peaks). The names are baked in: use
  the art, but render the names and tempers programmatically (mask or repaint the baked text). Moss, Ash and
  Amber cards are still to come.

Five more owner layers arrived only inside a message (not saved as files; described for reproduction):
- **Ash card:** same tilted gold-edged frame; black ground with drifting grey smoke and fine white ash flecks;
  "Ash / WARY".
- **Amber card:** dark stone ground split by glowing amber cracks radiating from a large glowing amber orb;
  "Amber / GREEDY".
- **Event A badge:** a violet-iridescent crystal shard inside a thin gold ring of dots, a violet silk ribbon sweeping
  around, a small silk spool; "Frost wins the shard from Iris for" (serif) and a large gold italic "13" over
  spaced caps "SILK", a small four-point star below.
- **Event B badge:** a dark pill with a gold edge and violet threads holding the italic quote "It is a weapon",
  joined to a dark disc with a gold reticle (four-point stars on a ring, dashed inner ring) pierced by a long pale
  crystal blade.
- **Event C badge:** a gold dashed line through a large gold italic "16" over "SILK", breaking at the right end in a
  gold crack spark; "Ash cheats Amber for" above; a silk spool and violet ribbon at lower left; thin gold arcs.
Moss is still to come.

## Layered asset pack from the owner (09.11 evening, `pack/`)

`agents_animation_layers.zip` as the owner sent it: six landscape clan cards with the sigil on the top edge
(`02_clan_cards/`, about 410x210 px each, text baked in), the "I · The Agents" title with its sigil, the Iris figure, the
floating islands and two environment concepts, detail elements (blossoms, crystal, snowflake, orb, ribbons, moss rock) and
UI ornaments (orbit circle, golden frame, arcs, sigils, blank panel). `manifest.json` and `README.txt` are the pack's own
notes. The video uses the six cards (copied to `game/cine/ref/land-*.png`) in the agents and crisis scenes and the ring
lockup from `layers/` on the Agents title card; the environment concepts stay references (real footage is the base).
