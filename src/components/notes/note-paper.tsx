import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { useStickySurface } from '@/components/ui/surface';
import { radii, spacing } from '@/constants/theme';

/** Kept for existing readers' text metrics; the surface no longer draws rules. */
export const PAPER_LINE = 22;

/** Shared neutral note surface for Card Details and Calendar's note preview. */
export function NotePaper({ accent = null, minHeight = 200, style, children }: PropsWithChildren<{ accent?: string | null; minHeight?: number; style?: StyleProp<ViewStyle> }>) {
  const { tokens: theme, scheme, look, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  return (
    <View style={[
      styles.surface, { minHeight, backgroundColor: styleColors.controlFill, borderColor: theme.borderSubtle },
      scheme !== 'dark' && [styles.shadow, { shadowOpacity: look.cardShadowOpacity }],
      sticky({ fill: styleColors.controlFill, radius: styleTokens.noteCard.radius, edge: styleTokens.noteCard.edge, edgeColor: accent ?? styleColors.outline }),
      style,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { paddingTop: 24, paddingBottom: 28, paddingHorizontal: spacing.md, borderRadius: radii.contentCard, borderWidth: StyleSheet.hairlineWidth },
  shadow: { shadowColor: '#000000', shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
});
