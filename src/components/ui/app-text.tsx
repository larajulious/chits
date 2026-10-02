import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import type { ChitsLook } from '@/constants/chits-themes';
import type { FontWeight, StyleTokens } from '@/constants/style-tokens';
import { headingFontFamily } from '@/constants/theme';

/**
 * title = screen titles (Classic: the theme's heading face and weight);
 * display = other headings; body = UI text; paragraph = longer prose.
 */
export type TextRole = 'title' | 'display' | 'body' | 'paragraph';

/**
 * The face for a role and weight. Classic sets only fontWeight (and the
 * theme's heading face for titles), exactly as screens did before; Sticky
 * picks the bundled family for that weight — one family per weight, since a
 * fontWeight on a custom family isn't reliable on Android.
 */
export function fontStyle(tokens: StyleTokens, look: ChitsLook, role: TextRole = 'body', weight?: FontWeight): TextStyle {
  const faces = role === 'title' ? tokens.font.display : tokens.font[role];
  if (faces) return { fontFamily: faces[weight ?? (role === 'title' ? '600' : '400')], fontWeight: 'normal' };
  if (role === 'title') return { fontWeight: look.headingWeight, fontFamily: headingFontFamily(look.headingFont) };
  return weight ? { fontWeight: weight } : {};
}

export function useFontStyle(role: TextRole = 'body', weight?: FontWeight): TextStyle {
  const { styleTokens, look } = useTheme();
  return fontStyle(styleTokens, look, role, weight);
}

const WEIGHTS: Record<string, FontWeight> = { normal: '400', bold: '700', 100: '400', 200: '400', 300: '400', 400: '400', 500: '500', 600: '600', 700: '700', 800: '800', 900: '800' };

/**
 * Text in the style's face. Without a `weight`, it uses the fontWeight the
 * style already asks for, so swapping Text for AppText never changes Classic.
 */
export function AppText({ variant = 'body', weight, style, ...props }: TextProps & { variant?: TextRole; weight?: FontWeight }) {
  const { styleTokens } = useTheme();
  const styled = !weight && styleTokens.font.body ? StyleSheet.flatten(style)?.fontWeight : undefined;
  const font = useFontStyle(variant, weight ?? (styled !== undefined ? WEIGHTS[String(styled)] : undefined));
  return <Text {...props} style={[style, font]} />;
}
