import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { showPermissionSettingsPrompt } from '@/components/permissions/permission-settings-prompt';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import type { SetReminderResult } from '@/services/reminders';
import {
  defaultCustomReminderTime, formatReminder, formatReminderClock, formatReminderDay, isValidReminderTime,
  reminderQuickOptions, withDate, withTime, type ReminderQuickKey,
} from '@/services/reminder-time';

type Choice = ReminderQuickKey | 'custom';
type Props = {
  visible: boolean;
  /** The note's current reminder (ms), or null when there isn't one. */
  existing: number | null;
  /** Board accent (or theme accent) for the selected state and the main button. */
  accent: string;
  accentOn: string;
  onClose: () => void;
  onSave: (date: Date) => Promise<SetReminderResult>;
  onRemove: () => Promise<void>;
};

const QUICK_ICONS: Record<ReminderQuickKey, React.ComponentProps<typeof Ionicons>['name']> = {
  'later-today': 'time-outline',
  tomorrow: 'sunny-outline',
  weekend: 'cafe-outline',
};

/**
 * "Remind me" for a note or card: quick choices, then a date and a time the user can
 * adjust, and one clear button. No text field, so no keyboard. The system
 * pickers are used for date/time (inline compact pickers on iOS, the Material
 * dialogs on Android).
 */
