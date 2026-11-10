import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { CardsCollection } from '@/components/boards/cards-collection.native';
import { FilterRail } from '@/components/boards/filter-rail';
import { BoardsMascotHero } from '@/components/boards/boards-mascot-hero.native';
import { compactHeroLayout } from '@/components/boards/compact-hero-layout';
import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { PlanHeroActions, usePlanHero } from '@/features/plan/plan-hero-action';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { NotesPullToCreate, useNotesRefresh } from './notes-pull-refresh.native';
import { NotesCanvas } from './notes-canvas.native';

type BoardProps = Pick<ComponentProps<typeof NotesCanvas>, 'notes' | 'shownKeys' | 'focus' | 'onFocusDone' | 'onToast' | 'onToggleChecklist'>;
type Props = Omit<ComponentProps<typeof CardsCollection>, 'header' | 'estimatedHeaderHeight' | 'emptyState' | 'backgroundColor' | 'filterBackgroundColor' | 'footer'> & {
  empty: boolean;
  onWrite: () => void;
  /** Pull can go straight to a blank editor while Write keeps its chooser. */
  onPullCreate?: () => void;
  footer?: ReactNode;
  /** The free board. Null keeps the list, which is what a screen reader can walk through. */
  board: BoardProps | null;
};

/** Boards' same hero and paper, above the notes board or, for screen readers, the recycled note grid. */
function NotesListingContent({ empty, onWrite, onPullCreate: _onPullCreate, footer, board, scrollY, ...collection }: Props & { scrollY: ReturnType<typeof useSharedValue<number>> }) {
  useLocale();
  const { width } = useWindowDimensions();
  const { scheme } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const plan = usePlanHero();
  const refresh = useNotesRefresh();
  const activity = useSharedValue(0);
  const listOpacity = refresh?.listOpacity;
  const boardFade = useAnimatedStyle(() => ({ opacity: listOpacity?.get() ?? 1 }));
  const activityNotes = collection.sections.flatMap(section => section.data);
  const changedAt = activityNotes.reduce((latest, item) => Math.max(latest, item.updatedAt), 0);
  const revision = activityNotes.map(item => `${item.kind}:${item.id}:${item.updatedAt}:${item.completedSubtaskCount}:${item.checklistSummary?.completed ?? 0}`).sort().join(';');
  // This listing survives masonry/canvas switches; the canvas itself does not.
  const [canvasSelection, setCanvasSelection] = useState<{ filter: string; key: string | null } | null>(null);
  const selectCanvasNote = useCallback((key: string | null) => setCanvasSelection({ filter: collection.filter, key }), [collection.filter]);
  const emptyState = <View style={styles.empty}>
    <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, { color: surfaces.ink }]}>{tr(empty ? 'workspace.quietTitle' : 'cardscollection.noCardsInThisFilter')}</AppText>
    <AppText family={fonts.text} style={[styles.body, { color: surfaces.inkMuted }]}>{tr(empty ? 'chat.whatSOnYourMind' : 'cardscollection.chooseAnotherBoardOrAllCards')}</AppText>
  </View>;

  if (board) return <View style={styles.flex}>
    <BoardsMascotHero changedAt={changedAt} revision={revision} revisionScope={collection.filter} variant="notes" width={width} paper={surfaces.paper} scrollY={scrollY} activity={activity} title={plan.title} body={plan.body} action={<PlanHeroActions cta={plan.cta} onWrite={onWrite} />} />
    <View style={{ backgroundColor: surfaces.control }}>
      <FilterRail value={collection.filter} onChange={collection.onFilter} options={collection.chips.map((chip) => ({ ...chip, accessibilityLabel: tr('cardscollection.filterByValueValueValue', { value1: chip.label, value2: chip.count, value3: chip.count === 1 ? 'card' : 'cards' }) }))} />
    </View>
    <Animated.View style={[styles.flex, boardFade]}><NotesCanvas {...board} selectedNoteKey={canvasSelection?.filter === collection.filter ? canvasSelection.key : null} onSelectNote={selectCanvasNote} filterKey={collection.filter} onOpen={collection.onOpen} onMore={collection.onMore} onToggleSubtask={collection.onToggleSubtask} bottomInset={collection.bottomInset} activity={activity} paper={surfaces.paper} footer={footer} emptyState={emptyState} /></Animated.View>
  </View>;

  return <CardsCollection
    {...collection}
    nativeScrollGesture={refresh?.native}
    scrollOffset={scrollY}
    backgroundColor={surfaces.paper}
    filterBackgroundColor={surfaces.control}
    estimatedHeaderHeight={compactHeroLayout(width).height}
    header={<BoardsMascotHero changedAt={changedAt} revision={revision} revisionScope={collection.filter} variant="notes" width={width} paper={surfaces.paper} scrollY={scrollY} title={plan.title} body={plan.body} action={<PlanHeroActions cta={plan.cta} onWrite={onWrite} />} />}
    emptyState={emptyState}
    footer={footer}
    dim={refresh?.listOpacity}
  />;
}

export function NotesListing(props: Props) {
  const scrollY = useSharedValue(0);
  const { width } = useWindowDimensions();
  const canvas = Boolean(props.board);
  useEffect(() => { if (canvas) scrollY.set(0); }, [canvas, scrollY]);
  return <NotesPullToCreate scrollY={scrollY} onCreateNote={props.onPullCreate ?? props.onWrite} canvas={Boolean(props.board)} width={width}>
    <NotesListingContent {...props} scrollY={scrollY} />
  </NotesPullToCreate>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  title: { fontSize: 20, lineHeight: 25, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
