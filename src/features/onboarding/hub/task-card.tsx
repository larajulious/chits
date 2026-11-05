import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { PAPER_INK, PAPER_YELLOW, PaperCard } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { useDirection } from '@/localization/provider';
import type { ChecklistItem } from '../checklist';
import { ot } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import type { WelcomeSurfaces } from '../welcome/welcome-surfaces';

const ICONS: Record<ChecklistItem, IconName> = { firstNote: 'chatbubble-outline', firstCard: 'reader-outline', reminder: 'notifications-outline', space: 'pin-outline' };
const TILE = 38;

/** A small check. It pops in only if the task finishes once the screen is up, not when it opens already done. */
function DoneBadge({ animate, surfaces }: { animate: boolean; surfaces: WelcomeSurfaces }) {
  const reduced = useReducedMotion();
  const [pop] = useState(animate && !reduced);
  const scale = useSharedValue(pop ? 0 : 1);
  useEffect(() => {
    if (pop) scale.set(withSequence(withTiming(1.18, { duration: 200, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 140 })));
  }, [pop, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={[styles.badge, { backgroundColor: surfaces.action, borderColor: surfaces.cardDone }, style]}>
    <Icon name="checkmark" size={13} color={surfaces.onAction} />
  </Animated.View>;
}

type Props = { item: ChecklistItem; completed: boolean; isNext: boolean; animate: boolean; compact: boolean; surfaces: WelcomeSurfaces; onPress: () => void };

export function TaskCard({ item, completed, isNext, animate, compact, surfaces, onPress }: Props) {
  const { rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const title = ot(`checklist.item.${item}`);
  const iconColor = isNext ? PAPER_INK : completed ? surfaces.inkMuted : surfaces.ink;
  return <PaperCard
    paper={completed ? surfaces.cardDone : surfaces.card}
    accessibilityRole="button"
    accessibilityLabel={title + (completed ? '. ' + ot('checklist.done') : '')}
    accessibilityHint={ot(`checklist.item.${item}.hint`)}
    onPress={onPress}
    style={[styles.card, compact && styles.compact, { borderRadius: styleTokens.button.radius }, completed && styles.flat]}
  >
    <View style={[styles.row, rowStyle]}>
      <View style={[styles.tile, { backgroundColor: isNext ? PAPER_YELLOW : completed ? surfaces.card : surfaces.control, borderRadius: styleTokens.button.radius }]}>
        <Icon name={ICONS[item]} size={19} color={iconColor} />
        {completed ? <DoneBadge animate={animate} surfaces={surfaces} /> : null}
      </View>
      <View style={styles.copy}>
        <AppText weight="700" family={fonts.display} style={[styles.title, { color: surfaces.ink }]}>{title}</AppText>
        <AppText family={fonts.text} style={[styles.description, { color: surfaces.inkMuted }]}>{ot(`hub.task.${item}`)}</AppText>
      </View>
      <Icon name="chevron-forward" size={19} color={surfaces.inkMuted} />
    </View>
  </PaperCard>;
}

const styles = StyleSheet.create({
  card: { minHeight: layout.minimumTouchTarget + spacing.sm, justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  // Still taller than the 44pt touch minimum.
  compact: { minHeight: layout.minimumTouchTarget + spacing.xxs, paddingVertical: spacing.xxs },
  flat: { boxShadow: '0px 0px 0px transparent' },
  row: { alignItems: 'center', gap: spacing.sm },
  tile: { width: TILE, height: TILE, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -5, bottom: -5, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, lineHeight: 19 },
  description: { fontSize: 13, lineHeight: 17 },
});
