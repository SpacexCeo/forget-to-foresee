# Simulation output (generated)

Rules `v2`, seeds 1..10000 (10000 seasons per strategy, 17 strategies, 197.3 s total, 1.16 ms per season). Rejected intents: 0; unexplained silk residual: 0.

## Iris: return per strategy

Final silk = Iris's silk after the finale. Net = final silk minus the `passive` strategy on the same seed (paired). Value in = silk Iris spent on actions; value back = silk that came back from them (stakes, gift shares, repayments, shard sales, own prize, finale bonus). RTP = value back / value in (ratio of totals). Anchors RTP = (stakes returned + gift shares) / stakes placed. Loans RTP = (repayments + debt-shard sales) / silk lent.

| strategy | final silk (mean ± 95% CI) | sd | p10 / p50 / p90 | net vs passive | P(net>0) | value in | value back | RTP | anchors RTP | hit % | loans RTP | prize | finale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 76.1 ± 0.7 | 36.3 | 33.0 / 76.0 / 121.0 | -61.9 ± 1.1 | 10.7% | 268.8 | 242.2 | 0.90 | 1.46 | 56.5% | 0.98 | 0.0 | 26.2 |
| coop-honest-none | 84.3 ± 0.6 | 28.8 | 48.0 / 85.0 / 120.0 | -53.7 ± 1.0 | 10.8% | 106.4 | 79.8 | 0.75 | n/a | n/a | 0.97 | 0.0 | 23.2 |
| coop-defect-anchor | 94.3 ± 1.0 | 52.6 | 26.0 / 93.0 / 162.0 | -43.7 ± 1.3 | 19.8% | 255.1 | 247.9 | 0.97 | 1.38 | 48.6% | 0.92 | 0.0 | 15.4 |
| coop-defect-none | 126.6 ± 0.9 | 46.4 | 81.9 / 134.0 / 174.0 | -11.5 ± 1.2 | 32.9% | 54.3 | 71.2 | 1.31 | n/a | n/a | 0.91 | 0.0 | 5.2 |
| late-honest-anchor | 76.3 ± 0.7 | 36.3 | 34.0 / 76.0 / 121.0 | -61.7 ± 1.1 | 10.7% | 268.7 | 242.3 | 0.90 | 1.46 | 56.5% | 0.98 | 0.0 | 26.2 |
| late-honest-none | 84.4 ± 0.6 | 29.0 | 48.0 / 85.0 / 121.0 | -53.6 ± 1.0 | 10.9% | 106.3 | 79.8 | 0.75 | n/a | n/a | 0.97 | 0.0 | 23.2 |
| late-defect-anchor | 97.2 ± 1.1 | 55.0 | 28.0 / 94.0 / 169.0 | -40.9 ± 1.4 | 22.6% | 254.3 | 250.4 | 0.98 | 1.32 | 46.7% | 0.92 | 0.1 | 11.3 |
| late-defect-none | 136.3 ± 0.9 | 48.2 | 92.0 / 142.0 / 187.0 | -1.8 ± 1.2 | 42.0% | 54.1 | 82.1 | 1.52 | n/a | n/a | 0.91 | 0.3 | 3.2 |
| hold-honest-anchor | 75.1 ± 0.7 | 38.1 | 29.0 / 72.0 / 125.0 | -63.0 ± 1.2 | 11.8% | 293.5 | 265.9 | 0.91 | 1.47 | 56.6% | 0.98 | 44.5 | 4.5 |
| hold-honest-none | 95.8 ± 0.6 | 31.6 | 56.0 / 97.0 / 136.0 | -42.2 ± 1.1 | 12.2% | 115.1 | 100.0 | 0.87 | n/a | n/a | 0.97 | 44.9 | -1.6 |
| hold-defect-anchor | 119.2 ± 1.2 | 59.7 | 41.0 / 120.0 / 193.0 | -18.8 ± 1.4 | 32.0% | 257.7 | 276.0 | 1.07 | 1.32 | 46.7% | 0.92 | 40.7 | -3.9 |
| hold-defect-none | 161.1 ± 1.1 | 53.6 | 109.0 / 172.0 / 211.0 | +23.0 ± 1.3 | 72.6% | 54.1 | 106.9 | 1.97 | n/a | n/a | 0.91 | 41.5 | -13.2 |
| passive | 138.0 ± 1.0 | 50.0 | 0.0 / 151.0 / 171.0 | +0.0 ± 0.0 | 0.0% | 0.0 | 27.4 | n/a | n/a | n/a | n/a | 44.5 | -17.1 |
| oracle (cheats) | 240.7 ± 1.3 | 68.2 | 174.0 / 242.0 / 319.0 | +102.6 ± 1.5 | 94.1% | 66.2 | 207.1 | 3.13 | 2.79 | 100.0% | n/a | 0.0 | 22.1 |
| debtdump | 81.6 ± 0.5 | 26.3 | 48.0 / 85.0 / 114.0 | -56.4 ± 1.0 | 10.4% | 110.4 | 81.0 | 0.73 | n/a | n/a | 0.91 | 0.0 | 23.2 |
| bidder | 71.8 ± 0.7 | 35.9 | 26.0 / 71.0 / 116.0 | -66.2 ± 1.1 | 10.0% | 271.7 | 241.0 | 0.89 | 1.47 | 56.8% | 0.97 | 0.0 | 25.4 |
| latebid | 72.3 ± 0.7 | 36.0 | 26.0 / 72.0 / 116.0 | -65.7 ± 1.1 | 10.2% | 271.5 | 241.3 | 0.89 | 1.47 | 56.8% | 0.97 | 0.0 | 25.5 |

