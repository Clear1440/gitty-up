import { describe, expect, it } from 'vitest';
import {
  CUSTOM_SCHEME_ID,
  DEFAULT_APPEARANCE,
  DEFAULT_CUSTOM_COLORS,
  SCHEMES,
  SYSTEM_MODE,
  isDarkAppearance,
  mixColors,
  normalizeAppearance,
  paletteOf,
} from './themes.js';

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const expectedKeys = Object.keys(SCHEMES[0].dark).sort();

describe('color schemes', () => {
  it.each(SCHEMES.flatMap((scheme) => ['dark', 'light'].map((mode) => [scheme.id, mode])))(
    '%s %s sets every token, in hex',
    (scheme, mode) => {
      const palette = paletteOf({ scheme, mode });
      expect(Object.keys(palette).sort()).toEqual(expectedKeys);
      for (const value of Object.values(palette)) expect(value).toMatch(HEX);
    },
  );

  it('has unique ids', () => {
    expect(new Set(SCHEMES.map((scheme) => scheme.id)).size).toBe(SCHEMES.length);
  });

  it('keeps the system mode, and shows the dark palette where the OS cannot be asked', () => {
    expect(normalizeAppearance({ scheme: 'coral', mode: SYSTEM_MODE }).mode).toBe(SYSTEM_MODE);
    expect(paletteOf({ scheme: 'coral', mode: SYSTEM_MODE })).toEqual(
      paletteOf({ scheme: 'coral', mode: 'dark' }),
    );
    expect(isDarkAppearance({ scheme: 'coral', mode: SYSTEM_MODE })).toBe(true);
  });

  it('falls back to the default for anything unknown', () => {
    expect(normalizeAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ scheme: 'gone', mode: 'dim' })).toEqual(DEFAULT_APPEARANCE);
    expect(normalizeAppearance({ scheme: 'coral', mode: 'light' })).toMatchObject({
      scheme: 'coral',
      mode: 'light',
      custom: DEFAULT_CUSTOM_COLORS,
    });
    const halfValid = normalizeAppearance({ custom: { dark: { bg: '#ABCDEF', text: 'nope' } } });
    expect(halfValid.custom.dark).toEqual({
      ...DEFAULT_CUSTOM_COLORS.dark,
      bg: '#abcdef',
    });
  });
});

describe('custom scheme', () => {
  const custom = (dark, light = DEFAULT_CUSTOM_COLORS.light) => ({
    scheme: CUSTOM_SCHEME_ID,
    mode: 'dark',
    custom: { dark, light },
  });

  it.each([
    ['dark', { bg: '#101418', text: '#f0f0f0', primary: '#ff7700', accent: '#33ccff' }],
    ['light', { bg: '#fbf8f2', text: '#1d1a16', primary: '#2255cc', accent: '#aa3377' }],
  ])('builds every token, in hex, from a %s background', (_label, colors) => {
    const palette = paletteOf(custom(colors));
    expect(Object.keys(palette).sort()).toEqual(expectedKeys);
    for (const value of Object.values(palette)) expect(value).toMatch(HEX);
    expect(palette).toMatchObject(colors);
  });

  it('goes by the background, not the mode, for light or dark', () => {
    const lightOnDarkMode = custom({ ...DEFAULT_CUSTOM_COLORS.dark, bg: '#ffffff', text: '#000000' });
    expect(isDarkAppearance(lightOnDarkMode)).toBe(false);
    expect(isDarkAppearance(custom(DEFAULT_CUSTOM_COLORS.dark))).toBe(true);
  });

  it('puts readable text on the primary color', () => {
    const onYellow = paletteOf(custom({ ...DEFAULT_CUSTOM_COLORS.dark, primary: '#ffe14d' }));
    const onNavy = paletteOf(custom({ ...DEFAULT_CUSTOM_COLORS.dark, primary: '#1a2a6c' }));
    expect(onYellow['on-primary']).toBe('#0b0d12');
    expect(onNavy['on-primary']).toBe('#ffffff');
  });

  it('mixes colors in a straight line', () => {
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#102030', '#102030', 0.3)).toBe('#102030');
  });
});
