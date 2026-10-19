import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import { hasExactReminderAccess, openReminderAlarmSettings } from '@/services/reminder-alarm-access';

/**
 * Android's "Alarms & reminders" access, checked while `active` and again
 * each time Chits returns from Settings. Null until known; always true
 * elsewhere (iOS has no such switch).
 */
export function useExactAlarmAccess(active: boolean): boolean | null {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const [allowed, setAllowed] = useState<boolean | null>(Platform.OS === 'android' ? null : true);
  useEffect(() => {
    if (!active || Platform.OS !== 'android') return;
    let live = true;
    const check = () => void hasExactReminderAccess().then((value) => { if (live) setAllowed(value); }, () => undefined);
    check();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') check(); });
    return () => { live = false; subscription.remove(); };
  }, [active]);
  return allowed;
}

/**
 * The step a reminder can't work without on Android: a card that stands out
 * from the form around it (accent border, icon, one clear button), shown as
 * soon as a reminder is chosen — not after a failed save. It goes away by
 * itself once access is allowed and the person comes back.
 */
export function ExactAlarmNotice({ action = tr("exactalarmnotice.setTheReminder") }: { action?: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View accessibilityRole="alert" style={[styles.card, { backgroundColor: theme.accentSoft, borderColor: theme.accentStrong }]}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: theme.accentStrong }]}><Icon name="alarm-outline" size={18} color={theme.background} /></View>
        <View style={styles.copy}>
          <AppText style={[styles.title, { color: theme.textPrimary }]}>{tr("exactalarmnotice.allowAlarmsReminders")}</AppText>
          <AppText style={[styles.text, { color: theme.textSecondary }]}>{tr("exactalarmnotice.androidNeedsThisBeforeChitsCan")}{' '}{action} {' '}{tr("exactalarmnotice.andNotifyYouOnTimeEvenWhenThe")}</AppText>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tr("exactalarmnotice.openSettingsToAllowAlarmsAndReminders")}
        onPress={() => { setFailed(false); void openReminderAlarmSettings().catch(() => setFailed(true)); }}
        style={({ pressed }) => [styles.button, { backgroundColor: theme.accentStrong }, pressed && styles.pressed]}
      >
        <Icon name="settings-outline" size={17} color={theme.background} />
        <AppText style={[styles.buttonText, { color: theme.background }]}>{tr("calendar.openSettings")}</AppText>
      </Pressable>
      {failed ? <AppText style={[styles.text, { color: theme.danger }]}>{tr("exactalarmnotice.settingsCouldnTBeOpenedFindChitsUnder")}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, borderRadius: radii.compactCard, padding: spacing.sm, gap: spacing.sm, marginTop: spacing.xs },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800' },
  text: { fontSize: 13, lineHeight: 18 },
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radii.control },
  buttonText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
