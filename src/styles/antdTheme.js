import { theme } from 'antd';
import { CssTokenHelper } from './CssTokenHelper.js';
import { isDarkAppearance, paletteOf } from './themes.js';

/**
 * Builds the Ant Design theme for an appearance, from its palette in themes.js and the
 * other tokens in tokens.css, so those files stay the single source of truth.
 * Call it after the stylesheets have loaded.
 */
export function createAntdTheme(appearance) {
  const isDark = isDarkAppearance(appearance);
  const palette = paletteOf(appearance);
  const color = (name) => palette[name.replace(/^--color-/, '')];
  const shadow = `0 8px 24px ${palette.shadow}`;

  const text = color('--color-text');
  const textMuted = color('--color-text-muted');
  const textDisabled = color('--color-text-disabled');
  const surfaceRaised = color('--color-surface-raised');
  const surfaceHover = color('--color-surface-hover');
  const surfaceSelected = color('--color-surface-selected');
  const onPrimary = color('--color-on-primary');

  return {
    algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: color('--color-primary'),
      colorInfo: color('--color-primary'),
      colorLink: color('--color-primary-strong'),
      colorSuccess: color('--color-success'),
      colorWarning: color('--color-warning'),
      colorError: color('--color-danger'),

      colorBgBase: color('--color-bg'),
      colorBgLayout: color('--color-bg'),
      colorBgContainer: color('--color-surface'),
      colorBgElevated: surfaceRaised,
      colorBorder: color('--color-border-strong'),
      colorBorderSecondary: color('--color-border'),

      // Ant fades text with opacity by default. Solid colors read more clearly.
      colorTextBase: text,
      colorText: text,
      colorTextHeading: text,
      colorTextSecondary: textMuted,
      colorTextTertiary: textMuted,
      colorTextDescription: textMuted,
      colorTextPlaceholder: textMuted,
      colorTextQuaternary: textDisabled,
      colorTextDisabled: textDisabled,
      colorIcon: textMuted,
      colorIconHover: text,

      controlItemBgHover: surfaceHover,
      controlItemBgActive: surfaceSelected,
      controlItemBgActiveHover: surfaceSelected,

      boxShadow: shadow,
      boxShadowSecondary: shadow,

      borderRadiusSM: CssTokenHelper.readPixels('--radius-sm'),
      borderRadius: CssTokenHelper.readPixels('--radius-md'),
      borderRadiusLG: CssTokenHelper.readPixels('--radius-lg'),

      fontFamily: CssTokenHelper.read('--font-sans'),
      fontFamilyCode: CssTokenHelper.read('--font-mono'),
      fontSize: CssTokenHelper.readPixels('--font-size-md'),
    },
    components: {
      Button: {
        // The dark algorithm would otherwise dim the primary color from the palette.
        colorPrimary: color('--color-primary'),
        colorPrimaryHover: color('--color-primary-strong'),
        colorPrimaryActive: color('--color-primary'),
        // Each palette picks the text color that reads best on its primary color.
        primaryColor: onPrimary,
        dangerColor: onPrimary,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Segmented: {
        trackBg: color('--color-bg'),
        itemSelectedBg: surfaceSelected,
        itemSelectedColor: text,
        itemColor: textMuted,
      },
      Tooltip: {
        colorBgSpotlight: surfaceRaised,
        colorTextLightSolid: text,
      },
    },
  };
}