## Where Iris's silk goes (mean per season)

| strategy | anchors | asks | words | loans | escrow | bids | mend | mediate | → stakes back | gift shares | repayments | shard sales | own prize | finale | visions |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 100.1 | 69.1 | 22.5 | 33.3 | 9.7 | 0.0 | 0.0 | 34.0 | 82.5 | 64.0 | 32.5 | 37.0 | 0.0 | 26.2 | 1.33 |
| coop-honest-none | 0.0 | 0.0 | 0.0 | 35.0 | 33.6 | 0.0 | 0.0 | 37.8 | 0.0 | 0.0 | 34.1 | 22.5 | 0.0 | 23.2 | 0.00 |
| coop-defect-anchor | 108.9 | 80.2 | 44.2 | 21.7 | 0.0 | 0.0 | 0.0 | 0.0 | 86.9 | 63.8 | 0.0 | 81.8 | 0.0 | 15.4 | 5.03 |
| coop-defect-none | 0.0 | 0.0 | 21.2 | 33.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 66.0 | 0.0 | 5.2 | 3.71 |
| late-honest-anchor | 100.1 | 69.2 | 22.5 | 33.3 | 9.7 | 0.0 | 0.0 | 33.9 | 82.5 | 64.0 | 32.6 | 37.0 | 0.0 | 26.2 | 1.33 |
| late-honest-none | 0.0 | 0.0 | 0.0 | 35.0 | 33.6 | 0.0 | 0.0 | 37.7 | 0.0 | 0.0 | 34.1 | 22.5 | 0.0 | 23.2 | 0.00 |
| late-defect-anchor | 110.4 | 77.1 | 45.0 | 21.7 | 0.0 | 0.0 | 0.0 | 0.0 | 84.8 | 61.0 | 0.0 | 93.2 | 0.1 | 11.3 | 5.88 |
| late-defect-none | 0.0 | 0.0 | 21.0 | 33.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 78.6 | 0.3 | 3.2 | 4.58 |
| hold-honest-anchor | 100.3 | 76.7 | 23.7 | 33.3 | 23.6 | 0.0 | 0.0 | 35.9 | 82.7 | 64.4 | 32.6 | 37.2 | 44.5 | 4.5 | 1.33 |
| hold-honest-none | 0.0 | 0.0 | 0.0 | 35.0 | 41.5 | 0.0 | 0.0 | 38.6 | 0.0 | 0.0 | 34.1 | 22.5 | 44.9 | -1.6 | 0.00 |
| hold-defect-anchor | 110.5 | 80.0 | 45.5 | 21.7 | 0.0 | 0.0 | 0.0 | 0.0 | 84.7 | 61.0 | 0.0 | 93.5 | 40.7 | -3.9 | 5.89 |
| hold-defect-none | 0.0 | 0.0 | 21.0 | 33.1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 78.6 | 41.5 | -13.2 | 4.58 |
| passive | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 44.5 | -17.1 | 0.00 |
| oracle | 66.2 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 65.1 | 119.9 | 0.0 | 0.0 | 0.0 | 22.1 | 0.00 |
| debtdump | 0.0 | 0.0 | 0.0 | 34.8 | 36.0 | 0.0 | 0.0 | 39.6 | 0.0 | 0.0 | 0.0 | 57.9 | 0.0 | 23.2 | 1.99 |
| bidder | 99.6 | 61.7 | 21.4 | 33.3 | 5.7 | 17.7 | 0.0 | 32.1 | 82.0 | 64.2 | 32.5 | 36.9 | 0.0 | 25.4 | 1.32 |
| latebid | 99.8 | 62.6 | 21.6 | 33.3 | 6.1 | 15.7 | 0.0 | 32.4 | 82.2 | 64.3 | 32.4 | 37.0 | 0.0 | 25.5 | 1.32 |

## Finale distribution, ties, crisis

