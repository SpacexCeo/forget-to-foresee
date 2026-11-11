"""The townsfolk cast (N-001): the thirteen people of the hill town from the owner-approved sheets
(docs/art/townsfolk/refs/N-001_02..13, 13b; the FRONT view of each sheet is the construction authority and the
declared height governs).

Each entry is plain data read by the build scripts in this folder:
    role, name     who they are (names are ours; nothing is taken from any game, film or show)
    height         real standing height in metres (the body is built at the rig's eye line and scaled on export)
    macros         MakeHuman macro targets (gender 0 female .. 1 male; age 0.19 ~ 10 y, 0.5 ~ 25 y, 1.0 ~ 90 y)
    detail         MakeHuman detail targets for the face and build (CC0), name -> weight
    skin, hair     look-dev parameters (linear RGB)
    costume        garment recipe for tf_costume.py; colours are keys of PALETTE
    style          posture and gait for tf_anim.py
"""

# Town palette (linear RGB): linen, wool, leather, dyed felt in terracotta, ochre, moss, indigo.
PALETTE = {
    "linen": (0.55, 0.49, 0.38), "linen_dark": (0.38, 0.32, 0.24), "cream": (0.60, 0.54, 0.43),
    "undyed_wool": (0.20, 0.15, 0.105), "charcoal": (0.045, 0.045, 0.05), "slate": (0.12, 0.13, 0.15),
    "terracotta": (0.30, 0.095, 0.055), "brick": (0.21, 0.065, 0.04), "ochre": (0.42, 0.25, 0.07),
    "straw": (0.50, 0.38, 0.17), "moss": (0.10, 0.115, 0.05), "sage": (0.28, 0.33, 0.20),
    "indigo": (0.05, 0.06, 0.105), "indigo_light": (0.09, 0.11, 0.18), "plum": (0.16, 0.06, 0.10),
    "leather": (0.16, 0.085, 0.04), "leather_dark": (0.07, 0.04, 0.025), "leather_tan": (0.33, 0.19, 0.09),
    "amber": (0.80, 0.42, 0.05), "bronze": (0.35, 0.22, 0.09), "pearl": (0.70, 0.68, 0.66),
    "shell_white": (0.78, 0.74, 0.66), "wood": (0.20, 0.12, 0.06), "iron": (0.10, 0.10, 0.11),
}

SKIN = {            # base tone (linear RGB), blush strength
    "fair": ((0.62, 0.40, 0.30), 0.5), "warm": ((0.52, 0.31, 0.21), 0.45), "olive": ((0.44, 0.27, 0.17), 0.35),
    "tan": ((0.36, 0.20, 0.12), 0.3), "brown": ((0.22, 0.115, 0.065), 0.2), "deep": ((0.13, 0.07, 0.042), 0.15),
}

HAIR = {
    "black": (0.012, 0.010, 0.010), "dark_brown": (0.045, 0.024, 0.014), "chestnut": (0.14, 0.07, 0.036),
    "auburn": (0.22, 0.07, 0.03), "sand": (0.42, 0.29, 0.14), "grey": (0.33, 0.32, 0.31),
    "white": (0.66, 0.65, 0.62), "salt_pepper": (0.16, 0.155, 0.15), "silver": (0.50, 0.49, 0.47),
}


def race(af=0.0, asn=0.0, ca=1.0):
    s = af + asn + ca
    return {"african": af / s, "asian": asn / s, "caucasian": ca / s}


def style(lean=0, hunch=0, protract=0, chin=0, tilt=0, width=0.0, knee=0.006, swing=1.0, sway=1.0, bounce=1.0,
          tempo=1, cloth=1.0, walk=1.25, cycle=30):
    return dict(lean=lean, hunch=hunch, protract=protract, chin=chin, tilt=tilt, width=width, knee=knee, swing=swing,
                sway=sway, bounce=bounce, tempo=tempo, cloth=cloth, walk=walk, cycle=cycle)


BAGGY = dict(trousers_cut="boot", trousers_w=1.14)      # full trousers gathered into ankle boots (every sheet)

