//! Shard data, its validation, the NEP-177 metadata and the deterministic ink-ring image. Byte-exact twin of
//! `game/src/net/shard-nft.js`; `tests/vectors.json` (generated from the JavaScript) pins every string.
//! Integer arithmetic only, so the two languages cannot drift on rounding.

use near_sdk::json_types::Base64VecU8;
use near_sdk::{env, near};

pub const SHARD_KINDS: &[&str] = &["first", "call", "gift", "betrayal", "debt", "promise", "insight", "lie"];
pub const CLANS: &[&str] = &["iris", "salt", "ash", "moss", "amber", "frost"];
pub const SPEC: &str = "ftf-shard/1";

pub const ERR_BAD_SEASON_ID: &str = "ERR_BAD_SEASON_ID: season_id must be 8-64 lowercase hex characters";
pub const ERR_BAD_KIND: &str = "ERR_BAD_KIND: unknown memory kind";
pub const ERR_BAD_CLAN: &str = "ERR_BAD_CLAN: unknown clan id";
pub const ERR_BAD_WEIGHT: &str = "ERR_BAD_WEIGHT: weight must be 0-4";
pub const ERR_BAD_TICK: &str = "ERR_BAD_TICK: forgotten_at_tick must be 1-17 and closes_at_tick 1-19";
pub const ERR_BAD_SHARD_ID: &str = "ERR_BAD_SHARD_ID: shard_id must be 1 or more";
pub const ERR_BAD_HASH: &str = "ERR_BAD_HASH: expected 64 lowercase hex characters";
pub const ERR_BAD_UNLOCK: &str = "ERR_BAD_UNLOCK: unlocked_index (0-1023) and unlocked_leaf go together";

/// The on-chain record of one shard: exactly the game's `shardData()` in canonical field order (its JSON is `extra`).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShardData {
    pub season_id: String,
    pub shard_id: u32,
    pub owner_clan: String,
    pub kind: String,
    pub weight: u8,
    pub forgotten_at_tick: u8,
    pub closes_at_tick: u8,
    pub winner_clan: Option<String>,
    pub price: Option<u32>,
    pub unlocked_index: Option<u32>,
    pub unlocked_leaf: Option<String>,
    pub schedule_root: String,
}

fn is_lower_hex(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_hash(s: &str) -> bool {
    s.len() == 64 && is_lower_hex(s)
}

impl ShardData {
    /// The same rules as `shardData()` in JavaScript.
    pub fn validate(&self) -> Result<(), &'static str> {
        let n = self.season_id.len();
        if !(8..=64).contains(&n) || !is_lower_hex(&self.season_id) {
            return Err(ERR_BAD_SEASON_ID);
        }
        if self.shard_id == 0 {
            return Err(ERR_BAD_SHARD_ID);
        }
        if !SHARD_KINDS.contains(&self.kind.as_str()) {
            return Err(ERR_BAD_KIND);
        }
        if !CLANS.contains(&self.owner_clan.as_str()) {
            return Err(ERR_BAD_CLAN);
        }
        if let Some(w) = &self.winner_clan {
            if !CLANS.contains(&w.as_str()) {
                return Err(ERR_BAD_CLAN);
            }
        }
        if self.weight > 4 {
            return Err(ERR_BAD_WEIGHT);
        }
        if !(1..=17).contains(&self.forgotten_at_tick) || !(1..=19).contains(&self.closes_at_tick) {
            return Err(ERR_BAD_TICK);
        }
        if !is_hash(&self.schedule_root) {
            return Err(ERR_BAD_HASH);
        }
        match (&self.unlocked_index, &self.unlocked_leaf) {
            (None, None) => {}
            (Some(i), Some(l)) => {
                if *i > 1023 {
                    return Err(ERR_BAD_UNLOCK);
                }
                if !is_hash(l) {
                    return Err(ERR_BAD_HASH);
                }
            }
            _ => return Err(ERR_BAD_UNLOCK),
        }
        Ok(())
    }

    pub fn token_id(&self) -> String {
        format!("{}-{}", self.season_id, self.shard_id)
    }

    /// Canonical `extra` JSON (serde keeps the struct's field order; `Option` None serialises as null, as in JS).
    pub fn extra(&self) -> String {
        near_sdk::serde_json::to_string(self).unwrap_or_default()
    }
}

pub fn kind_color(kind: &str) -> &'static str {
    match kind {
        "first" => "#d8b24a",
        "call" => "#7fb3d5",
        "gift" => "#8fcf8f",
        "betrayal" => "#c0504d",
        "debt" => "#b08968",
        "promise" => "#9b86c9",
        "insight" => "#cfd8dc",
        _ => "#6b6b6b",
    }
}

/// 16 directions, cos/sin × 1000 (the JavaScript `DIRS`).
const DIRS: [(i32, i32); 16] = [
    (1000, 0), (924, 383), (707, 707), (383, 924), (0, 1000), (-383, 924), (-707, 707), (-924, 383),
    (-1000, 0), (-924, -383), (-707, -707), (-383, -924), (0, -1000), (383, -924), (707, -707), (924, -383),
];

