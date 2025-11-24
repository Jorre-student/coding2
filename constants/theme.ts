/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#7033ff';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

/**
 * Extended semantic design tokens inspired by the provided OKLCH-based web theme.
 * These are normalized to hex for React Native and tuned to match the existing light palette.
 * Dark set kept for possible future re-introduction of dark mode.
 */
export const SemanticColors = {
  light: {
    background: '#FFFFFF', // --background
    foreground: '#11181C', // --foreground
    card: '#FFFFFF', // --card
    cardForeground: '#11181C',
    popover: '#FDFDFD', // subtle off-white
    popoverForeground: '#11181C',
  primary: '#7033ff',
    primaryForeground: '#FFFFFF',
    secondary: '#F0F4F7', // soft neutral (from muted/secondary idea)
    secondaryForeground: '#1A1F23',
    muted: '#F5F7F9',
    mutedForeground: '#61707A',
    accent: '#DCEFFC', // very light accent panel
    accentForeground: '#0A5E7A',
    destructive: '#D93D3D',
    destructiveForeground: '#FFFFFF',
    border: '#E2E6E8',
    input: '#F2F5F7',
  ring: '#7033ff',
    sidebar: '#F8FAFB',
    sidebarForeground: '#11181C',
    sidebarAccent: '#EEF3F6',
    sidebarAccentForeground: '#11181C',
    sidebarBorder: '#E2E6E8',
  sidebarRing: '#7033ff',
    chart1: '#3FB37F',
  chart2: '#7033ff',
    chart3: '#E5A21A',
    chart4: '#5C6BC0',
    chart5: '#6D7781',
  },
  dark: {
    background: '#151718',
    foreground: '#ECEDEE',
    card: '#1A1D1E',
    cardForeground: '#ECEDEE',
    popover: '#1E2122',
    popoverForeground: '#ECEDEE',
    primary: '#4FB3FF',
    primaryForeground: '#0B0C0D',
    secondary: '#232628',
    secondaryForeground: '#ECEDEE',
    muted: '#26292B',
    mutedForeground: '#9BA1A6',
    accent: '#20323E',
    accentForeground: '#C2E8FF',
    destructive: '#FF5F56',
    destructiveForeground: '#0B0C0D',
    border: '#2E3335',
    input: '#2A2F30',
    ring: '#4FB3FF',
    sidebar: '#1A1D1E',
    sidebarForeground: '#ECEDEE',
    sidebarAccent: '#232628',
    sidebarAccentForeground: '#ECEDEE',
    sidebarBorder: '#2E3335',
    sidebarRing: '#4FB3FF',
    chart1: '#58D3A4',
    chart2: '#4FB3FF',
    chart3: '#D6A34E',
    chart4: '#7E8BCE',
    chart5: '#8A949C',
  },
};

/**
 * Shadow presets approximating the CSS variable shadows in the provided theme.
 * Use via: style={[styles.card, Shadows.light.sm]}
 */
export const Shadows = {
  light: {
    '2xs': { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    xs:   { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    sm:   { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    md:   { shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
    lg:   { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    xl:   { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    '2xl': { shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  },
  dark: {
    '2xs': { shadowColor: '#000', shadowOpacity: 0.30, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
    xs:   { shadowColor: '#000', shadowOpacity: 0.34, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    sm:   { shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    md:   { shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
    lg:   { shadowColor: '#000', shadowOpacity: 0.42, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    xl:   { shadowColor: '#000', shadowOpacity: 0.46, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
    '2xl': { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  },
};

/**
 * Border radii system matching provided CSS radius scale. Values converted to dp.
 */
export const Radii = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 24,
};

/**
 * Convenience accessor for current palette: always 'light' (forced) but kept generic.
 */
export function getSemanticColors(mode: 'light' | 'dark' = 'light') {
  return SemanticColors[mode];
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
