import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useSpaceFonts } from './space-fonts';

const VARIANTS = {
  dark: { gradient: 'linear-gradient(180deg, #2B2D34, #15161A)', text: '#F4F2EC' },
  red: { gradient: 'linear-gradient(180deg, #C8391B, #A22C12)', text: '#FFF4EE' },
} as const;
const SIZES = {
  sm: { fontSize: 10, lineHeight: 13, paddingHorizontal: 7, paddingVertical: 3 },
  md: { fontSize: 12, lineHeight: 16, paddingHorizontal: 9, paddingVertical: 4 },
  lg: { fontSize: 15, lineHeight: 19, paddingHorizontal: 12, paddingVertical: 6 },
} as const;

type Props = {
  text: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Degrees; label tape is never stuck on quite straight. */
  rotation?: number;
  /** Scales everything (previews, exports). */
  unit?: number;
  style?: StyleProp<ViewStyle>;
  /** Decorative uses (e.g. an image's tag) stay out of the accessibility tree. */
  decorative?: boolean;
};

/**
 * Label-maker tape: embossed, uppercase Space Mono on a glossy strip. The
 * words are real text (readable by screen readers); the emboss highlight is a
 * hidden copy one point lower.
 */
export const LabelTape = memo(function LabelTape({ text, variant = 'dark', size = 'md', rotation = -2, unit = 1, style, decorative = false }: Props) {
  const fonts = useSpaceFonts();
  const colors = VARIANTS[variant];
  const metrics = SIZES[size];
  const label = text.toUpperCase();
  const type = { fontSize: metrics.fontSize * unit, lineHeight: metrics.lineHeight * unit, letterSpacing: metrics.fontSize * 0.18 * unit };
  return <View
    accessible={!decorative}
    accessibilityElementsHidden={decorative}
    importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    style={[styles.tape, {
      paddingHorizontal: metrics.paddingHorizontal * unit, paddingVertical: metrics.paddingVertical * unit, borderRadius: 2.5 * unit,
      experimental_backgroundImage: colors.gradient,
      boxShadow: `0px ${1.5 * unit}px ${2.5 * unit}px rgba(0,0,0,0.35)`,
      transform: [{ rotate: `${rotation}deg` }],
    }, style]}
  >
    {/* Emboss: a faint light edge one point below the letters… */}
    <Text accessible={false} importantForAccessibility="no" numberOfLines={1} style={[fonts.label, type, styles.highlight, { top: (metrics.paddingVertical + 1) * unit, left: metrics.paddingHorizontal * unit }]}>{label}</Text>
    {/* …and a dark edge one point above. */}
    <Text numberOfLines={1} style={[fonts.label, type, { color: colors.text, textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: -1 * unit }, textShadowRadius: 0 }]}>{label}</Text>
  </View>;
});

const styles = StyleSheet.create({
  tape: { alignSelf: 'flex-start' },
  highlight: { position: 'absolute', color: 'rgba(255,255,255,0.14)' },
});
