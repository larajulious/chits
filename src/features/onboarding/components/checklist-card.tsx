import { useLocale, useDirection } from '@/localization/provider';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { navigationIconName } from '@/localization/text-layout';
import { CHECKLIST_ITEMS } from '../checklist';
import { nextChecklistItem } from '../hub/journey';
import { useChecklist } from '../hub/use-checklist';
import { ot } from '../strings';
import { welcomeSurfaces } from '../welcome/welcome-surfaces';

/**
 * Getting started on Notes: one quiet strip, so notes stay first. It says how
 * far along you are and what's next, and opens the hub, which has the full list.
 */
export function GettingStartedCard() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const { rowStyle, direction } = useDirection();
  const { scheme, styleTokens } = useTheme();
  const desk = useDesk();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const { done, homeShown, dismissFromHome } = useChecklist();
  if (homeShown !== true) return null;
  const progress = ot('checklist.progress', { done: done.length, total: CHECKLIST_ITEMS.length });
  const next = nextChecklistItem(done);
  const detail = next ? ot('checklist.next', { task: ot(`checklist.item.${next}`) }) : ot('checklist.allDone');
  return <View style={[styles.strip, rowStyle, { backgroundColor: surfaces.card, borderColor: surfaces.control, borderRadius: styleTokens.button.radius }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${ot('checklist.title')}. ${progress}. ${detail}`} onPress={() => router.push('/onboarding')} style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
      <View style={[styles.heading, rowStyle]}>
        <AppText variant="title" numberOfLines={1} style={[styles.title, { color: surfaces.ink }]}>{ot('checklist.title')}</AppText>
        <AppText weight="700" style={[styles.count, { color: surfaces.inkMuted }]}>{progress}</AppText>
      </View>
      <View style={[styles.segments, rowStyle]}>
        {CHECKLIST_ITEMS.map((item) => <View key={item} style={[styles.segment, { backgroundColor: done.includes(item) ? surfaces.action : surfaces.track }]} />)}
      </View>
      <View style={[styles.next, rowStyle]}>
        <AppText numberOfLines={2} style={[styles.detail, { color: surfaces.inkMuted }]}>{detail}</AppText>
        <Icon name={navigationIconName('chevron-forward', direction)} size={15} color={surfaces.inkMuted} />
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={ot('checklist.close')} onPress={() => void dismissFromHome()} style={styles.close}>
      <Icon name="close" size={18} color={surfaces.inkMuted} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  strip: { marginHorizontal: spacing.md, marginTop: spacing.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: 'flex-start' },
  body: { flex: 1, minWidth: 0, paddingVertical: spacing.xs + 2, paddingLeft: spacing.sm, gap: 5 },
  heading: { alignItems: 'baseline', gap: spacing.xs },
  title: { flexShrink: 1, fontSize: 15, lineHeight: 20 },
  count: { fontSize: 12, lineHeight: 16 },
  segments: { gap: 3 },
  segment: { flex: 1, height: 5, borderRadius: 2 },
  next: { alignItems: 'center', gap: spacing.xxs },
  detail: { flexShrink: 1, fontSize: 13, lineHeight: 17 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.65 },
});
