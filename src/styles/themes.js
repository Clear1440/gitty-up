/*
 * Color schemes. Each has a dark and a light palette, and every palette sets each
 * --color-* token that tokens.css leaves to the theme. applyTheme writes them onto the
 * page, and antdTheme.js feeds the same palette to Ant Design.
 *
 * Keep colors in hex: Ant Design derives its hover and active shades from them.
 * Names are token names without the `--color-` prefix.
 */

/** Colors that mean the same thing in every scheme: success, warnings, diff rows. */
const DARK_BASE = {
  success: '#62d9b5',
  warning: '#f4c56f',
  'warning-subtle': '#3a2f17',
  danger: '#ff8197',
  'diff-added-bg': '#15332b',
  'diff-deleted-bg': '#3c1f29',
  shadow: '#00000099',
};

const LIGHT_BASE = {
  success: '#138a68',
  warning: '#a86b00',
  'warning-subtle': '#fdf0d5',
  danger: '#d1355a',
  'diff-added-bg': '#dff4ea',
  'diff-deleted-bg': '#fce4ea',
  shadow: '#1a1f2b33',
};

const graph = (...colors) =>
  Object.fromEntries(colors.map((color, index) => [`graph-${index + 1}`, color]));

export const SCHEMES = [
  {
    id: 'default',
    label: 'Blue',
    description: 'Blue monochrome, the original look',
    dark: {
      ...DARK_BASE,
      bg: '#0f1218',
      surface: '#161a22',
      'surface-raised': '#1e232d',
      'surface-hover': '#242a36',
      'surface-selected': '#263450',
      border: '#2a303c',
      'border-strong': '#454e60',
      text: '#eef1f7',
      'text-muted': '#aeb7c9',
      'text-disabled': '#8891a4',
      primary: '#6ea1ff',
      'primary-strong': '#9cc0ff',
      'primary-subtle': '#1e3358',
      'on-primary': '#0b1020',
      accent: '#c3b1ff',
      'accent-subtle': '#2e2854',
      'diff-hunk-bg': '#1d2233',
      ...graph('#6ea1ff', '#c3b1ff', '#62d9b5', '#f4c56f', '#ff8197', '#5fd0e8'),
    },
    light: {
      ...LIGHT_BASE,
      bg: '#f3f5f9',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      'surface-hover': '#eaeef5',
      'surface-selected': '#dce7fb',
      border: '#dde2eb',
      'border-strong': '#b9c2d1',
      text: '#161b26',
      'text-muted': '#525d70',
      'text-disabled': '#8a93a5',
      primary: '#2f6fe4',
      'primary-strong': '#1f55b8',
      'primary-subtle': '#dde8fd',
      'on-primary': '#ffffff',
      accent: '#6e56cf',
      'accent-subtle': '#ece8fb',
      'diff-hunk-bg': '#e9eef8',
      ...graph('#2f6fe4', '#7a5ce0', '#14a37f', '#c98a12', '#e0466a', '#1596b3'),
    },
  },
  {
    id: 'twilight',
    label: 'Twilight',
    description: 'Blue and purple',
    dark: {
      ...DARK_BASE,
      bg: '#110f1c',
      surface: '#18152a',
      'surface-raised': '#211d36',
      'surface-hover': '#2a2542',
      'surface-selected': '#33295a',
      border: '#2d2845',
      'border-strong': '#4b4470',
      text: '#efedf9',
      'text-muted': '#b4aecb',
      'text-disabled': '#8a84a3',
      primary: '#8b7cff',
      'primary-strong': '#b3a8ff',
      'primary-subtle': '#2e2860',
      'on-primary': '#120e26',
      accent: '#6ea1ff',
      'accent-subtle': '#1e3358',
      'diff-hunk-bg': '#1f1c33',
      ...graph('#8b7cff', '#6ea1ff', '#d38cff', '#62d9b5', '#f4c56f', '#ff8197'),
    },
    light: {
      ...LIGHT_BASE,
      bg: '#f4f3fb',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      'surface-hover': '#ecebf7',
      'surface-selected': '#e3defc',
      border: '#dfdcef',
      'border-strong': '#bdb7d8',
      text: '#1a1730',
      'text-muted': '#59547a',
      'text-disabled': '#908ba9',
      primary: '#6a4fe0',
      'primary-strong': '#5238c4',
      'primary-subtle': '#e8e3fd',
      'on-primary': '#ffffff',
      accent: '#2f6fe4',
      'accent-subtle': '#dde8fd',
      'diff-hunk-bg': '#ecebf8',
      ...graph('#6a4fe0', '#2f6fe4', '#b04fd6', '#14a37f', '#c98a12', '#e0466a'),
    },
  },
  {
    id: 'neon',
    label: 'Neon',
    description: 'Electric blue and pink on grey',
    dark: {
      ...DARK_BASE,
      bg: '#0d0e12',
      surface: '#15161c',
      'surface-raised': '#1d1f27',
      'surface-hover': '#252731',
      'surface-selected': '#18303f',
      border: '#2a2c36',
      'border-strong': '#474a58',
      text: '#f1f2f6',
      'text-muted': '#a9adbb',
      'text-disabled': '#80838f',
      primary: '#33c3ff',
      'primary-strong': '#8ae0ff',
      'primary-subtle': '#0f3247',
      'on-primary': '#04121a',
      accent: '#ff4fd8',
      'accent-subtle': '#45163d',
      'diff-hunk-bg': '#1a1c26',
      ...graph('#33c3ff', '#ff4fd8', '#a3ff6b', '#ffd84f', '#b18cff', '#b8bcc9'),
    },
    light: {
      ...LIGHT_BASE,
      bg: '#f2f3f5',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      'surface-hover': '#e9eaee',
      'surface-selected': '#dcf3fd',
      border: '#dcdee4',
      'border-strong': '#b5b8c2',
      text: '#14151a',
      'text-muted': '#565a66',
      'text-disabled': '#8d909b',
      primary: '#0089c2',
      'primary-strong': '#006c99',
      'primary-subtle': '#daf2fc',
      'on-primary': '#ffffff',
      accent: '#d61fae',
      'accent-subtle': '#fbe1f5',
      'diff-hunk-bg': '#eceef2',
      ...graph('#0089c2', '#d61fae', '#3f9e2a', '#c98a12', '#7a5ce0', '#6b7280'),
    },
  },
  {
    id: 'coral',
    label: 'Coral',
    description: 'Warm coral and peach',
    dark: {
      ...DARK_BASE,
      // The base red sits too close to coral to stand out as a warning.
      danger: '#ff5470',
      bg: '#16100f',
      surface: '#1e1615',
      'surface-raised': '#281e1c',
      'surface-hover': '#312523',
      'surface-selected': '#4a2a25',
      border: '#352826',
      'border-strong': '#574440',
      text: '#f8eeeb',
      'text-muted': '#c7b2ad',
      'text-disabled': '#957f7a',
      primary: '#ff7f6b',
      'primary-strong': '#ffab9d',
      'primary-subtle': '#4a221c',
      'on-primary': '#1f0a06',
      accent: '#ffc58a',
      'accent-subtle': '#43301b',
      'diff-hunk-bg': '#261b1a',
      ...graph('#ff7f6b', '#ffc58a', '#62d9b5', '#6ea1ff', '#e59cff', '#f4e06f'),
    },
    light: {
      ...LIGHT_BASE,
      danger: '#c8174a',
      bg: '#fbf5f3',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      'surface-hover': '#f6ebe8',
      'surface-selected': '#fde0da',
      border: '#efdfdb',
      'border-strong': '#d4bcb6',
      text: '#2a1714',
      'text-muted': '#6e5550',
      'text-disabled': '#a38f8a',
      primary: '#d9472f',
      'primary-strong': '#b33a26',
      'primary-subtle': '#fde3dd',
      'on-primary': '#ffffff',
      accent: '#c76d14',
      'accent-subtle': '#fcebd9',
      'diff-hunk-bg': '#f8ece9',
      ...graph('#d9472f', '#c76d14', '#14a37f', '#2f6fe4', '#a64fd6', '#a8920f'),
    },
  },
  {
    id: 'glacier',
    label: 'Glacier',
    description: 'Cyan, grey and white',
    dark: {
      ...DARK_BASE,
      bg: '#101416',
      surface: '#171c1f',
      'surface-raised': '#1f2629',
      'surface-hover': '#273034',
      'surface-selected': '#1b3a40',
      border: '#2a3236',
      'border-strong': '#465257',
      text: '#f0f5f6',
      'text-muted': '#aab8bc',
      'text-disabled': '#829094',
      primary: '#3fd4e0',
      'primary-strong': '#8be7ee',
      'primary-subtle': '#113a3f',
      'on-primary': '#041719',
      accent: '#d5dee0',
      'accent-subtle': '#2b3437',
      'diff-hunk-bg': '#1a2124',
      ...graph('#3fd4e0', '#d5dee0', '#7aa8ff', '#62d9b5', '#f4c56f', '#ff8197'),
    },
    light: {
      ...LIGHT_BASE,
      bg: '#f2f5f6',
      surface: '#ffffff',
      'surface-raised': '#ffffff',
      'surface-hover': '#e8eef0',
      'surface-selected': '#d4f1f4',
      border: '#dbe3e5',
      'border-strong': '#b3c0c4',
      text: '#12191b',
      'text-muted': '#52626a',
      'text-disabled': '#8a989d',
      primary: '#08838f',
      'primary-strong': '#066973',
      'primary-subtle': '#d6f3f5',
      'on-primary': '#ffffff',
      accent: '#5d6d73',
      'accent-subtle': '#e3e9eb',
      'diff-hunk-bg': '#e9f0f2',
      ...graph('#08838f', '#5d6d73', '#2f6fe4', '#14a37f', '#c98a12', '#e0466a'),
    },
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Earthy green, brown and blue on black',
    dark: {
      ...DARK_BASE,
      bg: '#0e100c',
      surface: '#151812',
      'surface-raised': '#1d2119',
      'surface-hover': '#252a20',
      'surface-selected': '#2a3a24',
      border: '#2a2f24',
      'border-strong': '#474f3d',
      text: '#eef0e6',
      'text-muted': '#b3b8a4',
      'text-disabled': '#878c78',
      primary: '#8fbf6a',
      'primary-strong': '#b5d996',
      'primary-subtle': '#26361b',
      'on-primary': '#0d1408',
      accent: '#c49a6c',
      'accent-subtle': '#3a2c1d',
      'diff-hunk-bg': '#1b1f17',
      ...graph('#8fbf6a', '#c49a6c', '#6f9fc4', '#e0c36b', '#d47a6a', '#9ab0a0'),
    },
    light: {
      ...LIGHT_BASE,
      bg: '#f4f3ee',
      surface: '#fdfdf9',
      'surface-raised': '#ffffff',
      'surface-hover': '#ecebe2',
      'surface-selected': '#e1ecd5',
      border: '#e0ded3',
      'border-strong': '#bfbcab',
      text: '#1b1d16',
      'text-muted': '#5a5d4c',
      'text-disabled': '#929482',
      primary: '#4f7a31',
      'primary-strong': '#3c5f24',
      'primary-subtle': '#e2eed7',
      'on-primary': '#ffffff',
      accent: '#8a5a2b',
      'accent-subtle': '#f1e6d8',
      'diff-hunk-bg': '#edefe5',
      ...graph('#4f7a31', '#8a5a2b', '#3d6f99', '#b08a1e', '#b8513f', '#5c7d6a'),
    },
  },
  {
    id: 'sand',
    label: 'Sand',
    description: 'Tan and brown',
    dark: {
      ...DARK_BASE,
      bg: '#15120e',
      surface: '#1d1914',
      'surface-raised': '#26211a',
      'surface-hover': '#2f2920',
      'surface-selected': '#403322',
      border: '#322b22',
      'border-strong': '#54493a',
      text: '#f4ede2',
      'text-muted': '#c2b49f',
      'text-disabled': '#908471',
      primary: '#d9b382',
      'primary-strong': '#ecd0a8',
      'primary-subtle': '#3f3020',
      'on-primary': '#1c1308',
      accent: '#c08e62',
      'accent-subtle': '#36261a',
      'diff-hunk-bg': '#231e17',
      ...graph('#d9b382', '#c08e62', '#8fb5a0', '#e0956b', '#c9c06b', '#9fa8c9'),
    },
    light: {
      ...LIGHT_BASE,
      bg: '#f6f1e8',
      surface: '#fffcf6',
      'surface-raised': '#fffdf9',
      'surface-hover': '#efe7d9',
      'surface-selected': '#eedfc6',
      border: '#e6dccb',
      'border-strong': '#c9b99f',
      text: '#2a2116',
      'text-muted': '#6b5c48',
      'text-disabled': '#a09280',
      primary: '#8f6235',
      'primary-strong': '#714c27',
      'primary-subtle': '#f0e3cf',
      'on-primary': '#ffffff',
      accent: '#6d4a2e',
      'accent-subtle': '#ebdccd',
      'diff-hunk-bg': '#f1e9dc',
      ...graph('#8f6235', '#6d4a2e', '#4f8a6e', '#c46a3b', '#8f8a2b', '#5a6aa0'),
    },
  },
];

