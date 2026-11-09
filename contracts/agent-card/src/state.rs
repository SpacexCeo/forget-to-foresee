//! The agent's end-of-season state: its fields, its validation and its canonical JSON. Byte-exact twin of
//! `agentState()` / `agentStateJson()` in `game/src/net/agent-nft.js`; `tests/vectors.json` pins both.
//! The canonical JSON is serde's serialization of these structs (field order as declared, no spaces, `None` as null);
//! every value is an integer, a boolean or an ASCII enum, so the two languages produce the same bytes.

use near_sdk::near;

pub const SPEC: &str = "ftf-agent/1";
pub const CLANS: &[&str] = &["iris", "salt", "ash", "moss", "amber", "frost"];
pub const MEMORY_KINDS: &[&str] = &["first", "call", "gift", "betrayal", "debt", "promise"];
pub const OUTCOMES: &[&str] = &["gift", "weapon", "survived", "lost", "gone", "proof_failed"];
pub const READING_RULES: &[&str] = &["unknown", "top", "dots"];
pub const RULES: &[&str] = &["v1", "v2", "v3"];
pub const FRAGMENTS: &[&str] = &["held", "dark", "scroll"];
pub const FATES: &[&str] = &["bought", "burned", "open"];
pub const MAX_MEMORIES: usize = 24;
pub const MAX_SILK: u32 = 1_000_000;