export function ReminderSheet({ visible, existing, accent, accentOn, onClose, onSave, onRemove }: Props) {
  const { scheme, tokens: theme } = useTheme();
  const controls = useStickyControls();
  // Initial state comes from props at mount; the parent remounts the sheet
  // (new `key`) each time it opens, so it always starts from the note's current
  // reminder — or Tomorrow when there isn't one.
  const [initial] = useState(() => {
    const opened = new Date();
    const quick = reminderQuickOptions(opened);
    if (existing) return { now: opened, choice: (quick.find((option) => option.date.getTime() === existing)?.key ?? 'custom') as Choice, value: new Date(existing) };
    return { now: opened, choice: 'tomorrow' as Choice, value: quick.find((option) => option.key === 'tomorrow')!.date };
  });
  const [now, setNow] = useState(initial.now);
  const [choice, setChoice] = useState<Choice>(initial.choice);
  const [value, setValue] = useState<Date>(initial.value);
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  // "Pick date & time" on Android runs the date dialog then the time dialog.
  const [chainTime, setChainTime] = useState(false);
  const [problem, setProblem] = useState<'past' | 'declined' | 'failed' | null>(null);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const options = useMemo(() => reminderQuickOptions(now), [now]);

  // Keep "now" current while open so "Today"/validation don't go stale.
  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(timer);
  }, [visible]);

  const valid = isValidReminderTime(value, now);
  const unchanged = existing !== null && value.getTime() === existing;

  const pick = (next: Date, nextChoice: Choice) => {
    setValue(next);
    setChoice(nextChoice);
    setProblem(null);
  };

  const chooseCustom = () => {
    const base = choice === 'custom' ? value : defaultCustomReminderTime(new Date());
    pick(base, 'custom');
    if (Platform.OS === 'android') { setChainTime(true); setAndroidPicker('date'); }
  };

  const close = () => { if (!busy) onClose(); };

  const save = async () => {
    if (busy) return;
    const current = new Date();
    if (!isValidReminderTime(value, current)) { setNow(current); setProblem('past'); return; }
    setBusy('save');
    setProblem(null);
    const result = await onSave(value);
    setBusy(null);
    if (result.ok) onClose();
    // Declined on an earlier attempt and tried again: offer Settings explicitly.
    else if (result.reason === 'blocked') showPermissionSettingsPrompt('notifications');
    else setProblem(result.reason);
  };

  const remove = async () => {
    if (busy) return;
    setBusy('remove');
    try { await onRemove(); onClose(); } finally { setBusy(null); }
  };

  const title = existing ? 'Reminder' : 'Remind me';
  const primaryLabel = existing ? 'Change Reminder' : 'Set Reminder';
  const primaryDisabled = !valid || unchanged || busy !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close reminder" style={StyleSheet.absoluteFill} onPress={close} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
          <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
          <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: theme.surfaceElevated }]}><Icon name={existing ? 'notifications' : 'notifications-outline'} size={18} color={accent} /></View>
              <View style={styles.flex}>
                <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{title}</AppText>
                <AppText style={[styles.subtitle, { color: theme.textSecondary }]}>{existing ? `Set for ${formatReminder(new Date(existing), now)}` : 'Get notified about this card'}</AppText>
              </View>
            </View>

            <View accessibilityRole="radiogroup" style={[styles.group, controls.panel, { borderColor: theme.borderSubtle }]}>
              {options.map((option, index) => (
                <OptionRow
                  key={option.key}
                  icon={QUICK_ICONS[option.key]}
                  label={option.label}
                  detail={quickDetail(option.key, option.date)}
                  selected={choice === option.key}
                  first={index === 0}
                  accent={accent}
                  onPress={() => pick(option.date, option.key)}
                />
              ))}
              <OptionRow icon="calendar-outline" label="Pick date & time" detail={choice === 'custom' ? formatReminder(value, now) : null} selected={choice === 'custom'} first={false} accent={accent} onPress={chooseCustom} />
            </View>

            <AppText style={[styles.sectionLabel, { color: theme.textMuted }]}>DATE & TIME</AppText>
            <View style={[styles.group, controls.panel, { borderColor: theme.borderSubtle }]}>
              <FieldRow label="Date" first>
                {Platform.OS === 'ios'
                  ? <DateTimePicker style={styles.iosDate} value={value} mode="date" display="compact" minimumDate={startOfDay(now)} accentColor={accent} themeVariant={scheme === 'dark' ? 'dark' : 'light'} onValueChange={(_, date) => pick(withDate(value, date.getFullYear(), date.getMonth(), date.getDate()), 'custom')} />
                  : <FieldButton text={formatReminderDay(value, now)} label={`Date, ${formatReminderDay(value, now)}. Change date`} onPress={() => setAndroidPicker('date')} />}
              </FieldRow>
              <FieldRow label="Time" first={false}>
                {Platform.OS === 'ios'
                  ? <DateTimePicker style={styles.iosTime} value={value} mode="time" display="compact" accentColor={accent} themeVariant={scheme === 'dark' ? 'dark' : 'light'} onValueChange={(_, date) => pick(withTime(value, date.getHours(), date.getMinutes()), 'custom')} />
                  : <FieldButton text={formatReminderClock(value)} label={`Time, ${formatReminderClock(value)}. Change time`} onPress={() => setAndroidPicker('time')} />}
              </FieldRow>
            </View>

            {problem === 'past' || (!valid && !busy) ? (
              <View accessibilityRole="alert" style={styles.inline}><Icon name="alert-circle-outline" size={16} color={theme.danger} /><AppText style={[styles.inlineText, { color: theme.danger }]}>Choose a future time.</AppText></View>
            ) : null}
            {problem === 'declined' ? (
              // Just declined at the system prompt: a plain status line only — no
              // prompt and no Settings shortcut (App Review Guideline 5.1.1(iv)).
              <View accessibilityRole="alert" style={styles.inline}><Icon name="notifications-off-outline" size={16} color={theme.textSecondary} /><AppText style={[styles.inlineText, { color: theme.textSecondary }]}>Reminder not set. Notifications aren’t allowed for Chits.</AppText></View>
            ) : null}
            {problem === 'failed' ? (
              <View accessibilityRole="alert" style={styles.inline}><Icon name="alert-circle-outline" size={16} color={theme.danger} /><AppText style={[styles.inlineText, { color: theme.danger }]}>The reminder couldn’t be set. Please try again.</AppText></View>
            ) : null}

          </ScrollView>
          <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
            {existing ? (
              <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void remove()} style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
                {busy === 'remove' ? <ActivityIndicator size="small" color={theme.danger} /> : <AppText style={[styles.textButtonLabel, { color: theme.danger }]}>Remove Reminder</AppText>}
              </Pressable>
            ) : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" disabled={busy !== null} onPress={close} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
                <AppText style={[styles.textButtonLabel, { color: theme.textSecondary }]}>Cancel</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: primaryDisabled }}
                disabled={primaryDisabled}
                onPress={() => void save()}
                style={({ pressed }) => [styles.primary, controls.button, { backgroundColor: accent }, primaryDisabled && styles.disabled, pressed && !primaryDisabled && styles.pressed]}
              >
                {busy === 'save' ? <ActivityIndicator size="small" color={accentOn} /> : <AppText style={[styles.primaryLabel, { color: accentOn }]}>{primaryLabel}</AppText>}
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {Platform.OS === 'android' && androidPicker === 'date' ? (
        <DateTimePicker
          value={value}
          mode="date"
          presentation="dialog"
          minimumDate={startOfDay(now)}
          accentColor={accent}
          // The Material date dialog returns UTC midnight of the chosen day.
          onValueChange={(_, date) => { setAndroidPicker(chainTime ? 'time' : null); setChainTime(false); pick(withDate(value, date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()), 'custom'); }}
          onDismiss={() => { setAndroidPicker(null); setChainTime(false); }}
        />
      ) : null}
      {Platform.OS === 'android' && androidPicker === 'time' ? (
        <DateTimePicker
          value={value}
          mode="time"
          presentation="dialog"
          accentColor={accent}
          onValueChange={(_, date) => { setAndroidPicker(null); pick(withTime(value, date.getHours(), date.getMinutes()), 'custom'); }}
          onDismiss={() => setAndroidPicker(null)}
        />
      ) : null}
    </Modal>
  );
}