export const MODES = ['dark', 'light'];

/*
 * The custom scheme: the user picks four colors for each mode, and the rest of the
 * palette is worked out from them.
 */
export const CUSTOM_SCHEME_ID = 'custom';

export const CUSTOM_COLORS = [
  { key: 'bg', label: 'Background' },
  { key: 'text', label: 'Text' },
  { key: 'primary', label: 'Primary' },
  { key: 'accent', label: 'Accent' },
];

const pickCustomColors = (palette) =>
  Object.fromEntries(CUSTOM_COLORS.map(({ key }) => [key, palette[key]]));

/** A custom scheme starts out as the default one. */
export const DEFAULT_CUSTOM_COLORS = {
  dark: pickCustomColors(SCHEMES[0].dark),
  light: pickCustomColors(SCHEMES[0].light),
};

export const DEFAULT_APPEARANCE = {
  scheme: 'default',
  mode: 'dark',
  custom: DEFAULT_CUSTOM_COLORS,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const parseHex = (hex) => [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));

const toHex = (channels) =>
  `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;

/** The color `amount` of the way from `from` to `to`, where 0 is `from` and 1 is `to`. */
export function mixColors(from, to, amount) {
  const start = parseHex(from);
  const end = parseHex(to);
  return toHex(start.map((channel, index) => channel + (end[index] - channel) * amount));
}

/** How bright a color looks, from 0 for black to 1 for white (WCAG relative luminance). */
function luminance(hex) {
  const [red, green, blue] = parseHex(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Whether light text reads better than dark text on this color. */
const isDarkColor = (hex) => (1.05 / (luminance(hex) + 0.05)) > ((luminance(hex) + 0.05) / 0.05);

/** Fills in the pieces of a palette that four colors leave open. */
export function buildCustomPalette({ bg, text, primary, accent }) {
  const isDark = isDarkColor(bg);
  const base = isDark ? DARK_BASE : LIGHT_BASE;
  const towardText = (amount) => mixColors(bg, text, amount);
  const surface = isDark ? towardText(0.04) : mixColors(bg, '#ffffff', 0.8);
  const defaults = SCHEMES[0][isDark ? 'dark' : 'light'];

  return {
    ...base,
    bg,
    surface,
    'surface-raised': isDark ? towardText(0.08) : surface,
    'surface-hover': towardText(isDark ? 0.11 : 0.05),
    'surface-selected': mixColors(surface, primary, isDark ? 0.24 : 0.16),
    border: towardText(isDark ? 0.12 : 0.1),
    'border-strong': towardText(0.25),
    text,
    'text-muted': mixColors(text, bg, 0.3),
    'text-disabled': mixColors(text, bg, 0.48),
    primary,
    // Toward the text color is lighter on a dark page and darker on a light one,
    // so the strong shade stands out more either way.
    'primary-strong': mixColors(primary, text, 0.35),
    'primary-subtle': mixColors(bg, primary, isDark ? 0.22 : 0.15),
    'on-primary': isDarkColor(primary) ? '#ffffff' : '#0b0d12',
    accent,
    'accent-subtle': mixColors(bg, accent, isDark ? 0.2 : 0.14),
    'warning-subtle': mixColors(bg, base.warning, 0.15),
    'diff-added-bg': mixColors(bg, base.success, isDark ? 0.16 : 0.14),
    'diff-deleted-bg': mixColors(bg, base.danger, isDark ? 0.16 : 0.12),
    'diff-hunk-bg': mixColors(bg, primary, 0.08),
    ...graph(
      primary,
      accent,
      defaults['graph-3'],
      defaults['graph-4'],
      defaults['graph-5'],
      defaults['graph-6'],
    ),
  };
}

const findScheme = (id) => SCHEMES.find((scheme) => scheme.id === id);

const isKnownScheme = (id) => id === CUSTOM_SCHEME_ID || Boolean(findScheme(id));

/** Custom colors for both modes, with anything missing or invalid taken from the defaults. */
function normalizeCustom(custom) {
  return Object.fromEntries(
    MODES.map((mode) => [
      mode,
      Object.fromEntries(
        CUSTOM_COLORS.map(({ key }) => {
          const color = custom?.[mode]?.[key];
          const isValid = typeof color === 'string' && HEX_COLOR.test(color);
          return [key, isValid ? color.toLowerCase() : DEFAULT_CUSTOM_COLORS[mode][key]];
        }),
      ),
    ]),
  );
}

/** An appearance that is safe to apply: unknown schemes or modes fall back to the default. */
export function normalizeAppearance(appearance) {
  return {
    scheme: isKnownScheme(appearance?.scheme) ? appearance.scheme : DEFAULT_APPEARANCE.scheme,
    mode: MODES.includes(appearance?.mode) ? appearance.mode : DEFAULT_APPEARANCE.mode,
    custom: normalizeCustom(appearance?.custom),
  };
}

export function paletteOf(appearance) {
  const { scheme, mode, custom } = normalizeAppearance(appearance);
  if (scheme === CUSTOM_SCHEME_ID) return buildCustomPalette(custom[mode]);
  return findScheme(scheme)[mode];
}

/**
 * Whether an appearance shows light text on a dark page. A custom scheme goes by its
 * background, which may not match the mode it was picked for.
 */
export function isDarkAppearance(appearance) {
  const { scheme, mode, custom } = normalizeAppearance(appearance);
  return scheme === CUSTOM_SCHEME_ID ? isDarkColor(custom[mode].bg) : mode === 'dark';
}

/** Writes an appearance's colors onto the page, where every stylesheet picks them up. */
export function applyTheme(appearance) {
  const colorScheme = isDarkAppearance(appearance) ? 'dark' : 'light';
  const root = document.documentElement;
  for (const [name, value] of Object.entries(paletteOf(appearance))) {
    root.style.setProperty(`--color-${name}`, value);
  }
  root.style.colorScheme = colorScheme;
  root.dataset.mode = colorScheme;
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', colorScheme);
}
