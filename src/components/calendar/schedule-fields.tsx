import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { ReminderDatePicker } from '@/components/reminders/reminder-date-picker.native';
import { ReminderTimePicker } from '@/components/reminders/reminder-time-picker.native';
import { ExactAlarmNotice, useExactAlarmAccess } from '@/components/reminders/exact-alarm-notice';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Chip, ChipRow } from '@/components/ui/controls';
import { Icon, type IconName } from '@/components/ui/icon';
import { useStickyControls } from '@/components/ui/surface';
import { radii, spacing } from '@/constants/theme';
import { reminderInPast, type CalendarDestination, type ReminderChoice, type ScheduleDraft } from '@/features/calendar/calendar-actions';
import {
  DAY_MINUTES, DEFAULT_DURATION_MINUTES, formatMinute, localDayKey, parseDayKey, reminderPresets,
} from '@/features/calendar/calendar-schedule';
import { formatReminder, formatReminderDay } from '@/services/reminder-time';

type Props = {
  value: ScheduleDraft;
  onChange: (next: ScheduleDraft) => void;
  /** Where a new note is saved; omitted when editing an existing note's schedule. */
  destination?: CalendarDestination;
  destinations?: CalendarDestination[];
  onDestinationChange?: (next: CalendarDestination) => void;
};

/** A sensible first time for a note added to a day: the next whole hour today, else 9:00. */
export function defaultStartMinute(dateKey: string, now = new Date()): number {
  if (dateKey !== localDayKey(now)) return 9 * 60;
  return Math.min(DAY_MINUTES - DEFAULT_DURATION_MINUTES, (now.getHours() + 1) * 60);
}

/**
 * The day, time and reminder of a calendar note, as compact grouped rows:
 * Date, All day, Starts/Ends, a row of reminder choices and (when adding)
 * where the note is saved. The day and times use the shared Chits pickers on
 * iOS and Android.
 */