// The option's label already names the day ("Later today", "Tomorrow"), so
// only the time is added; the weekend option adds the weekday.
function quickDetail(key: ReminderQuickKey, date: Date) {
  if (key === 'weekend') return `${new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date)}, ${formatReminderClock(date)}`;
  return formatReminderClock(date);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function OptionRow({ icon, label, detail, selected, first, accent, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; detail: string | null; selected: boolean; first: boolean; accent: string; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle }, pressed && { backgroundColor: theme.surfaceElevated }]}
    >
      <Icon name={icon} size={19} color={selected ? accent : theme.textSecondary} />
      <AppText style={[styles.rowLabel, { color: theme.textPrimary }, selected && styles.rowLabelSelected]}>{label}</AppText>
      {detail ? <AppText numberOfLines={1} style={[styles.rowDetail, { color: selected ? accent : theme.textMuted }]}>{detail}</AppText> : null}
      <Icon name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={selected ? accent : theme.borderSubtle} />
    </Pressable>
  );
}

function FieldRow({ label, first, children }: { label: string; first: boolean; children: React.ReactNode }) {
  const { tokens: theme } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle }]}>
      <AppText style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</AppText>
      <View style={styles.fieldValue}>{children}</View>
    </View>
  );
}

function FieldButton({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.fieldButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
      <AppText style={[styles.fieldButtonText, { color: theme.textPrimary }]}>{text}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  sheet: { maxHeight: '92%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, borderRadius: 2 },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  headerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
  subtitle: { marginTop: 1, fontSize: 13, lineHeight: 18 },
  group: { overflow: 'hidden', borderRadius: radii.compactCard, borderWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowLabelSelected: { fontWeight: '700' },
  rowDetail: { maxWidth: '48%', fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  fieldValue: { alignItems: 'flex-end', justifyContent: 'center' },
  // iOS compact pickers size to their content; give them room so they're never clipped.
  iosDate: { width: 170 },
  iosTime: { width: 110 },
  fieldButton: { minHeight: 34, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.control - 2 },
  fieldButtonText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  inlineText: { fontSize: 13, fontWeight: '600' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.md },
  removeButton: { minHeight: 40, alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  actions: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.xs },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  textButtonLabel: { fontSize: 15, fontWeight: '600' },
  primary: { minHeight: 46, minWidth: 132, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.control },
  primaryLabel: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.64 },
});
