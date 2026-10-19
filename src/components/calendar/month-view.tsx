import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type ListRenderItemInfo, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import type { CalendarItem } from '@/features/calendar/calendar-data';
import { addLocalDays, cellCapacity, localDayKey, monthFromIndex, monthGrid, weekdayOrder } from '@/features/calendar/calendar-schedule';

import { ENTRY_COLORS, ENTRY_INK } from './calendar-entry';
import { dateFormat } from '@/services/reminder-time';

// Months the pager can reach (Jan 1900 – Dec 2199): far beyond any real note,
// and cheap — pages are laid out by index, only three are ever mounted.
const FIRST_MONTH = 1900 * 12;
const MONTH_COUNT = 300 * 12;
const MONTHS = Array.from({ length: MONTH_COUNT }, (_, index) => FIRST_MONTH + index);
const WEEKDAY_ROW = 24;
const DAY_NUMBER = 24;
const CELL_TOP = 3 + DAY_NUMBER + 3;
const STRIP_GAP = 2;
// Built once: a month page draws up to 42 cells, and Intl formatters are costly to create.
const DAY_LABEL = { format: (date: Date) => dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date) };
const WEEKDAY_LABEL = { format: (date: Date) => dateFormat(undefined, { weekday: 'short' }).format(date) };

type Props = {
  /** The month shown, as a month index (year * 12 + month). */
  month: number;
  onMonthChange: (month: number) => void;
  itemsByDay: Map<string, CalendarItem[]>;
  selectedKey: string | null;
  todayKey: string;
  weekStart: number;
  reduceMotion: boolean;
  onPressDay: (dateKey: string) => void;
  onLongPressDay: (dateKey: string) => void;
};

/**
 * The month grid: one page per month, swiped sideways (or moved by the header
 * arrows, Today and the month picker). Each date cell shows its entries as
 * colored strips with titles, and "+N" when they don't all fit — the number
 * of strips adapts to the cell height, so the grid works full screen and
 * when the day panel shrinks it.
 */
export function MonthView({ month, onMonthChange, itemsByDay, selectedKey, todayKey, weekStart, reduceMotion, onPressDay, onLongPressDay }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const list = useRef<FlatList<number>>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const shown = useRef(month);

  // Follow the header's navigation; swipes report back through onMonthChange.
  useEffect(() => {
    if (!size || shown.current === month) return;
    shown.current = month;
    list.current?.scrollToIndex({ index: month - FIRST_MONTH, animated: !reduceMotion });
  }, [month, size, reduceMotion]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize((current) => {
      if (current && current.width === width && current.height === height) return current;
      // A new width (rotation, split screen) moves every page; keep this month in view.
      if (current && current.width !== width) requestAnimationFrame(() => list.current?.scrollToIndex({ index: shown.current - FIRST_MONTH, animated: false }));
      return { width, height };
    });
  };
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!size) return;
    const next = FIRST_MONTH + Math.round(event.nativeEvent.contentOffset.x / size.width);
    if (next !== shown.current) { shown.current = next; onMonthChange(next); }
  };

  const extraData = useMemo(() => ({ itemsByDay, selectedKey, todayKey, weekStart, size }), [itemsByDay, selectedKey, todayKey, weekStart, size]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<number>) => size
    ? <MonthPage month={item} width={size.width} height={size.height} itemsByDay={itemsByDay} selectedKey={selectedKey} todayKey={todayKey} weekStart={weekStart} onPressDay={onPressDay} onLongPressDay={onLongPressDay} />
    : null, [size, itemsByDay, selectedKey, todayKey, weekStart, onPressDay, onLongPressDay]);
  const getItemLayout = useCallback((_: unknown, index: number) => ({ length: size?.width ?? 0, offset: (size?.width ?? 0) * index, index }), [size]);

  return (
    <View style={styles.pager} onLayout={onLayout}>
      {size ? (
        <FlatList
          ref={list}
          horizontal
          pagingEnabled
          data={MONTHS}
          extraData={extraData}
          keyExtractor={String}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialScrollIndex={month - FIRST_MONTH}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={settle}
          // Paging with a fling never stops between months.
          decelerationRate="fast"
        />
      ) : null}
    </View>
  );
}

type PageProps = {
  month: number; width: number; height: number; itemsByDay: Map<string, CalendarItem[]>; selectedKey: string | null; todayKey: string; weekStart: number;
  onPressDay: (dateKey: string) => void; onLongPressDay: (dateKey: string) => void;
};

