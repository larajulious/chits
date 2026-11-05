import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { PAPER_INK, PAPER_INK_MUTED, PaperAction, PaperNote, useHandwriting } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText, Icon } from '@/components/ui/primitives';
import type { IconName } from '@/components/ui/icon';
import { Reveal } from '@/features/onboarding/welcome/reveal';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { REVEAL_MS } from './spin-layout';

/** How long a long title may run before the card tells the rest through its label. */
const TITLE_LINES = 4;
export const SPIN_CONFIRM_MS = 170;

/** A note Chits has pulled from the pile: taped down, in its category's color. */
export function SpinResultCard({ paper, title, eyebrow, action, animate, confirming = false, children }: { paper: string; title: string; eyebrow?: string; action?: ReactNode; /** A landing just now: rise into place. A restored result is simply there. */ animate: boolean; /** Start Focus was pressed: the card answers before the page changes. */ confirming?: boolean; children?: ReactNode }) {
  useLocale();
  const { handBold } = useHandwriting();
  const { rowStyle } = useDirection();
  const reduced = useReducedMotion();
  const live = animate && !reduced;
  const enter = useSharedValue(live ? 0 : 1);
  const press = useSharedValue(0);
  useEffect(() => { if (live) enter.set(withDelay(REVEAL_MS.card, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }))); }, [enter, live]);
  useEffect(() => { if (confirming && !reduced) press.set(withSequence(withTiming(1, { duration: SPIN_CONFIRM_MS * 0.6, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: SPIN_CONFIRM_MS, easing: Easing.inOut(Easing.sin) }))); }, [confirming, press, reduced]);
  const motion = useAnimatedStyle(() => ({ opacity: enter.get(), transform: [{ translateY: (1 - enter.get()) * 18 - press.get() * 3 }, { scale: 1 + press.get() * 0.015 }] }));
  return <Animated.View style={[styles.wrap, motion]}>
    <PaperNote paper={paper} tilt={-0.8} tape style={styles.note}>
      <View style={[styles.heading, rowStyle]}>
        <AppText weight="700" style={styles.eyebrow}>{eyebrow ?? tr('spin.picked')}</AppText>
        {action}
      </View>
      <AppText accessibilityRole="header" accessibilityLabel={title} numberOfLines={TITLE_LINES} style={[handBold, styles.title]}>{title}</AppText>
      {children ? <Reveal visible animate={live} delay={REVEAL_MS.details} style={styles.details}>{children}</Reveal> : null}
    </PaperNote>
  </Animated.View>;
}

/** One line of a result's details: an icon and what it means. */
export function SpinFact({ icon, children }: { icon: IconName; children: ReactNode }) {
  const { rowStyle } = useDirection();
  return <View style={[styles.fact, rowStyle]}><Icon name={icon} size={14} color={PAPER_INK_MUTED} /><AppText style={styles.caption}>{children}</AppText></View>;
}

/** The page's actions. Start Focus leads in the reader's accent; the others stay quiet. In the page's flow, `animate` brings them in last. */
export function SpinActions({ primary, secondary, animate, stacked = false }: { primary?: { label: string; disabled?: boolean; onPress: () => void }; secondary: { label: string; disabled?: boolean; onPress: () => void }[]; animate: boolean; /** Large text needs each action on its own row. */ stacked?: boolean }) {
  const { tokens } = useTheme();
  const { rowStyle } = useDirection();
  const reduced = useReducedMotion();
  return <Reveal visible animate={animate && !reduced} delay={REVEAL_MS.actions} style={styles.actions}>
    {primary ? <PaperAction primary paper={tokens.accent} ink={tokens.accentText} {...primary} /> : null}
    <View style={[styles.row, stacked ? styles.column : rowStyle]}>
      {secondary.map(action => <PaperAction key={action.label} containerStyle={stacked ? undefined : styles.flex} {...action} />)}
    </View>
  </Reveal>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { paddingHorizontal: 2, paddingTop: 8 },
  note: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, gap: 6 },
  heading: { alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 },
  eyebrow: { flex: 1, color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: PAPER_INK, fontSize: 24, lineHeight: 30 },
  details: { gap: 6 },
  fact: { alignItems: 'center', gap: 6, flexShrink: 1 },
  caption: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  actions: { gap: 8 },
  row: { gap: 8, alignItems: 'stretch' },
  column: { flexDirection: 'column' },
});
