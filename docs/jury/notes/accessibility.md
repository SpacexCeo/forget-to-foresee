# Accessibility: guidelines, standards and how judges check them

Read on 2026-11-08 (UTC). Juror notes feeding `docs/jury/rubric.md`.

## Summary for the rubric
- The four reference sets agree on the same short list: remappable controls, readable default text with a size
  option, contrast (4.5:1 text, 3:1 large text and UI), no information by colour alone, subtitles for speech,
  separate volume controls, a way to stop or reduce motion, and no time pressure outside core mechanics
  (Game Accessibility Guidelines, XAG 101/102/103/107/116/117, IGDA GASIG Top Ten, WCAG 2.2 AA).
- Game Accessibility Guidelines is tiered: Basic items are "low cost, high reach" and are what a juror should
  expect from a hackathon build; Intermediate items (hold-vs-toggle alternatives, contrast option, hide background
  movement, resizable UI) are differentiators; Advanced items (font size slider, screen-reader menus, audio
  description) are rare and score as innovation.
- XAG gives the only hard numbers for games: PC text at least 18 px at 1080p by default, scalable to 200 percent;
  4.5:1 / 3:1 / 7:1 (high-contrast mode) contrast; sensitivity adjustable by at least 50 percent; UI time limits
  adjustable to ten times the default or off.
- WCAG 2.2 AA applies to the HTML parts of a browser game (lobby, menus, settings, HUD text): 1.4.3, 1.4.11, 1.4.4,
  2.1.1, 2.1.4 (single-character shortcuts must be remappable or disable-able), 2.4.7, 2.5.8 (24 by 24 px
  targets), 3.1.1 (`lang` attribute), 4.1.3 (status messages announced without focus). 2.3.3 reduced motion is AAA
  but is the standard the game industry quotes.
- A browser game inherits two free wins and two risks: `prefers-reduced-motion` and OS text zoom work for free;
  WebGL canvases are invisible to screen readers and single-key hotkeys (G, T, M, V...) conflict with 2.1.4 unless
  they can be remapped or turned off.
- Awards (The Game Awards, Can I Play That?, GAconf) reward *innovation* and breadth of options, not compliance; a
  juror scoring a hackathon entry should separate "baseline present" from "something new for a disability group".
- Published checks reviewers actually run: play on mute, play with colour filters, play keyboard-only, scale OS
  text, try to pause, look for an accessibility section in settings and in the README (GASIG item 10,
  Can I Play That? guide, XAG 121).
- For Forget to Foresee the evidence that exists today: six automated accessibility tests (contrast, colour-
  independent tells), `?motion=reduce` plus `prefers-reduced-motion`, Novice/Pro modes, 5 UI languages, touch and
  gamepad. Missing against the baseline: key remapping, text size option, hold-vs-toggle statement, a pause.

## Findings
### Game Accessibility Guidelines, tiers Basic / Intermediate / Advanced
- Source: https://gameaccessibilityguidelines.com/basic/ , https://gameaccessibilityguidelines.com/intermediate/ ,
  https://gameaccessibilityguidelines.com/advanced/ , https://gameaccessibilityguidelines.com/full-list/ (read 2026-11-08)
- Basic, Motor: "Allow controls to be remapped / reconfigured"; "Include an option to adjust the sensitivity of
  controls"; "Include an option to adjust the game speed"; "Ensure that all areas of the user interface can be
  accessed using the same input method as the gameplay"; "Ensure interactive elements / virtual controls are large
  and well spaced, particularly on small or touch screens".
- Basic, Cognitive and Vision: "Use an easily readable default font size"; "Provide high contrast between text/UI
  and background"; "Ensure no essential information is conveyed by a fixed colour alone"; "Allow players to
  progress through text prompts at their own pace"; "Avoid flickering images and repetitive patterns"; "Include
  interactive tutorials"; "Use simple clear language"; "Allow the game to be started without the need to navigate
  through multiple levels of menus"; FOV: "set an appropriate default for the expected viewing environment".
- Basic, Hearing and General: "Provide subtitles for all important speech"; "Ensure no essential information is
  conveyed by sounds alone"; "Provide separate volume controls or mutes for effects, speech and background /
  music"; "Offer a wide choice of difficulty levels"; "Ensure that all settings are saved/remembered"; "Provide
  details of accessibility features in-game" and "on packaging and/or website".
- Intermediate: "Avoid / provide alternatives to requiring buttons to be held down"; "Provide an option to adjust
  contrast"; "Provide a choice of text colour, low/high contrast choice as a minimum"; "Provide an option to turn
  off / hide background movement"; "Allow interfaces to be resized"; "Avoid (or provide option to disable) any
  difference between controller movement and camera movement"; FOV "allow a means for it to be adjusted";
  "Indicate / allow reminder of controls during gameplay"; "Give a clear indication that interactive elements are
  interactive"; "Include a means of practicing without failure"; "Allow difficulty level to be altered during
  gameplay"; "Support more than one input device"; "Provide an autosave feature".
