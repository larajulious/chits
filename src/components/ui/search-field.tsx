import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';

export function SearchField({ value, onChangeText, placeholder, accessibilityLabel }: { value: string; onChangeText: (value: string) => void; placeholder: string; accessibilityLabel: string }) {
  const { tokens: theme } = useTheme();
  return <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
    <Ionicons accessible={false} name="search" size={16} color={theme.textMuted} />
    <TextInput
      accessibilityLabel={accessibilityLabel}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      selectionColor={theme.accent}
      returnKeyType="search"
      style={[styles.input, { color: theme.textPrimary }]}
    />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onChangeText('')}>
      <Ionicons accessible={false} name="close-circle" size={16} color={theme.textMuted} />
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { height: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: 16, paddingHorizontal: spacing.sm + spacing.xxs, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, height: '100%', fontSize: 15, padding: 0 },
});
