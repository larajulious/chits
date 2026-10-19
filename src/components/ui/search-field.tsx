import { contentTextStyle } from '@/localization/text-layout';
import { tr } from '@/localization/runtime';
import { useDirection } from '@/localization/provider';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';

export function SearchField({ value, onChangeText, placeholder, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; placeholder: string; accessibilityLabel: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { direction, rowStyle } = useDirection();
  const { tokens: theme } = useTheme();
  return <View style={[styles.field, rowStyle, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
    <Ionicons accessible={false} name="search" size={16} color={theme.textMuted} />
    <TextInput
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      selectionColor={theme.accent}
      returnKeyType="search"
      style={[styles.input, contentTextStyle(value, direction), { color: theme.textPrimary }]}
    />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel={tr("unorganized.clearSearch")} hitSlop={8} onPress={() => onChangeText('')}>
      <Ionicons accessible={false} name="close-circle" size={16} color={theme.textMuted} />
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { height: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: 16, paddingHorizontal: spacing.sm + spacing.xxs, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, height: '100%', fontSize: 15, padding: 0 },
});