- Advanced: "Allow the font size to be adjusted"; "Ensure screen reader support, including menus & installers";
  "Avoid any sudden unexpected movement or events"; "Do not make precise timing essential to gameplay – offer
  alternatives, actions that can be carried out while paused"; "Provide an audio description track"; "Allow all
  narrative and instructions to be replayed".
- Not present as standalone items: a colour-blind palette, screen shake, a pause button or time-limit removal; the
  closest items are colour independence, hide background movement, game speed and the Advanced timing item.

### WCAG 2.2 quick reference and Understanding documents (W3C)
- Source: https://www.w3.org/WAI/WCAG22/quickref/ , https://www.w3.org/TR/WCAG22/ ,
  https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html ,
  https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (read 2026-11-08)
- 1.4.1 Use of Color (A): "Color is not used as the only visual means of conveying information".
- 1.4.3 Contrast (Minimum) (AA): text 4.5:1, large text 3:1; logotypes and inactive controls exempt.
- 1.4.11 Non-text Contrast (AA): UI components and graphical objects "a contrast ratio of at least 3:1 against
  adjacent color(s)".
- 1.4.4 Resize Text (AA): text "can be resized without assistive technology up to 200 percent without loss of
  content or functionality". 1.4.10 Reflow (AA): no two-dimensional scrolling at 320 CSS px width.
- 2.1.1 Keyboard (A): "All functionality of the content is operable through a keyboard interface".
- 2.1.4 Character Key Shortcuts (A): single printable-character shortcuts must be able to be turned off, remapped
  to include a modifier, or active only on focus.
- 2.2.1 Timing Adjustable (A): each time limit can be turned off, adjusted or extended. 2.2.2 Pause, Stop, Hide (A):
  auto-moving content over five seconds needs "a mechanism for the user to pause, stop, or hide it".
- 2.3.1 Three Flashes (A); 2.3.3 Animation from Interactions (AAA): "Motion animation triggered by interaction can
  be disabled, unless the animation is essential".
- 2.4.7 Focus Visible (AA); 2.4.11 Focus Not Obscured (Minimum) (AA, new in 2.2); 2.4.13 Focus Appearance (AAA):
  2 px perimeter and 3:1 change.
- 2.5.8 Target Size (Minimum) (AA, new in 2.2): "at least 24 by 24 CSS pixels", with spacing, equivalent, inline
  and user-agent exceptions.
- 3.1.1 Language of Page (A): "The default human language of each web page can be programmatically determined".
- 4.1.3 Status Messages (AA): status messages "can be programmatically determined through role or properties" so
  assistive tech presents them "without receiving focus" (role="status", aria-live).
- 1.2.2 Captions (Prerecorded) (A): "Captions are provided for all prerecorded audio content in synchronized media"
  (applies to the demo video).

### Xbox Accessibility Guidelines (XAG) v3.2 and Gaming and Disability Player Experience Guide
- Source: https://learn.microsoft.com/en-us/gaming/accessibility/guidelines ,
  https://devdocs.xbox.com/build/game-principles/accessibility/xbox-accessibility-guidelines.md (index of 23 XAGs),
  https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/101 (102, 103, 106, 107,
  116, 117 at the same path), https://learn.microsoft.com/gaming/accessibility/gadpeg (read 2026-11-08)
- Framing: "intended for designers as a catalyst ... for test teams as a checklist"; "aren't intended to act as a
  checklist to validate any type of compliance or legal requirements".
- XAG 101 Text display: PC/VR "Font size should equal or exceed: 18 px at 1080p"; "resize text up to 200 percent of
  the minimum font sizes"; "Include at least one sans serif type-face option"; line width at most 80 characters,
  line spacing 1.5; "Platform-provided screen magnification tools aren't an appropriate mitigation".
- XAG 102 Contrast: standard text and visual elements 4.5:1, large-scale 3:1, inactive text 3:1, high-contrast mode
  7:1; measure against "the lowest contrasting area of the background"; "Images shouldn't contain text except for
  Logotypes"; red and green together "can cause difficulty for players with certain types of colorblindness".
- XAG 103 Additional cues: "Color alone should never be used to represent information"; colour-coded content "also
  needs to be expressed by using at least one additional signifier such as shape, pattern, iconography, or text
  labels"; if colour is primary, "the player should be able to configure those colors".
- XAG 106 Screen narration: "All core game UI text ... should support the screen readers that are available on the
  platform"; narration order name, role, value, index; "Programmatically expose the language of the game".
