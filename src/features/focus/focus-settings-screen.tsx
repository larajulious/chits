import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { AppHeader, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { enableFocusNotifications } from '@/services/focus-notifications';
import type { FocusPreferences } from '@/services/focus-timer';
import { useFocusState } from './use-focus';
import { FocusText as AppText } from './focus-ui';
import { DurationSheet } from './duration-sheet';

export default function FocusSettingsScreen() {
  'use no memo'; useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { repository, preferences, error: loadError } = useFocusState();
  const { tokens } = useTheme();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);
  const [duration, setDuration] = useState('25');
  const closeDuration = () => { if (!lock.current) { Keyboard.dismiss(); setDurationOpen(false); } };
  const change = async (update: Partial<FocusPreferences>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(false);
    try {
      if (update.notifications && !await enableFocusNotifications()) { setNotice(true); return; }
      await repository.setPreferences({ ...await repository.preferences(), ...update });
      Keyboard.dismiss(); setDurationOpen(false);
    } catch { setError(tr('focus.error')); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Screen><AppHeader title={tr('focus.settings')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <ScrollView contentContainerStyle={styles.content}>
      {error || loadError ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error ?? loadError}</AppText> : null}
      <View style={styles.section}>
      <AppText accessibilityRole="header" weight="600" style={[styles.sectionLabel, { color: tokens.textSecondary }]}>{tr('focus.title')}</AppText>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setDuration(String(preferences.durationMinutes ?? 25)); setDurationOpen(true); }} style={({ pressed }) => [styles.row, rowStyle, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
        <AppText style={[styles.label, styles.rowCopy]}>{tr('focus.defaultDuration')}</AppText>
        <AppText style={[styles.value, { color: tokens.textSecondary }]}>{preferences.durationMinutes === null ? tr('focus.untimed') : tr('focus.minutes', { minutes: preferences.durationMinutes })}</AppText>
        <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={17} color={tokens.textMuted} />
      </Pressable>
      {(['companion','continuity','notifications'] as const).map((key) => <View key={key} style={[styles.row, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
        <View style={styles.rowCopy}><AppText style={styles.label}>{tr(`focus.preference.${key}`)}</AppText><AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{tr(`focus.preferenceHelp.${key}`)}</AppText></View>
        <Switch accessibilityRole="switch" accessibilityLabel={tr(`focus.preference.${key}`)} accessibilityHint={tr(`focus.preferenceHelp.${key}`)} value={preferences[key]} disabled={busy} onValueChange={(value) => void change({ [key]: value })} trackColor={{ true: tokens.accent, false: tokens.borderSubtle }} thumbColor={tokens.surface} />
      </View>)}
      </View>
      {notice ? <AppText accessibilityLiveRegion="polite">{tr('focus.notificationsOff')}</AppText> : null}
      <View style={styles.section}><Pressable accessibilityRole="button" onPress={() => router.push('/focus-history')} style={({ pressed }) => [styles.row, rowStyle, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
        <AppText style={[styles.label, styles.rowCopy]}>{tr('focus.history')}</AppText><Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={17} color={tokens.textMuted} />
      </Pressable></View>
    </ScrollView>
    <DurationSheet visible={durationOpen} title={tr('focus.defaultDuration')} value={duration} onChange={setDuration}
      onClose={closeDuration} busy={busy} error={error} onSave={() => void change({ durationMinutes: Number(duration) })} onUntimed={() => void change({ durationMinutes: null })} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 28 },
  section: { marginTop: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 4 },
  row: { minHeight: 50, alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1, minWidth: 0 }, label: { fontSize: 16 },
  description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  value: { fontSize: 14, flexShrink: 1, maxWidth: '45%' },
  pressed: { opacity: 0.65 },
});
