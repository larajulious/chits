import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { CardsCollection } from '@/components/boards/cards-collection.native';
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

type Props = Omit<ComponentProps<typeof CardsCollection>, 'header' | 'estimatedHeaderHeight' | 'emptyState' | 'backgroundColor' | 'footer'> & {
  empty: boolean;
  onWrite: () => void;
  footer?: ReactNode;
};

/** Boards' same hero and paper, above the existing recycled note grid. */
export function NotesListing({ empty, onWrite, footer, ...collection }: Props) {
  useLocale();
  const { width } = useWindowDimensions();
  const { scheme } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const plan = usePlanHero();
  const scrollY = useSharedValue(0);

  return <CardsCollection
    {...collection}
    scrollOffset={scrollY}
    backgroundColor={surfaces.paper}
    estimatedHeaderHeight={compactHeroLayout(width).height}
    header={<BoardsMascotHero variant="notes" width={width} paper={surfaces.paper} scrollY={scrollY} title={plan.title} body={plan.body} action={<PlanHeroActions cta={plan.cta} onWrite={onWrite} />} />}
    emptyState={<View style={styles.empty}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, { color: surfaces.ink }]}>{tr(empty ? 'workspace.quietTitle' : 'cardscollection.noCardsInThisFilter')}</AppText>
      <AppText family={fonts.text} style={[styles.body, { color: surfaces.inkMuted }]}>{tr(empty ? 'chat.whatSOnYourMind' : 'cardscollection.chooseAnotherBoardOrAllCards')}</AppText>
    </View>}
    footer={footer}
  />;
}

const styles = StyleSheet.create({
  empty: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  title: { fontSize: 20, lineHeight: 25, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
});
