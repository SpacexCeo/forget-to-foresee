# Town Pulse: every number and the call behind it

`game/public/pulse.html` (`/pulse.html`) reads the town contract straight from a NEAR RPC node in the browser. Each
host gets 6 s, then the next one is tried; answers are cached 60 s in the tab. A failed call shows "Unavailable" and
never an old number. The page runs no third-party scripts, sets no cookies and has no analytics. Each number below
can be checked with the same call:

```bash
RPC=https://rpc.testnet.near.org; T=ftf-town.testnet
v() { curl -s $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"'$T'","method_name":"'$1'","args_base64":"'$(printf '%s' "$2" | base64 | tr -d '\n')'"}}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Buffer.from(JSON.parse(s).result.result).toString()))'; }
v pulse '{}'                 # the tiles: trades, transactions, silk traded, pledged, purse, entrants, burned, minted, treasury, reserve, accounts, gate
v params '{}'                # Rules in force
v gate_price '{}'            # the portal price (v2 contract)
v stake_pools '{}'           # The town works: silk pledged per works
v balances_of '{"account_ids":["trader-01.ftf-town.testnet","clan-salt.ftf-town.testnet"]}'   # The town's wallets
v stall_of '{"trader":"trader-05.ftf-town.testnet"}'                                          # Hall of Pledges
curl -s $RPC -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tx","params":{"tx_hash":"<hash>","sender_account_id":"trader-01.ftf-town.testnet","wait_until":"FINAL"}}'   # Latest events
```

## Independent count (public indexer)

The section at the top of the page does not trust the contract's own counters. Since 00:00 UTC it walks the public
NearBlocks v3 indexer (`https://api-testnet.nearblocks.io/v3/accounts/<contract>/txns`, 100 rows a page, CORS open, no
key) for the town, `items.` and `gate.` sub-contracts and the seven `*.ftf-coordinator.testnet` contracts, de-duplicates
by hash and shows successful transactions today, market trades today (`ftf-town.testnet : trade`), failures (each linked
to the explorer), transactions in the last 60 minutes, distinct signing accounts and the contract : method mix. It
recounts every 10 minutes. If a page fails four times the section says "unavailable" and shows no numbers. The same
count from a terminal, for any UTC day or window: `node tools/count/count.mjs --day YYYY-MM-DD` (`tools/count/README.md`).

What the relayer adds, and how the page keeps it honest:

- **Latest events.** The relayer (`/api/market/stats`) names the latest transaction hashes. The page fetches each one
  from the RPC and shows only the `ftf_town` events the chain logged. A hash the chain does not return is shown as
  "not confirmed ✗".
- **Relayer says.** The relayer's own figure for each trader's silk is shown beside the chain's. A difference of more
  than 1 silk and 2 % is marked ⚠ with a warning line, and the chain's number is the true one.
- **Clan strategies, stalls and last trades** come from the relayer's stats and are labelled as such. The stalls'
  stock and prices live in the relayer, not on chain.

Check: `node game/scripts/pulse-check.mjs` (with the built game served by `npx vite preview` on port 4173) runs the
page in a browser against recorded fixtures. It checks that the numbers equal the fixtures, that a mismatch shows the
warning, that events are read from the chain's answer, and that a failing RPC shows "Unavailable" with no numbers.
