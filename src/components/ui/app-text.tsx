import { Children, isValidElement, type ReactNode } from 'react';
import { contentTextStyle, languageDirection, needsSystemFont } from '@/localization/text-layout';
import { useLocale } from '@/localization/provider';
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

function visibleText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{children?: ReactNode}>(child) ? visibleText(child.props.children) : '').join('');
}

const WEIGHTS: Record<string, FontWeight> = { normal: '400', bold: '700', 100: '400', 200: '400', 300: '400', 400: '400', 500: '500', 600: '600', 700: '700', 800: '800', 900: '800' };

/**
 * Text in the style's face. Without a `weight`, it uses the fontWeight the
 * style already asks for, so swapping Text for AppText never changes Classic.
 */
export function AppText({ variant = 'body', weight, style, ...props }: TextProps & { variant?: TextRole; weight?: FontWeight }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const locale = useLocale();
  const { styleTokens } = useTheme();
  const styled = !weight && styleTokens.font.body ? StyleSheet.flatten(style)?.fontWeight : undefined;
  const font = useFontStyle(variant, weight ?? (styled !== undefined ? WEIGHTS[String(styled)] : undefined));
  const text = visibleText(props.children);
  const flattened = StyleSheet.flatten(style);
  const bidi = contentTextStyle(text, languageDirection(locale));
  const scriptFont = needsSystemFont(text, locale) ? { fontFamily: undefined, includeFontPadding: true, ...(flattened?.fontSize ? { lineHeight: Math.max(flattened.lineHeight ?? 0, Math.ceil(flattened.fontSize * 1.5)) } : {}) } : {};
  return <Text {...props} accessibilityLanguage={props.accessibilityLanguage ?? locale} style={[bidi, style, font, scriptFont]} />;
}
