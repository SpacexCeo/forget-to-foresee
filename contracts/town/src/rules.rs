//! The town's integer rules, shared with game/src/game/town-rules.js through contracts/town/tests/vectors.json.
//! Pure functions, no state, no environment: the same inputs give the same outputs in Rust and in JS.
use near_sdk::near;

pub use near_sdk::json_types::U128 as U;
pub const BPS: u128 = 10_000;
/// Reward index fixed point.
pub const INDEX_SCALE: u128 = 1_000_000_000_000_000_000;
/// One silk in micro-units.
pub const UNIT: u128 = 1_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Params {
    pub epoch_secs: u32,
    pub trade_fee_bps: u32,
    pub min_trade: u128,
    pub station_tax_bps: u32,
    pub tithe_stakers_bps: u32,
    pub tithe_purse_bps: u32,
    pub tithe_reserve_bps: u32,
    pub tithe_burn_bps: u32,
    pub rate_ceiling_bps: u32,
    pub lock_days: [u32; 4],
    pub lock_mult_bps: [u32; 4],
    pub works_bps: [u32; 4],
    pub cooldown_days: u32,
    pub early_exit_bps: u32,
    pub deed_fee: u128,
    pub cap_total: u128,
    pub cap_floor: u128,
    pub cap_share_bps: u32,
    pub cap_asset: u128,
    pub credit_day_cap: u128,
    pub entry_fee: u128,
    pub entry_burn_bps: u32,
    /// Share of each entry fee to the Shell Observatory's stakers (the rest of the fee goes to the purse).
    pub entry_works_bps: u32,
    pub season_mint_cap: u128,
    pub mint_floor: u128,
    pub mint_burn_match_bps: u32,
    pub mint_per_entrant: u128,
    pub payout_cap_bps: u32,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            epoch_secs: 86_400, trade_fee_bps: 12, min_trade: UNIT / 2, station_tax_bps: 1_200,
            tithe_stakers_bps: 6_500, tithe_purse_bps: 1_000, tithe_reserve_bps: 1_000, tithe_burn_bps: 1_500,
            rate_ceiling_bps: 40, lock_days: [0, 5, 10, 20], lock_mult_bps: [10_000, 11_500, 13_000, 15_000], works_bps: [3_500, 2_500, 2_500, 1_500],
            cooldown_days: 2, early_exit_bps: 1_000, deed_fee: UNIT / 2, cap_total: 8_000 * UNIT, cap_floor: 800 * UNIT, cap_share_bps: 500,
            cap_asset: 3_000 * UNIT, credit_day_cap: 4_000 * UNIT,
            entry_fee: 40 * UNIT, entry_burn_bps: 2_000, entry_works_bps: 1_500,
            season_mint_cap: 12_000 * UNIT, mint_floor: 1_000 * UNIT, mint_burn_match_bps: 8_000, mint_per_entrant: 24 * UNIT, payout_cap_bps: 400,
        }
    }
}

impl Params {
    /// Bounded ranges (docs/security-town.md T13).
    pub fn valid(&self) -> bool {
        (60..=86_400).contains(&self.epoch_secs) && self.trade_fee_bps <= 100 && self.min_trade >= 1_000 && self.station_tax_bps <= 3_000
            && self.tithe_stakers_bps + self.tithe_purse_bps + self.tithe_reserve_bps + self.tithe_burn_bps == 10_000
            && (1..=200).contains(&self.rate_ceiling_bps) && self.lock_days.windows(2).all(|w| w[0] < w[1]) && self.lock_days[3] <= 60
            && self.lock_mult_bps[0] == 10_000 && self.lock_mult_bps.windows(2).all(|w| w[0] <= w[1]) && self.lock_mult_bps[3] <= 30_000
            && self.works_bps.iter().sum::<u32>() == 10_000 && self.works_bps.iter().all(|&b| b > 0)
            && self.cooldown_days <= 14 && self.early_exit_bps <= 3_000 && self.deed_fee <= 10 * UNIT
            && self.cap_floor <= self.cap_total && self.cap_asset <= self.cap_total && self.cap_share_bps <= 10_000 && self.credit_day_cap <= 100_000 * UNIT
            && self.entry_fee <= 1_000 * UNIT && self.entry_burn_bps + self.entry_works_bps <= 10_000
            && self.season_mint_cap <= 100_000 * UNIT && self.mint_floor <= self.season_mint_cap && self.mint_burn_match_bps <= 10_000
            && self.mint_per_entrant <= 1_000 * UNIT && (1..=10_000).contains(&self.payout_cap_bps)
    }
}

pub fn trade_fee(p: &Params, silk: u128) -> u128 { silk * p.trade_fee_bps as u128 / BPS }

/// Per-account pledge cap: min(cap_total, max(cap_floor, cap_share·TVL)).
pub fn stake_cap(p: &Params, tvl: u128) -> u128 { p.cap_total.min(p.cap_floor.max(tvl * p.cap_share_bps as u128 / BPS)) }

#[derive(Debug, PartialEq)]
pub struct Split { pub stakers: u128, pub purse: u128, pub reserve: u128, pub burn: u128 }

/// What the swept treasury silk becomes; the rounding remainder is burned so nothing is lost or created.
pub fn split_sweep(p: &Params, b: u128) -> Split {
    let stakers = b * p.tithe_stakers_bps as u128 / BPS;
    let purse = b * p.tithe_purse_bps as u128 / BPS;
    let reserve = b * p.tithe_reserve_bps as u128 / BPS;
    Split { stakers, purse, reserve, burn: b - stakers - purse - reserve }
}

#[derive(Debug, PartialEq)]
pub struct EntrySplit { pub burn: u128, pub works: u128, pub purse: u128 }

/// A tournament entry fee: burned / to the Shell Observatory's stakers / to the purse (the remainder).
pub fn split_entry(p: &Params, fee: u128) -> EntrySplit {
    let burn = fee * p.entry_burn_bps as u128 / BPS;
    let works = fee * p.entry_works_bps as u128 / BPS;
    EntrySplit { burn, works, purse: fee - burn - works }
}

/// The silk a season may mint for its purse: min(cap, floor + match·burned last season, per-entrant·entrants).
pub fn season_mint_cap(p: &Params, burn_prev: u128, entrants: u32) -> u128 {
    p.season_mint_cap.min(p.mint_floor + burn_prev * p.mint_burn_match_bps as u128 / BPS).min(p.mint_per_entrant * entrants as u128)
}

#[derive(Debug, PartialEq)]
pub struct Plan { pub pots: [u128; 4], pub overflow: u128 }

/// The stake pot over the works with earning weight: base shares renormalised, each capped at rate_ceiling·weight;
/// the capped excess overflows to the purse, the division remainder stays in the pot.
pub fn plan_distribution(p: &Params, pot: u128, weights: &[u128; 4]) -> Plan {
    let total_bps: u128 = (0..4).filter(|&a| weights[a] > 0).map(|a| p.works_bps[a] as u128).sum();
    let mut pots = [0u128; 4];
    let mut overflow = 0;
    if total_bps == 0 { return Plan { pots, overflow }; }
    for a in 0..4 {
        if weights[a] == 0 { continue; }
        let share = pot * p.works_bps[a] as u128 / total_bps;
        let ceiling = weights[a] * p.rate_ceiling_bps as u128 / BPS;
        pots[a] = share.min(ceiling);
        overflow += share - pots[a];
    }
    Plan { pots, overflow }
}

pub fn pending_reward(weight: u128, snapshot: u128, index: u128) -> u128 { weight * (index - snapshot) / INDEX_SCALE }