| strategy | gift | lost | survived | weapon | gone | gone tick | accepted | tie 3:3 | key in Scroll | Key spoken | Ash contributes | Ash isolated at end | scroll size | Iris links broken at end |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 41.0% | 16.3% | 34.5% | 5.8% | 2.4% | 13.0 | 47.9% | 17.6% | 65.7% | 97.6% | 96.0% | 2.3% | 4.95 | 0.27 |
| coop-honest-none | 47.5% | 10.9% | 38.7% | 2.4% | 0.4% | 13.0 | 50.2% | 12.6% | 87.5% | 99.6% | 96.7% | 0.4% | 5.50 | 0.13 |
| coop-defect-anchor | 28.4% | 18.9% | 25.7% | 8.1% | 18.8% | 14.1 | 45.0% | 23.3% | 39.3% | 0.0% | 64.7% | 99.9% | 4.38 | 0.40 |
| coop-defect-none | 29.7% | 19.6% | 26.2% | 8.2% | 16.4% | 14.3 | 45.3% | 23.8% | 39.7% | 0.0% | 65.4% | 99.9% | 4.40 | 0.45 |
| late-honest-anchor | 40.9% | 16.3% | 34.6% | 5.7% | 2.5% | 13.0 | 47.8% | 17.7% | 65.5% | 97.6% | 95.5% | 2.4% | 4.93 | 0.29 |
| late-honest-none | 47.6% | 10.9% | 38.7% | 2.5% | 0.4% | 13.0 | 50.3% | 12.6% | 87.3% | 99.7% | 96.5% | 0.4% | 5.49 | 0.13 |
| late-defect-anchor | 22.9% | 16.0% | 21.1% | 7.2% | 32.9% | 13.7 | 44.8% | 24.2% | 36.5% | 0.0% | 60.2% | 98.7% | 4.20 | 0.71 |
| late-defect-none | 25.4% | 16.9% | 21.4% | 7.1% | 29.3% | 13.9 | 45.8% | 23.6% | 37.0% | 0.0% | 60.9% | 99.3% | 4.23 | 0.74 |
| hold-honest-anchor | 44.1% | 13.6% | 36.4% | 4.2% | 1.7% | 13.0 | 49.1% | 14.9% | 75.5% | 98.3% | 95.7% | 1.7% | 4.20 | 0.29 |
| hold-honest-none | 49.1% | 9.4% | 39.7% | 1.5% | 0.2% | 13.0 | 50.7% | 11.1% | 93.0% | 99.8% | 96.5% | 0.2% | 4.64 | 0.13 |
| hold-defect-anchor | 22.9% | 15.9% | 21.0% | 7.2% | 33.1% | 13.7 | 45.0% | 24.0% | 36.5% | 0.0% | 60.2% | 98.7% | 3.28 | 0.87 |
| hold-defect-none | 25.3% | 16.9% | 21.4% | 7.0% | 29.4% | 13.9 | 45.8% | 23.6% | 37.0% | 0.0% | 60.9% | 99.3% | 3.30 | 0.89 |
| passive | 32.8% | 23.0% | 28.3% | 11.0% | 4.9% | 14.4 | 46.1% | 26.6% | 37.6% | 0.0% | 62.3% | 100.0% | 3.39 | 1.00 |
| oracle | 32.5% | 21.4% | 35.2% | 2.9% | 8.0% | 14.6 | 38.5% | 22.1% | 39.7% | 0.0% | 65.3% | 100.0% | 4.42 | 0.61 |
| debtdump | 47.3% | 11.3% | 39.0% | 2.4% | 0.0% | 13.0 | 49.7% | 12.5% | 86.6% | 100.0% | 96.8% | 0.0% | 5.48 | 0.07 |
| bidder | 39.3% | 17.8% | 33.8% | 6.5% | 2.8% | 13.0 | 47.0% | 19.1% | 62.7% | 97.2% | 95.9% | 2.7% | 4.86 | 0.26 |
| latebid | 39.6% | 17.5% | 33.8% | 6.4% | 2.7% | 13.0 | 47.2% | 18.9% | 63.0% | 97.3% | 95.9% | 2.6% | 4.87 | 0.27 |

## Tension (mean H after each tick; H starts at 10, 100 = the Shells leave)

