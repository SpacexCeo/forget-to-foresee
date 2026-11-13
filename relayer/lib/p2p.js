// The player market's order book (sprint 6.4; docs/market.md). Players list monster resources for silk; others buy
// some or all. The rules are lib/market-rules.js (a byte copy of the game's). Settlement is on NEAR testnet only (the
// owner's rule: no demo modes): per fill the items move first (items.coordinator_transfer seller -> buyer), then the
// silk (ftf-town trade_for buyer -> seller, the fee burned); if the silk call fails the items are moved back, so
// nothing half-happens, and both transaction hashes are returned. Until those contract methods are deployed the
// market answers `market_not_live` and moves nothing. The book itself (listings) is kept by the relayer.
//
// One operation at a time (a queue), so two buyers of the last item get one winner. The book is a JSON file.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MARKET, TRADABLE, checkListing, checkBuy, applyFill, isOpen, dayOf } from './market-rules.js';

const MICRO_PER_CENT = 10_000n;
const empty = () => ({ v: 1, seq: 0, listings: {}, volume: {}, trades: [] });

export function loadBook(file) { try { const b = JSON.parse(readFileSync(file, 'utf8')); return b && b.v === 1 ? b : empty(); } catch { return empty(); } }
function saveBook(file, book) { if (!file) return; mkdirSync(dirname(file), { recursive: true }); writeFileSync(file + '.tmp', JSON.stringify(book)); renameSync(file + '.tmp', file); }

/**
 * @param {object} o
 * @param {string} [o.file] the book's JSON file (none: memory only)
 * @param {(item: string) => number} o.refUnitC the reference unit price in cents (the stall's quote)
 * @param {(account: string) => Promise<{silkC: number, items: object}>} o.holdings the account's real holdings on NEAR
 * @param {object} [o.chain] {transferItems({from, to, item, qty, requestHash}), tradeSilk({buyer, seller, totalC, feeC, requestHash})} -> {ok, hash, failure}
 * @param {() => Promise<boolean>} [o.live] whether the settlement methods are deployed (and the keys set)
 */