CAST = {
    # ---------------------------------------------------------------- shopkeepers (seen close)
    "shardkeeper": dict(
        sheet="N-001_02", role="Keeper of the Shard Exchange (S-001)", name="Maren Voss",
        idea="A warm, exact appraiser of forgotten memories: curly dark bob, an amber pendant, a knotted ochre sash.",
        height=1.70,
        macros=dict(gender=0.0, age=0.60, muscle=0.40, weight=0.55, height=0.55, proportions=0.60,
                    cupsize=0.50, firmness=0.50, race=race(0.05, 0.10, 0.85)),
        detail={"head/head-oval": 0.3, "cheek/l-cheek-volume-incr": 0.3, "cheek/r-cheek-volume-incr": 0.3,
                "mouth/mouth-angles-up": 0.5, "nose/nose-scale-horiz-incr": 0.2, "eyes/l-eye-scale-incr": 0.2,
                "eyes/r-eye-scale-incr": 0.2},
        skin="warm", hair=("dark_brown", "curly_bob"), brows=1.0,
        costume=dict(base="dress", dress=("indigo", "ochre"), hem=0.30, sleeves="none", collar="wrap", under=("cream",),
                     underskirt=("cream", 0.36),
                     trousers=("undyed_wool", "leather"), sash=("ochre",), shoes=("boots", "leather"),
                     extras=("ring_pendant",), **BAGGY),
        style=style(lean=-1, protract=-2, chin=-2, swing=0.8, sway=1.1, bounce=0.9, walk=1.20, cycle=30),
    ),
    "scribe": dict(
        sheet="N-001_03", role="Scribe of Signs (S-002)", name="Odo Fenn",
        idea="A slim, observant scribe: moss work coat, a long ochre scarf, a scroll tube on the belt, hair tied up.",
        height=1.76,
        macros=dict(gender=1.0, age=0.52, muscle=0.35, weight=0.28, height=0.60, proportions=0.60,
                    cupsize=0.5, firmness=0.5, race=race(0.0, 0.35, 0.65)),
        detail={"nose/nose-scale-vert-incr": 0.3, "chin/chin-prominent-incr": 0.2, "cheek/l-cheek-volume-decr": 0.3,
                "cheek/r-cheek-volume-decr": 0.3, "head/head-oval": 0.3, "mouth/mouth-angles-up": 0.3},
        skin="warm", hair=("black", "topknot"), beard=("black", "short"), brows=1.0,
        costume=dict(base="shirt_trousers", shirt=("moss", "ochre"), sleeves="elbow", shirt_hem="tunic", tunic_len=0.80,
                     under=("cream",), trousers=("undyed_wool", "leather"), belt=("leather", "bronze"),
                     shoes=("boots", "leather"), scarf=("ochre", "tails"),
                     extras=("quill_case", "pouch"), **BAGGY),
        style=style(lean=2, hunch=2, protract=2, chin=-2, tilt=2, swing=0.8, sway=0.8, bounce=0.9, walk=1.20, cycle=30),
    ),
    "innkeeper": dict(
        sheet="N-001_04", role="Innkeeper (S-003)", name="Brenna Holloway",
        idea="A sturdy, kind host: terracotta dress, a worn leather apron with a towel, auburn hair pinned up.",
        height=1.78,
        macros=dict(gender=0.0, age=0.64, muscle=0.55, weight=0.80, height=0.70, proportions=0.50,
                    cupsize=0.65, firmness=0.45, race=race(0.05, 0.0, 0.95)),
        detail={"head/head-round": 0.5, "cheek/l-cheek-volume-incr": 0.5, "cheek/r-cheek-volume-incr": 0.5,
                "chin/chin-width-incr": 0.3, "mouth/mouth-angles-up": 0.4, "nose/nose-point-up": 0.2},
        skin="fair", hair=("auburn", "bun_curly"), brows=0.9, freckles=0.3,
        costume=dict(base="dress", dress=("terracotta", "cream"), hem=0.20, sleeves="cap", collar="scoop", under=("cream",),
                     apron=("leather", "leather_dark"), shoes=("boots", "leather"), extras=("towel",)),
        style=style(lean=-1, hunch=1, protract=1, chin=1, width=0.03, knee=0.010, swing=0.9, sway=1.3, bounce=0.9,
                    cloth=0.8, walk=1.15, cycle=32),
    ),
    # ---------------------------------------------------------------- street life
    "baker": dict(
        sheet="N-001_05", role="Baker", name="Tobin Marsh",
        idea="Stocky, good-humoured and floury: ochre shirt, a flour-dusted apron, a linen head wrap, a full dark beard.",
        height=1.72,
        macros=dict(gender=1.0, age=0.56, muscle=0.70, weight=0.90, height=0.45, proportions=0.40,
                    cupsize=0.5, firmness=0.5, race=race(0.15, 0.10, 0.75)),
        detail={"head/head-round": 0.6, "cheek/l-cheek-volume-incr": 0.5, "cheek/r-cheek-volume-incr": 0.5,
                "nose/nose-scale-horiz-incr": 0.4, "neck/measure-neck-circ-incr": 0.5, "mouth/mouth-angles-up": 0.5},
        skin="olive", hair=("dark_brown", "covered"), beard=("dark_brown", "full"), brows=1.3,
        costume=dict(base="shirt_trousers", shirt=("ochre", "ochre"), sleeves="short", trousers=("terracotta", "brick"),
                     apron=("cream", "linen"), shoes=("boots", "leather"), hat=("headscarf", "cream", "linen"),
                     extras=("flour",), **BAGGY),
        style=style(lean=-1, hunch=1, chin=1, width=0.045, knee=0.012, swing=0.9, sway=1.4, bounce=1.0, cloth=0.8,
                    walk=1.15, cycle=30),
    ),
    "sweeper": dict(
        sheet="N-001_06", role="Street sweeper", name="Pip Rowan",
        idea="Slim, diligent and cheerful: moss tunic, rolled ochre trousers, an ochre kerchief, a straw broom.",
        height=1.62,
        macros=dict(gender=0.0, age=0.50, muscle=0.40, weight=0.28, height=0.40, proportions=0.60,
                    cupsize=0.40, firmness=0.6, race=race(0.05, 0.25, 0.70)),
        detail={"head/head-oval": 0.2, "mouth/mouth-angles-up": 0.6, "eyes/l-eye-scale-incr": 0.3,
                "eyes/r-eye-scale-incr": 0.3, "nose/nose-point-up": 0.3, "chin/chin-width-decr": 0.2},
        skin="warm", hair=("dark_brown", "covered"), brows=0.9,
        costume=dict(base="shirt_trousers", shirt=("moss", "leather_tan"), sleeves="elbow", shirt_hem="tunic", tunic_len=0.10,
                     under=("cream",), under_sleeves="none",
                     trousers=("ochre", "ochre"), belt=("leather", "bronze"), shoes=("boots", "leather"),
                     hat=("headscarf", "ochre", "ochre"), extras=("broom", "pouch"), **BAGGY),
        style=style(lean=3, hunch=1, protract=1, chin=1, tilt=3, swing=1.1, sway=1.1, bounce=1.2, tempo=2, walk=1.20, cycle=28),
    ),
    "lamplighter": dict(
        sheet="N-001_07", role="Lamplighter", name="Corin Vale",
        idea="Tall and lean, observant: indigo work coat over rolled linen sleeves, a tool belt, a lantern in the hand.",
        height=1.86,
        macros=dict(gender=1.0, age=0.58, muscle=0.45, weight=0.25, height=0.85, proportions=0.70,
                    cupsize=0.5, firmness=0.5, race=race(0.0, 0.15, 0.85)),
        detail={"head/head-oval": 0.4, "nose/nose-scale-vert-incr": 0.3, "nose/nose-hump-incr": 0.2,
                "chin/chin-height-incr": 0.2, "cheek/l-cheek-volume-decr": 0.3, "cheek/r-cheek-volume-decr": 0.3,
                "neck/neck-scale-vert-incr": 0.3},
        skin="olive", hair=("dark_brown", "wavy"), beard=("dark_brown", "short"), brows=1.1,
        costume=dict(base="shirt_trousers", shirt=("indigo", "bronze"), sleeves="short", shirt_hem="tunic", tunic_len=0.62,
                     under=("cream",), under_sleeves="rolled", trousers=("linen", "linen_dark"),
                     belt=("leather", "bronze"), shoes=("boots", "leather"),
                     extras=("lantern", "pouch", "pouch_r", "cross_strap", "ring_brooch"), **BAGGY),
        style=style(lean=1, hunch=1, protract=1, chin=-1, swing=0.9, sway=0.8, bounce=0.9, walk=1.30, cycle=32),
    ),
    "guard": dict(
        sheet="N-001_08", role="Guard at the lower gate", name="Kessa Dorn",
        idea="The tallest in the town, calm and respected: quilted moss coat, bronze-studded leather cuirass, terracotta sash.",
        height=1.92,
        macros=dict(gender=0.0, age=0.52, muscle=0.85, weight=0.50, height=0.95, proportions=0.80,
                    cupsize=0.30, firmness=0.7, race=race(0.10, 0.45, 0.45)),
        detail={"chin/chin-width-incr": 0.3, "cheek/l-cheek-bones-incr": 0.4, "cheek/r-cheek-bones-incr": 0.4,
                "mouth/mouth-angles-up": 0.3, "head/head-oval": 0.2, "neck/measure-neck-circ-incr": 0.3},
        skin="olive", hair=("black", "pixie"), brows=1.2,
        costume=dict(base="shirt_trousers", shirt=("moss", "leather_tan"), sleeves="long", shirt_hem="gambeson", tunic_len=0.85,
                     trousers=("undyed_wool", "leather_dark"), sash=("terracotta",),
                     shoes=("boots_tall", "leather"),
                     extras=("cuirass", "pauldrons", "bracers", "sidearm"), trousers_cut="boot", trousers_w=1.12),
        style=style(lean=-2, protract=-3, chin=-3, width=0.04, swing=0.8, sway=0.7, bounce=0.8, cloth=0.8, walk=1.30, cycle=32),
    ),
    "elder": dict(
        sheet="N-001_09", role="Elder on the bench", name="Aldo Nan",
        idea="The oldest man in the town: a fringed ochre shawl over an indigo vest, a cane, a white beard, a wise smile.",
        height=1.65,
        macros=dict(gender=1.0, age=0.93, muscle=0.25, weight=0.55, height=0.35, proportions=0.40,
                    cupsize=0.5, firmness=0.3, race=race(0.0, 0.10, 0.90)),
        detail={"head/head-round": 0.3, "nose/nose-scale-horiz-incr": 0.4, "nose/nose-scale-vert-incr": 0.3,
                "ears/l-ear-scale-incr": 0.5, "ears/r-ear-scale-incr": 0.5, "mouth/mouth-angles-up": 0.5,
                "cheek/l-cheek-volume-incr": 0.2, "cheek/r-cheek-volume-incr": 0.2},
        skin="fair", hair=("white", "swept"), beard=("white", "full"), brows=1.3,
        costume=dict(base="shirt_trousers", shirt=("cream", "linen_dark"), sleeves="long", trousers=("linen_dark", "leather"),
                     over="vest_long", over_col=("indigo", "ochre"), over_len=0.15, over_open=0.02,
                     shawl=("ochre", "ochre"), shoes=("boots", "leather"), extras=("cane", "ring_brooch"), **BAGGY),
        style=style(lean=10, hunch=6, protract=6, chin=-9, tilt=2, width=0.02, knee=0.026, swing=0.4, sway=0.9,
                    bounce=0.5, cloth=0.8, walk=0.65, cycle=40),
    ),
    "child_a": dict(
        sheet="N-001_10", role="Child, 10", name="Wren",
        idea="A town girl with two long braids: moss pinafore with pockets over a linen shirt, ochre knee trousers.",
        height=1.32,
        macros=dict(gender=0.0, age=0.19, muscle=0.40, weight=0.45, height=0.50, proportions=0.50,
                    cupsize=0.5, firmness=0.5, race=race(0.10, 0.10, 0.80)),
        detail={"head/head-round": 0.4, "cheek/l-cheek-volume-incr": 0.5, "cheek/r-cheek-volume-incr": 0.5,
                "mouth/mouth-angles-up": 0.6, "nose/nose-point-up": 0.4, "eyes/l-eye-scale-incr": 0.4,
                "eyes/r-eye-scale-incr": 0.4},
        skin="warm", hair=("dark_brown", "braids_two"), brows=0.7,
        costume=dict(base="dress", dress=("moss", "ochre"), hem_at="knee", hem=0.03, sleeves="none", collar="scoop",
                     under=("cream",), trousers=("straw", "straw"), trousers_cut="cropped", trousers_w=1.14,
                     shoes=("boots", "leather"), extras=("pockets",)),
        style=style(lean=2, chin=-2, tilt=3, swing=1.3, sway=1.2, bounce=1.5, tempo=2, cloth=1.1, walk=1.10, cycle=22),
    ),
    "child_b": dict(
        sheet="N-001_11", role="Child, 8", name="Tam",
        idea="A curious boy with a mop of curls: ochre tunic with toggles, terracotta shorts, wool socks, a belt pouch.",
        height=1.22,
        macros=dict(gender=1.0, age=0.16, muscle=0.40, weight=0.40, height=0.50, proportions=0.50,
                    cupsize=0.5, firmness=0.5, race=race(0.0, 0.10, 0.90)),
        detail={"head/head-round": 0.4, "cheek/l-cheek-volume-incr": 0.5, "cheek/r-cheek-volume-incr": 0.5,
                "mouth/mouth-angles-up": 0.6, "nose/nose-point-up": 0.4, "eyes/l-eye-scale-incr": 0.5,
                "eyes/r-eye-scale-incr": 0.5, "ears/l-ear-rot-out": 0.3, "ears/r-ear-rot-out": 0.3},
        skin="warm", hair=("chestnut", "short_curly"), brows=0.7, freckles=0.5,
        costume=dict(base="shirt_trousers", shirt=("ochre", "leather_tan"), sleeves="short", shirt_hem="tunic", tunic_len=-0.25,
                     trousers=("terracotta", "brick"), trousers_cut="knee", trousers_w=1.15,
                     belt=("leather", "bronze"), shoes=("boots", "leather"), socks=("undyed_wool",),
                     extras=("pouch",)),
        style=style(lean=3, chin=-3, swing=1.3, sway=1.0, bounce=1.4, tempo=2, walk=1.20, cycle=22),
    ),
    "musician": dict(
        sheet="N-001_12", role="Street musician", name="Liss Carrow",
        idea="A slender travelling storyteller: long terracotta vest over a linen shirt, indigo trousers, a lute on a strap.",
        height=1.74,
        macros=dict(gender=0.5, age=0.47, muscle=0.40, weight=0.28, height=0.60, proportions=0.70,
                    cupsize=0.10, firmness=0.6, race=race(0.05, 0.15, 0.80)),
        detail={"head/head-oval": 0.4, "chin/chin-width-decr": 0.3, "mouth/mouth-angles-up": 0.4,
                "eyes/l-eye-corner2-up": 0.2, "eyes/r-eye-corner2-up": 0.2, "nose/nose-scale-vert-incr": 0.2},
        skin="fair", hair=("chestnut", "short_curly"), brows=0.9, freckles=0.3,
        costume=dict(base="shirt_trousers", shirt=("cream", "linen_dark"), sleeves="long", trousers=("indigo", "indigo_light"),
                     over="vest_long", over_col=("terracotta", "ochre"), over_len=0.0, over_open=0.012,
                     belt=("leather", "bronze"), shoes=("boots", "leather"), extras=("lute",), **BAGGY),
        style=style(protract=-2, chin=-2, tilt=5, swing=1.0, sway=1.2, bounce=1.0, cloth=1.1, walk=1.25, cycle=28),
    ),
    "courier": dict(
        sheet="N-001_13", role="Courier with a satchel", name="Jory Pell",
        idea="Athletic and quick: moss work shirt with rolled sleeves, full indigo trousers, a leather satchel, a high ponytail.",
        height=1.68,
        macros=dict(gender=0.0, age=0.44, muscle=0.65, weight=0.38, height=0.50, proportions=0.70,
                    cupsize=0.45, firmness=0.7, race=race(0.10, 0.30, 0.60)),
        detail={"mouth/mouth-angles-up": 0.5, "cheek/l-cheek-bones-incr": 0.3, "cheek/r-cheek-bones-incr": 0.3,
                "eyes/l-eye-scale-incr": 0.2, "eyes/r-eye-scale-incr": 0.2, "chin/chin-width-decr": 0.1},
        skin="tan", hair=("black", "ponytail"), brows=1.1,
        costume=dict(base="shirt_trousers", shirt=("moss", "leather_tan"), sleeves="rolled", shirt_hem="blouse",
                     trousers=("indigo", "indigo_light"),
                     belt=("leather", "bronze"), shoes=("boots", "leather"), extras=("satchel",), **BAGGY),
        style=style(lean=5, protract=1, chin=-2, swing=1.3, sway=0.9, bounce=1.2, tempo=2, cloth=1.2, walk=1.55, cycle=24),
    ),
    "shrinekeeper": dict(
        sheet="N-001_13b", role="Keeper of the round shrine", name="Ilse Seren",
        idea="A calm, reassuring keeper: indigo wool robe with wide sleeves over an ivory linen dress, amber beads, a low bun.",
        height=1.60,
        macros=dict(gender=0.0, age=0.80, muscle=0.30, weight=0.50, height=0.35, proportions=0.50,
                    cupsize=0.50, firmness=0.3, race=race(0.0, 0.30, 0.70)),
        detail={"head/head-oval": 0.3, "mouth/mouth-angles-up": 0.5, "cheek/l-cheek-bones-incr": 0.3,
                "cheek/r-cheek-bones-incr": 0.3, "nose/nose-scale-vert-incr": 0.2},
        skin="warm", hair=("silver", "bun_low"), brows=0.8,
        costume=dict(base="robe", robe=("indigo", "ochre"), hem=0.22, sleeves="wide", collar="wrap", under=("cream",),
                     underskirt=("cream", 0.10), belt=("indigo", "bronze"), shoes=("slippers", "leather"),
                     extras=("amber_beads", "ring_brooch")),
        style=style(lean=1, hunch=1, protract=1, chin=-2, swing=0.4, sway=0.7, bounce=0.5, cloth=1.2, walk=0.95, cycle=36),
    ),
}

ORDER = ("shardkeeper", "scribe", "innkeeper", "baker", "sweeper", "lamplighter", "guard", "elder", "child_a", "child_b",
         "musician", "courier", "shrinekeeper")