| strategy | start | t1 | t2 | t3 | t4 | t5 | t6 | t7 | t8 | t9 | t10 | t11 | t12 | t13 | t14 | t15 | t16 | max | P(gone) | crisis jump | edges cut at 13 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 10.0 | 8.0 | 6.0 | 7.4 | 8.5 | 8.8 | 12.2 | 12.7 | 13.1 | 13.9 | 24.2 | 24.3 | 59.0 | 30.0 | 29.4 | 26.8 | 26.2 | 59.3 | 2.4% | 36.6 | 2.20 |
| coop-honest-none | 10.0 | 8.0 | 6.0 | 7.4 | 6.8 | 6.1 | 7.7 | 7.7 | 7.7 | 8.2 | 19.6 | 19.3 | 54.6 | 27.7 | 25.9 | 24.5 | 23.9 | 54.7 | 0.4% | 36.6 | 2.21 |
| coop-defect-anchor | 10.0 | 8.0 | 6.0 | 7.4 | 9.9 | 12.0 | 15.2 | 17.7 | 24.0 | 24.7 | 26.6 | 29.1 | 65.7 | 69.8 | 65.1 | 65.5 | 65.3 | 78.9 | 18.8% | 37.0 | 2.21 |
| coop-defect-none | 10.0 | 8.0 | 6.0 | 7.4 | 10.0 | 12.0 | 14.9 | 17.5 | 23.7 | 24.0 | 25.9 | 27.4 | 63.7 | 68.3 | 63.8 | 64.5 | 64.1 | 77.7 | 16.4% | 37.7 | 2.25 |
| late-honest-anchor | 10.0 | 8.0 | 6.0 | 7.4 | 8.5 | 8.8 | 12.2 | 12.7 | 13.1 | 13.9 | 24.1 | 24.3 | 58.9 | 30.1 | 29.4 | 26.9 | 26.3 | 59.2 | 2.5% | 36.6 | 2.20 |
| late-honest-none | 10.0 | 8.0 | 6.0 | 7.4 | 6.8 | 6.1 | 7.7 | 7.7 | 7.7 | 8.2 | 19.6 | 19.3 | 54.5 | 27.8 | 25.9 | 24.6 | 24.0 | 54.6 | 0.4% | 36.6 | 2.20 |
| late-defect-anchor | 10.0 | 8.0 | 6.0 | 7.4 | 9.9 | 12.0 | 15.2 | 17.7 | 23.9 | 36.3 | 38.2 | 41.7 | 77.9 | 75.5 | 70.3 | 70.4 | 70.1 | 86.8 | 32.9% | 36.7 | 2.19 |
| late-defect-none | 10.0 | 8.0 | 6.0 | 7.4 | 10.0 | 12.0 | 14.9 | 17.5 | 23.7 | 35.9 | 37.6 | 40.1 | 76.0 | 75.0 | 69.7 | 70.1 | 69.4 | 86.2 | 29.3% | 37.5 | 2.24 |
| hold-honest-anchor | 10.0 | 8.0 | 6.0 | 7.4 | 8.5 | 8.8 | 12.2 | 12.7 | 13.1 | 13.9 | 24.1 | 23.6 | 57.4 | 29.2 | 28.1 | 26.7 | 26.1 | 57.7 | 1.7% | 36.6 | 2.21 |
| hold-honest-none | 10.0 | 8.0 | 6.0 | 7.4 | 6.8 | 6.1 | 7.7 | 7.7 | 7.7 | 8.2 | 19.6 | 18.9 | 53.5 | 26.6 | 25.3 | 24.4 | 23.8 | 53.6 | 0.2% | 36.6 | 2.20 |
| hold-defect-anchor | 10.0 | 8.0 | 6.0 | 7.4 | 9.9 | 12.0 | 15.2 | 17.7 | 23.9 | 36.3 | 38.2 | 41.9 | 78.1 | 75.5 | 70.3 | 70.4 | 70.1 | 86.8 | 33.1% | 36.6 | 2.19 |
| hold-defect-none | 10.0 | 8.0 | 6.0 | 7.4 | 10.0 | 12.0 | 14.9 | 17.5 | 23.7 | 35.9 | 37.7 | 40.1 | 76.1 | 75.0 | 69.8 | 70.1 | 69.5 | 86.2 | 29.4% | 37.5 | 2.24 |
| passive | 10.0 | 8.0 | 6.0 | 7.4 | 8.9 | 10.4 | 12.8 | 14.9 | 16.8 | 18.5 | 19.6 | 20.4 | 56.4 | 55.8 | 56.3 | 56.5 | 56.7 | 64.9 | 4.9% | 35.9 | 2.13 |
| oracle | 10.0 | 8.0 | 6.0 | 7.4 | 8.9 | 10.3 | 12.7 | 14.9 | 16.9 | 18.5 | 19.7 | 20.4 | 56.3 | 61.2 | 60.7 | 60.7 | 60.8 | 69.6 | 8.0% | 35.9 | 2.13 |
| debtdump | 10.0 | 8.0 | 6.0 | 7.4 | 6.8 | 6.1 | 6.3 | 6.7 | 6.4 | 7.2 | 8.1 | 9.1 | 41.9 | 22.7 | 23.1 | 20.9 | 20.4 | 42.3 | 0.0% | 37.3 | 2.21 |
| bidder | 10.0 | 8.0 | 6.0 | 7.4 | 8.5 | 8.8 | 12.2 | 12.7 | 13.1 | 14.6 | 25.1 | 25.1 | 59.8 | 30.6 | 30.4 | 27.2 | 26.5 | 60.1 | 2.8% | 36.6 | 2.20 |
| latebid | 10.0 | 8.0 | 6.0 | 7.4 | 8.5 | 8.8 | 12.2 | 12.7 | 13.1 | 14.5 | 25.0 | 25.0 | 59.7 | 30.5 | 30.2 | 27.1 | 26.5 | 60.0 | 2.7% | 36.6 | 2.21 |

