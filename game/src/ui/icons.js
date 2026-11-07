// Original 24-unit line icons. Decorative only: visible labels carry the meaning.
const PATHS = Object.freeze({
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  back: 'M20 12H5m6-6-6 6 6 6',
  memory: 'm12 3 7 9-7 9-7-9Z M12 3v18M5 12h14',
  clan: 'M8 8a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-2a8 8 0 0 1 16 0v2',
  scroll: 'M6 4h13v15H6a3 3 0 0 1 0-6h13M6 4a3 3 0 0 0-3 3v9M9 8h7',
  shell: 'M20 13a8 8 0 1 1-8-9c5 0 8 3 8 7s-3 7-7 7a5 5 0 0 1-5-5 4 4 0 0 1 4-4 3 3 0 0 1 3 3 2 2 0 0 1-2 2',
  anchor: 'M12 7v14M7 11h10M3 15c0 4 4 6 9 6s9-2 9-6M9 4a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  check: 'm5 12 4 4L19 6',
  warning: 'm12 3 10 18H2ZM12 9v5M12 17v1',
  lock: 'M6 10h12v11H6ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  close: 'm6 6 12 12M6 18 18 6',
  settings: 'M5 4v16M12 4v16M19 4v16M2 9h6M9 15h6M16 8h6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0',
  hourglass: 'M6 3h12M6 21h12M7 3v4l10 10v4M17 3v4L7 17v4',
});

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

export function icon(name) {
  if (!PATHS[name]) throw new Error(`Unknown UI icon: ${name}`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ftf-icon' })) svg.setAttribute(key, value);
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}
