//! Byte-exact re-implementation of the game's commitments (game/src/game/engine.js,
//! rules v2, and game/src/game/crypto.js):
//!
//! * leaf   = SHA-256(utf8("ftf:leaf:" + schemaVersion + "|" + seasonId + "|" + index + "|" + canonicalEvent + "|" + saltHex))
//! * node   = SHA-256(ascii(leftHex + rightHex)); a level with an odd node count pairs the
//!   last node with itself
//! * key    = SHA-256(utf8("ftf:key:" + schemaVersion + "|" + seasonId + "|" + phrase + "|" + saltHex))
//!
//! Hashes travel as 64 lowercase hex characters, exactly as the game prints them.

use near_sdk::near;

/// Rule schemas whose leaf format this contract knows. The game's `v2` rules are the only one.
pub const SUPPORTED_SCHEMAS: &[&str] = &["v2"];
/// Upper bound on leaves per season (a v2 season has 15).
pub const MAX_LEAF_COUNT: u32 = 1024;
/// Salts are lowercase hex of at least 32 bytes (the game uses exactly 32 CSPRNG bytes).
pub const MIN_SALT_HEX: usize = 64;
pub const MAX_SALT_HEX: usize = 128;
/// Season ids are lowercase hex (the game uses 8 CSPRNG bytes = 16 characters).
pub const MIN_SEASON_ID_HEX: usize = 8;
pub const MAX_SEASON_ID_HEX: usize = 64;
pub const MAX_PHRASE_BYTES: usize = 256;

pub type Hash = [u8; 32];

/// SHA-256. In the contract (`cargo near build`, `--cfg near` on wasm32) this is the NEAR host
/// function; in host tests near-sdk falls back to a pure-Rust implementation.
pub fn sha256(data: &[u8]) -> Hash {
    near_sdk::env::sha256_array(data)
}

pub const ERR_BAD_SCHEMA: &str = "ERR_BAD_SCHEMA: unsupported schema_version";
pub const ERR_BAD_SEASON_ID: &str = "ERR_BAD_SEASON_ID: season_id must be 8-64 lowercase hex characters";
pub const ERR_BAD_HASH: &str = "ERR_BAD_HASH: expected 64 lowercase hex characters";
pub const ERR_BAD_SALT: &str = "ERR_BAD_SALT: salt must be 64-128 lowercase hex characters (>= 32 bytes), even length";
pub const ERR_BAD_EVENT: &str = "ERR_BAD_EVENT: canonical_event is not a canonical v2 event";
pub const ERR_BAD_PHRASE: &str = "ERR_BAD_PHRASE: phrase must be 1-256 bytes";
pub const ERR_BAD_PATH_LENGTH: &str = "ERR_BAD_PATH_LENGTH: merkle_path length does not match the tree depth";
pub const ERR_BAD_PATH_DIRECTION: &str = "ERR_BAD_PATH_DIRECTION: merkle_path step side does not match the index";
pub const ERR_BAD_PATH_DUPLICATE: &str = "ERR_BAD_PATH_DUPLICATE: the last node of an odd level must be paired with itself";
pub const ERR_INDEX_OUT_OF_RANGE: &str = "ERR_INDEX_OUT_OF_RANGE: index >= leaf_count";

/// One step of a Merkle path in crypto.js `proofFor` format: `h` is the sibling hash,
/// `left` is true when the sibling sits on the left.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PathStep {
    pub h: String,
    pub left: bool,
}

/// A season event in the exact form engine.js hashes:
/// `{"t":T,"place":P,"action":A,"power":W,"delay":D,"dots":O}` (no spaces, this key order).
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CanonicalEvent {
    pub t: u8,
    pub place: u8,
    pub action: u8,
    pub power: u8,
    pub delay: u8,
    pub dots: u8,
}

const EVENT_KEYS: [&str; 6] = ["t", "place", "action", "power", "delay", "dots"];

impl CanonicalEvent {
    /// Strict parser: accepts only the byte string JSON.stringify produces for a v2 event,
    /// with v2 value ranges (place/action/power/dots 0-3, delay 1-4, 1 <= delay < t).
    pub fn parse(s: &str) -> Result<Self, &'static str> {
        let mut rest = s.as_bytes();
        let mut v = [0u8; 6];
        for (i, key) in EVENT_KEYS.iter().enumerate() {
            let lead: &[u8] = if i == 0 { b"{\"" } else { b",\"" };
            rest = rest.strip_prefix(lead).ok_or(ERR_BAD_EVENT)?;
            rest = rest.strip_prefix(key.as_bytes()).ok_or(ERR_BAD_EVENT)?;
            rest = rest.strip_prefix(b"\":").ok_or(ERR_BAD_EVENT)?;
            let digits = rest.iter().take_while(|b| b.is_ascii_digit()).count();
            if digits == 0 || digits > 3 || (digits > 1 && rest[0] == b'0') {
                return Err(ERR_BAD_EVENT);
            }
            let mut n: u32 = 0;
            for b in &rest[..digits] {
                n = n * 10 + u32::from(b - b'0');
            }
            v[i] = u8::try_from(n).map_err(|_| ERR_BAD_EVENT)?;
            rest = &rest[digits..];
        }
        if rest != b"}" {
            return Err(ERR_BAD_EVENT);
        }
        let e = CanonicalEvent { t: v[0], place: v[1], action: v[2], power: v[3], delay: v[4], dots: v[5] };
        let ranges_ok = e.place <= 3 && e.action <= 3 && e.power <= 3 && e.dots <= 3 && (1..=4).contains(&e.delay) && e.delay < e.t;
        if ranges_ok { Ok(e) } else { Err(ERR_BAD_EVENT) }
    }

    /// The canonical byte string (inverse of `parse`).
    pub fn to_canonical_string(&self) -> String {
        format!(
            "{{\"t\":{},\"place\":{},\"action\":{},\"power\":{},\"delay\":{},\"dots\":{}}}",
            self.t, self.place, self.action, self.power, self.delay, self.dots
        )
    }
}