- XAG 107 Input: "remap all of the controls within the game itself"; "Avoid introducing mechanics where a key or
  button should be held down for an extended period"; "Avoid ... press two buttons simultaneously"; keyboard users
  can "start the game, adjust settings, play the game, and exit ... using a keyboard alone"; sensitivity "by at
  least 50% of the default"; touch targets at least 15 mm on phones.
- XAG 116 Time limits (non-core UI only): limits "used only when they're essential"; adjustable "up to at least ten
  times the length of the default"; warn and give "at least 20 seconds to extend"; or "Turn off the time limit".
- XAG 117 Visual distractions and motion: a mechanism to "pause, stop, or hide" auto-updating content; "Avoid the
  use of camera shake, camera bobbing effects, motion blur ... or provide an option to turn off"; "Provide adjustable
  field of view settings"; adjust "horizontal and vertical camera movement sensitivity".
- GADPEG: companion that organises the same XAG guidance "by type of disability" (PDF download; not read).

### AbleGamers Accessible Player Experiences (APX)
- Source: https://accessible.games/accessible-player-experiences/ (read 2026-11-08)
- Two families of patterns: Access ("whether a player can give input to the game and take in its information") and
  Challenge ("accessibility is not about eliminating challenge; it is about adding flexibility to challenge").
- 12 Access patterns named on the page: Second Channel, Flexible Text Entry, Clear Text, Leave It There, Same
  Controls But Different, Improved Precision, Do More With Less, Flexible Displays, Personal Interface, Flexible
  Controllers, Distinguish This From That, Clear Channels.
- 10 Challenge patterns: Moderation In All Things, House Rules, Bypass, Undo Redo, Helping Hand, Training Ground,
  Play Alongside, Slow It Down, Total Recall, Save Early Save Often. Pattern definitions are on sub-pages (not read).

### Can I Play That? reference guide and awards
- Source: https://caniplaythat.com/basic-accessibility-options-for-blind-and-low-vision-players/ ,
  https://caniplaythat.com/2020/11/29/can-i-play-thats-2020-accessibility-awards/ (read 2026-11-08)
- Blind/low-vision guide expects: adjustable contrast ("it's even better if the contrast can be adjusted"), scalable
  text ("Include scalable font"), a dyslexia-friendly and a bold sans-serif font, bold outlines on interactive
  elements, options to disable screen shake and flashing lights, screen-reader menus, adjustable game speed,
  replayable tutorial, gameplay that pauses when text appears, remappable controls, adjustable sensitivity.
- Reviews are organised per disability (deaf/HoH, blind/low vision, mobility, cognitive); a 2025 DiGRA paper maps
  the 2019-2025 reviews onto the Game Accessibility Guidelines (via search result; paper not read).
- 2020 awards had 18 categories including "Best overall accessible game", per-disability bests, "Best feature you
  wish all games would implement", "Most accessible game trailer"; eligibility by release year, no public rubric.
  The awards moved to GAconf Awards from 2022 (17 then 19 categories, expert-jury shortlists).

### IGDA Game Accessibility SIG, Top Ten
- Source: https://igda-gasig.org/how/sig-top-ten/ (2021 V4), https://igda-gasig.org/how/game-accessibility-top-ten-se/
  (archive, 2015 list) (read 2026-11-08)
- V4 is phrased as questions a team asks itself: "Can your game be understood without hearing? On mute?"; "Could
  your controls be simpler, more flexible, less demanding?"; "Does your gameplay or UI depend on seeing colours?";
  "Is your text both legible and readable?"; "How intense is too intense?"; "Do your players know that your game
  is accessible?".
- 2015 list is the concrete baseline most reviewers still use: difficulty and speed options, subtitles for all
  speech, high-contrast option, large default text with options, colour-blind friendly, more than one input device,
  separate volume sliders, customisable controls, simple menus, and "List accessibility features ... before purchase".

### The Game Awards, Innovation in Accessibility
- Source: https://www.thegamer.com/game-awards-accessibility-category-last-of-us-2/ (official pages
  thegameawards.com/news/... returned 404 on 2026-11-08) (read 2026-11-08)
- Category added in 2020; summarised as recognising "developers creating content, features, and technology that
  help people with disabilities enjoy games". No public scoring rubric; a jury of accessibility specialists picks
  nominees, winners are 90 percent jury and 10 percent public vote (via search summary). The signal is novelty
  plus reach, not a compliance count.

## Checklist
A juror can run these in about ten minutes on the hosted build; each item names its source.
1. Open settings: is there an accessibility section or an accessibility statement in-game and in the README?
   (GAG Basic "Provide details of accessibility features in-game"; GASIG V4 item 10; XAG 121.)
2. Can every hotkey be remapped, or at least turned off? Single letters G/T/M/V/F/E/H/L count as character-key
   shortcuts. (GAG Basic remap; XAG 107; WCAG 2.1.4.)
