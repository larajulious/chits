import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import type { CalendarItem, CalendarItemType } from '@/features/calendar/calendar-data';
import { formatScheduleTime, parseDayKey } from '@/features/calendar/calendar-schedule';
import { formatReminder, formatReminderClock, dateFormat } from '@/services/reminder-time';

/**
 * Entry colors by kind — Chits' own Ocean Blue, Plum, Honey and Green accents,
 * deep enough that white text on them stays readable (≥ 4.5:1) on light and
 * dark pages alike.
 */
export const ENTRY_COLORS: Record<CalendarItemType, string> = {
  note: '#3D6D9B',
  card: '#844B98',
  reminder: '#8A6414',
  space: '#3D6E5C',
};
export const ENTRY_INK = '#FFFFFF';
export const ENTRY_TYPE_LABEL: Record<CalendarItemType, string> = { get note() { return tr("calendarentry.calendarNote"); }, get card() { return tr("calendarentry.boardCard"); }, get reminder() { return tr("id.reminder"); }, get space() { return tr("calendarentry.spaceNote"); } };

/** Where it sits in its day: the planned time, or the reminder's time. */
export function entryTimeLabel(item: CalendarItem): string {
  if (item.plan && item.occurrence === 'plan') return formatScheduleTime(item.plan);
  return formatReminderClock(new Date(item.scheduledAt));
}

export function entryAccessibilityLabel(item: CalendarItem, now: number): string {
  const parts = [item.title, entryTimeLabel(item), ENTRY_TYPE_LABEL[item.type], item.source];
  if (item.reminderAt !== null) parts.push(item.reminderAt < now ? tr("calendarentry.reminderOverdue") : `reminder ${formatReminder(new Date(item.reminderAt), new Date(now))}`);
  return parts.join(', ');
}

/** One entry in a list (day panel, week, agenda, search): color bar, time, title, source and reminder. */
export const EntryRow = memo(function EntryRow({ item, now, showDate = false, onOpen, onActions }: { item: CalendarItem; now: number; showDate?: boolean; onOpen: (item: CalendarItem) => void; onActions: (item: CalendarItem) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const overdue = item.reminderAt !== null && item.reminderAt < now;
  const day = showDate ? parseDayKey(item.dateKey) : null;
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("revisit.openValue", { value1: entryAccessibilityLabel(item, now) })} accessibilityHint={tr("calendarentry.opensTheNote")} onPress={() => onOpen(item)} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <View style={[styles.bar, { backgroundColor: ENTRY_COLORS[item.type] }]} />
        <View style={styles.timeColumn}>
          {day ? <AppText numberOfLines={1} style={[styles.dateText, { color: theme.textSecondary }]}>{dateFormat(undefined, { month: 'short', day: 'numeric' }).format(day)}</AppText> : null}
          <AppText numberOfLines={2} style={[styles.time, { color: theme.textPrimary }]}>{entryTimeLabel(item)}</AppText>
        </View>
        <View style={styles.copy}>
          <AppText numberOfLines={2} style={[styles.title, { color: theme.textPrimary }]}>{item.title}</AppText>
          <View style={styles.meta}>
            <AppText numberOfLines={1} style={[styles.metaText, { color: theme.textSecondary }]}>{item.source}</AppText>
            {item.attachmentCount > 0 ? <View style={styles.metaIcon}><Icon name="attach-outline" size={13} color={theme.textMuted} /><AppText style={[styles.metaText, { color: theme.textMuted }]}>{item.attachmentCount}</AppText></View> : null}
            {item.reminderAt !== null ? <View style={styles.metaIcon}>
              <Icon name={overdue ? 'notifications-off-outline' : 'notifications-outline'} size={13} color={overdue ? theme.danger : theme.textSecondary} />
              <AppText numberOfLines={1} style={[styles.metaText, { color: overdue ? theme.danger : theme.textSecondary }]}>{overdue ? tr("calendarentry.overdue") : formatReminder(new Date(item.reminderAt), new Date(now))}</AppText>
            </View> : null}
          </View>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarentry.moreActionsForValue", { value1: item.title })} onPress={() => onActions(item)} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
        <Icon name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
});

/**
 * The selected day under the month grid: its entries, or a friendly empty
 * state, with Add note always one tap away. It takes the lower part of the
 * screen and the grid shrinks above it, so the month stays visible.
 */
export function DayPanel({ dateKey, items, now, onAdd, onClose, onOpen, onActions }: { dateKey: string; items: CalendarItem[]; now: number; onAdd: () => void; onClose: () => void; onOpen: (item: CalendarItem) => void; onActions: (item: CalendarItem) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const day = parseDayKey(dateKey);
  const title = day ? dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(day) : dateKey;
  return (
    <View style={[styles.panel, { backgroundColor: theme.background, borderTopColor: theme.borderSubtle }]}>
      <View style={styles.panelHeader}>
        <View style={styles.flex}>
          <AppText accessibilityRole="header" numberOfLines={1} style={[styles.panelTitle, { color: theme.textPrimary }]}>{title}</AppText>
          <AppText style={[styles.panelCount, { color: theme.textMuted }]}>{items.length ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : tr("calendarentry.nothingPlanned")}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("calendar.addNoteOnValue", { value1: title })} onPress={onAdd} style={({ pressed }) => [styles.addButton, { backgroundColor: theme.accentStrong }, pressed && styles.pressed]}>
          <Icon name="add" size={18} color={theme.background} />
          <AppText style={[styles.addText, { color: theme.background }]}>{tr("addnotesheet.add")}</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarentry.closeDay")} onPress={onClose} hitSlop={4} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>
      {items.length ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.panelList}>
          {items.map((item) => <EntryRow key={item.key} item={item} now={now} onOpen={onOpen} onActions={onActions} />)}
        </ScrollView>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarentry.nothingPlannedForValueAddANote", { value1: title })} onPress={onAdd} style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}><Icon name="create-outline" size={22} color={theme.accentStrong} /></View>
          <AppText style={[styles.emptyTitle, { color: theme.textPrimary }]}>{tr("calendarentry.aClearDay")}</AppText>
          <AppText style={[styles.emptyText, { color: theme.textSecondary }]}>{tr("calendarentry.tapToJotDownANoteOrSet")}</AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.compactCard, overflow: 'hidden', minHeight: 64 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, paddingRight: spacing.xs },
  bar: { width: 4, alignSelf: 'stretch', marginVertical: -spacing.sm },
  timeColumn: { width: 76, gap: 2 },
  dateText: { fontSize: 12, fontWeight: '700' },
  time: { fontSize: 12, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: spacing.xxs },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs, rowGap: 2 },
  metaIcon: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  metaText: { fontSize: 12, flexShrink: 1 },
  more: { width: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.64 },
  panel: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  panelTitle: { fontSize: 16, fontWeight: '700' },
  panelCount: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  addButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, borderRadius: radii.pill },
  addText: { fontSize: 14, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  panelList: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.xs },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  emptyIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
