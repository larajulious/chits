import { useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { useStickySurface } from '@/components/ui/surface';
import { tintWithAccent } from '@/constants/board-appearance';
import { radii, spacing } from '@/constants/theme';

/** Distance between the paper's ruled lines; text on it uses this as its line height. */
export const PAPER_LINE = 22;

/**
 * A note's ruled paper — the page Card Details shows a card's content on:
 * blue rules, a red margin line, tinted with the board's accent (plain Chits
 * paper without one), a soft shadow in light mode and Sticky's edge. Shared
 * so every place a whole note is read looks like the same sheet of paper.
 */
export function NotePaper({ accent = null, minHeight = 200, style, children }: PropsWithChildren<{ accent?: string | null; minHeight?: number; style?: StyleProp<ViewStyle> }>) {
  const { tokens: theme, scheme, look, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  const [height, setHeight] = useState(0);
  const dark = scheme === 'dark';
  const paper = accent ? tintWithAccent(theme.cardBase, accent, dark ? 0.16 : 0.1) : theme.cardPaper;
  const edge = accent ? tintWithAccent(theme.borderSubtle, accent, dark ? 0.3 : 0.35) : theme.borderSubtle;
  const rules = Math.min(320, Math.max(0, Math.floor((Math.max(minHeight, height) - 58) / PAPER_LINE) + 1));
  return (
    <View
      onLayout={({ nativeEvent }) => {
        const next = Math.ceil(nativeEvent.layout.height);
        setHeight((current) => (current === next ? current : next));
      }}
      style={[
        styles.paper, { minHeight, backgroundColor: paper, borderColor: edge },
        !dark && [styles.shadow, { shadowOpacity: look.cardShadowOpacity }],
        sticky({ fill: styleColors.controlFill, radius: styleTokens.noteCard.radius, edge: styleTokens.noteCard.edge, edgeColor: accent ?? styleColors.outline }),
        style,
      ]}
    >
      <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
        {Array.from({ length: rules }, (_, index) => <View key={index} style={[styles.rule, { top: 46 + index * PAPER_LINE, backgroundColor: dark ? 'rgba(157,193,226,0.27)' : '#BCD2EA' }]} />)}
        <View style={[styles.margin, { backgroundColor: dark ? 'rgba(233,163,163,0.46)' : '#E9A3A3' }]} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { paddingTop: 24, paddingBottom: 28, paddingLeft: 46, paddingRight: spacing.md, borderRadius: radii.contentCard, borderWidth: StyleSheet.hairlineWidth },
  shadow: { shadowColor: '#000000', shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  rule: { position: 'absolute', left: 0, right: 0, height: 1 },
  margin: { position: 'absolute', top: 0, bottom: 0, left: 30, width: 1 },
});