## Inequality: final silk per clan and Gini

| strategy | Iris | Salt | Ash | Moss | Amber | Frost | Gini (all) | Gini (excl. weapon) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 76.1 | 134.3 | 134.2 | 120.6 | 189.2 | 158.2 | 0.157 | 0.166 |
| coop-honest-none | 84.3 | 147.3 | 147.6 | 132.3 | 199.1 | 169.7 | 0.155 | 0.159 |
| coop-defect-anchor | 94.3 | 113.3 | 114.6 | 117.5 | 171.9 | 144.9 | 0.142 | 0.155 |
| coop-defect-none | 126.6 | 127.6 | 121.2 | 124.1 | 181.2 | 151.7 | 0.117 | 0.127 |
| late-honest-anchor | 76.3 | 134.3 | 134.2 | 120.7 | 189.4 | 158.4 | 0.157 | 0.166 |
| late-honest-none | 84.4 | 147.1 | 147.5 | 132.2 | 199.1 | 169.5 | 0.155 | 0.159 |
| late-defect-anchor | 97.2 | 109.2 | 99.9 | 110.4 | 160.6 | 140.4 | 0.149 | 0.161 |
| late-defect-none | 136.3 | 123.9 | 107.0 | 117.6 | 171.8 | 147.8 | 0.127 | 0.136 |
| hold-honest-anchor | 75.1 | 137.7 | 137.6 | 123.9 | 193.6 | 163.2 | 0.162 | 0.169 |
| hold-honest-none | 95.8 | 149.1 | 149.4 | 134.1 | 201.4 | 171.8 | 0.146 | 0.149 |
| hold-defect-anchor | 119.2 | 109.0 | 99.8 | 110.3 | 160.2 | 140.7 | 0.141 | 0.152 |
| hold-defect-none | 161.1 | 123.9 | 106.9 | 117.5 | 171.8 | 147.9 | 0.133 | 0.143 |
| passive | 138.0 | 139.7 | 125.2 | 122.7 | 183.7 | 148.0 | 0.099 | 0.111 |
| oracle | 240.7 | 136.7 | 124.4 | 122.0 | 186.3 | 139.8 | 0.148 | 0.152 |
| debtdump | 81.6 | 135.1 | 147.2 | 143.7 | 203.6 | 169.6 | 0.158 | 0.162 |
| bidder | 71.8 | 140.6 | 132.6 | 119.2 | 189.4 | 161.9 | 0.161 | 0.172 |
| latebid | 72.3 | 139.8 | 132.7 | 119.3 | 189.5 | 161.6 | 0.160 | 0.171 |

## Gift pool conservation (all clans, all resolved Gift events)