pub const ERR_BAD_SPEC: &str = "ERR_BAD_SPEC: spec must be ftf-agent/1";
pub const ERR_BAD_SEASON_ID: &str = "ERR_BAD_SEASON_ID: season_id must be 8-64 lowercase hex characters";
pub const ERR_BAD_AGENT: &str = "ERR_BAD_AGENT: unknown agent (clan id)";
pub const ERR_BAD_RULES: &str = "ERR_BAD_RULES: unknown rules version";
pub const ERR_BAD_HASH: &str = "ERR_BAD_HASH: expected 64 lowercase hex characters";
pub const ERR_BAD_VERSION: &str = "ERR_BAD_VERSION: version must be 1-1000";
pub const ERR_BAD_TICK: &str = "ERR_BAD_TICK: final_tick must be 1-19 and forgotten_at_tick 1-17";
pub const ERR_BAD_OUTCOME: &str = "ERR_BAD_OUTCOME: unknown season outcome";
pub const ERR_BAD_TRAITS: &str = "ERR_BAD_TRAITS: traits out of range (rule, 16 cells of meaning 0-3 counted by words_known, counts 0-16, attention 1-3, silk, fragment)";
pub const ERR_BAD_TRUST: &str = "ERR_BAD_TRUST: trust lists the other clans once each, values 0-100";
pub const ERR_BAD_MEMORY: &str = "ERR_BAD_MEMORY: memory id 1 or more, known kind, weight 0-4, known clan, at most 24 per list";
pub const ERR_BAD_SHARD: &str = "ERR_BAD_SHARD: shard_id 1 or more, shard_token <season_id>-<shard_id>, unlocked_index 0-1023";
pub const ERR_BAD_FATE: &str = "ERR_BAD_FATE: fate bought (with buyer and price), burned or open (without)";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TrustEntry {
    pub clan: String,
    /// The agent's trust in this clan.
    pub trust: u8,
    /// This clan's trust in the agent.
    pub trusted_by: u8,
    pub link_broken: bool,
    pub remembers_betrayal: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Traits {
    pub reading_rule: String,
    pub words_known: u8,
    pub confident_cells: u8,
    pub bought_words: u8,
    /// The season's dictionary, slot-major (4 slots × 4 strokes): the meaning the agent knows, or null.
    pub cells: Vec<Option<u8>>,
    /// The agent forgot its owner (the First Word) and obeys less.
    pub wild: bool,
    pub attention: u8,
    pub silk: u32,
    pub fragment: String,
    pub trust: Vec<TrustEntry>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Remembered {
    pub id: u32,
    pub kind: String,
    pub weight: u8,
    pub about: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Forgotten {
    pub shard_id: u32,
    /// The memory shard's token id on the memory-shard contract (`<season_id>-<shard_id>`).
    pub shard_token: String,
    pub kind: String,
    pub weight: u8,
    pub forgotten_at_tick: u8,
    pub fate: String,
    pub buyer: Option<String>,
    pub price: Option<u32>,
    pub unlocked_index: Option<u32>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Biography {
    pub remembered: Vec<Remembered>,
    pub forgotten: Vec<Forgotten>,
}

/// The canonical end-of-season state of one agent (the token's `extra`).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentState {
    pub spec: String,
    pub season_id: String,
    pub agent: String,
    pub rules: String,
    pub schedule_root: String,
    pub version: u32,
    pub final_tick: u8,
    pub outcome: String,
    pub vote: Option<bool>,
    pub heir: Option<bool>,
    pub traits: Traits,
    pub biography: Biography,
}

fn is_lower_hex(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn is_hash(s: &str) -> bool {
    s.len() == 64 && is_lower_hex(s)
}

fn one_of(v: &str, list: &[&str]) -> bool {
    list.contains(&v)
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

impl AgentState {
    /// The same rules, in the same order, as `agentState()` in JavaScript.
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.spec != SPEC {
            return Err(ERR_BAD_SPEC);
        }
        let n = self.season_id.len();
        if !(8..=64).contains(&n) || !is_lower_hex(&self.season_id) {
            return Err(ERR_BAD_SEASON_ID);
        }
        if !one_of(&self.agent, CLANS) {
            return Err(ERR_BAD_AGENT);
        }
        if !one_of(&self.rules, RULES) {
            return Err(ERR_BAD_RULES);
        }
        if !is_hash(&self.schedule_root) {
            return Err(ERR_BAD_HASH);
        }
        if !(1..=1000).contains(&self.version) {
            return Err(ERR_BAD_VERSION);
        }
        if !(1..=19).contains(&self.final_tick) {
            return Err(ERR_BAD_TICK);
        }
        if !one_of(&self.outcome, OUTCOMES) {
            return Err(ERR_BAD_OUTCOME);
        }

        let t = &self.traits;
        if !one_of(&t.reading_rule, READING_RULES) || t.cells.len() != 16 {
            return Err(ERR_BAD_TRAITS);
        }
        if t.cells.iter().any(|c| matches!(c, Some(m) if *m > 3)) {
            return Err(ERR_BAD_TRAITS);
        }
        let known = t.cells.iter().filter(|c| c.is_some()).count();
        if t.words_known > 16 || t.words_known as usize != known {
            return Err(ERR_BAD_TRAITS);
        }
        if t.confident_cells > 16 || t.bought_words > 16 || !(1..=3).contains(&t.attention) || t.silk > MAX_SILK {
            return Err(ERR_BAD_TRAITS);
        }
        if !one_of(&t.fragment, FRAGMENTS) {
            return Err(ERR_BAD_TRAITS);
        }
        if t.trust.len() > 5 {
            return Err(ERR_BAD_TRUST);
        }
        for (i, e) in t.trust.iter().enumerate() {
            if !one_of(&e.clan, CLANS) || e.clan == self.agent || t.trust[..i].iter().any(|x| x.clan == e.clan) {
                return Err(ERR_BAD_TRUST);
            }
            if e.trust > 100 || e.trusted_by > 100 {
                return Err(ERR_BAD_TRUST);
            }
        }

        let b = &self.biography;
        if b.remembered.len() > MAX_MEMORIES || b.forgotten.len() > MAX_MEMORIES {
            return Err(ERR_BAD_MEMORY);
        }
        for m in &b.remembered {
            if m.id == 0 || !one_of(&m.kind, MEMORY_KINDS) || m.weight > 4 {
                return Err(ERR_BAD_MEMORY);
            }
            if let Some(a) = &m.about {
                if !one_of(a, CLANS) {
                    return Err(ERR_BAD_MEMORY);
                }
            }
        }
        for m in &b.forgotten {
            if m.shard_id == 0 || m.shard_token != format!("{}-{}", self.season_id, m.shard_id) {
                return Err(ERR_BAD_SHARD);
            }
            if !one_of(&m.kind, MEMORY_KINDS) || m.weight > 4 {
                return Err(ERR_BAD_MEMORY);
            }
            if !(1..=17).contains(&m.forgotten_at_tick) {
                return Err(ERR_BAD_TICK);
            }
            if !one_of(&m.fate, FATES) {
                return Err(ERR_BAD_FATE);
            }
            if let Some(w) = &m.buyer {
                if !one_of(w, CLANS) {
                    return Err(ERR_BAD_FATE);
                }
            }
            if (m.fate == "bought") != m.buyer.is_some() || m.buyer.is_some() != m.price.is_some() {
                return Err(ERR_BAD_FATE);
            }
            if matches!(m.unlocked_index, Some(i) if i > 1023) {
                return Err(ERR_BAD_SHARD);
            }
        }
        Ok(())
    }

    /// `<season_id>-agent-<agent>`: one card per season and agent.
    pub fn token_id(&self) -> String {
        format!("{}-agent-{}", self.season_id, self.agent)
    }

    /// The canonical JSON (the token's `extra`).
    pub fn canonical_json(&self) -> String {
        near_sdk::serde_json::to_string(self).unwrap_or_default()
    }

    /// sha256 of the canonical JSON, lowercase hex.
    pub fn state_hash(&self) -> String {
        hex(&near_sdk::env::sha256(self.canonical_json().as_bytes()))
    }
}
