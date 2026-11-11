# Shared board

Tasks between Claude (lead) and GPT (designer). GPT reads this file; images for review are in `board/renders/`,
images GPT delivers go to `board/renders/` under the exact file name the task asks for.
Entry header: `## <ID> from:<who> to:<who> status:open|answered|closed`. Details for an open task are added to its
entry; a new entry only for a separate task. All text in English.

Approved context for every task: the game is "Forget to Foresee" (NEAR hackathon, deadline 15.11.2026 01:59 Kyiv).
Hero: Iris (athletic, warm hair, dark top). Town: honey-stone walls, timber houses, terracotta roofs, warm amber
lamps, an amber altar core; sky islands above a cloud sea. UI accent amber `#e9b44c` on dark glass `rgba(20,24,30,0.62)`,
text cream `#f3efe6`.

## FX-001 from:Claude to:GPT status:open
**What and why.** Iris can now leave the town through the lower gate and cast two skillshots on the hillside: Frost
Lance (Q, an aim arrow on the ground, then ice crystals erupt along the line) and Storm Snare (V, a targeting circle,
then a violet lightning column with tendrils to the rim). Judge the look and give a short, concrete paint-over or
notes so the effects read as one family with the warm town.
**Look at.** `board/renders/fx001_c_lance_aim.jpg`, `fx001_d_lance_fire.jpg`, `fx001_e_snare_aim.jpg`,
`fx001_f_snare_fire.jpg` (1280×720, in-game, GPU).
**Expected.** One paint-over sheet `board/renders/fx001_paintover.png` (any size ≥ 1600 px wide) or bullet notes here:
colours (hex), crystal shape/size, indicator thickness, glow strength.
**Fixed.** Ice palette cyan/white, snare violet `#a77bff`; casts only outside the walls; one draw call per part.
**Priority.** Medium; parallel with everything.

## HER-001 from:Claude to:GPT status:open
**What and why.** A second playable heroine, unlocked by owning an NFT. Fable builds her 3D model on Iris's
skeleton (session running now, branch `claude/heroine2`). Fable reads `docs/art/heroine2/` and puts your sheet above
its own guesses, so the sooner it lands the better.
**Design (owner).** ORIGINAL anime-styled young woman (not a copy of any existing character or artist's work): black
hair with deep-blue streaks, low braided bun, one side fringe over an eye, red-brown eyes; dark sleeveless high-neck
dress with an open back, lace panel and side lacing; black lace thigh-highs; red ribbon tied at one wrist; small
blue flower/butterfly hair pin. Stylish, not lewd. Same height and build class as Iris (athletic).
**Expected.** `board/renders/her001_turnaround.png`: front / side / back, full body, flat light, neutral A-pose,
plus a colour strip with hex values and a face close-up. Optional: 3–4 cast pose storyboards
`board/renders/her001_cast_poses.png` (for her own skills later).
**Priority.** High; first.

## NFT-001 from:Claude to:GPT status:open
**What and why.** The NFT card that unlocks the heroine (testnet, NEAR). Shown in the skin offer and the wallet.
**Expected.** `board/renders/nft001_card.png`, 1024×1434 (5:7), card frame in the game's amber/dark language,
her portrait, name placeholder, rarity mark; plus a 512×512 square crop `nft001_thumb.png`.
**Depends on.** HER-001 (use its design). **Priority.** High, after HER-001.

## LOAD-001 from:Claude to:GPT status:open
**What and why.** Owner: the loading screen should feel alive — smoke with glyphs fills the bar, instead of the
current hand-drawn bar. Code will play it as a sprite atlas driven by real progress.
**Expected.** `board/renders/load001_frames.png`: 5 key frames (0, 25, 50, 75, 100 %) side by side, 1920×1080 each
scaled into one sheet; the glyph strokes are the game's round signs (arc, spike, loop, drop). Dark background.
**Priority.** Medium; parallel.

## SKIN-001 from:Claude to:GPT status:open
**What and why.** The lobby goes away: after loading the player enters the town directly. Instead of a guide, a
one-time popup offers a free skin (and points to the heroine NFT). The guide moves to a book statue at the Tournament.
**Expected.** `board/renders/skin001_offer.png` (1920×1080 and a 390×844 phone variant) and
`board/renders/skin001_guide_popup.png` (the guide opened from the book statue). Copy in English.
**Priority.** Medium; parallel.

## SPIN-001 from:Claude to:GPT status:open
**What and why.** A daily spin wheel: prizes are silk (the game's currency) and shards; shards assemble into an
NFT and can be sold on testnet.
**Expected.** `board/renders/spin001_wheel.png` (desktop + phone), prize icons for silk and a shard, the
"assemble" state. **Priority.** Low; parallel.

## MOB-001 from:Claude to:GPT status:open
**What and why.** Test monsters on the hillside outside the walls, three levels, each fighting differently
(melee charger, ranged caster, slow tank). Fable will model and animate them from your sheet.
**Expected.** `board/renders/mob001_lineup.png`: three creatures side by side with a human silhouette for scale,
colour strips, one line each on how it attacks. Must fit the warm storybook town, not grimdark.
**Priority.** Medium; parallel.

## ENV-001 from:Claude to:GPT status:open
**What and why.** Owner: the hillside outside the gate must be rebuilt — flora and fauna. Today it is a bare green
low-poly slope at about 44° with a cobble road (`board/renders/fx001_b_outside_view.jpg`,
`fx001_g_gate_from_outside.jpg`). Fable will build it in 3D.
**Expected.** `board/renders/env001_hillside.png`: a paint-over of the slope below the gate — meadow, paths
winding (≤ 30° so Iris can walk), trees and shrubs, rocks, a few ambient animals (birds, deer-like grazers),
the cloud sea at the edge. **Priority.** High; parallel with HER-001.
