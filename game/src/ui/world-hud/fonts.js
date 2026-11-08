// Fonts for the world HUD (docs/ui-world-hud.md §3), all OFL-1.1, bundled by Vite, no CDN at runtime.
// Serif roles: Libre Caslon Text (Latin) + Old Standard TT for Cyrillic, loaded from the cyrillic
// subset files only under the family "WH Cyrillic" that tokens.css also declares (same size-adjust /
// metric overrides — keep the two in sync; this copy uses bundled URLs so production builds work,
// tokens.css's copy uses the node_modules path for dev and the parity script).
// Body-copy roles: Source Sans 3 (Latin + Cyrillic in one family; 400/500/600).
// Browser-only module.
import '@fontsource/libre-caslon-text/400.css';
import '@fontsource/libre-caslon-text/700.css';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/500.css';
import '@fontsource/source-sans-3/600.css';
import cyr400 from '@fontsource/old-standard-tt/files/old-standard-tt-cyrillic-400-normal.woff2?url';
import cyr700 from '@fontsource/old-standard-tt/files/old-standard-tt-cyrillic-700-normal.woff2?url';

const RANGE = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const face = (url, weight) => `@font-face { font-family: "WH Cyrillic"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("${url}") format("woff2"); unicode-range: ${RANGE}; size-adjust: 112%; ascent-override: 97%; descent-override: 26%; line-gap-override: 0%; }`;

if (typeof document !== 'undefined' && !document.querySelector('style[data-wh-fonts]')) {
  const style = document.createElement('style');
  style.dataset.whFonts = '';
  style.textContent = face(cyr400, 400) + '\n' + face(cyr700, 700);
  document.head.appendChild(style);
}
