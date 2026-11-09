//! The agent card's NEP-177 metadata and its deterministic on-chain image. Byte-exact twin of `agentSvg()` and
//! `agentMetadata()` in `game/src/net/agent-nft.js`; `tests/vectors.json` (generated from the JavaScript) pins every
//! string. Integer arithmetic and ASCII enums only.

use crate::state::{hex, AgentState, Forgotten, Remembered};
use near_sdk::env;
use near_sdk::json_types::Base64VecU8;

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

fn outcome_text(outcome: &str) -> &'static str {
    match outcome {
        "gift" => "the message was a gift",
        "weapon" => "the message was a weapon",
        "survived" => "the weapon was refused",
        "lost" => "a gift was refused",
        "gone" => "the Shells left",
        _ => "the season was voided",
    }
}

fn cap(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

const MONO: &str = r#"font-family="monospace""#;

/// The 320×420 card. Must equal `agentSvg()` byte for byte (JS `Math.trunc` = Rust `/` on non-negative integers).
pub fn svg(s: &AgentState) -> String {
    let hash = s.state_hash();
    let t = &s.traits;
    let mut p = String::with_capacity(5120);
    p.push_str(r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 420" width="320" height="420">"#);
    p.push_str(r##"<rect width="320" height="420" fill="#141a1f"/>"##);
    p.push_str(r##"<rect x="8" y="8" width="304" height="404" rx="14" fill="none" stroke="#e4c272" stroke-width="2" opacity="0.8"/>"##);
    p.push_str(&format!(
        r##"<text x="160" y="38" text-anchor="middle" font-family="serif" font-size="22" fill="#f6df9b">{}</text>"##,
        s.agent.to_ascii_uppercase()
    ));
    p.push_str(&format!(
        r##"<text x="160" y="58" text-anchor="middle" {MONO} font-size="11" fill="#cfd8dc">AGENT CARD · SEASON {}</text>"##,
        &s.season_id[..s.season_id.len().min(16)]
    ));
    for (i, cell) in t.cells.iter().enumerate().take(16) {
        let (x, y) = (102 + 30 * (i % 4), 72 + 30 * (i / 4));
        if cell.is_some() {
            p.push_str(&format!(r##"<rect x="{x}" y="{y}" width="26" height="26" rx="4" fill="#e4c272"/>"##));
        } else {
            p.push_str(&format!(r##"<rect x="{x}" y="{y}" width="26" height="26" rx="4" fill="none" stroke="#cfd8dc" stroke-width="1" opacity="0.35"/>"##));
        }
    }
    p.push_str(&format!(
        r##"<text x="160" y="208" text-anchor="middle" {MONO} font-size="11" fill="#cfd8dc">RULE {} · {}/16 WORDS · {} SURE</text>"##,
        t.reading_rule.to_ascii_uppercase(),
        t.words_known,
        t.confident_cells
    ));
    // (kind, weight, kept, bought): kept memories first, then forgotten ones; at most 12 drawn.
    let items: Vec<(&str, i32, bool, bool)> = s
        .biography
        .remembered
        .iter()
        .map(|m| (m.kind.as_str(), m.weight as i32, true, false))
        .chain(s.biography.forgotten.iter().map(|m| (m.kind.as_str(), m.weight as i32, false, m.fate == "bought")))
        .take(12)
        .collect();
    let n = items.len() as i32;
    for (k, (kind, weight, kept, bought)) in items.iter().enumerate() {
        let cx = 160 - 12 * (n - 1) + 24 * k as i32;
        let r = 4 + 2 * weight;
        let color = kind_color(kind);
        if *kept {
            p.push_str(&format!(r#"<circle cx="{cx}" cy="236" r="{r}" fill="{color}"/>"#));
        } else {
            p.push_str(&format!(r#"<circle cx="{cx}" cy="236" r="{r}" fill="none" stroke="{color}" stroke-width="2"/>"#));
            if *bought {
                p.push_str(&format!(r#"<circle cx="{cx}" cy="236" r="2" fill="{color}"/>"#));
            }
        }
    }
    for (i, e) in t.trust.iter().enumerate() {
        let y = 270 + 18 * i as i32;
        p.push_str(&format!(r##"<text x="24" y="{y}" {MONO} font-size="10" fill="#cfd8dc">{}</text>"##, e.clan.to_ascii_uppercase()));
        p.push_str(&format!(r##"<rect x="80" y="{}" width="180" height="8" rx="2" fill="#26323a"/>"##, y - 8));
        p.push_str(&format!(
            r#"<rect x="80" y="{}" width="{}" height="8" rx="2" fill="{}"/>"#,
            y - 8,
            e.trust as i32 * 180 / 100,
            if e.link_broken { "#c0504d" } else { "#8fcf8f" }
        ));
        p.push_str(&format!(r##"<text x="296" y="{y}" text-anchor="end" {MONO} font-size="10" fill="#cfd8dc">{}</text>"##, e.trust));
    }
    p.push_str(&format!(
        r##"<text x="160" y="368" text-anchor="middle" {MONO} font-size="11" fill="#cfd8dc">{} · TICK {} · {}</text>"##,
        s.outcome.to_ascii_uppercase(),
        s.final_tick,
        if t.wild { "WILD" } else { "OBEDIENT" }
    ));
    p.push_str(&format!(r##"<text x="160" y="388" text-anchor="middle" {MONO} font-size="11" fill="#e4c272">STATE {}</text>"##, &hash[..16]));
    p.push_str(&format!(
        r##"<text x="160" y="404" text-anchor="middle" {MONO} font-size="9" fill="#cfd8dc" opacity="0.6">FORGET TO FORESEE · NEAR TESTNET</text>"##
    ));
    p.push_str("</svg>");
    p
}

/// NEP-177 fields the game's `agentMetadata()` also computes (everything but `issued_at`, which is block time).
pub struct MetadataParts {
    pub title: String,
    pub description: String,
    pub media: String,
    pub media_hash: Base64VecU8,
    pub extra: String,
    pub state_hash: String,
}

fn memory_phrase(m: &Remembered) -> String {
    match &m.about {
        Some(a) => format!("{} (weight {}, {})", m.kind, m.weight, cap(a)),
        None => format!("{} (weight {})", m.kind, m.weight),
    }
}

fn fate_phrase(m: &Forgotten) -> String {
    let fate = match m.fate.as_str() {
        "bought" => format!("bought by {} for {} silk", cap(m.buyer.as_deref().unwrap_or("")), m.price.unwrap_or(0)),
        "burned" => "burned unsold".to_string(),
        _ => "unsold when the season ended".to_string(),
    };
    format!("{} (weight {}) {}, shard {}", m.kind, m.weight, fate, m.shard_token)
}

pub fn metadata_parts(s: &AgentState) -> MetadataParts {
    let json = s.canonical_json();
    let state_hash = hex(&env::sha256(json.as_bytes()));
    let image = svg(s);
    let t = &s.traits;
    let b = &s.biography;
    let rem = if b.remembered.is_empty() { "nothing".to_string() } else { b.remembered.iter().map(memory_phrase).collect::<Vec<_>>().join(", ") };
    let forg = if b.forgotten.is_empty() { "nothing".to_string() } else { b.forgotten.iter().map(fate_phrase).collect::<Vec<_>>().join("; ") };
    let vote = match s.vote {
        None => "no vote",
        Some(true) => "voted to accept",
        Some(false) => "voted to refuse",
    };
    let heir = match s.heir {
        None => "no heir choice",
        Some(true) => "forgot everything for an heir",
        Some(false) => "kept the memory",
    };
    let agent = cap(&s.agent);
    let description = format!(
        "{agent} at the end of season {} (rules {}, tick {}): {}; {vote}; {heir}. Remembered: {rem}. Forgotten: {forg}. Reading rule {}, {} of 16 words known, {} confident cells, {} ({} attention), {} silk. State hash {state_hash} = sha256 of this token's extra ({}, version {}). The season's schedule root is {} (contracts/season-commit). Minted by the season coordinator; Forget to Foresee, NEAR testnet.",
        s.season_id,
        s.rules,
        s.final_tick,
        outcome_text(&s.outcome),
        t.reading_rule,
        t.words_known,
        t.confident_cells,
        if t.wild { "wild" } else { "obedient" },
        t.attention,
        t.silk,
        s.spec,
        s.version,
        s.schedule_root
    );
    use near_sdk::base64::Engine as _;
    let b64 = near_sdk::base64::engine::general_purpose::STANDARD;
    MetadataParts {
        title: format!("{agent} · agent card · season {}", s.season_id),
        description,
        media: format!("data:image/svg+xml;base64,{}", b64.encode(image.as_bytes())),
        media_hash: Base64VecU8::from(env::sha256(image.as_bytes())),
        extra: json,
        state_hash,
    }
}
