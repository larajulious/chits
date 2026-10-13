import { useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { getCalendars } from 'expo-localization';

import { AppText, useFontStyle } from '@/components/ui/app-text';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { parseReminderClock, dateFormat } from '@/services/reminder-time';

type Props = {
  value: Date;
  accent: string;
  accentOn: string;
  onConfirm: (hours: number, minutes: number) => void;
  onDismiss: () => void;
};

/** A draft time: only confirming commits it to the selected reminder date. */
export function AndroidReminderTimePicker({ value, accent, accentOn, onConfirm, onDismiss }: Props) {
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const font = useFontStyle('body', '600');
  const [is24Hour] = useState(() => getCalendars()[0].uses24hourClock ?? dateFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === false);
  const [hour, setHour] = useState(() => String(is24Hour ? value.getHours() : value.getHours() % 12 || 12).padStart(2, '0'));
  const [minute, setMinute] = useState(() => String(value.getMinutes()).padStart(2, '0'));
  const [period, setPeriod] = useState<'AM' | 'PM'>(() => value.getHours() >= 12 ? 'PM' : 'AM');
  const hourRef = useRef<TextInput>(null);
  const minuteRef = useRef<TextInput>(null);
  const time = parseReminderClock(hour, minute, is24Hour ? null : period);
  const close = () => { Keyboard.dismiss(); onDismiss(); };
  const confirm = () => { if (time) { Keyboard.dismiss(); onConfirm(time.hours, time.minutes); } };
  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onShow={() => hourRef.current?.focus()} onRequestClose={close}>
    <KeyboardAvoidingView behavior="height" style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cancel time selection" onPress={close} style={StyleSheet.absoluteFill} />
      <View accessibilityViewIsModal style={[styles.dialog, controls.panel, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>Set time</AppText>
          <AppText style={[styles.hint, { color: theme.textSecondary }]}>Enter the hour and minute.</AppText>
          <View style={styles.fields}>
            <View style={styles.field}>
              <AppText style={[styles.label, { color: theme.textSecondary }]}>Hour</AppText>
              <TextInput ref={hourRef} selectTextOnFocus accessibilityLabel={is24Hour ? 'Hour, 0 to 23' : 'Hour, 1 to 12'} keyboardType="number-pad" returnKeyType="next" maxLength={2} value={hour} onChangeText={(text) => setHour(text.replace(/\D/g, ''))} onSubmitEditing={() => minuteRef.current?.focus()} selectionColor={accent} style={[styles.input, controls.input, font, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: accent }]} />
            </View>
            <AppText style={[styles.colon, { color: theme.textPrimary }]}>:</AppText>
            <View style={styles.field}>
              <AppText style={[styles.label, { color: theme.textSecondary }]}>Minute</AppText>
              <TextInput ref={minuteRef} selectTextOnFocus accessibilityLabel="Minute, 0 to 59" keyboardType="number-pad" returnKeyType="done" maxLength={2} value={minute} onChangeText={(text) => setMinute(text.replace(/\D/g, ''))} onSubmitEditing={confirm} selectionColor={accent} style={[styles.input, controls.input, font, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: accent }]} />
            </View>
          </View>
          {!is24Hour ? <View accessibilityRole="radiogroup" accessibilityLabel="AM or PM" style={styles.periods}>
            {(['AM', 'PM'] as const).map((item) => <Pressable key={item} accessibilityRole="radio" accessibilityState={{ selected: item === period }} onPress={() => setPeriod(item)} style={[styles.period, controls.button, { backgroundColor: item === period ? accent : theme.surfaceElevated, borderColor: item === period ? accent : theme.borderSubtle }]}>
              <AppText weight="600" style={{ color: item === period ? accentOn : theme.textPrimary }}>{item}</AppText>
            </Pressable>)}
          </View> : null}
          {!time ? <AppText accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>Use {is24Hour ? '0–23' : '1–12'} for the hour and 0–59 for minutes.</AppText> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={close} style={styles.action}><AppText weight="600" style={{ color: theme.textSecondary }}>Cancel</AppText></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Confirm reminder time" disabled={!time} accessibilityState={{ disabled: !time }} onPress={confirm} style={[styles.action, controls.button, { backgroundColor: accent }, !time && styles.disabled]}><AppText weight="600" style={{ color: accentOn }}>Done</AppText></Pressable>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, maxHeight: '90%', borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  content: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  hint: { marginTop: 8, fontSize: 14 },
  fields: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 24 },
  field: { flex: 1, gap: 8 },
  label: { fontSize: 14 },
  input: { height: 64, textAlign: 'center', fontSize: 32, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 8 },
  colon: { fontSize: 32, paddingBottom: 12 },
  periods: { flexDirection: 'row', gap: 10, marginTop: 20 },
  period: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  error: { fontSize: 13, marginTop: 16 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  action: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  disabled: { opacity: 0.45 },
});
