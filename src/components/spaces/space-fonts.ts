import { Platform, type TextStyle } from 'react-native';
import { useFonts } from 'expo-font';
import { fontStyle } from '@/components/ui/app-text';
import { useOptionalTheme } from '@/components/theme-provider';
import { BricolageGrotesque_400Regular } from '@expo-google-fonts/bricolage-grotesque/400Regular';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { Kalam_400Regular } from '@expo-google-fonts/kalam/400Regular';
import { SpaceMono_700Bold } from '@expo-google-fonts/space-mono/700Bold';

// Every face Spaces uses, bundled with the app (Open Font License) — nothing
// is fetched at runtime, so Spaces looks the same offline.
const FACES = { BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_800ExtraBold, Kalam_400Regular, SpaceMono_700Bold, Fredoka_700Bold };

export type SpaceFonts = {
  /** App-theme typography for interface text and headings. */
  ui: TextStyle; uiSemi: TextStyle; uiHeavy: TextStyle;
  /** Kalam: what's written on a note. */
  note: TextStyle;
  /** Space Mono Bold: label-maker tape and small caps labels. */
  label: TextStyle;
  /** Fredoka Bold: the fridge's alphabet magnets. */
  letters: TextStyle;
  ready: boolean;
};

const LOADED: SpaceFonts = {
  ui: { fontFamily: 'BricolageGrotesque_400Regular' },
  uiSemi: { fontFamily: 'BricolageGrotesque_600SemiBold' },
  uiHeavy: { fontFamily: 'BricolageGrotesque_800ExtraBold' },
  note: { fontFamily: 'Kalam_400Regular' },
  label: { fontFamily: 'SpaceMono_700Bold' },
  letters: { fontFamily: 'Fredoka_700Bold' },
  ready: true,
};
// The first frame or two, while the bundled files register: system faces in
// the nearest weight, never an unknown family name.
const FALLBACK: SpaceFonts = {
  ui: {}, uiSemi: { fontWeight: '600' }, uiHeavy: { fontWeight: '800' },
  note: {},
  label: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontWeight: '700' },
  letters: { fontWeight: '800' },
  ready: false,
};

/** Spaces' type, as styles to spread into a Text's style. */
export function useSpaceFonts(): SpaceFonts {
  const [loaded] = useFonts(FACES);
  const theme = useOptionalTheme();
  const fonts = loaded ? LOADED : FALLBACK;
  if (!theme) return fonts;
  return {
    ...fonts,
    ui: fontStyle(theme.styleTokens, theme.look, 'body', '400'),
    uiSemi: fontStyle(theme.styleTokens, theme.look, 'body', '600'),
    uiHeavy: fontStyle(theme.styleTokens, theme.look, 'title', '800'),
  };
}
