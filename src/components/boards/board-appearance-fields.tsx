import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { BOARD_ACCENTS, BOARD_ICONS, type BoardIconName } from '@/constants/board-appearance';

type Props = {
  icon: BoardIconName | null;
  accent: string | null;
  onIconChange: (icon: BoardIconName | null) => void;
  onAccentChange: (accent: string | null) => void;
};

// The one icon/accent picker in the app — Create Board and Edit Board both render
// this exact component so the two flows can never visually drift apart.
export function BoardAppearanceFields({ icon, accent, onIconChange, onAccentChange }: Props) {
  const { tokens: theme } = useTheme();
  return <>
    <Text style={[styles.label, { color: theme.textSecondary }]}>Icon</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconChoices}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="No icon"
        accessibilityState={{ selected: icon === null }}
        onPress={() => onIconChange(null)}
        style={[styles.iconChoice, { backgroundColor: theme.surfaceElevated }, icon === null && { borderColor: theme.accentStrong, backgroundColor: theme.accentSoft }]}
      >
        <Ionicons accessible={false} name="remove" size={20} color={theme.textSecondary} />
      </Pressable>
      {BOARD_ICONS.map((choice) => (
        <Pressable
          key={choice.name}
          accessibilityRole="radio"
          accessibilityLabel={choice.label}
          accessibilityState={{ selected: icon === choice.name }}
          onPress={() => onIconChange(choice.name)}
          style={[styles.iconChoice, { backgroundColor: theme.surfaceElevated }, icon === choice.name && { borderColor: theme.accentStrong, backgroundColor: theme.accentSoft }]}
        >
          <Ionicons accessible={false} name={choice.name} size={20} color={theme.textPrimary} />
        </Pressable>
      ))}
    </ScrollView>

    <Text style={[styles.label, { color: theme.textSecondary }]}>Accent</Text>
    <View style={styles.swatches}>
      {BOARD_ACCENTS.map((choice) => (
        <Pressable
          key={choice.label}
          accessibilityRole="radio"
          accessibilityLabel={`${choice.label} accent`}
          accessibilityState={{ selected: accent === choice.value }}
          onPress={() => onAccentChange(choice.value)}
          style={[styles.swatchHit, accent === choice.value && { borderColor: theme.textPrimary }]}
        >
          <View style={[styles.swatch, { backgroundColor: choice.color ?? theme.surfaceElevated, borderColor: theme.borderSubtle }]}>
            {accent === choice.value ? <Ionicons accessible={false} name="checkmark" size={16} color={choice.value ? '#FFFFFF' : theme.textPrimary} /> : null}
          </View>
        </Pressable>
      ))}
    </View>
  </>;
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginTop: spacing.xs },
  iconChoices: { gap: spacing.xs, paddingVertical: spacing.xs },
  iconChoice: { width: 44, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  swatches: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs },
  swatchHit: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
});
