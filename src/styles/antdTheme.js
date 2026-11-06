import { theme } from 'antd';
import { readPixels, readToken } from './readToken.js';

/**
 * Builds the Ant Design theme from tokens.css, so that file stays the single source
 * of truth. Call it after the stylesheets have loaded.
 */
export function createAntdTheme() {
  const text = readToken('--color-text');
  const textMuted = readToken('--color-text-muted');
  const textDisabled = readToken('--color-text-disabled');
  const surfaceRaised = readToken('--color-surface-raised');
  const surfaceHover = readToken('--color-surface-hover');
  const surfaceSelected = readToken('--color-surface-selected');
  const onPrimary = readToken('--color-on-primary');

  return {
    algorithm: theme.darkAlgorithm,
    token: {
      colorPrimary: readToken('--color-primary'),
      colorInfo: readToken('--color-primary'),
      colorLink: readToken('--color-primary-strong'),
      colorSuccess: readToken('--color-success'),
      colorWarning: readToken('--color-warning'),
      colorError: readToken('--color-danger'),

      colorBgBase: readToken('--color-bg'),
      colorBgLayout: readToken('--color-bg'),
      colorBgContainer: readToken('--color-surface'),
      colorBgElevated: surfaceRaised,
      colorBorder: readToken('--color-border-strong'),
      colorBorderSecondary: readToken('--color-border'),

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

      boxShadow: readToken('--shadow-popup'),
      boxShadowSecondary: readToken('--shadow-popup'),

      borderRadiusSM: readPixels('--radius-sm'),
      borderRadius: readPixels('--radius-md'),
      borderRadiusLG: readPixels('--radius-lg'),

      fontFamily: readToken('--font-sans'),
      fontFamilyCode: readToken('--font-mono'),
      fontSize: readPixels('--font-size-md'),
    },
    components: {
      Button: {
        // The dark algorithm would otherwise dim the primary color from tokens.css.
        colorPrimary: readToken('--color-primary'),
        colorPrimaryHover: readToken('--color-primary-strong'),
        colorPrimaryActive: readToken('--color-primary'),
        // White on this blue is hard to read, so filled buttons use dark text.
        primaryColor: onPrimary,
        dangerColor: onPrimary,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Segmented: {
        trackBg: readToken('--color-bg'),
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