const MonthPage = memo(function MonthPage({ month, width, height, itemsByDay, selectedKey, todayKey, weekStart, onPressDay, onLongPressDay }: PageProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { year, month: monthOfYear } = monthFromIndex(month);
  const { start, weeks } = monthGrid(year, monthOfYear, weekStart);
  const order = weekdayOrder(weekStart);
  // Strip height follows the text size (capped), so larger text never clips.
  const scale = Math.min(fontScale, 1.25);
  const stripHeight = Math.ceil(10.5 * scale * 1.3) + 4;
  const cellHeight = (height - WEEKDAY_ROW) / weeks;
  const slots = Math.floor((cellHeight - CELL_TOP - 2) / (stripHeight + STRIP_GAP));
  const cellWidth = width / 7;

  return (
    <View style={{ width, height }}>
      <View style={styles.weekdays} accessible={false} importantForAccessibility="no-hide-descendants">
        {order.map((day) => (
          <AppText key={day} style={[styles.weekday, { width: cellWidth, color: theme.textMuted }]}>{WEEKDAY_LABEL.format(new Date(2026, 1, day + 1)).toUpperCase()}</AppText>
        ))}
      </View>
      {Array.from({ length: weeks }, (_, week) => (
        <View key={week} style={[styles.week, { height: cellHeight, borderTopColor: theme.borderSubtle }]}>
          {Array.from({ length: 7 }, (_, column) => {
            const date = addLocalDays(start, week * 7 + column);
            const key = localDayKey(date);
            return <DayCell key={key} date={date} dateKey={key} width={cellWidth} items={itemsByDay.get(key)} inMonth={date.getMonth() === monthOfYear} today={key === todayKey} selected={key === selectedKey} slots={slots} stripHeight={stripHeight} last={column === 6} onPress={onPressDay} onLongPress={onLongPressDay} />;
          })}
        </View>
      ))}
    </View>
  );
});

const EMPTY: CalendarItem[] = [];
type CellProps = {
  date: Date; dateKey: string; width: number; items: CalendarItem[] | undefined; inMonth: boolean; today: boolean; selected: boolean;
  slots: number; stripHeight: number; last: boolean; onPress: (dateKey: string) => void; onLongPress: (dateKey: string) => void;
};

const DayCell = memo(function DayCell({ date, dateKey, width, items = EMPTY, inMonth, today, selected, slots, stripHeight, last, onPress, onLongPress }: CellProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const { shown, more } = cellCapacity(items.length, slots);
  const dateLabel = DAY_LABEL.format(date);
  const titles = items.slice(0, 3).map((item) => item.title).join(', ');
  const label = tr('calendar.daySummary', { date: today ? tr('dates.today') + ', ' + dateLabel : dateLabel, entries: items.length ? countLabel('entry', items.length) + ': ' + titles + (items.length > 3 ? tr('monthview.andMore') : '') : tr('monthview.noEntries') });
  const numberColor = today ? theme.background : selected ? theme.accentStrong : inMonth ? theme.textPrimary : theme.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      accessibilityHint={tr("monthview.showsThisDayLongPressToAddA")}
      onPress={() => onPress(dateKey)}
      onLongPress={() => onLongPress(dateKey)}
      style={({ pressed }) => [styles.cell, { width }, !last && { borderRightColor: theme.borderSubtle, borderRightWidth: StyleSheet.hairlineWidth }, selected && { backgroundColor: theme.accentSoft }, pressed && { backgroundColor: theme.surfaceElevated }]}
    >
      <View style={[styles.dayNumber, today && { backgroundColor: theme.accentStrong }, selected && !today && { borderColor: theme.accentStrong, borderWidth: 1.5 }]}>
        <AppText maxFontSizeMultiplier={1.2} style={[styles.dayText, { color: numberColor }, (today || selected) && styles.dayTextStrong]}>{date.getDate()}</AppText>
      </View>
      {slots > 0 ? <>
        {items.slice(0, shown).map((item) => (
          <View key={item.key} style={[styles.strip, { height: stripHeight, backgroundColor: ENTRY_COLORS[item.type] }, !inMonth && styles.outside]}>
            {item.reminderAt !== null ? <Icon name="notifications" size={8} color={ENTRY_INK} /> : null}
            <AppText numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.25} style={[styles.stripText, { color: ENTRY_INK, lineHeight: stripHeight - 3 }]}>{item.title}</AppText>
          </View>
        ))}
        {more > 0 ? <AppText numberOfLines={1} maxFontSizeMultiplier={1.25} style={[styles.more, { color: theme.textSecondary, lineHeight: stripHeight }]}>+{more}</AppText> : null}
      </> : items.length ? (
        // No room for titles (the day panel is open): a dot per entry, up to three.
        <View style={styles.dots}>{items.slice(0, 3).map((item) => <View key={item.key} style={[styles.dot, { backgroundColor: ENTRY_COLORS[item.type] }]} />)}</View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pager: { flex: 1 },
  weekdays: { height: WEEKDAY_ROW, flexDirection: 'row', alignItems: 'center' },
  weekday: { textAlign: 'center', fontSize: 11, fontWeight: '600' },
  week: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  cell: { alignItems: 'stretch', paddingTop: 3, paddingHorizontal: 2, overflow: 'hidden' },
  dayNumber: { alignSelf: 'center', width: DAY_NUMBER, height: DAY_NUMBER, borderRadius: DAY_NUMBER / 2, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  dayText: { fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },
  dayTextStrong: { fontWeight: '800' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 1, borderRadius: 4, paddingHorizontal: 3, marginBottom: STRIP_GAP, overflow: 'hidden' },
  stripText: { flex: 1, fontSize: 10.5, fontWeight: '600' },
  outside: { opacity: 0.55 },
  more: { fontSize: 10.5, fontWeight: '700', paddingHorizontal: 3 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 3 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
