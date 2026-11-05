import { countLabel, tr } from '@/localization/runtime';
import { useDirection } from '@/localization/provider';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText, Icon } from '@/components/ui/primitives';
import { PAPER_INK, PAPER_WHITE, PaperCard, useHandwriting } from '@/components/desk/paper-desk';
import { resolveBoardIcon } from '@/constants/board-appearance';
import { mix, noteColors, stableTilt } from '@/constants/style-tokens';
import { spacing } from '@/constants/theme';
import type { Board } from '@/db/types';
import { Reveal } from '@/features/onboarding/welcome/reveal';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';

type BoardSummary = Board & { columnCount: number; cardCount: number };
const revealedBoards = new Set<string>();

/** Getting Started's rounded paper and icon tile, in each board's own color. */
export const BoardListItem = memo(function BoardListItem({ board, onPress, entranceDelay }: { board: BoardSummary; onPress: () => void; entranceDelay?: number }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle, isRTL } = useDirection();
  const { tokens, styleTokens } = useTheme();
  const { handBold } = useHandwriting();
  const fonts = useWelcomeFonts();
  const [reveal] = useState(() => entranceDelay !== undefined && !revealedBoards.has(board.id));
  useEffect(() => { revealedBoards.add(board.id); }, [board.id]);
  const accent = board.accent ?? tokens.accent;
  const { cardTint: paper, cardInkMuted: muted } = noteColors(accent);
  const taped = stableTilt(`board:${board.id}:tape`, 1) > 0.1;
  const columns = countLabel('column', board.columnCount);
  const cards = countLabel('card', board.cardCount);
  const rounded = { borderRadius: styleTokens.button.radius };

  return <Reveal visible animate={reveal} delay={entranceDelay}>
    <PaperCard
      paper={paper}
      tape={taped}
      accessibilityRole="button"
      accessibilityLabel={`${board.name}. ${columns}. ${cards}.`}
      accessibilityHint={tr("boardlistitem.opensBoard")}
      onPress={onPress}
      style={[styles.card, rounded]}
    >
      <View style={[styles.row, rowStyle]}>
        <View style={[styles.tile, rounded, { backgroundColor: mix(paper, PAPER_WHITE, 0.55) }]}>
          <Icon name={resolveBoardIcon(board.icon)} size={19} color={mix(accent, PAPER_INK, 0.4)} />
        </View>
        <View style={styles.copy}>
          <AppText numberOfLines={2} style={[handBold, styles.name]}>{board.name}</AppText>
          <View style={[styles.metadata, rowStyle]}>
            <View style={[styles.stat, rowStyle]}><Icon name="reader-outline" size={12} color={muted} /><AppText family={fonts.text} style={[styles.detail, { color: muted }]}>{cards}</AppText></View>
            <View style={[styles.stat, rowStyle]}><Icon name="albums-outline" size={12} color={muted} /><AppText family={fonts.text} style={[styles.detail, { color: muted }]}>{columns}</AppText></View>
          </View>
        </View>
        <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={19} color={muted} />
      </View>
    </PaperCard>
  </Reveal>;
});

const styles = StyleSheet.create({
  card: { minHeight: 64, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  row: { alignItems: 'center', gap: spacing.sm },
  tile: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  name: { color: PAPER_INK, fontSize: 17, lineHeight: 22 },
  metadata: { flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 },
  stat: { alignItems: 'center', gap: 4, maxWidth: '100%' },
  detail: { flexShrink: 1, fontSize: 13, lineHeight: 17 },
});
