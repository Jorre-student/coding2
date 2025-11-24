/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { getDesignTokens } from '@/constants/design-tokens';
import { Colors } from '@/constants/theme';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  const theme = 'light'; // forced light mode
  const colorFromProps = props[theme];
  if (colorFromProps) return colorFromProps;
  // Map legacy colorName to design tokens where possible
  const tokens = getDesignTokens(theme);
  const mapping: Record<string, string> = {
    background: tokens.background,
    text: tokens.foreground,
    tint: tokens.primary,
    icon: tokens.foreground,
    tabIconDefault: tokens.mutedForeground,
    tabIconSelected: tokens.primary,
  };
  return mapping[colorName] || Colors[theme][colorName];
}