3. Keyboard only: Tab/Enter/Esc through lobby, tutorial, settings, HUD panels; focus ring visible on every control.
   (WCAG 2.1.1, 2.4.7, 2.4.11; XAG 107 "using a keyboard alone".)
4. Default body text at least 18 px at 1080p and no text baked into images. (XAG 101, 102.)
5. Browser zoom 200 percent: nothing clips, no two-axis scrolling in panels. (WCAG 1.4.4, 1.4.10; XAG 101 scaling.)
6. Contrast: body text 4.5:1, large text and controls 3:1, measured against the lightest patch of the background
   (mist, glass). (WCAG 1.4.3, 1.4.11; XAG 102.)
7. Colour-coded state (Unsure / Revealed / Verified / Came true, clan colours) also carries a word, icon or shape;
   check with a deuteranopia filter. (WCAG 1.4.1; XAG 103; GAG Basic colour item.)
8. Reduced motion: OS `prefers-reduced-motion` or the URL flag stops mist, speed ramps, camera bob; no element
   flashes more than three times a second. (WCAG 2.2.2, 2.3.1, 2.3.3; XAG 117; GAG Intermediate background movement.)
9. Camera and controls: sensitivity slider or at least two speeds; no action requires holding a key, or the hold has
   a toggle alternative (run on Shift). (GAG Basic sensitivity, Intermediate hold item; XAG 107.)
10. No timed UI outside the core turn mechanic; text prompts wait for the player; a pause or "nothing moves until I
    act" statement exists. (WCAG 2.2.1; XAG 116; GAG Basic own pace.)
11. Sound: play on mute and lose nothing; any voice line has subtitles; separate music/effects sliders. (GAG Basic
    hearing items; GASIG V4 item 1; XAG 104/105.)
12. Touch: targets at least 24 by 24 CSS px, ideally 15 mm, with spacing; no multi-finger or drag-only action.
    (WCAG 2.5.8; XAG 107 mobile; GAG Basic large well-spaced controls.)
13. Screen reader on the HTML shell: `lang` set per UI language, buttons labelled, log and quest updates in a live
    region; the WebGL canvas has a text alternative. (WCAG 3.1.1, 4.1.3; XAG 106.)
14. Difficulty and help: a guided mode, in-game control reminders, replayable tutorial, undo or sandbox.
    (GAG Basic difficulty and tutorial; Intermediate reminders; APX Helping Hand, Training Ground, Undo Redo.)
15. Evidence: automated tests or a documented manual pass exist for items 6 to 8, and settings persist across
    reloads. (GAG Basic "settings are saved/remembered"; the hackathon rule "no claim that does not run".)

## Implications for Forget to Foresee
- Baseline already covered and verifiable: six accessibility tests (`game/tests/ui-a11y.test.mjs`) cover contrast
  and colour-independent tells (checklist 6, 7, 15); `prefers-reduced-motion` is honoured in `styles.css`,
  `world-hud/tokens.css`, `world-hud/index.js` and the `?motion=reduce` flag (item 8); Novice/Pro modes and the
  tutorial (item 14); touch and gamepad plus keyboard (GAG "more than one input device"); 5 UI languages help
  item 13 only if `<html lang>` follows the selected language.
- Gaps a juror will find in ten minutes: no key remapping or hotkey-off switch (items 2, WCAG 2.1.4); no text size
  option beyond browser zoom (item 5 should be tested at 200 percent before the freeze); no camera sensitivity
  slider for the 3D view (item 9); no in-game accessibility statement (item 1). Cheapest fixes before 15.11: a
  README "Accessibility" section listing what exists and what does not, a Shift-run toggle, and a `lang` sync.
- Turn-based play with G/T advancing trials is a structural strength: there is no time pressure (items 10, XAG 116),
  and the Advanced GAG item "actions that can be carried out while paused" is met by design; say so explicitly in
  the README and the demo video rather than leaving the juror to infer it.
- The WebGL island is invisible to screen readers; the HTML HUD (log lines, quest banner, sign cards) is where
  4.1.3 live regions and labelled buttons would make the game partly playable without sight. Do not claim screen-
  reader support unless it is tested.
- Colour-coded clan and sign states must keep their text labels in both Novice and Pro; the Pro slot rows with
  confidence values are a good colour-independent tell to show in the video.
- For award-style "innovation" credit the honest claim is the Novice/Pro split (APX Moderation In All Things) and
  the commit-reveal that lets any player verify a sign without trusting the screen; do not overclaim colour-blind
  palettes or remapping that are not in the build.
- Captions on the demo video are a WCAG 1.2.2 item and also help the AI screening layer read the claims; keep the
  proof line on screen at least three seconds, as the shot list already says.
