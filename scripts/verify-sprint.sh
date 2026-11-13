#!/usr/bin/env bash
# One command for the sprint (docs/plans/sprint/FTF-5h-Six-Agent-Sprint.md 8.4). Stops at the first red step and prints
# the table. Needs Node 20+ (the checks read both TAP and the Node 24 spec reporter) and, for steps 5-6, Playwright.
#   bash scripts/verify-sprint.sh [--quick]     (--quick: unit, lint, build, budget only)
set -u
cd "$(dirname "$0")/.."
ROOT=$(pwd); QUICK=0; [ "${1:-}" = "--quick" ] && QUICK=1
declare -a NAMES STATUS DETAIL
row() { NAMES+=("$1"); STATUS+=("$2"); DETAIL+=("$3"); }
table() {
  printf '\n%-10s %-6s %s\n' step status detail
  for i in "${!NAMES[@]}"; do printf '%-10s %-6s %s\n' "${NAMES[$i]}" "${STATUS[$i]}" "${DETAIL[$i]}"; done
}
fail() { row "$1" FAIL "$2"; table; exit 1; }
count() { grep -Eo '^(#|ℹ) pass [0-9]+' <<<"$1" | grep -Eo '[0-9]+$' | tail -1; }

[ -d game/node_modules ] || (cd game && npm ci --no-audit --no-fund >/dev/null) || fail setup "npm ci failed in game/"

# 1 Unit
out=$(cd game && npm test 2>&1) || fail unit "game tests failed: $(grep -E '^not ok' <<<"$out" | head -3 | tr '\n' ' ')"
GAME=$(count "$out")
s=$(cd server && npm test 2>&1) || fail unit "server tests failed"
r=$(cd relayer && npm test 2>&1) || fail unit "relayer tests failed"
row unit ok "game $GAME, server $(count "$s"), relayer $(count "$r")"

# 2 Lint
l=$(node scripts/lint-sprint.mjs 2>&1) || fail lint "$(echo "$l" | head -5 | tr '\n' ' ')"
row lint ok "$(tail -1 <<<"$l")"

# 3 Build
(cd game && npm run build >/tmp/ftf-sprint-build.log 2>&1) || fail build "see /tmp/ftf-sprint-build.log"
row build ok "game/dist"

# 4 Budget
b=$(node scripts/bundle-budget.mjs 2>&1) || fail budget "$(echo "$b" | tr '\n' ' ')"
row budget ok "$(head -1 <<<"$b" | sed 's/^bundle-budget: //')"

if [ $QUICK = 0 ]; then
  # 5 Smoke: the built page loads with no page error
  (cd game && npx vite preview --port 4179 --strictPort --host 127.0.0.1 >/tmp/ftf-sprint-preview.log 2>&1 &) ; sleep 3
  sm=$(cd game && timeout 400 node scripts/smoke-built.mjs "http://127.0.0.1:4179/?day1=0&quest=0" 300 2>&1); smok=$?
  if [ $smok -ne 0 ]; then pkill -f "vite preview --port 4179"; fail smoke "$(tail -2 <<<"$sm" | tr '\n' ' ')"; fi
  row smoke ok "$(tail -1 <<<"$sm")"
  # the same with every sprint flag on: a TDZ between play and sprint chunks only shows when those chunks load
  sm=$(cd game && timeout 400 node scripts/smoke-built.mjs "http://127.0.0.1:4179/?day1=0&quest=0&ff=all" 300 2>&1); smok=$?
  if [ $smok -ne 0 ]; then pkill -f "vite preview --port 4179"; fail smoke-ff "$(tail -2 <<<"$sm" | tr '\n' ' ')"; fi
  row smoke-ff ok "$(tail -1 <<<"$sm")"
  # 6 E2E (tools/e2e/sprint/run.mjs once it exists)
  if [ -f tools/e2e/sprint/run.mjs ]; then
    e=$(timeout 1500 node tools/e2e/sprint/run.mjs "http://127.0.0.1:4179/" 2>&1); eok=$?
    pkill -f "vite preview --port 4179"
    [ $eok -eq 0 ] || fail e2e "$(tail -3 <<<"$e" | tr '\n' ' ')"
    row e2e ok "$(tail -1 <<<"$e")"
  else pkill -f "vite preview --port 4179"; row e2e skip "tools/e2e/sprint/run.mjs not written yet"; fi
  # 7 Clipping (A6)
  if [ -d game/tests/clipping ] && ls game/tests/clipping/*.test.mjs >/dev/null 2>&1; then
    c=$(cd game && node --test tests/clipping/*.test.mjs 2>&1) || fail clipping "$(grep -E '^not ok' <<<"$c" | head -3 | tr '\n' ' ')"
    row clipping ok "$(count "$c") checks"
  else row clipping skip "game/tests/clipping not written yet"; fi
fi

# 8 Stats: the game count in docs/STATS.md matches this run (regenerate with node scripts/stats.mjs --write)
ST=$(grep -E '^\| game \|' docs/STATS.md | awk -F'|' '{gsub(/ /,"",$4); print $4}')
if [ "$ST" = "$GAME" ]; then row stats ok "docs/STATS.md game $ST"; else row stats WARN "docs/STATS.md says game $ST, this run $GAME (node scripts/stats.mjs --write before the final merge)"; fi
table
