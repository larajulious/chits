import type { ReactNode } from 'react';
import { StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { noteColors, stableTilt, type NoteColors } from '@/constants/style-tokens';
import { AppText } from './app-text';
import { PressableSurface, surfaceStyle } from './surface';

/** A Sticky note's colors: its board's accent when it has one, else the palette's. */
export function useNoteColors(accent: string | null | undefined): NoteColors {
  const { styleColors } = useTheme();
  return accent ? noteColors(accent) : styleColors;
}

/**
 * A note as paper. Classic: the paper and hairline the caller passes, with a
 * soft lift on light pages. Sticky: tinted paper with a solid bottom edge, a
 * strip of tape at the top (a small angle that stays put for this note) and
 * a folded corner. `tilt` lets boards set the note itself slightly askew;
 * lists keep notes straight.
 */
export function NoteCard({ id, accent, paper, border, tilt = false, children, style, ...props }: Omit<PressableProps, 'style' | 'children'> & {
  id: string;
  /** The note's board color, if any. */
  accent?: string | null;
  /** Classic paper and hairline. */
  paper: string; border: string;
  tilt?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { styleTokens: t, styleColors, scheme, look, tokens } = useTheme();
  const colors = useNoteColors(accent);
  const sticky = t.card.tinted;
  const padding = { paddingTop: t.noteCard.padding.top, paddingHorizontal: t.noteCard.padding.horizontal, paddingBottom: t.noteCard.padding.bottom };
  const card = <PressableSurface
    {...props}
    fill={sticky ? colors.cardTint : paper}
    radius={t.noteCard.radius}
    border={border}
    outline={false}
    shadow={scheme === 'dark' ? false : { ...t.shadow.card, opacity: look.cardShadowOpacity }}
    edge={t.noteCard.edge || false}
    edgeColor={colors.cardEdge}
    pressedStyle={styles.classicPressed}
    style={[styles.note, padding, style]}
  >
    {children}
    {t.card.fold ? <View pointerEvents="none" style={[styles.fold, { borderTopWidth: t.fold, borderRightWidth: t.fold, borderTopColor: colors.cardEdge, borderRightColor: tokens.background }]} /> : null}
  </PressableSurface>;
  if (!t.card.tape && !tilt) return card;
  const tape = t.tape;
  return <View style={tilt && t.card.tilt ? { transform: [{ rotate: `${stableTilt(`${id}:note`, t.card.tilt)}deg` }] } : undefined}>
    {card}
    {t.card.tape ? <View
      pointerEvents="none"
      style={[styles.tape, {
        top: -tape.overhang, width: tape.width, height: tape.height, marginLeft: -tape.width / 2, borderRadius: tape.radius,
        ...surfaceStyle(t, styleColors, { fill: colors.cardEdge, outline: false, edge: tape.edge, edgeColor: colors.tapeEdge }),
        transform: [{ rotate: `${stableTilt(id, tape.maxAngle)}deg` }],
      }]}
    /> : null}
  </View>;
}

/**
 * Where a note lives. Classic: quiet text. Sticky: a small white pill with an
 * ink outline, readable on any note color.
 */
export function NoteCategory({ label, color }: { label: string; color: string }) {
  const { styleTokens: t, styleColors } = useTheme();
  if (!t.noteCard.pillOutline) return <AppText numberOfLines={1} weight="600" style={[styles.location, { color, fontSize: t.noteCard.pillSize }]}>{label}</AppText>;
  return <View style={[styles.pill, { borderWidth: t.noteCard.pillOutline, borderColor: styleColors.cardInk, borderRadius: t.noteCard.pillRadius }]}>
    <AppText numberOfLines={1} weight="800" style={{ color: styleColors.cardInk, fontSize: t.noteCard.pillSize }}>{label}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  note: { minWidth: 0 },
  classicPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  fold: { position: 'absolute', right: 0, bottom: 0, width: 0, height: 0 },
  tape: { position: 'absolute', left: '50%' },
  location: { flexShrink: 1 },
  pill: { flexShrink: 1, alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, backgroundColor: '#FFFFFF' },
});
