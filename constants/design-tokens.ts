// Design tokens derived from provided OKLCH CSS variables.
// React Native lacks direct OKLCH support; we convert to hex using culori at runtime.
// @ts-ignore - culori lacks TypeScript declarations.
import * as culori from 'culori';

const { converter, parse } = culori as any;
const toHex = converter('hex');

type RawMap = Record<string, string>;

const lightRaw: RawMap = {
  background: 'oklch(0.9940 0 0)',
  foreground: 'oklch(0 0 0)',
  card: 'oklch(0.9940 0 0)',
  cardForeground: 'oklch(0 0 0)',
  popover: 'oklch(0.9911 0 0)',
  popoverForeground: 'oklch(0 0 0)',
  // Updated to explicit hex per user request (#7033ff)
  primary: '#7033ff',
  primaryForeground: 'oklch(1 0 0)',
  secondary: 'oklch(0.9540 0.0063 255.4755)',
  secondaryForeground: 'oklch(0.1344 0 0)',
  muted: 'oklch(0.9702 0 0)',
  mutedForeground: 'oklch(0.4386 0 0)',
  accent: 'oklch(0.9393 0.0288 266.3680)',
  accentForeground: 'oklch(0.5445 0.1903 259.4848)',
  destructive: 'oklch(0.6290 0.1902 23.0704)',
  destructiveForeground: 'oklch(1 0 0)',
  border: 'oklch(0.9300 0.0094 286.2156)',
  input: 'oklch(0.9401 0 0)',
  ring: 'oklch(0 0 0)',
  chart1: 'oklch(0.7459 0.1483 156.4499)',
  chart2: 'oklch(0.5393 0.2713 286.7462)',
  chart3: 'oklch(0.7336 0.1758 50.5517)',
  chart4: 'oklch(0.5828 0.1809 259.7276)',
  chart5: 'oklch(0.5590 0 0)',
  sidebar: 'oklch(0.9777 0.0051 247.8763)',
  sidebarForeground: 'oklch(0 0 0)',
  sidebarPrimary: 'oklch(0 0 0)',
  sidebarPrimaryForeground: 'oklch(1 0 0)',
  sidebarAccent: 'oklch(0.9401 0 0)',
  sidebarAccentForeground: 'oklch(0 0 0)',
  sidebarBorder: 'oklch(0.9401 0 0)',
  sidebarRing: 'oklch(0 0 0)',
};

const darkRaw: RawMap = {
  background: 'oklch(0.2223 0.0060 271.1393)',
  foreground: 'oklch(0.9551 0 0)',
  card: 'oklch(0.2568 0.0076 274.6528)',
  cardForeground: 'oklch(0.9551 0 0)',
  popover: 'oklch(0.2568 0.0076 274.6528)',
  popoverForeground: 'oklch(0.9551 0 0)',
  primary: 'oklch(0.6132 0.2294 291.7437)',
  primaryForeground: 'oklch(1 0 0)',
  secondary: 'oklch(0.2940 0.0130 272.9312)',
  secondaryForeground: 'oklch(0.9551 0 0)',
  muted: 'oklch(0.2940 0.0130 272.9312)',
  mutedForeground: 'oklch(0.7058 0 0)',
  accent: 'oklch(0.2795 0.0368 260.0310)',
  accentForeground: 'oklch(0.7857 0.1153 246.6596)',
  destructive: 'oklch(0.7106 0.1661 22.2162)',
  destructiveForeground: 'oklch(1 0 0)',
  border: 'oklch(0.3289 0.0092 268.3843)',
  input: 'oklch(0.3289 0.0092 268.3843)',
  ring: 'oklch(0.6132 0.2294 291.7437)',
  chart1: 'oklch(0.8003 0.1821 151.7110)',
  chart2: 'oklch(0.6132 0.2294 291.7437)',
  chart3: 'oklch(0.8077 0.1035 19.5706)',
  chart4: 'oklch(0.6691 0.1569 260.1063)',
  chart5: 'oklch(0.7058 0 0)',
  sidebar: 'oklch(0.2011 0.0039 286.0396)',
  sidebarForeground: 'oklch(0.9551 0 0)',
  sidebarPrimary: 'oklch(0.6132 0.2294 291.7437)',
  sidebarPrimaryForeground: 'oklch(1 0 0)',
  sidebarAccent: 'oklch(0.2940 0.0130 272.9312)',
  sidebarAccentForeground: 'oklch(0.6132 0.2294 291.7437)',
  sidebarBorder: 'oklch(0.3289 0.0092 268.3843)',
  sidebarRing: 'oklch(0.6132 0.2294 291.7437)',
};

function toHexSafe(v: string, fallback: string) {
  try {
    const p = parse(v);
    return (p && toHex(p)) || fallback;
  } catch {
    return fallback;
  }
}

function convert(raw: RawMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(raw)) {
    const isFg = /foreground$/.test(key) || key === 'foreground';
    const value = raw[key].trim();
    if (/^#([0-9a-fA-F]{3,8})$/.test(value)) {
      out[key] = value.toLowerCase();
      continue;
    }
    out[key] = toHexSafe(value, isFg ? '#000000' : '#ffffff');
  }
  return out;
}

export const tokens = {
  light: convert(lightRaw),
  dark: convert(darkRaw),
  raw: { light: lightRaw, dark: darkRaw },
};

export type Mode = 'light' | 'dark';
export function getDesignTokens(mode: Mode = 'light') {
  return tokens[mode];
}

// Shadow scale approximations
export const shadows = {
  '2xs': { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 2, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  xs: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  sm: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  md: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  lg: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 6, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  xl: { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  '2xl': { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
};

// Radius scale (1.4rem ~ 22.4px baseline)
export const radius = {
  base: 22,
  sm: 18,
  md: 20,
  lg: 22,
  xl: 26,
};

// Typography tokens (fonts must be loaded separately; currently not bundled)
export const typography = {
  // Google font family names as loaded via @expo-google-fonts packages
  fontSansRegular: 'PlusJakartaSans_400Regular',
  fontSansMedium: 'PlusJakartaSans_500Medium',
  fontSansSemiBold: 'PlusJakartaSans_600SemiBold',
  // Aliases for backward compatibility
  fontSans: 'PlusJakartaSans_400Regular',
  fontSerifRegular: 'Lora_400Regular',
  fontSerif: 'Lora_400Regular',
  fontMonoRegular: 'IBMPlexMono_400Regular',
  fontMono: 'IBMPlexMono_400Regular',
  trackingNormal: -0.025, // multiply by fontSize for letterSpacing
};