export function ScheduleFields({ value, onChange, destination, destinations, onDestinationChange }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const [picker, setPicker] = useState<'date' | 'start' | 'end' | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customKey, setCustomKey] = useState(0);
  const day = parseDayKey(value.dateKey) ?? new Date();
  const allDay = value.startMinute === null;
  const start = value.startMinute ?? 9 * 60;
  const end = value.endMinute ?? Math.min(DAY_MINUTES, start + DEFAULT_DURATION_MINUTES);
  const presets = reminderPresets(value);
  const past = reminderInPast(value);
  const wantsReminder = value.reminder.mode !== 'none';
  const alarmAccess = useExactAlarmAccess(wantsReminder);

  // A relative reminder that doesn't exist for the new kind of day (e.g. "5 min
  // before" on an all-day note) falls back to the first preset.
  const fitReminder = (next: ScheduleDraft): ScheduleDraft => (next.reminder.mode === 'offset' && !reminderPresets(next).some((preset) => preset.offset === (next.reminder as { offset: number }).offset)
    ? { ...next, reminder: { mode: 'offset', offset: reminderPresets(next)[0].offset } }
    : next);
  const update = (patch: Partial<ScheduleDraft>) => onChange(fitReminder({ ...value, ...patch }));
  const setDay = (year: number, month: number, date: number) => update({ dateKey: localDayKey(new Date(year, month, date)) });
  const setStart = (minute: number) => {
    // Moving the start keeps the length, as calendars do.
    const length = Math.max(0, end - start);
    update({ startMinute: minute, endMinute: Math.min(DAY_MINUTES, minute + (length || DEFAULT_DURATION_MINUTES)) });
  };
  const setEnd = (minute: number) => update({ endMinute: minute <= start ? Math.min(DAY_MINUTES, start + DEFAULT_DURATION_MINUTES) : minute });
  const toggleAllDay = (next: boolean) => update(next
    ? { startMinute: null, endMinute: null }
    : { startMinute: defaultStartMinute(value.dateKey), endMinute: Math.min(DAY_MINUTES, defaultStartMinute(value.dateKey) + DEFAULT_DURATION_MINUTES) });
  const chooseReminder = (reminder: ReminderChoice) => onChange({ ...value, reminder });
  const timeAsDate = (minute: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minute / 60), minute % 60);

  const timeField = (which: 'start' | 'end', minute: number) =>
    <FieldButton text={formatMinute(minute % DAY_MINUTES)} label={tr("schedulefields.valueValueChangeTime", { value1: which === 'start' ? tr("schedulefields.starts") : tr("schedulefields.ends"), value2: formatMinute(minute % DAY_MINUTES) })} onPress={() => setPicker(which)} />;

  return (
    <View style={styles.root}>
      <View style={[styles.group, controls.panel, { borderColor: theme.borderSubtle }]}>
        <Row label={tr("schedulefields.date")} icon="calendar-outline" first>
          <FieldButton text={formatReminderDay(day, new Date())} label={tr("schedulefields.dateValueChangeDate", { value1: formatReminderDay(day, new Date()) })} onPress={() => setPicker('date')} />
        </Row>
        <Row label={tr("schedulefields.allDay")} icon="sunny-outline">
          <Switch accessibilityLabel={tr("schedulefields.allDay")} value={allDay} onValueChange={toggleAllDay} trackColor={{ true: theme.accentStrong, false: theme.borderSubtle }} thumbColor={Platform.OS === 'android' ? theme.surface : undefined} ios_backgroundColor={theme.borderSubtle} />
        </Row>
        {!allDay ? <>
          <Row label={tr("schedulefields.starts")} icon="time-outline">{timeField('start', start)}</Row>
          <Row label={tr("schedulefields.ends")} icon="hourglass-outline">{timeField('end', end)}</Row>
        </> : null}
      </View>

      <AppText style={[styles.sectionLabel, { color: theme.textMuted }]}>{tr("schedulefields.reminder")}</AppText>
      <ChipRow>
        <Chip label={tr("schedulefields.none")} selected={value.reminder.mode === 'none'} onPress={() => chooseReminder({ mode: 'none' })} accessibilityLabel={tr("schedulefields.noReminder")} />
        {presets.map((preset) => (
          <Chip key={preset.offset} label={preset.label} selected={value.reminder.mode === 'offset' && value.reminder.offset === preset.offset} onPress={() => chooseReminder({ mode: 'offset', offset: preset.offset })} accessibilityLabel={tr("schedulefields.remindValue", { value1: preset.label })} />
        ))}
        <Chip label={value.reminder.mode === 'custom' ? formatReminder(new Date(value.reminder.at), new Date()) : tr('schedulefields.custom')} selected={value.reminder.mode === 'custom'} onPress={() => { setCustomKey((key) => key + 1); setCustomOpen(true); }} accessibilityLabel={tr("schedulefields.remindAtACustomDateAndTime")} />
      </ChipRow>
      {wantsReminder && alarmAccess === false ? <ExactAlarmNotice action={tr("schedulefields.saveThisReminder")} /> : null}
      {past ? <View accessibilityRole="alert" style={styles.inline}><Icon name="alert-circle-outline" size={16} color={theme.danger} /><AppText style={[styles.inlineText, { color: theme.danger }]}>{tr("schedulefields.thatReminderTimeHasPassedChooseAnother")}</AppText></View> : null}

      {destination && destinations && onDestinationChange ? <>
        <AppText style={[styles.sectionLabel, { color: theme.textMuted }]}>{tr("schedulefields.saveTo")}</AppText>
        <ChipRow>
          {destinations.map((option) => {
            const key = destinationKey(option);
            const label = option.type === 'chat' ? tr("calendarnotepicker.chat") : option.label;
            return <Chip key={key} label={label} selected={key === destinationKey(destination)} onPress={() => onDestinationChange(option)} accessibilityLabel={tr("schedulefields.saveToValue", { value1: option.type === 'chat' ? tr("calendarnotepicker.chat") : `${option.type === 'board' ? 'board' : 'space'} ${option.label}` })} />;
          })}
        </ChipRow>
      </> : null}

      {picker === 'date' ? (
        <ReminderDatePicker
          value={day}
          prompt={tr('reminderDatePicker.dayPrompt')}
          onConfirm={(year, month, date) => { setPicker(null); setDay(year, month, date); }}
          onDismiss={() => setPicker(null)}
        />
      ) : null}
      {picker === 'start' || picker === 'end' ? (
        <ReminderTimePicker
          value={timeAsDate((picker === 'start' ? start : end) % DAY_MINUTES)}
          prompt={tr(picker === 'start' ? 'reminderTimePicker.startPrompt' : 'reminderTimePicker.endPrompt')}
          onConfirm={(hours, minutes) => { const which = picker; setPicker(null); const minute = hours * 60 + minutes; if (which === 'start') setStart(minute); else setEnd(minute || DAY_MINUTES); }}
          onDismiss={() => setPicker(null)}
        />
      ) : null}
      <ReminderSheet
        key={customKey}
        visible={customOpen}
        existing={value.reminder.mode === 'custom' ? value.reminder.at : null}
        accent={theme.accentStrong}
        accentOn={theme.background}
        onClose={() => setCustomOpen(false)}
        // Only picks the time here; the reminder is scheduled when the note is saved.
        onSave={async (date) => { chooseReminder({ mode: 'custom', at: date.getTime() }); return { ok: true }; }}
        onRemove={async () => chooseReminder({ mode: 'none' })}
      />
    </View>
  );
}

export function destinationKey(destination: CalendarDestination): string {
  return destination.type === 'chat' ? 'chat' : destination.type === 'board' ? `board:${destination.boardId}` : `space:${destination.spaceId}`;
}

function Row({ label, icon, first = false, children }: { label: string; icon: IconName; first?: boolean; children: React.ReactNode }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle }]}>
      <Icon name={icon} size={18} color={theme.textSecondary} />
      <AppText style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</AppText>
      <View style={styles.fieldValue}>{children}</View>
    </View>
  );
}

function FieldButton({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.fieldButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
      <AppText style={[styles.fieldButtonText, { color: theme.textPrimary }]}>{text}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xxs },
  group: { overflow: 'hidden', borderRadius: radii.compactCard, borderWidth: StyleSheet.hairlineWidth },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  fieldValue: { alignItems: 'flex-end', justifyContent: 'center' },
  fieldButton: { minHeight: 34, minWidth: 88, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.control - 2 },
  fieldButtonText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xxs, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xxs },
  inlineText: { flex: 1, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.64 },
});
