import { countLabel, tr } from '@/localization/runtime';
import { useDirection } from '@/localization/provider';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText, Icon, PressableSurface, Surface } from '@/components/ui/primitives';
import { resolveBoardIcon, tintWithAccent } from '@/constants/board-appearance';
import { radii, spacing } from '@/constants/theme';
import type { Board } from '@/db/types';

type BoardSummary = Board & { columnCount: number; cardCount: number };

export const BoardListItem = memo(function BoardListItem({ board, onPress }: { board: BoardSummary; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const { tokens, styleTokens, scheme } = useTheme();
  const dark = scheme === 'dark';
  const accent = board.accent ?? tokens.accentStrong;
  const fill = tintWithAccent(dark ? tokens.surface : tokens.cardPaper, accent, dark ? 0.08 : 0.025);
  const border = tintWithAccent(tokens.borderSubtle, accent, 0.2);
  const iconFill = tintWithAccent(dark ? tokens.surface : tokens.cardBase, accent, dark ? 0.24 : 0.12);
  const iconInk = dark ? tintWithAccent(tokens.textPrimary, accent, 0.25) : accent;
  const columns = countLabel('column', board.columnCount);
  const cards = countLabel('card', board.cardCount);

  return <PressableSurface
    accessibilityRole="button"
    accessibilityLabel={`${board.name}. ${columns}. ${cards}.`}
    accessibilityHint={tr("boardlistitem.opensBoard")}
    onPress={onPress}
    fill={fill}
    border={border}
    radius={radii.compactCard}
    outline={1}
    outlineColor={border}
    edge={styleTokens.elevation === 'edge' ? 2 : false}
    edgeColor={border}
    shadow={dark ? false : 'card'}
    pressedStyle={styles.pressed}
    style={[styles.card, rowStyle, { borderWidth: 1, borderColor: border }]}
  >
    <View pointerEvents="none" style={[styles.accentRail, { backgroundColor: accent }]} />
    <Surface fill={iconFill} radius={styleTokens.radius.control} outline={false} edge={false} style={styles.mark}>
      <Icon name={resolveBoardIcon(board.icon)} size={20} color={iconInk} />
    </Surface>
    <View style={styles.copy}>
      <AppText variant="display" weight="700" numberOfLines={2} style={[styles.name, { color: tokens.textPrimary }]}>{board.name}</AppText>
      <View style={[styles.metadata, rowStyle]}>
        <View style={styles.stat}><Icon name="reader-outline" size={13} color={tokens.textMuted} /><AppText style={[styles.detail, { color: tokens.textSecondary }]}>{cards}</AppText></View>
        <View style={styles.stat}><Icon name="albums-outline" size={13} color={tokens.textMuted} /><AppText style={[styles.detail, { color: tokens.textSecondary }]}>{columns}</AppText></View>
      </View>
    </View>
    <Icon name="chevron-forward" size={17} color={tokens.textMuted} />
  </PressableSurface>;
});

const styles = StyleSheet.create({
  card: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.sm, paddingVertical: 10 },
  accentRail: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 3 },
  mark: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 16, lineHeight: 22 },
  metadata: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm, rowGap: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  detail: { flexShrink: 1, fontSize: 12, lineHeight: 17 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