| strategy | Gift events | claimed | pot of claimed events | paid out | paid − pot | events with drift | minted by rounding | lost to rounding | unclaimed pot (no anchor on the right Shell) | stakes burned by Storm |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 65697 | 58477 | 1475320 | 1478270 | 2950 | 14292 (24.4%) | 9313 | 6363 | 166410 | 122290 |
| coop-honest-none | 66138 | 46465 | 1174930 | 1175457 | 527 | 5657 (12.2%) | 3268 | 2741 | 478310 | 86400 |
| coop-defect-anchor | 63289 | 55507 | 1400090 | 1402833 | 2743 | 11628 (20.9%) | 7500 | 4757 | 180590 | 134790 |
| coop-defect-none | 63828 | 44435 | 1122590 | 1123002 | 412 | 5348 (12.0%) | 3032 | 2620 | 472530 | 82450 |
| late-honest-anchor | 65683 | 58463 | 1475050 | 1478011 | 2961 | 14287 (24.4%) | 9314 | 6353 | 166340 | 122190 |
| late-honest-none | 66145 | 46491 | 1175460 | 1175961 | 501 | 5631 (12.1%) | 3240 | 2739 | 477810 | 86540 |
| late-defect-anchor | 60607 | 52801 | 1329880 | 1332455 | 2575 | 10642 (20.2%) | 6858 | 4283 | 181430 | 132290 |
| late-defect-none | 61583 | 42600 | 1073470 | 1073862 | 392 | 5001 (11.7%) | 2834 | 2442 | 463490 | 80800 |
| hold-honest-anchor | 65841 | 58638 | 1479360 | 1482349 | 2989 | 14362 (24.5%) | 9370 | 6381 | 165870 | 122350 |
| hold-honest-none | 66170 | 46514 | 1176110 | 1176617 | 507 | 5620 (12.1%) | 3237 | 2730 | 477930 | 86590 |
| hold-defect-anchor | 60540 | 52740 | 1328270 | 1330842 | 2572 | 10628 (20.2%) | 6854 | 4282 | 181320 | 131970 |
| hold-defect-none | 61568 | 42591 | 1073160 | 1073555 | 395 | 5001 (11.7%) | 2836 | 2441 | 463350 | 80770 |
| passive | 65550 | 45829 | 1158110 | 1158545 | 435 | 5576 (12.2%) | 3180 | 2745 | 480220 | 85690 |
| oracle | 65116 | 65116 | 1626620 | 1629456 | 2836 | 13001 (20.0%) | 8133 | 5297 | 0 | 84440 |
| debtdump | 66218 | 46503 | 1173140 | 1173545 | 405 | 5735 (12.3%) | 3242 | 2837 | 482290 | 84230 |
| bidder | 65651 | 58443 | 1474750 | 1477598 | 2848 | 13994 (23.9%) | 9032 | 6184 | 166200 | 122150 |
| latebid | 65666 | 58467 | 1475300 | 1478181 | 2881 | 14051 (24.0%) | 9089 | 6208 | 165970 | 122020 |

## Shard auctions and debt claims

| strategy | shards closed | burned: no bids | burned: top bid unfunded | of which a funded bidder existed | lost sale silk | Iris unfunded | tie at top | sold by Iris | bought by Iris | debt claims transferred | dead (overdue) claims | silk paid for dead claims | debt cancelled by debtor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 42996 | 0 | 0 | 0 | 0 | 0 | 3751 | 23001 | 0 | 0 | 0 | 0 | 0 |
| coop-honest-none | 29962 | 0 | 0 | 0 | 0 | 0 | 3807 | 9962 | 0 | 0 | 0 | 0 | 0 |
| coop-defect-anchor | 69075 | 0 | 0 | 0 | 0 | 0 | 4157 | 49088 | 0 | 573 | 573 | 8022 | 12485 |
| coop-defect-none | 56082 | 1 | 1 | 1 | 3 | 0 | 4488 | 36089 | 0 | 678 | 678 | 9492 | 18387 |
| late-honest-anchor | 42988 | 0 | 0 | 0 | 0 | 0 | 3760 | 22993 | 0 | 0 | 0 | 0 | 0 |
| late-honest-none | 29965 | 0 | 0 | 0 | 0 | 0 | 3823 | 9965 | 0 | 0 | 0 | 0 | 0 |
| late-defect-anchor | 76996 | 0 | 3 | 3 | 13 | 0 | 4139 | 57121 | 0 | 573 | 573 | 8022 | 12466 |
| late-defect-none | 64663 | 1 | 0 | 0 | 0 | 0 | 4389 | 44729 | 0 | 678 | 678 | 9492 | 18356 |
| hold-honest-anchor | 43059 | 0 | 0 | 0 | 0 | 0 | 3760 | 23064 | 0 | 0 | 0 | 0 | 0 |
| hold-honest-none | 29978 | 0 | 0 | 0 | 0 | 0 | 3823 | 9978 | 0 | 0 | 0 | 0 | 0 |
| hold-defect-anchor | 77094 | 0 | 3 | 3 | 13 | 0 | 4139 | 57224 | 0 | 573 | 573 | 8022 | 12466 |
| hold-defect-none | 64659 | 1 | 0 | 0 | 0 | 0 | 4389 | 44725 | 0 | 678 | 678 | 9492 | 18356 |
| passive | 20000 | 0 | 0 | 0 | 0 | 0 | 3779 | 0 | 0 | 0 | 0 | 0 | 0 |
| oracle | 20000 | 0 | 0 | 0 | 0 | 0 | 3808 | 0 | 0 | 0 | 0 | 0 | 0 |
| debtdump | 49909 | 0 | 0 | 0 | 0 | 0 | 5497 | 29909 | 0 | 697 | 697 | 9758 | 19213 |
| bidder | 42916 | 0 | 426 | 426 | 2885 | 426 | 91 | 22921 | 18951 | 0 | 0 | 0 | 0 |
| latebid | 42934 | 0 | 237 | 237 | 1559 | 237 | 432 | 22938 | 16849 | 0 | 0 | 0 | 0 |

## Best-response table (factorial design, mean final silk)

