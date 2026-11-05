import { Pressable, StyleSheet, View } from 'react-native';

import { useHandwriting } from '@/components/desk/paper-desk';
import { AppText, Icon } from '@/components/ui/primitives';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** A warm paper tag: it asks for attention without alarm. Fixed colors, like every paper on the desk. */
export const OVERDUE_PAPER = '#F7E2C0';
export const OVERDUE_INK = '#6E4310';

/** Overdue work, noted beside the wheel rather than competing with it. */
export function SpinOverdueChip({ count, disabled, onPress }: { count: number; disabled: boolean; onPress: () => void }) {
  useLocale();
  const { hand } = useHandwriting();
  const { rowStyle } = useDirection();
  const label = tr('spin.overdueShort', { count });
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={tr('spin.addressOverdue')} accessibilityState={{ disabled }} disabled={disabled} hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.chip, rowStyle, pressed && styles.pressed, disabled && styles.disabled]}>
      <Icon name="alert-circle-outline" size={15} color={OVERDUE_INK} />
      <AppText numberOfLines={1} style={[hand, styles.text]}>{label}</AppText>
      <Icon name="chevron-forward" size={14} color={OVERDUE_INK} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  chip: { minHeight: 30, maxWidth: '100%', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 4, borderRadius: 15, backgroundColor: OVERDUE_PAPER },
  text: { flexShrink: 1, color: OVERDUE_INK, fontSize: 13, lineHeight: 18 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
