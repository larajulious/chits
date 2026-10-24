import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { PAPERS, PAPER_CONFETTI, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PaperNote, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { stableTilt } from '@/constants/style-tokens';
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

/**
 * Entries on the desk are paper slips, one pastel per kind, so the four kinds
 * read apart at a glance; `ENTRY_MARKS` are deeper cuts for dots. Ink is the
 * papers' own, in every appearance.
 */
export const ENTRY_PAPERS: Record<CalendarItemType, string> = { note: PAPERS[3], card: PAPERS[5], reminder: PAPERS[0], space: PAPERS[2] };
export const ENTRY_MARKS: Record<CalendarItemType, string> = { note: PAPER_CONFETTI[3], card: PAPER_CONFETTI[5], reminder: PAPER_CONFETTI[0], space: PAPER_CONFETTI[2] };
/** Red ink, for today's circle, the current time and overdue reminders. */
export const RED_INK = '#B8372E';

/** One entry in a list (day panel, week, agenda, search): a paper slip with its time, title, source and reminder. */
export const EntryRow = memo(function EntryRow({ item, now, showDate = false, onOpen, onActions }: { item: CalendarItem; now: number; showDate?: boolean; onOpen: (item: CalendarItem) => void; onActions: (item: CalendarItem) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const overdue = item.reminderAt !== null && item.reminderAt < now;
  const day = showDate ? parseDayKey(item.dateKey) : null;
  const tilt = stableTilt(`entry:${item.key}`, 0.6);
  return (
    <View style={[styles.row, { backgroundColor: ENTRY_PAPERS[item.type], boxShadow: `0px 4px 10px ${desk.shadow}`, transform: [{ rotate: `${tilt}deg` }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("revisit.openValue", { value1: entryAccessibilityLabel(item, now) })} accessibilityHint={tr("calendarentry.opensTheNote")} onPress={() => onOpen(item)} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <View style={styles.timeColumn}>
          {day ? <AppText numberOfLines={1} style={[styles.dateText, { color: PAPER_INK_MUTED }]}>{dateFormat(undefined, { month: 'short', day: 'numeric' }).format(day)}</AppText> : null}
          <AppText numberOfLines={2} style={[styles.time, { color: PAPER_INK }]}>{entryTimeLabel(item)}</AppText>
        </View>
        <View style={styles.copy}>
          <AppText numberOfLines={2} style={[handBold, styles.title, { color: PAPER_INK }]}>{item.title}</AppText>
          <View style={styles.meta}>
            <AppText numberOfLines={1} style={[styles.metaText, { color: PAPER_INK_MUTED }]}>{item.source}</AppText>
            {item.attachmentCount > 0 ? <View style={styles.metaIcon}><Icon name="attach-outline" size={13} color={PAPER_INK_MUTED} /><AppText style={[styles.metaText, { color: PAPER_INK_MUTED }]}>{item.attachmentCount}</AppText></View> : null}
            {item.reminderAt !== null ? <View style={styles.metaIcon}>
              <Icon name={overdue ? 'notifications-off-outline' : 'notifications-outline'} size={13} color={overdue ? RED_INK : PAPER_INK_MUTED} />
              <AppText numberOfLines={1} style={[styles.metaText, { color: overdue ? RED_INK : PAPER_INK_MUTED }, overdue && styles.overdue]}>{overdue ? tr("calendarentry.overdue") : formatReminder(new Date(item.reminderAt), new Date(now))}</AppText>
            </View> : null}
          </View>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarentry.moreActionsForValue", { value1: item.title })} onPress={() => onActions(item)} style={({ pressed }) => [styles.more, pressed && styles.pressed]}>
        <Icon name="ellipsis-horizontal" size={20} color={PAPER_INK_MUTED} />
      </Pressable>
    </View>
  );
});

/**
 * The selected day under the month grid, on the desk: its date handwritten,
 * its entries as slips, or a friendly empty state, with Add one tap away. It
 * takes the lower part of the screen and the grid shrinks above it.
 */
export function DayPanel({ dateKey, items, now, onAdd, onClose, onOpen, onActions }: { dateKey: string; items: CalendarItem[]; now: number; onAdd: () => void; onClose: () => void; onOpen: (item: CalendarItem) => void; onActions: (item: CalendarItem) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const day = parseDayKey(dateKey);
  const title = day ? dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(day) : dateKey;
  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.flex}>
          <AppText accessibilityRole="header" numberOfLines={1} style={[handBold, styles.panelTitle, { color: desk.ink }]}>{title}</AppText>
          <AppText style={[styles.panelCount, { color: desk.inkMuted }]}>{items.length ? `${items.length} ${items.length === 1 ? 'entry' : 'entries'}` : tr("calendarentry.nothingPlanned")}</AppText>
        </View>
        <PaperTab paper={PAPER_YELLOW} tilt={-2} icon="add" label={tr("addnotesheet.add")} accessibilityRole="button" accessibilityLabel={tr("calendar.addNoteOnValue", { value1: title })} onPress={onAdd} />
        <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarentry.closeDay")} onPress={onClose} hitSlop={4} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
          <Icon name="close" size={22} color={desk.inkMuted} />
        </Pressable>
      </View>
      {items.length ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.panelList}>
          {items.map((item) => <EntryRow key={item.key} item={item} now={now} onOpen={onOpen} onActions={onActions} />)}
        </ScrollView>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarentry.nothingPlannedForValueAddANote", { value1: title })} onPress={onAdd} style={({ pressed }) => [styles.empty, pressed && styles.pressed]}>
          <PaperNote paper={PAPER_WHITE} tilt={-1.5} tape style={styles.emptyNote}>
            <Icon name="create-outline" size={22} color={PAPER_INK} />
            <AppText style={[handBold, styles.emptyTitle]}>{tr("calendarentry.aClearDay")}</AppText>
            <AppText style={styles.emptyText}>{tr("calendarentry.tapToJotDownANoteOrSet")}</AppText>
          </PaperNote>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 3, minHeight: 64 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.xs },
  timeColumn: { width: 70, gap: 2, paddingTop: 3 },
  dateText: { fontSize: 12, fontWeight: '700' },
  time: { fontSize: 12, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  copy: { flex: 1, gap: 1 },
  title: { fontSize: 18, lineHeight: 24 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs, rowGap: 2 },
  metaIcon: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
  metaText: { fontSize: 12, flexShrink: 1 },
  overdue: { fontWeight: '700' },
  more: { width: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.64 },
  panel: { flex: 1 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  panelTitle: { fontSize: 22, lineHeight: 29 },
  panelCount: { fontSize: 12, fontWeight: '600', marginTop: -1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  panelList: { paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: spacing.md, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  emptyNote: { alignItems: 'center', gap: 2, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 14, maxWidth: 280 },
  emptyTitle: { color: PAPER_INK, fontSize: 20, lineHeight: 26 },
  emptyText: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