Rows: fragment decision. Columns: trust × market. Each cell is Iris's mean final silk (± 95% CI). The best fragment choice in each column is marked with *.

| frag \ trust-market | honest-anchor | honest-none | defect-anchor | defect-none |
| --- | --- | --- | --- | --- |
| coop | 76.1 ± 0.7 | 84.3 ± 0.6 | 94.3 ± 1.0 | 126.6 ± 0.9 |
| late | 76.3 ± 0.7 * | 84.4 ± 0.6 | 97.2 ± 1.1 | 136.3 ± 0.9 |
| hold | 75.1 ± 0.7 | 95.8 ± 0.6 * | 119.2 ± 1.2 * | 161.1 ± 1.1 * |

| dimension | best response per context (other two dimensions fixed) | dominant? |
| --- | --- | --- |
| frag | honest-anchor: **late**; honest-none: **hold**; defect-anchor: **hold**; defect-none: **hold** | no |
| trust | coop-anchor: **defect**; coop-none: **defect**; late-anchor: **defect**; late-none: **defect**; hold-anchor: **defect**; hold-none: **defect** | yes: defect |
| market | coop-honest: **none**; coop-defect: **none**; late-honest: **none**; late-defect: **none**; hold-honest: **none**; hold-defect: **none** | yes: none |


# Findings reproduced (rules `v2`, seeds 1..3000)

## F1. Withholding the fragment pays more than contributing
Paired on 3000 seeds, identical behaviour except the fragment decision.
| measure | value |
| --- | --- |
| hold − coop, Iris final silk (mean ± 95% CI) | 11.5 ± 0.9 |
| P(hold > coop) / P(tie) | 63.6% / 11.4% |
| late (contribute at tV−1) − coop | 0.2 ± 0.3 |
| mean own prize V collected by hold | 44.9 |
| mean finale bonus collected by coop (+40 gift, +15 survived, 0 otherwise) | 23.7 |
| P(outcome gift) / P(survived) under coop | 48.5% / 38.5% |
| analytic: E[V] = 45 (uniform 30/40/50/60) vs E[finale given contribute] = 40·P(gift) + 15·P(survived) | 45 vs 25.2 |
| AI side (coop run): Amber (always holds, V=80) / Moss (honest) / Frost final silk | 199.3 / 133.1 / 170.4 |
Minimal trace, seed 1: coop → t6 contribute → silk 48, H 6; t17 vote true → silk 88, H 21. hold → own prize 50 at tick tV=14, final silk 98 vs 88.
Note: tick 16 (DEADLINE) is unreachable for Iris's fragment: tV is 11..15 and always fires first, so "late contribution" means tV−1 at the latest.

## F2. The Gift pool is not conserved
Payout per hit anchor is round(pot · w / Σw) (engine resolveEvent). Rounding each share separately means Σ shares ≠ pot. Enumerating 2–4 anchors with weights 1..8: pot 10: +1 silk in 126 weight patterns; pot 10: -1 silk in 67 weight patterns; pot 10: +2 silk in 11 weight patterns; pot 20: +1 silk in 115 weight patterns; pot 20: -1 silk in 94 weight patterns; pot 20: +2 silk in 3 weight patterns; pot 40: -1 silk in 87 weight patterns; pot 40: +1 silk in 89 weight patterns; pot 40: +2 silk in 5 weight patterns; pot 80: +1 silk in 78 weight patterns; pot 80: -1 silk in 78 weight patterns.
Measured over 3000 coop-honest-anchor seasons: 19654 Gift events, 17479 claimed; pot total 494460, paid 444550 (drift +890: 2809 minted, 1919 lost); 4311 events (24.7%) paid a total different from the pot; 50800 silk of pot went unclaimed (no anchor on the right Shell); 36630 silk of stakes burned in Storms.
Minimal example: seed 1, tick 13, pot 40, anchors by clans [1,2,4] with weights [3,3,3] → shares [13,13,13] = 39 (-1).
Beyond rounding, the pool is created from nothing at reveal time (there is no funded pot), so the Gift mechanic is a silk faucet; Storms are the only sink on anchors.

## F3. The proof check is disconnected from the resolved event fields
`resolveEvent` verifies `e.leaf` against `S.root` with the stored Merkle path, but then pays anchors and writes the chronicle from `e.place / e.action / e.power` without recomputing the leaf from those fields, and the result `verified` is only logged.
| test over 500 seeds | result |
| --- | --- |
| tick-3 event with place edited in memory after commitment: engine reports proof ✓ | 500/500 (100.0%) |
| Iris anchored on the edited place and got paid the Gift | 500/500 |
| recomputing the leaf from the resolved fields would have caught it | 500/500 |
| root replaced by garbage: every proof ✗, yet the season continues and pays out normally | 500/500 |
Fix: at reveal, recompute `leafHash(e, idx)` from the fields being paid out, verify it against a root held outside the mutable state (server or chain), and halt the season (outcome `proof_failed`) on mismatch instead of logging ✗.

