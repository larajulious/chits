import { countLabel, tr } from '@/localization/runtime';
import { useDirection } from '@/localization/provider';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { AppText, Icon } from '@/components/ui/primitives';
import { PAPER_INK, PAPER_WHITE, Tape, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { resolveBoardIcon } from '@/constants/board-appearance';
import { mix, noteColors, stableTilt } from '@/constants/style-tokens';
import type { Board } from '@/db/types';

type BoardSummary = Board & { columnCount: number; cardCount: number };
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

/**
 * A board on the desk: a paper in a pastel of the board's color with its name
 * handwritten and its icon on a round sticker. A board holding cards has a
 * second sheet peeking out behind it, like a small stack of notes. Each board
 * keeps one little tilt; pressing springs it down.
 */
export const BoardListItem = memo(function BoardListItem({ board, onPress }: { board: BoardSummary; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle, isRTL } = useDirection();
  const { tokens } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const reduceMotion = useReducedMotion();
  const accent = board.accent ?? tokens.accentStrong;
  const { cardTint: paper, cardInkMuted: muted } = noteColors(accent);
  const tilt = stableTilt(`board:${board.id}`, 0.9);
  const taped = stableTilt(`board:${board.id}:tape`, 1) > 0.1;
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt}deg` }, { scale: press.get() }] }));
  const columns = countLabel('column', board.columnCount);
  const cards = countLabel('card', board.cardCount);

  return <Animated.View style={pressStyle}>
    {board.cardCount > 0 ? <View pointerEvents="none" style={[styles.stack, { backgroundColor: mix(paper, PAPER_INK, 0.07), boxShadow: `0px 4px 8px ${desk.shadow}`, transform: [{ rotate: `${tilt > 0 ? -2.2 : 2.2}deg` }] }]} /> : null}
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${board.name}. ${columns}. ${cards}.`}
      accessibilityHint={tr("boardlistitem.opensBoard")}
      onPress={onPress}
      onPressIn={() => { if (!reduceMotion) press.set(withSpring(0.97, PRESS_SPRING)); }}
      onPressOut={() => press.set(withSpring(1, PRESS_SPRING))}
      style={({ pressed }) => [styles.card, rowStyle, { backgroundColor: paper, boxShadow: `0px ${pressed ? 2 : 6}px ${pressed ? 5 : 12}px ${desk.shadow}` }, reduceMotion && pressed && styles.reducedPressed]}
    >
      <View style={[styles.sticker, { boxShadow: `0px 2px 4px ${desk.shadow}` }]}>
        <Icon name={resolveBoardIcon(board.icon)} size={20} color={mix(accent, PAPER_INK, 0.4)} />
      </View>
      <View style={styles.copy}>
        <AppText numberOfLines={2} style={[handBold, styles.name]}>{board.name}</AppText>
        <View style={[styles.metadata, rowStyle]}>
          <View style={[styles.stat, rowStyle]}><Icon name="reader-outline" size={13} color={muted} /><AppText style={[styles.detail, { color: muted }]}>{cards}</AppText></View>
          <View style={[styles.stat, rowStyle]}><Icon name="albums-outline" size={13} color={muted} /><AppText style={[styles.detail, { color: muted }]}>{columns}</AppText></View>
        </View>
      </View>
      <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={17} color={muted} />
    </Pressable>
    {taped ? <Tape width={60} angle={stableTilt(`board:${board.id}:tape-angle`, 5)} /> : null}
  </Animated.View>;
});

const styles = StyleSheet.create({
  stack: { ...StyleSheet.absoluteFill, borderRadius: 3 },
  card: { minHeight: 76, alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 3 },
  reducedPressed: { opacity: 0.82 },
  sticker: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0, backgroundColor: PAPER_WHITE },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: PAPER_INK, fontSize: 21, lineHeight: 27 },
  metadata: { flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
  stat: { alignItems: 'center', gap: 4, maxWidth: '100%' },
  detail: { flexShrink: 1, fontSize: 12, lineHeight: 17 },
});
