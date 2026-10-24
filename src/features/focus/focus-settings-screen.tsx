import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { AppHeader, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PaperDesk, PaperNote, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { enableFocusNotifications } from '@/services/focus-notifications';
import type { FocusPreferences } from '@/services/focus-timer';
import { useFocusState } from './use-focus';
import { FocusText as AppText } from './focus-ui';
import { DurationSheet } from './duration-sheet';

export default function FocusSettingsScreen() {
  'use no memo'; useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { repository, preferences, error: loadError } = useFocusState();
  const desk = useDesk();
  const { handBold } = useHandwriting();
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
  return <Screen style={{ backgroundColor: desk.desk }}><AppHeader title={tr('focus.settings')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <PaperDesk>
    <ScrollView contentContainerStyle={styles.content}>
      {error || loadError ? <AppText accessibilityRole="alert" weight="600" style={[styles.deskText, { color: desk.danger }]}>{error ?? loadError}</AppText> : null}
      <AppText accessibilityRole="header" style={[handBold, styles.sectionLabel, { color: desk.ink }]}>{tr('focus.title')}</AppText>
      <PaperNote paper={PAPER_WHITE} style={styles.sheet}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setDuration(String(preferences.durationMinutes ?? 25)); setDurationOpen(true); }} style={({ pressed }) => [styles.row, rowStyle, pressed && styles.pressed]}>
          <AppText style={[styles.label, styles.rowCopy]}>{tr('focus.defaultDuration')}</AppText>
          <AppText style={[handBold, styles.value]}>{preferences.durationMinutes === null ? tr('focus.untimed') : tr('focus.minutes', { minutes: preferences.durationMinutes })}</AppText>
          <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={17} color={PAPER_INK_MUTED} />
        </Pressable>
        {(['companion','continuity','notifications'] as const).map((key) => <View key={key} style={[styles.row, rowStyle, styles.ruled]}>
          <View style={styles.rowCopy}><AppText style={styles.label}>{tr(`focus.preference.${key}`)}</AppText><AppText variant="paragraph" style={styles.description}>{tr(`focus.preferenceHelp.${key}`)}</AppText></View>
          <Switch accessibilityRole="switch" accessibilityLabel={tr(`focus.preference.${key}`)} accessibilityHint={tr(`focus.preferenceHelp.${key}`)} value={preferences[key]} disabled={busy} onValueChange={(value) => void change({ [key]: value })} trackColor={{ true: SWITCH_ON, false: 'rgba(43,38,32,0.18)' }} thumbColor={PAPER_WHITE} ios_backgroundColor="rgba(43,38,32,0.18)" />
        </View>)}
      </PaperNote>
      {notice ? <AppText accessibilityLiveRegion="polite" style={[styles.deskText, { color: desk.inkMuted }]}>{tr('focus.notificationsOff')}</AppText> : null}
      <PaperNote paper={PAPERS[3]} tilt={0.6} style={styles.sheet}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/focus-history')} style={({ pressed }) => [styles.row, rowStyle, pressed && styles.pressed]}>
          <Icon name="time-outline" size={19} color={PAPER_INK} />
          <AppText style={[handBold, styles.historyLabel, styles.rowCopy]}>{tr('focus.history')}</AppText>
          <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={17} color={PAPER_INK_MUTED} />
        </Pressable>
      </PaperNote>
    </ScrollView>
    </PaperDesk>
    <DurationSheet visible={durationOpen} title={tr('focus.defaultDuration')} value={duration} onChange={setDuration}
      onClose={closeDuration} busy={busy} error={error} onSave={() => void change({ durationMinutes: Number(duration) })} onUntimed={() => void change({ durationMinutes: null })} />
  </Screen>;
}

// A deeper yellow than the paper, so an "on" switch still reads on white.
const SWITCH_ON = '#E2B52C';
const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 18, paddingBottom: 28, gap: 14 },
  deskText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  sectionLabel: { fontSize: 24, lineHeight: 30, paddingHorizontal: 4 },
  sheet: { paddingHorizontal: 14, paddingVertical: 2 },
  row: { minHeight: 52, alignItems: 'center', gap: 10, paddingVertical: 10 },
  ruled: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(43,38,32,0.2)' },
  rowCopy: { flex: 1, minWidth: 0 }, label: { color: PAPER_INK, fontSize: 16 },
  description: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 19, marginTop: 3 },
  value: { color: PAPER_INK, fontSize: 18, lineHeight: 24, flexShrink: 1, maxWidth: '45%' },
  historyLabel: { color: PAPER_INK, fontSize: 20, lineHeight: 26 },
  pressed: { opacity: 0.6 },
});
