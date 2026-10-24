import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import { DeskHeading, PAPER_INK, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import type { CalendarItem } from '@/features/calendar/calendar-data';
import { addLocalDays, DAY_MINUTES, formatMinute, layoutDayLanes, localDayKey, minuteOfDay, parseDayKey } from '@/features/calendar/calendar-schedule';

import { ENTRY_PAPERS, EntryRow, entryAccessibilityLabel, entryTimeLabel } from './calendar-entry';
import { dateFormat } from '@/services/reminder-time';

type ListHandlers = { now: number; onOpen: (item: CalendarItem) => void; onActions: (item: CalendarItem) => void };

function dayHeading(date: Date, todayKey: string): string {
  const key = localDayKey(date);
  if (key === todayKey) return tr("calendarviews.today");
  if (key === localDayKey(addLocalDays(parseDayKey(todayKey)!, 1))) return tr("remindertime.tomorrow");
  return dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
}

/** Week: the seven days stacked, each with its entries or a quiet "Add" line. */
export function WeekView({ weekStartDate, itemsByDay, todayKey, bottomInset, onAddOnDay, onPressDay, ...handlers }: ListHandlers & { weekStartDate: Date; itemsByDay: Map<string, CalendarItem[]>; todayKey: string; bottomInset: number; onAddOnDay: (dateKey: string) => void; onPressDay: (dateKey: string) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { hand, handBold } = useHandwriting();
  const weekday = dateFormat(undefined, { weekday: 'short' });
  return (
    <ScrollView contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}>
      {Array.from({ length: 7 }, (_, index) => {
        const date = addLocalDays(weekStartDate, index);
        const key = localDayKey(date);
        const items = itemsByDay.get(key) ?? [];
        const today = key === todayKey;
        return (
          <View key={key} style={[styles.weekDay, { borderBottomColor: desk.rule }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarviews.valueValueValueOpenDay", { value1: dayHeading(date, todayKey), value2: items.length, value3: items.length === 1 ? 'entry' : 'entries' })} onPress={() => onPressDay(key)} style={styles.weekDate}>
              <AppText style={[styles.weekName, { color: today ? desk.danger : desk.inkMuted }]}>{weekday.format(date).toUpperCase()}</AppText>
              <View style={styles.weekNumber}>
                {today ? <View style={[styles.penCircle, { borderColor: desk.danger }]} /> : null}
                <AppText style={[handBold, styles.weekNumberText, { color: today ? desk.danger : desk.ink }]}>{date.getDate()}</AppText>
              </View>
            </Pressable>
            <View style={styles.weekEntries}>
              {items.length ? items.map((item) => <EntryRow key={item.key} item={item} {...handlers} />) : (
                <Pressable accessibilityRole="button" accessibilityLabel={tr("calendarviews.addANoteOnValue", { value1: dayHeading(date, todayKey) })} onPress={() => onAddOnDay(key)} style={({ pressed }) => [styles.weekEmpty, pressed && styles.pressed]}>
                  <Icon name="add" size={16} color={desk.inkMuted} />
                  <AppText style={[hand, styles.weekEmptyHand, { color: desk.inkMuted }]}>{tr("calendarviews.addANote")}</AppText>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const HOUR_HEIGHT = 56;
const GUTTER = 56;
const MIN_BLOCK_MINUTES = 30;

/**
 * Day: all-day notes on top, then a 24-hour timeline with timed notes as
 * blocks (side by side when they overlap) and a line at the current time.
 * Tapping an empty hour adds a note at that time.
 */
export function DayView({ dateKey, items, todayKey, bottomInset, onAddAt, ...handlers }: ListHandlers & { dateKey: string; items: CalendarItem[]; todayKey: string; bottomInset: number; onAddAt: (minute: number | null) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const scroll = useRef<ScrollView>(null);
  const allDay = items.filter((item) => item.allDay);
  const timed = useMemo(() => items.filter((item) => !item.allDay).map((item) => {
    const start = item.startMinute ?? minuteOfDay(new Date(item.scheduledAt));
    const end = Math.min(DAY_MINUTES, Math.max(start + MIN_BLOCK_MINUTES, item.endMinute ?? 0));
    return { item, start, end };
  }), [items]);
  const lanes = useMemo(() => layoutDayLanes(timed.map(({ item, start, end }) => ({ key: item.key, start, end }))), [timed]);
  const isToday = dateKey === todayKey;
  const nowMinute = minuteOfDay(new Date(handlers.now));

  // Open on the morning, the current time today, or the first note — whichever is relevant.
  useEffect(() => {
    const first = timed.length ? Math.min(...timed.map((block) => block.start)) : null;
    const target = isToday ? nowMinute - 90 : first !== null ? first - 30 : 8 * 60;
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: Math.max(0, (target / 60) * HOUR_HEIGHT), animated: false }));
    // Only when the day changes, not on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  return (
    <View style={styles.flex}>
      {allDay.length ? (
        <View style={[styles.allDay, { borderBottomColor: desk.rule }]}>
          <AppText style={[styles.allDayLabel, { color: desk.inkMuted }]}>{tr("calendarviews.allDay")}</AppText>
          <View style={styles.allDayItems}>
            {allDay.map((item) => (
              <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={tr("revisit.openValue", { value1: entryAccessibilityLabel(item, handlers.now) })} onPress={() => handlers.onOpen(item)} onLongPress={() => handlers.onActions(item)} style={({ pressed }) => [styles.allDayChip, { backgroundColor: ENTRY_PAPERS[item.type], boxShadow: `0px 3px 6px ${desk.shadow}` }, pressed && styles.pressed]}>
                {item.reminderAt !== null ? <Icon name="notifications" size={11} color={PAPER_INK} /> : null}
                <AppText numberOfLines={1} style={[styles.blockTitle, { color: PAPER_INK }]}>{item.title}</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: bottomInset }}>
        <View style={{ height: 24 * HOUR_HEIGHT }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <Pressable key={hour} accessibilityRole="button" accessibilityLabel={tr("calendarviews.addANoteAtValue", { value1: formatMinute(hour * 60) })} onPress={() => onAddAt(hour * 60)} style={[styles.hour, { top: hour * HOUR_HEIGHT, borderTopColor: desk.rule }]}>
              <AppText style={[styles.hourLabel, { color: desk.inkMuted }]}>{hour === 0 ? '' : formatMinute(hour * 60)}</AppText>
            </Pressable>
          ))}
          <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { left: GUTTER, right: spacing.xs }]}>
            {timed.map(({ item, start, end }) => {
              const lane = lanes.get(item.key) ?? { lane: 0, lanes: 1 };
              const width = 100 / lane.lanes;
              const short = end - start < 45;
              return (
                <Pressable
                  key={item.key}
                  accessibilityRole="button"
                  accessibilityLabel={tr("revisit.openValue", { value1: entryAccessibilityLabel(item, handlers.now) })}
                  accessibilityHint={tr("calendarviews.longPressForMoreActions")}
                  onPress={() => handlers.onOpen(item)}
                  onLongPress={() => handlers.onActions(item)}
                  style={({ pressed }) => [styles.block, { top: (start / 60) * HOUR_HEIGHT + 1, height: ((end - start) / 60) * HOUR_HEIGHT - 2, left: `${lane.lane * width}%`, width: `${width}%`, backgroundColor: ENTRY_PAPERS[item.type], boxShadow: `0px 3px 7px ${desk.shadow}` }, pressed && styles.pressed]}
                >
                  <View style={styles.blockLine}>
                    {item.reminderAt !== null ? <Icon name="notifications" size={11} color={PAPER_INK} /> : null}
                    <AppText numberOfLines={short ? 1 : 2} style={[styles.blockTitle, { color: PAPER_INK }]}>{item.title}</AppText>
                  </View>
                  {!short ? <AppText numberOfLines={1} style={[styles.blockTime, { color: PAPER_INK }]}>{entryTimeLabel(item)}</AppText> : null}
                </Pressable>
              );
            })}
          </View>
          {isToday ? (
            <View pointerEvents="none" style={[styles.nowLine, { top: (nowMinute / 60) * HOUR_HEIGHT, backgroundColor: desk.danger }]}>
              <View style={[styles.nowDot, { backgroundColor: desk.danger }]} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Agenda: everything from today on, in order and grouped by day, with
 * reminders that have already gone off listed first under Overdue.
 */
export function AgendaView({ items, todayKey, bottomInset, emptyText, ...handlers }: ListHandlers & { items: CalendarItem[]; todayKey: string; bottomInset: number; emptyText: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const localeVersion = useLocale();
  const desk = useDesk();
  const sections = useMemo(() => {
    void localeVersion; // Refresh translated display metadata without reloading the database.

    // Each overdue note once, even when it also shows on its reminder's day.
    const seen = new Set<string>();
    const overdue = items.filter((item) => {
      const note = `${item.kind}:${item.id}`;
      if (item.dateKey >= todayKey || item.reminderAt === null || item.reminderAt >= handlers.now || seen.has(note)) return false;
      seen.add(note);
      return true;
    });
    const groups: { key: string; title: string; data: CalendarItem[] }[] = overdue.length ? [{ key: 'overdue', title: tr("calendarentry.overdue"), data: overdue }] : [];
    for (const item of items) {
      if (item.dateKey < todayKey) continue;
      const last = groups.at(-1);
      if (last && last.key === item.dateKey) last.data.push(item);
      else groups.push({ key: item.dateKey, title: dayHeading(parseDayKey(item.dateKey)!, todayKey), data: [item] });
    }
    return groups;
  }, [items, todayKey, handlers.now, localeVersion]);
  if (!sections.length) return <View style={styles.agendaEmpty}><AppText style={[styles.weekEmptyText, { color: desk.inkMuted, textAlign: 'center' }]}>{emptyText}</AppText></View>;
  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.key}
      stickySectionHeadersEnabled
      contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
      renderSectionHeader={({ section }) => (
        <DeskHeading title={section.title} count={section.data.length} tone={section.key === 'overdue' ? desk.danger : undefined} style={[styles.sectionHeader, { backgroundColor: desk.desk }]} />
      )}
      renderItem={({ item }) => <View style={styles.agendaRow}><EntryRow item={item} {...handlers} /></View>}
    />
  );
}

/** Search results across every date, each showing its day; tapping one opens the day. */
export function SearchResults({ items, query, bottomInset, ...handlers }: ListHandlers & { items: CalendarItem[]; query: string; bottomInset: number }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  if (!items.length) return <View style={styles.agendaEmpty}><AppText style={[styles.weekEmptyText, { color: desk.inkMuted, textAlign: 'center' }]}>{query.trim() ? tr("calendarviews.nothingOnTheCalendarMatchesValue", { value1: query.trim() }) : tr("calendarviews.searchNotesAndRemindersOnYourCalendar")}</AppText></View>;
  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}>
      {items.map((item) => <View key={item.key} style={styles.agendaRow}><EntryRow item={item} showDate {...handlers} /></View>)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  pressed: { opacity: 0.64 },
  weekDay: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  weekDate: { width: 44, alignItems: 'center', gap: 2, paddingTop: 2 },
  weekName: { fontSize: 11, fontWeight: '700' },
  weekNumber: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  penCircle: { ...StyleSheet.absoluteFill, borderRadius: 17, borderWidth: 2, transform: [{ rotate: '-8deg' }, { scaleX: 1.12 }] },
  weekNumberText: { fontSize: 20, lineHeight: 26 },
  weekEntries: { flex: 1, gap: 12, justifyContent: 'center', paddingVertical: 4 },
  weekEmpty: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  weekEmptyText: { fontSize: 14 },
  weekEmptyHand: { fontSize: 17, lineHeight: 23 },
  allDay: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  allDayLabel: { width: GUTTER - spacing.md - spacing.xs + 8, fontSize: 10, fontWeight: '700', paddingTop: 8 },
  allDayItems: { flex: 1, gap: 4 },
  allDayChip: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs, borderRadius: 3 },
  hour: { position: 'absolute', left: 0, right: 0, height: HOUR_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },
  hourLabel: { width: GUTTER - 6, marginTop: -8, textAlign: 'right', fontSize: 11, fontVariant: ['tabular-nums'] },
  block: { position: 'absolute', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3 },
  blockLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  blockTitle: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  blockTime: { fontSize: 11, opacity: 0.9, marginTop: 1 },
  nowLine: { position: 'absolute', left: GUTTER - 4, right: 0, height: 2 },
  nowDot: { position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5 },
  sectionHeader: { paddingTop: spacing.sm, paddingBottom: spacing.xs },
  agendaRow: { marginBottom: 12 },
  agendaEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
});