const HEX: &[u8; 16] = b"0123456789abcdef";

fn is_lower_hex(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn to_hex(bytes: &[u8]) -> String {
    let mut out = vec![0u8; bytes.len() * 2];
    hex_into(&mut out, bytes);
    String::from_utf8(out).unwrap_or_default()
}

fn hex_into(dst: &mut [u8], src: &[u8]) {
    for (i, b) in src.iter().enumerate() {
        dst[2 * i] = HEX[(b >> 4) as usize];
        dst[2 * i + 1] = HEX[(b & 0x0f) as usize];
    }
}

fn nibble(c: u8) -> u8 {
    if c.is_ascii_digit() { c - b'0' } else { c - b'a' + 10 }
}

fn decode_lower_hex(s: &str) -> Vec<u8> {
    s.as_bytes().chunks(2).map(|p| (nibble(p[0]) << 4) | nibble(p[1])).collect()
}

pub fn parse_hash(s: &str) -> Result<Hash, &'static str> {
    if s.len() != 64 || !is_lower_hex(s) {
        return Err(ERR_BAD_HASH);
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&decode_lower_hex(s));
    Ok(out)
}

/// Validates a salt and returns its raw bytes.
pub fn parse_salt(s: &str) -> Result<Vec<u8>, &'static str> {
    if s.len() < MIN_SALT_HEX || s.len() > MAX_SALT_HEX || s.len() % 2 != 0 || !is_lower_hex(s) {
        return Err(ERR_BAD_SALT);
    }
    Ok(decode_lower_hex(s))
}

pub fn check_schema(schema: &str) -> Result<(), &'static str> {
    if SUPPORTED_SCHEMAS.contains(&schema) { Ok(()) } else { Err(ERR_BAD_SCHEMA) }
}

pub fn check_season_id(id: &str) -> Result<(), &'static str> {
    let len_ok = (MIN_SEASON_ID_HEX..=MAX_SEASON_ID_HEX).contains(&id.len());
    if len_ok && is_lower_hex(id) { Ok(()) } else { Err(ERR_BAD_SEASON_ID) }
}

pub fn check_phrase(phrase: &str) -> Result<(), &'static str> {
    if phrase.is_empty() || phrase.len() > MAX_PHRASE_BYTES { Err(ERR_BAD_PHRASE) } else { Ok(()) }
}

/// engine.js `leafHash` under v2 rules.
pub fn leaf_hash(schema: &str, season_id: &str, index: u32, canonical_event: &str, salt_hex: &str) -> Hash {
    let preimage = format!("ftf:leaf:{schema}|{season_id}|{index}|{canonical_event}|{salt_hex}");
    sha256(preimage.as_bytes())
}

/// crypto.js `merkle`: sha256(leftHex + rightHex) over the ASCII hex strings.
pub fn node_hash(left: &Hash, right: &Hash) -> Hash {
    let mut buf = [0u8; 128];
    hex_into(&mut buf[..64], left);
    hex_into(&mut buf[64..], right);
    sha256(&buf)
}

/// engine.js `keyCommit` under v2 rules.
pub fn key_commitment(schema: &str, season_id: &str, phrase: &str, salt_hex: &str) -> Hash {
    let preimage = format!("ftf:key:{schema}|{season_id}|{phrase}|{salt_hex}");
    sha256(preimage.as_bytes())
}

/// Number of path steps for a tree with `leaf_count` leaves (crypto.js levels - 1).
pub fn tree_depth(leaf_count: u32) -> usize {
    let (mut n, mut d) = (leaf_count, 0usize);
    while n > 1 {
        n = n.div_ceil(2);
        d += 1;
    }
    d
}

/// Folds a crypto.js path into a root. Unlike crypto.js `verifyProof`, the side of every
/// step is derived from `index` (the `left` flags must agree), the path length must equal
/// the tree depth, and a node without a real sibling must be paired with itself. This binds
/// the proof to exactly one position in a tree of exactly `leaf_count` leaves.
pub fn root_from_path(leaf: Hash, index: u32, leaf_count: u32, path: &[PathStep]) -> Result<Hash, &'static str> {
    if index >= leaf_count {
        return Err(ERR_INDEX_OUT_OF_RANGE);
    }
    if path.len() != tree_depth(leaf_count) {
        return Err(ERR_BAD_PATH_LENGTH);
    }
    let (mut h, mut idx, mut width) = (leaf, index, leaf_count);
    for step in path {
        let sibling = parse_hash(&step.h)?;
        let sibling_on_left = idx & 1 == 1;
        if step.left != sibling_on_left {
            return Err(ERR_BAD_PATH_DIRECTION);
        }
        if !sibling_on_left && idx + 1 >= width && sibling != h {
            return Err(ERR_BAD_PATH_DUPLICATE);
        }
        h = if sibling_on_left { node_hash(&sibling, &h) } else { node_hash(&h, &sibling) };
        idx >>= 1;
        width = width.div_ceil(2);
    }
    Ok(h)
}