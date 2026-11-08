import { theme } from 'antd';
import { CssTokenHelper } from './CssTokenHelper.js';

/**
 * Builds the Ant Design theme from tokens.css, so that file stays the single source
 * of truth. Call it after the stylesheets have loaded.
 */
export function createAntdTheme() {
  const text = CssTokenHelper.read('--color-text');
  const textMuted = CssTokenHelper.read('--color-text-muted');
  const textDisabled = CssTokenHelper.read('--color-text-disabled');
  const surfaceRaised = CssTokenHelper.read('--color-surface-raised');
  const surfaceHover = CssTokenHelper.read('--color-surface-hover');
  const surfaceSelected = CssTokenHelper.read('--color-surface-selected');
  const onPrimary = CssTokenHelper.read('--color-on-primary');

  return {
    algorithm: theme.darkAlgorithm,
    token: {
      colorPrimary: CssTokenHelper.read('--color-primary'),
      colorInfo: CssTokenHelper.read('--color-primary'),
      colorLink: CssTokenHelper.read('--color-primary-strong'),
      colorSuccess: CssTokenHelper.read('--color-success'),
      colorWarning: CssTokenHelper.read('--color-warning'),
      colorError: CssTokenHelper.read('--color-danger'),

      colorBgBase: CssTokenHelper.read('--color-bg'),
      colorBgLayout: CssTokenHelper.read('--color-bg'),
      colorBgContainer: CssTokenHelper.read('--color-surface'),
      colorBgElevated: surfaceRaised,
      colorBorder: CssTokenHelper.read('--color-border-strong'),
      colorBorderSecondary: CssTokenHelper.read('--color-border'),

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

      boxShadow: CssTokenHelper.read('--shadow-popup'),
      boxShadowSecondary: CssTokenHelper.read('--shadow-popup'),

      borderRadiusSM: CssTokenHelper.readPixels('--radius-sm'),
      borderRadius: CssTokenHelper.readPixels('--radius-md'),
      borderRadiusLG: CssTokenHelper.readPixels('--radius-lg'),

      fontFamily: CssTokenHelper.read('--font-sans'),
      fontFamilyCode: CssTokenHelper.read('--font-mono'),
      fontSize: CssTokenHelper.readPixels('--font-size-md'),
    },
    components: {
      Button: {
        // The dark algorithm would otherwise dim the primary color from tokens.css.
        colorPrimary: CssTokenHelper.read('--color-primary'),
        colorPrimaryHover: CssTokenHelper.read('--color-primary-strong'),
        colorPrimaryActive: CssTokenHelper.read('--color-primary'),
        // White on this blue is hard to read, so filled buttons use dark text.
        primaryColor: onPrimary,
        dangerColor: onPrimary,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Segmented: {
        trackBg: CssTokenHelper.read('--color-bg'),
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
