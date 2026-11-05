import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AndroidReminderTimePicker } from '@/components/reminders/android-reminder-time-picker';
import { SettingsNote, SettingsRow, SettingsSection, SettingsToggleRow } from '@/components/settings/settings-rows';
import { useTheme } from '@/components/theme-provider';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { formatReminderClock } from '@/services/reminder-time';
import { ensureNotificationPermission } from '@/services/reminders';
import { parseClock, PLAN_NOTIFICATION_DEFAULTS, PLAN_NOTIFICATION_KEYS, type PlanNotificationSettings } from './plan-core';
import { readPlanNotificationSettings } from './plan-settings-store';

const clockDate = (clock: string) => {
  const parsed = parseClock(clock) ?? { hours: 8, minutes: 0 };
  const date = new Date();
  date.setHours(parsed.hours, parsed.minutes, 0, 0);
  return date;
};
const clockOf = (hours: number, minutes: number) => `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

/** Both reminders start off, and asking for permission only ever follows turning one on. */
export function PlanSettingsSection() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { tokens, scheme } = useTheme();
  const [settings, setSettings] = useState<PlanNotificationSettings>(PLAN_NOTIFICATION_DEFAULTS);
  const [blocked, setBlocked] = useState(false);
  const [picking, setPicking] = useState<'morning' | 'evening' | null>(null);
  useEffect(() => { void readPlanNotificationSettings(database).then(setSettings).catch(() => undefined); }, [database]);
  const save = async (key: keyof PlanNotificationSettings, value: boolean | string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', PLAN_NOTIFICATION_KEYS[key], String(value), Date.now());
  };
  const toggle = async (key: 'morning' | 'evening', next: boolean) => {
    if (next) {
      const permission = await ensureNotificationPermission();
      setBlocked(permission !== 'granted');
      if (permission !== 'granted') return;
    }
    await save(key, next);
  };
  const timeRow = (key: 'morning' | 'evening') => {
    const field = key === 'morning' ? 'morningTime' as const : 'eveningTime' as const;
    const value = clockDate(settings[field]);
    if (Platform.OS === 'ios') return <View style={styles.iosTime}><SettingsRow label={tr('plan.settings.time')} /><View style={styles.iosPicker}><DateTimePicker value={value} mode="time" display="compact" accentColor={tokens.accent} themeVariant={scheme === 'dark' ? 'dark' : 'light'} onValueChange={(_event, date) => { if (date) void save(field, clockOf(date.getHours(), date.getMinutes())); }} /></View></View>;
    return <SettingsRow label={tr('plan.settings.time')} value={formatReminderClock(value)} onPress={() => setPicking(key)} />;
  };
  return <SettingsSection title={tr('plan.cta.plan')}>
    <SettingsToggleRow icon="sunny-outline" label={tr('plan.settings.morning')} description={tr('plan.settings.morningHelp')} value={settings.morning} onChange={(next) => void toggle('morning', next)} />
    {settings.morning ? timeRow('morning') : null}
    <SettingsToggleRow icon="moon-outline" label={tr('plan.settings.evening')} description={tr('plan.settings.eveningHelp')} value={settings.evening} onChange={(next) => void toggle('evening', next)} />
    {settings.evening ? timeRow('evening') : null}
    {blocked ? <SettingsNote>{tr('plan.settings.blocked')}</SettingsNote> : null}
    <SettingsRow icon="time-outline" label={tr('plan.history')} onPress={() => router.push('/plan-history')} />
    {picking ? <AndroidReminderTimePicker value={clockDate(settings[picking === 'morning' ? 'morningTime' : 'eveningTime'])} accent={tokens.accent} accentOn={tokens.accentText} onDismiss={() => setPicking(null)} onConfirm={(hours, minutes) => { void save(picking === 'morning' ? 'morningTime' : 'eveningTime', clockOf(hours, minutes)); setPicking(null); }} /> : null}
  </SettingsSection>;
}

const styles = StyleSheet.create({
  iosTime: { justifyContent: 'center' },
  iosPicker: { position: 'absolute', right: 14 },
});
