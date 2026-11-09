# Live site: cold load, devices and first impression (C1, C7)

Research cycle 5, 2026-11-08 22:18 UTC. Search-result snippets read, not full pages. Moderate depth.

## Findings
1. **Slow or blank first loads are the most common complaint on web jam entries; a visible progress bar earns
   explicit praise; mobile browsers fail where desktop works.** Anecdotal (forum and devlog posts), no data on how
   fast judges abandon a game.
   - https://itch.io/post/1096412, https://itch.io/post/9866358 (2026-11-08): "up to a minute on a white screen",
     players report 1 to 2 minute loads.
   - https://itch.io/devlog/975520/06-the-psychology-of-loading-screens-intros.amp (2026-11-08): loading screens
     shape perceived quality and polish.
   - https://itch.io/devlog/662375/reduced-load-time.amp (2026-11-08): shrinking the build fixed complaints.
   - https://forum.godotengine.org/t/web-game-loads-too-slow-on-mobile-devices-for-15-seconds-but-on-pc-loads-for-1-2-second-what-to-do/15037
     and https://godotforums.org/d/36339-html5-export-wont-run-in-mobile-browsers/15 (2026-11-08): 15 s on phones
     versus 1 to 2 s on PC; builds that never load on mobile only.
2. **An objective yardstick a technical juror can quote:** Core Web Vitals "good" at the 75th percentile is LCP at
   most 2.5 s, INP at most 200 ms, CLS at most 0.1; "poor" is LCP over 4 s, INP over 500 ms, CLS over 0.25.
   Unchanged in 2026 per secondary sources (https://corewebvitals.io/core-web-vitals,
   https://blog.mean.ceo/core-web-vitals-news-november-2026/, both 2026-11-08). The poor boundaries come from one
   source; web.dev itself was not read. INP is the relevant one for a turn-based game (click to feedback).

## Checks added to the judging procedure (phase 2)
1. Cold load of the live URL in a fresh headless Chromium profile, desktop: time to first interactive control.
   Over 4 s with no progress indicator costs C7 one point; a blank white screen over 10 s is a C1 drift (judge path
   not reliably reachable).
2. Same on an emulated phone (Playwright device "Pixel 7"): the judge path either works or the page says plainly
   that desktop is required. A silent failure on mobile costs C7 one point (many judges open X links on a phone).
3. Transfer size of the first load (DevTools/Playwright request log); record it in the scorecard as evidence.
4. Click to visible feedback on the main action under 200 ms (INP "good").
5. Console errors on the judge path: zero expected; any uncaught error is listed as evidence under C1.
