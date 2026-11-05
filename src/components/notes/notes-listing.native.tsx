import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

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
import { NotesCanvas } from './notes-canvas.native';

type BoardProps = Pick<ComponentProps<typeof NotesCanvas>, 'notes' | 'shownKeys' | 'focus' | 'onFocusDone' | 'onToast' | 'onToggleChecklist'>;
type Props = Omit<ComponentProps<typeof CardsCollection>, 'header' | 'estimatedHeaderHeight' | 'emptyState' | 'backgroundColor' | 'filterBackgroundColor' | 'footer'> & {
  empty: boolean;
  onWrite: () => void;
  footer?: ReactNode;
  /** The free board. Null keeps the list, which is what a screen reader can walk through. */
  board: BoardProps | null;
};

/** Boards' same hero and paper, above the notes board or, for screen readers, the recycled note grid. */
export function NotesListing({ empty, onWrite, footer, board, ...collection }: Props) {
  useLocale();
  const { width } = useWindowDimensions();
  const { scheme } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const plan = usePlanHero();
  const scrollY = useSharedValue(0);
  const activity = useSharedValue(0);
  const emptyState = <View style={styles.empty}>
    <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, { color: surfaces.ink }]}>{tr(empty ? 'workspace.quietTitle' : 'cardscollection.noCardsInThisFilter')}</AppText>
    <AppText family={fonts.text} style={[styles.body, { color: surfaces.inkMuted }]}>{tr(empty ? 'chat.whatSOnYourMind' : 'cardscollection.chooseAnotherBoardOrAllCards')}</AppText>
  </View>;

  if (board) return <View style={styles.flex}>
    <BoardsMascotHero variant="notes" width={width} paper={surfaces.paper} scrollY={scrollY} activity={activity} title={plan.title} body={plan.body} action={<PlanHeroActions cta={plan.cta} onWrite={onWrite} />} />
    <View style={{ backgroundColor: surfaces.control }}>
      <FilterRail value={collection.filter} onChange={collection.onFilter} options={collection.chips.map((chip) => ({ ...chip, accessibilityLabel: tr('cardscollection.filterByValueValueValue', { value1: chip.label, value2: chip.count, value3: chip.count === 1 ? 'card' : 'cards' }) }))} />
    </View>
    <NotesCanvas {...board} filterKey={collection.filter} onOpen={collection.onOpen} onMore={collection.onMore} onToggleSubtask={collection.onToggleSubtask} bottomInset={collection.bottomInset} activity={activity} paper={surfaces.paper} footer={footer} emptyState={emptyState} />
  </View>;

  return <CardsCollection
    {...collection}
    scrollOffset={scrollY}
    backgroundColor={surfaces.paper}
    filterBackgroundColor={surfaces.control}
    estimatedHeaderHeight={compactHeroLayout(width).height}
    header={<BoardsMascotHero variant="notes" width={width} paper={surfaces.paper} scrollY={scrollY} title={plan.title} body={plan.body} action={<PlanHeroActions cta={plan.cta} onWrite={onWrite} />} />}
    emptyState={emptyState}
    footer={footer}
  />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  title: { fontSize: 20, lineHeight: 25, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