## F4. The seed reveals the whole future
The season is `mulberry32(seed)`; `S.seed` sits in the client state and in baseline the commitment is `sha256('seed:'+seed)` (v2 salts the commitment, but the seed is still a 32-bit integer and still in the state). Anyone holding the seed regenerates all 15 events, every clan's hidden V/tV and Ash's Key phrase: `newSeason(seed)` is the oracle.
Brute force without the seed, from revealed events only (replica of the engine RNG, no hashing), searching 16,777,216 seeds with the true seed 123456 inside:
| revealed events R (ticks 3..) | seeds matching in the search space | time |
| --- | --- | --- |
| 1 | 524552 | 1494 ms |
| 2 | 869 | 1655 ms |
| 3 | 5 | 1616 ms |
| 4 | 1 | 1598 ms |
| 5 | 1 | 1617 ms |
Rate 10,375,520 candidates/s single-threaded → the full 2^32 space takes about 7 min on this machine (0.1 h); by tick 7 (5 revealed events) the seed is unique and the remaining 10 events, all prizes and the Key are known.
Value of the leak: the `oracle` strategy (anchors the true Gifts from tick 1, votes the truth) ends with 165.7 ± 2.3 more silk than the honest anchoring cooperator on the same 3000 seeds; anchors RTP 2.81 vs 1.46.
Fix: 128-bit server-side seed, CSPRNG stream (not mulberry32), never ship `seed` in any client projection; the Merkle root is the only public commitment.

## F5. An unfunded top bid burns the sale
`resolveShards` takes the single top bid; if that bidder lacks the silk at closing time the shard burns even when other funded bids exist (no fallback to the next bidder, no escrow at bid time).
| strategy (3000 seasons) | shards closed | burned: no bids | burned: top unfunded | with a funded second bidder | lost sale silk | Iris was the unfunded top | ties at top |
| --- | --- | --- | --- | --- | --- | --- | --- |
| coop-honest-anchor | 12890 | 0 | 0 | 0 | 0 | 0 | 1092 |
| hold-defect-anchor | 23200 | 0 | 0 | 0 | 0 | 0 | 1237 |
| bidder | 12870 | 0 | 127 | 127 | 855 | 127 | 31 |
| latebid | 12877 | 0 | 74 | 74 | 484 | 74 | 131 |
Griefing reproduction (Frost's tick-7 shard): Iris bids, then spends her silk below the bid before the auction closes at tick 9. Succeeded in 1000/1000 seasons where the shard existed and Iris could become top bidder; Frost lost 6450 silk of otherwise funded AI bids, and the AI buyers lost the insight.
Minimal trace, seed 1: t7 accept Salt's loan (−20); t7 bid 9; t7 anchor (−10); t7 anchor (−10); t7 anchor (−10); t8 anchor (−10); t8 anchor (−10); t8 anchor (−10); silk at close 7 < bid 9 → "Никто не купил. Осколок сгорел, этого больше нет в истории мира.".
Fix: lock the bid amount in escrow when bidding (refund when outbid), or at closing fall back to the highest funded bid.

## F6. Overdue debts are transferable (and the claim can never be collected)
A debt memory is settled in `startTick` of its due tick. Forgetting it one tick earlier puts it on a 2-tick auction that closes after the due date; the buyer (if not the debtor) receives a claim with `due` in the past, and `startTick` only settles claims with `due === tick`, so it is never paid. If the debtor buys it, the debt is cancelled for about 0.55 of its face value.
| measure (3000 debtdump seasons: lend, then forget the debt at due−1) | value |
| --- | --- |
| silk lent / repaid directly | 104500 / 0 |
| debt shards sold (silk to Iris) | 95550 |
| claims transferred to a non-debtor buyer | 214 |
| of which already overdue at purchase (never collectable) | 214 (100.0%), buyers paid 2996 silk for nothing |
| debt cancelled by the debtor buying its own shard | 5761 |
| comparison, honest lender over the same seeds: lent / repaid | 104980 / 103458 (RTP 0.99) |
| debtdump lender RTP incl. shard sales | 0.91 |
Minimal trace, seed 3: t3 accept #5; t4 accept #7; t5 accept #9; t6 forget #6; t7 accept #13; t10 forget #15; t13 forget #1 → at tick 8 the state holds claim {"holder":1,"debtor":3,"amount":25,"due":7} (due < tick), which no later tick will ever settle.
Fix: settle claims with `due <= tick` (immediately on purchase if overdue), or forbid forgetting a debt within one tick of its due date, or value the shard at 0 for non-debtors when it would close after the due date.
