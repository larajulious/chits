import { Platform, type ColorSchemeName } from 'react-native';

const lightTokens = {
  background: '#FFFFFF', surface: '#F9F9F9', surfaceElevated: '#F0F0F0',
  textPrimary: '#0D0D0D', textSecondary: '#5D5D5D', textMuted: '#6E6E6E',
  borderSubtle: '#E5E5E5', accent: '#0D0D0D', danger: '#B53A35', success: '#36785B',
} as const;
const darkTokens = {
  background: '#121311', surface: '#1B1D1A', surfaceElevated: '#262925',
  textPrimary: '#F3F2EC', textSecondary: '#C6C7BF', textMuted: '#96988F',
  borderSubtle: '#363934', accent: '#4E8468', danger: '#EE8B82', success: '#68A982',
} as const;
export const tokens = lightTokens;

export const chatThemes = {
  light: { name: 'Light', light: { accent: '#0D0D0D', accentSoft: '#F0F0F0', accentStrong: '#0D0D0D', accentText: '#FFFFFF', accentBorder: '#D9D9D9' }, dark: { accent: '#ECECEC', accentSoft: '#303030', accentStrong: '#ECECEC', accentText: '#171717', accentBorder: '#606060' } },
  green: { name: 'Chits Green', light: { accent: '#3D6E5C', accentSoft: '#E5F0EA', accentStrong: '#2D5949', accentText: '#FFFFFF', accentBorder: '#93B7A5' }, dark: { accent: '#4E8468', accentSoft: '#1E3027', accentStrong: '#75A98A', accentText: '#FFFFFF', accentBorder: '#507460' } },
  blue: { name: 'Ocean Blue', light: { accent: '#3D6D9B', accentSoft: '#E6EFF7', accentStrong: '#2D557A', accentText: '#FFFFFF', accentBorder: '#94B5CF' }, dark: { accent: '#5F8EB8', accentSoft: '#1E2D3A', accentStrong: '#83AFD7', accentText: '#FFFFFF', accentBorder: '#597A98' } },
  indigo: { name: 'Indigo', light: { accent: '#5B5A9D', accentSoft: '#ECEBFA', accentStrong: '#45437B', accentText: '#FFFFFF', accentBorder: '#AAA9CF' }, dark: { accent: '#7A79BA', accentSoft: '#29283E', accentStrong: '#A5A3DC', accentText: '#FFFFFF', accentBorder: '#696895' } },
  orange: { name: 'Warm Orange', light: { accent: '#9A5E33', accentSoft: '#F8ECE3', accentStrong: '#7B4925', accentText: '#FFFFFF', accentBorder: '#D5AA8B' }, dark: { accent: '#C17C49', accentSoft: '#3B2920', accentStrong: '#E0A36F', accentText: '#FFFFFF', accentBorder: '#9A6948' } },
  rose: { name: 'Rose', light: { accent: '#A45E6E', accentSoft: '#F8E9ED', accentStrong: '#824656', accentText: '#FFFFFF', accentBorder: '#D9A4B0' }, dark: { accent: '#C2798A', accentSoft: '#3A252B', accentStrong: '#E3A4B1', accentText: '#FFFFFF', accentBorder: '#9C6874' } },
  neutral: { name: 'Neutral', light: { accent: '#5E6863', accentSoft: '#EAEEEB', accentStrong: '#454D49', accentText: '#FFFFFF', accentBorder: '#AAB3AE' }, dark: { accent: '#8D9992', accentSoft: '#282D2A', accentStrong: '#B2BDB6', accentText: '#121311', accentBorder: '#69736D' } },
} as const;
export type ChatThemeKey = keyof typeof chatThemes;
export type ThemeTokens = Record<keyof typeof lightTokens, string> & { accentSoft: string; accentStrong: string; accentText: string; accentBorder: string };
export function getThemeTokens(key: ChatThemeKey, scheme: ColorSchemeName): ThemeTokens { return { ...(scheme === 'dark' ? darkTokens : lightTokens), ...chatThemes[key][scheme === 'dark' ? 'dark' : 'light'] }; }

export type SemanticColor = keyof typeof tokens;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
  web: { sans: 'system-ui', rounded: 'system-ui', mono: 'monospace' },
});

export const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 24, xl: 32 } as const;
export const radii = { control: 12, compactCard: 16, contentCard: 18, pill: 999 } as const;
export const layout = { maxContentWidth: 720, minimumTouchTarget: 44 } as const;
