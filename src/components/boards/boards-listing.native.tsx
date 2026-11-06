import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { AppText, Button, EmptyState, Icon } from '@/components/ui/primitives';
import { DeskHeading, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PaperCard, useDesk } from '@/components/desk/paper-desk';
import { spacing } from '@/constants/theme';
import type { Board } from '@/db/types';
import { Reveal } from '@/features/onboarding/welcome/reveal';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { countLabel, tr } from '@/localization/runtime';
import { BoardListItem } from './board-list-item.native';
import { BoardsMascotHero } from './boards-mascot-hero.native';

type BoardSummary = Board & { columnCount: number; cardCount: number };
let boardsRevealedThisLaunch = false;
const pluralize = (count: number, singular: string) => countLabel(singular, count);

/** The existing board actions, presented on Chits' compact desk. No data writes. */
export function BoardsListing({ boards, unorganizedCount, onBoard, onUnorganized, onCreate, bottomInset, footer }: {
  boards: BoardSummary[];
  unorganizedCount: number;
  onBoard: (id: string) => void;
  onUnorganized: () => void;
  onCreate: () => void;
  bottomInset: number;
  footer?: ReactNode;
}) {
  useLocale();
  const { scheme } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const { rowStyle, isRTL } = useDirection();
  const dimensions = useWindowDimensions();
  const [width, setWidth] = useState(dimensions.width);
  const [revealBoards, setRevealBoards] = useState(() => !boardsRevealedThisLaunch);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => { scrollY.set(event.contentOffset.y); });
  const boardSurfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  useEffect(() => {
    boardsRevealedThisLaunch = true;
    // Virtualized rows and later view switches arrive already settled.
    const timer = setTimeout(() => setRevealBoards(false), 900);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.FlatList
      data={boards}
      onScroll={onScroll}
      scrollEventThrottle={16}
      // Overscroll would pull the held hero away from the app header.
      bounces={false}
      overScrollMode="never"
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      keyExtractor={(board) => board.id}
      style={{ backgroundColor: boardSurfaces.paper }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.md }]}
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews={false}
      ListHeaderComponent={<>
        <BoardsMascotHero
          changedAt={boards.reduce((latest, board) => Math.max(latest, board.updatedAt), 0)}
          revision={boards.map(board => `${board.id}:${board.updatedAt}`).sort().join(';')}
          width={width}
          paper={boardSurfaces.paper}
          scrollY={scrollY}
          action={<Button label={tr('index.createBoard')} onPress={onCreate} style={styles.createButton} />}
        />
        <Reveal visible animate={revealBoards} delay={120} style={styles.listHeader}>
          <PaperCard
            paper={PAPER_YELLOW}
            tilt={-0.6}
            tape
            accessibilityRole="button"
            accessibilityLabel={tr("index.valueOpenUnorganized", { value1: pluralize(unorganizedCount, 'unorganized thought') })}
            onPress={onUnorganized}
            style={[styles.unorganized, rowStyle]}
          >
            <View style={styles.unorganizedMark}>
              <Icon name="file-tray-outline" size={19} color={PAPER_YELLOW} />
            </View>
            <View style={styles.rowCopy}>
              <AppText family={fonts.display} weight="700" style={styles.unorganizedTitle}>{tr("index.unorganized")}</AppText>
              <AppText family={fonts.text} style={styles.rowDetail}>
                {unorganizedCount === 0 ? tr("index.allCaughtUp") : tr("index.valueWaiting", { value1: pluralize(unorganizedCount, 'thought') })}
              </AppText>
            </View>
            <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={PAPER_INK_MUTED} />
          </PaperCard>

          <DeskHeading title={tr("index.yourBoards")} count={boards.length} style={styles.sectionHeader} />
        </Reveal>
      </>}
      renderItem={({ item: board, index }) => <View style={styles.boardItem}>
        <BoardListItem board={board} entranceDelay={revealBoards && index < 4 ? 180 + index * 55 : undefined} onPress={() => onBoard(board.id)} />
      </View>}
      ListEmptyComponent={<EmptyState title={tr("workspace.noBoardsTitle")} description={tr("index.organizeYourChitsWhenYouReReady")} style={styles.empty} />}
      ListFooterComponent={<>{footer}</>}
    />
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  createButton: { maxWidth: '100%', paddingVertical: spacing.xs },
  empty: { minHeight: 160, paddingVertical: spacing.lg },
  listHeader: { paddingHorizontal: spacing.md, paddingTop: 10, paddingBottom: 10 },
  boardItem: { paddingHorizontal: spacing.md, marginBottom: 10 },
  unorganized: { minHeight: 64, alignItems: 'center', justifyContent: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.sm },
  unorganizedMark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER_INK },
  rowCopy: { flex: 1, minWidth: 0 },
  unorganizedTitle: { color: PAPER_INK, fontSize: 16, lineHeight: 20 },
  rowDetail: { color: PAPER_INK_MUTED, marginTop: 1, fontSize: 13, lineHeight: 18 },
  sectionHeader: { marginTop: 12, paddingHorizontal: spacing.xxs },
});
