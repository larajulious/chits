import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChitsMascot } from '@/components/mascot/chits-mascot';
import { useMascotPreference } from '@/components/mascot/mascot-provider';
import { MASCOT_VARIANTS } from '@/components/mascot/mascot-variants';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { navigationIconName } from '@/localization/text-layout';
import { SettingsSection, useSettingsSurfaces } from './settings-rows';

export function MascotSettings() {
  'use no memo';
  useLocale();
  const { variant } = useMascotPreference();
  const mascot = MASCOT_VARIANTS.find((item) => item.id === variant)!;
  const { tokens } = useTheme();
  const fonts = useWelcomeFonts();
  const surfaces = useSettingsSurfaces();
  const { rowStyle, direction } = useDirection();
  return <SettingsSection title={tr('mascot.personalization')}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${tr('mascot.title')}. ${mascot.name}. ${tr('mascot.change')}`} accessibilityHint={tr('mascot.description')} onPress={() => router.push('/mascot')}
      style={({ pressed }) => [styles.row, rowStyle, pressed && { backgroundColor: surfaces.pressed }]}>
      <ChitsMascot still size={60} accessible={false} />
      <View style={styles.copy}>
        <AppText family={fonts.text} style={[styles.label, { color: tokens.textPrimary }]}>{tr('mascot.title')}</AppText>
        <AppText family={fonts.text} style={[styles.name, { color: tokens.textSecondary }]}>{mascot.name}</AppText>
        <AppText family={fonts.text} style={[styles.detail, { color: tokens.textSecondary }]}>{tr('mascot.description')}</AppText>
        <AppText family={fonts.text} weight="600" style={[styles.action, { color: tokens.textPrimary }]}>{tr('mascot.change')}</AppText>
      </View>
      <Icon name={navigationIconName('chevron-forward', direction)} size={17} color={tokens.textSecondary} />
    </Pressable>
  </SettingsSection>;
}
const styles = StyleSheet.create({
  row: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 100 },
  copy: { flex: 1, minWidth: 0 }, label: { fontSize: 15, lineHeight: 21 },
  name: { fontSize: 13, lineHeight: 19, marginTop: 2 },
  detail: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  action: { fontSize: 13, lineHeight: 19, marginTop: 8 },
});