fn nibble(src: &str, i: usize) -> usize {
    let b = src.as_bytes()[i % 64];
    (if b.is_ascii_digit() { b - b'0' } else { b - b'a' + 10 }) as usize
}

fn cap(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// The 320×320 ink ring. Must equal `shardSvg()` byte for byte (JS `Math.trunc` = Rust `/` on i32).
pub fn svg(d: &ShardData) -> String {
    let color = kind_color(&d.kind);
    let src = d.unlocked_leaf.as_deref().unwrap_or(&d.schedule_root);
    let (cx, cy, r) = (160i32, 160i32, 92i32);
    let mut out = String::with_capacity(2048);
    out.push_str(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="320" height="320">"#);
    out.push_str(r##"<rect width="320" height="320" fill="#141a1f"/>"##);
    out.push_str(&format!(r#"<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="6" opacity="0.9"/>"#));
    out.push_str(&format!(r#"<circle cx="{cx}" cy="{cy}" r="{}" fill="none" stroke="{color}" stroke-width="1" opacity="0.35"/>"#, r + 14));
    for i in 0..8usize {
        let (dx, dy) = DIRS[nibble(src, i)];
        let len = 18 + 3 * nibble(src, i + 8) as i32;
        let (x1, y1) = (cx + (r + 10) * dx / 1000, cy + (r + 10) * dy / 1000);
        let (x2, y2) = (cx + (r + 10 + len) * dx / 1000, cy + (r + 10 + len) * dy / 1000);
        out.push_str(&format!(r#"<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{}" stroke-linecap="round"/>"#, 2 + (i % 3)));
    }
    for k in 0..d.weight as usize {
        let (dx, dy) = DIRS[(12 + 4 * k) % 16];
        out.push_str(&format!(r#"<circle cx="{}" cy="{}" r="7" fill="{color}"/>"#, cx + 56 * dx / 1000, cy + 56 * dy / 1000));
    }
    if d.winner_clan.is_some() {
        out.push_str(&format!(r#"<circle cx="{cx}" cy="{cy}" r="12" fill="{color}"/>"#));
    } else {
        out.push_str(&format!(r#"<circle cx="{cx}" cy="{cy}" r="9" fill="none" stroke="{color}" stroke-width="2"/>"#));
    }
    out.push_str(&format!(r##"<text x="160" y="28" text-anchor="middle" font-family="monospace" font-size="13" fill="#cfd8dc">SEASON {}</text>"##, d.season_id));
    out.push_str(&format!(
        r##"<text x="160" y="300" text-anchor="middle" font-family="monospace" font-size="13" fill="#cfd8dc">{} · TRIAL {} · #{}</text>"##,
        d.kind.to_uppercase(),
        d.forgotten_at_tick,
        d.shard_id
    ));
    out.push_str("</svg>");
    out
}

/// NEP-177 fields the game's `shardMetadata()` also computes (everything but `issued_at`, which is block time).
pub struct MetadataParts {
    pub title: String,
    pub description: String,
    pub media: String,
    pub media_hash: Base64VecU8,
    pub extra: String,
}

pub fn metadata_parts(d: &ShardData) -> MetadataParts {
    let image = svg(d);
    let sale = match (&d.winner_clan, d.price) {
        (Some(w), p) => format!("bought by {} for {} silk at the trial-{} auction", cap(w), p.unwrap_or(0), d.closes_at_tick),
        (None, _) => format!("unsold at the trial-{} auction and burned", d.closes_at_tick),
    };
    let unlock = match (&d.unlocked_leaf, d.unlocked_index) {
        (Some(l), Some(i)) => format!(" The vision it paid for opened sign #{} of the season (leaf {}).", i + 1, l),
        _ => String::new(),
    };
    let what = if d.weight > 0 {
        format!("a {} memory of weight {}", d.kind, d.weight)
    } else if d.kind == "lie" {
        "a lie".to_string()
    } else {
        "an insight".to_string()
    };
    use near_sdk::base64::Engine as _;
    let b64 = near_sdk::base64::engine::general_purpose::STANDARD;
    MetadataParts {
        title: format!("Memory shard #{} · {} · season {}", d.shard_id, cap(&d.kind), d.season_id),
        description: format!(
            "{} forgot {} at trial {} of season {}; the shard was {}.{} The season's schedule root is {} (contracts/season-commit). Forget to Foresee, NEAR testnet.",
            cap(&d.owner_clan),
            what,
            d.forgotten_at_tick,
            d.season_id,
            sale,
            unlock,
            d.schedule_root
        ),
        media: format!("data:image/svg+xml;base64,{}", b64.encode(image.as_bytes())),
        media_hash: Base64VecU8::from(env::sha256(image.as_bytes())),
        extra: d.extra(),
    }
}