export function createP2P({ file = null, refUnitC, holdings = async () => ({ silkC: 0, items: {} }), chain = null, live = async () => !!chain, now = () => Date.now(), book: given = null } = {}) {
  const settlement = 'chain';
  const book = given || (file ? loadBook(file) : empty());
  let tail = Promise.resolve();
  const serial = (fn) => { const p = tail.then(fn, fn); tail = p.catch(() => {}); return p; };
  const save = () => saveBook(file, book);
  const listView = (l) => ({ ...l, settlement });
  const notLive = { status: 503, body: { error: 'market_not_live' } };

  const volumeOf = (account) => { const v = book.volume[account]; return v && v.day === dayOf(now()) ? v.c : 0; };
  const addVolume = (account, c) => { book.volume[account] = { day: dayOf(now()), c: volumeOf(account) + c }; };
  function sweep() {
    for (const l of Object.values(book.listings)) {
      if ((l.status === 'active' || l.status === 'partial') && now() >= l.expiresAt) {
        l.status = 'expired'; // the items never left the seller: nothing to give back
      }
    }
  }
  const activeOf = (account) => Object.values(book.listings).filter((l) => l.seller === account && isOpen(l, now())).length;

  return {
    settlement,
    /** {listings, referenceUnitC, band, settlement} for one item (open listings, cheapest first). */
    live,
    book(item) {
      sweep();
      const ref = refUnitC(item);
      const listings = Object.values(book.listings).filter((l) => l.item === item && isOpen(l, now())).sort((a, b) => a.unitPriceC - b.unitPriceC || a.createdAt - b.createdAt).map(listView);
      return { listings, referenceUnitC: ref, band: { minC: Math.max(1, Math.ceil(ref * MARKET.bandLow)), maxC: Math.floor(ref * MARKET.bandHigh) }, settlement };
    },
    /** The account's own listings and fills. */
    async mine(account) {
      sweep();
      const listings = Object.values(book.listings).filter((l) => l.seller === account).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(listView);
      const fills = book.trades.filter((t) => t.buyer === account || t.seller === account).slice(-50);
      return { listings, fills, volumeTodayC: volumeOf(account), settlement };
    },
    stats() { return { today: book.trades.filter((t) => dayOf(t.at) === dayOf(now())).length, volumeC: book.trades.filter((t) => dayOf(t.at) === dayOf(now())).reduce((s, t) => s + t.totalC, 0), lastTrades: book.trades.slice(-5).reverse(), settlement }; },

    list({ account, item, qty, unitC }) {
      return serial(async () => {
        if (!(await live())) return notLive;
        sweep();
        const held = ((await holdings(account)).items || {})[item] ?? 0;
        const c = checkListing({ item, qty, unitC, refUnitC: refUnitC(item), active: activeOf(account), held });
        if (!c.ok) return { status: c.error === 'not_enough_items' || c.error === 'limit_listings' ? 409 : 400, body: c };
        book.seq += 1;
        const id = 'lst_' + createHash('sha256').update(account + '|' + book.seq + '|' + now()).digest('hex').slice(0, 8);
        const l = { id, seller: account, sellerKind: /\.ftf-town\.testnet$/.test(account) ? 'agent' : 'player', item, tokenId: item, qtyTotal: qty, qtyLeft: qty, unitPriceC: unitC, referenceUnitC: refUnitC(item),
          createdAt: now(), expiresAt: now() + MARKET.durationMs, status: 'active', settlement, fills: [] };
        book.listings[id] = l; save();
        return { status: 200, body: { listing: listView(l) } };
      });
    },

    cancel({ account, listingId }) {
      return serial(async () => {
        sweep();
        const l = book.listings[listingId];
        if (!l || l.seller !== account) return { status: 404, body: { error: 'listing_gone' } };
        if (!isOpen(l, now())) return { status: 409, body: { error: 'listing_gone', listing: listView(l) } };
        l.status = 'cancelled';
        save();
        return { status: 200, body: { listing: listView(l) } };
      });
    },

    buy({ account, listingId, qty, requestId }) {
      return serial(async () => {
        sweep();
        const l = book.listings[listingId];
        const done = l && (l.fills || []).find((f) => f.requestId === requestId && f.buyer === account);
        if (done) return { status: 200, body: { fill: done, listing: listView(l), repeated: true } }; // a retry of a lost answer
        if (!(await live()) || !chain) return notLive;
        const silkC = (await holdings(account)).silkC;
        const c = checkBuy({ listing: l, buyer: account, qty, now: now(), silkC, spentToday: { buyer: volumeOf(account), seller: l ? volumeOf(l.seller) : 0 } });
        if (!c.ok) return { status: { listing_gone: 409, self_trade: 409, not_enough_silk: 402, daily_cap: 429 }[c.error] || 400, body: c };
        const f = { ...c.fill, buyer: account, seller: l.seller, item: l.item, unitPriceC: l.unitPriceC, requestId, at: now(), settlement, txItems: null, txSilk: null };
        const requestHash = createHash('sha256').update(`ftf-market|${account}|${listingId}|${qty}|${requestId}`).digest('hex');
        const it = await chain.transferItems({ from: l.seller, to: account, item: l.item, qty, requestHash });
        if (!it.ok) return { status: 409, body: { error: 'not_enough_items', detail: String(it.failure || '').slice(0, 120), tx_hash: it.hash } };
        const sk = await chain.tradeSilk({ buyer: account, seller: l.seller, totalC: f.totalC, feeC: f.feeC, requestHash });
        if (!sk.ok) {
          const back = await chain.transferItems({ from: account, to: l.seller, item: l.item, qty, requestHash: requestHash.slice(0, 63) + (requestHash.endsWith('0') ? '1' : '0') }).catch(() => ({ ok: false }));
          return { status: 402, body: { error: 'not_enough_silk', detail: String(sk.failure || '').slice(0, 120), tx_items: it.hash, tx_back: back.hash || null, compensated: !!back.ok } };
        }
        f.txItems = it.hash; f.txSilk = sk.hash;
        Object.assign(l, applyFill(l, f));
        addVolume(account, f.totalC); addVolume(l.seller, f.totalC);
        book.trades.push(f); if (book.trades.length > 500) book.trades.splice(0, book.trades.length - 500);
        save();
        return { status: 200, body: { fill: f, listing: listView(l) } };
      });
    },
  };
}

/** Cents → the contracts' micro-silk string. */
export const microOf = (c) => String(BigInt(Math.round(c)) * MICRO_PER_CENT);
