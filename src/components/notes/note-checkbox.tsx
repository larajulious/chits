import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { Icon } from '@/components/ui/icon';

/** A separate touch target keeps completion taps away from the native input. */
export function NoteCheckbox({ checked, label, onPress, disabled = false }: { checked: boolean; label: string; onPress?: () => void; disabled?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, scheme } = useTheme();
  const accent = scheme === 'dark' ? '#E6A5B6' : '#802743';
  const indicator = <View style={[styles.box, { borderColor: checked ? accent : tokens.textMuted, backgroundColor: checked ? accent : 'transparent' }]}>
    {checked ? <Icon name="checkmark" size={15} color={scheme === 'dark' ? '#31121D' : '#FFFFFF'} /> : null}
  </View>;
  if (!onPress) return <View accessibilityLabel={`${checked ? tr("notecheckbox.completed") : tr("notecheckbox.incomplete")}: ${label}`} style={styles.target}>{indicator}</View>;
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label || tr("notecheckbox.emptyChecklistItem")} accessibilityState={{ checked, disabled }} disabled={disabled} hitSlop={{ top: 6, bottom: 6, left: 4, right: 0 }} onPress={(event) => { event.stopPropagation(); onPress(); }} style={({ pressed }) => [styles.target, pressed && { opacity: 0.65 }]}>{indicator}</Pressable>;
}

const styles = StyleSheet.create({
  target: { width: 34, minHeight: 28, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 3, flexShrink: 0 },
  box: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
