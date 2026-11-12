//! The town's integer rules, shared with game/src/game/town-rules.js through contracts/town/tests/vectors.json.
//! Pure functions, no state, no environment: the same inputs give the same outputs in Rust and in JS.
use near_sdk::near;

pub use near_sdk::json_types::U128 as U;
pub const BPS: u128 = 10_000;
/// Reward index fixed point.
pub const INDEX_SCALE: u128 = 1_000_000_000_000_000_000;
/// One wool or one silk in micro-units.
pub const UNIT: u128 = 1_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Params {
    pub epoch_secs: u32,
    pub trade_fee_bps: u32,
    pub min_trade: u128,
    pub amm_fee_bps: u32,
    /// Share of the AMM fee that goes to the stake pot (the rest stays in the pool for LPs).
    pub amm_fee_stakers_bps: u32,
    pub swap_cap_bps: u32,
    pub sweep_max_bps: u32,
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
    pub wool_credit_day_cap: u128,
}

impl Default for Params {
    fn default() -> Self {
        Params {
            epoch_secs: 86_400, trade_fee_bps: 12, min_trade: UNIT / 2, amm_fee_bps: 30, amm_fee_stakers_bps: 2_000, swap_cap_bps: 500,
            sweep_max_bps: 100, station_tax_bps: 1_200, tithe_stakers_bps: 6_500, tithe_purse_bps: 1_000, tithe_reserve_bps: 1_000, tithe_burn_bps: 1_500,
            rate_ceiling_bps: 40, lock_days: [0, 5, 10, 20], lock_mult_bps: [10_000, 11_500, 13_000, 15_000], works_bps: [3_500, 2_500, 2_500, 1_500],
            cooldown_days: 2, early_exit_bps: 1_000, deed_fee: UNIT / 4, cap_total: 4_000 * UNIT, cap_floor: 400 * UNIT, cap_share_bps: 500,
            cap_asset: 1_500 * UNIT, wool_credit_day_cap: 2_000 * UNIT,
        }
    }
}

impl Params {
    /// Bounded ranges (docs/security-town.md T13).
    pub fn valid(&self) -> bool {
        (60..=86_400).contains(&self.epoch_secs) && self.trade_fee_bps <= 100 && self.min_trade >= 1_000 && self.amm_fee_bps >= 1 && self.amm_fee_bps <= 100
            && self.amm_fee_stakers_bps <= 5_000 && (10..=2_000).contains(&self.swap_cap_bps) && (1..=500).contains(&self.sweep_max_bps)
            && self.station_tax_bps <= 3_000
            && self.tithe_stakers_bps + self.tithe_purse_bps + self.tithe_reserve_bps + self.tithe_burn_bps == 10_000
            && (1..=200).contains(&self.rate_ceiling_bps) && self.lock_days.windows(2).all(|w| w[0] < w[1]) && self.lock_days[3] <= 60
            && self.lock_mult_bps[0] == 10_000 && self.lock_mult_bps.windows(2).all(|w| w[0] <= w[1]) && self.lock_mult_bps[3] <= 30_000
            && self.works_bps.iter().sum::<u32>() == 10_000 && self.works_bps.iter().all(|&b| b > 0)
            && self.cooldown_days <= 14 && self.early_exit_bps <= 3_000 && self.deed_fee <= 10 * UNIT
            && self.cap_floor <= self.cap_total && self.cap_asset <= self.cap_total && self.cap_share_bps <= 10_000 && self.wool_credit_day_cap <= 100_000 * UNIT
    }
}

#[derive(Debug, PartialEq)]
pub struct Quote { pub out: u128, pub fee: u128, pub to_stakers: u128 }

/// Constant product with the fee taken from the input (rounded up): out = y·in_eff / (x + in_eff).
pub fn swap_quote(p: &Params, x: u128, y: u128, amount: u128) -> Quote {
    let fee = (amount * p.amm_fee_bps as u128 + BPS - 1) / BPS;
    let in_eff = amount.saturating_sub(fee);
    let out = if x + in_eff == 0 { 0 } else { y * in_eff / (x + in_eff) };
    Quote { out, fee, to_stakers: fee * p.amm_fee_stakers_bps as u128 / BPS }
}

pub fn trade_fee(p: &Params, silk: u128) -> u128 { silk * p.trade_fee_bps as u128 / BPS }

/// Per-account pledge cap: min(cap_total, max(cap_floor, cap_share·TVL)).
pub fn stake_cap(p: &Params, tvl: u128) -> u128 { p.cap_total.min(p.cap_floor.max(tvl * p.cap_share_bps as u128 / BPS)) }

/// Liquidity in proportion to the pool: (shares, wool taken, silk taken), amounts rounded up, never above the maxima.
pub fn lp_add(x: &u128, y: &u128, shares_total: u128, wool_max: u128, silk_max: u128) -> (u128, u128, u128) {
    let mut shares = (wool_max * shares_total / x).min(silk_max * shares_total / y);
    loop {
        if shares == 0 { return (0, 0, 0); }
        let w = (shares * x + shares_total - 1) / shares_total;
        let s = (shares * y + shares_total - 1) / shares_total;
        if w <= wool_max && s <= silk_max { return (shares, w, s); }
        shares -= 1;
    }
}

#[derive(Debug, PartialEq)]
pub struct Split { pub stakers: u128, pub purse: u128, pub reserve: u128, pub burn: u128 }

/// What the wool bought by the sweep becomes; the rounding remainder is burned so nothing is lost or created.
pub fn split_bought(p: &Params, b: u128) -> Split {
    let stakers = b * p.tithe_stakers_bps as u128 / BPS;
    let purse = b * p.tithe_purse_bps as u128 / BPS;
    let reserve = b * p.tithe_reserve_bps as u128 / BPS;
    Split { stakers, purse, reserve, burn: b - stakers - purse - reserve }
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

pub fn isqrt(n: u128) -> u128 {
    if n < 2 { return n; }
    let mut x = (n as f64).sqrt() as u128;
    while x * x > n { x -= 1; }
    while (x + 1) * (x + 1) <= n { x += 1; }
    x
}
