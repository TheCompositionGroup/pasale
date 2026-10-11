// Nine original line icons for the service tiles. 24x24 grid, one stroke weight,
// round caps and joins. Each icon is a list of SVG path strings. A business picks one
// by name in config (icon: 'store'). Drawn for Pásale; no third-party artwork.
export const ICONS = {
  store: ['M4.5 4h15L21 9H3z', 'M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0', 'M5 12v8h14v-8', 'M10 20v-5h4v5'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
  chat: ['M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M8 10h8', 'M8 13h5'],
  scissors: ['M8.5 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M8.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z', 'M8 7.7L20 18.5', 'M8 16.3L20 5.5'],
  wrench: ['M15 4.5a4.5 4.5 0 0 0-3.9 6.4L4 18l2 2 7.1-7.1A4.5 4.5 0 0 0 19.5 9l-2.7 2.7-2.5-.5-.5-2.5L16.5 5.9A4.5 4.5 0 0 0 15 4.5z'],
  heart: ['M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z'],
  document: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M9 12h6', 'M9 16h6'],
  car: ['M4 15v-3.5L6.2 7h11.6L20 11.5V15z', 'M4 11.5h16', 'M10 16.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'M18 16.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'],
  frame: ['M4 8h16v13H4z', 'M7 11h10v7H7z', 'M8 8l4-5 4 5'],
};
export const ICON_NAMES = Object.keys(ICONS);
