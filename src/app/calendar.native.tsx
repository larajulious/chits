import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen, Toast } from '@/components/ui/primitives';
import { layout, radii, spacing } from '@/constants/theme';
import { addLocalDays, getCalendarItems, getRemindersForDate, localDayKey, startOfLocalDay, type CalendarItem } from '@/features/calendar/calendar-data';
import { completeReminder, removeCardReminder, removeMessageReminder, setCardReminder, setMessageReminder, subscribeToReminderChanges } from '@/services/reminders';
import { subscribeToSpaceChanges } from '@/services/space-changes';

const VIEWS = ['Month', 'Week', 'Agenda'] as const;
type CalendarView = typeof VIEWS[number];
type SourceFilter = 'All' | 'Chat' | 'Boards' | 'Spaces';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (date: Date) => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
const timeLabel = (timestamp: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);

export default function CalendarScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { actionSheet, confirm } = useAppDialog();
  const { tokens: theme } = useTheme();
  const { height, fontScale } = useWindowDimensions();
  const pinDateGrid = height >= 700 && fontScale <= 1.3;
  const [today, setToday] = useState(() => startOfLocalDay(new Date()));
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState(() => startOfLocalDay(new Date()));
  const [view, setView] = useState<CalendarView>('Month');
  const [filter, setFilter] = useState<SourceFilter>('All');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarItem | null>(null);
  const [sheetKey, setSheetKey] = useState(0);

  const reload = useCallback(async () => {
    setNow(Date.now());
    try { setItems(await getCalendarItems(database)); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [database]);
  useFocusEffect(useCallback(() => {
    setToday(startOfLocalDay(new Date()));
    void reload();
    const stop = subscribeToReminderChanges(() => void reload());
    const stopSpaces = subscribeToSpaceChanges(() => void reload());
    const clock = setInterval(() => { setNow(Date.now()); setToday(startOfLocalDay(new Date())); }, 60_000);
    return () => { stop(); stopSpaces(); clearInterval(clock); };
  }, [reload]));

  const visible = useMemo(() => items.filter((item) => {
    if (filter === 'Chat' && item.kind !== 'message') return false;
    if (filter === 'Boards' && item.kind !== 'card') return false;
    if (filter === 'Spaces' && !item.spaceId) return false;
    const words = query.trim().toLocaleLowerCase();
    return !words || `${item.title} ${item.searchText} ${item.source} ${item.boardName ?? ''}`.toLocaleLowerCase().includes(words);
  }), [items, filter, query]);
  const selectedItems = useMemo(() => getRemindersForDate(visible, selected), [visible, selected]);
  const counts = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const item of visible) { const day = localDayKey(item.scheduledAt); byDay.set(day, (byDay.get(day) ?? 0) + 1); }
    return byDay;
  }, [visible]);
  const agenda = useMemo(() => {
    const groups: { key: string; date: Date; items: CalendarItem[] }[] = [];
    for (const item of visible) {
      const key = localDayKey(item.scheduledAt);
      const last = groups.at(-1);
      if (last?.key === key) last.items.push(item);
      else groups.push({ key, date: startOfLocalDay(new Date(item.scheduledAt)), items: [item] });
    }
    return groups;
  }, [visible]);

  const openItem = (item: CalendarItem) => {
    if (item.spaceId) router.push({ pathname: '/spaces', params: { spaceId: item.spaceId, noteId: item.id } });
    else if (item.kind === 'card') router.push({ pathname: '/card/[id]', params: { id: item.id } });
    else router.push({ pathname: '/chat', params: { messageId: item.id } });
  };
  const editItem = (item: CalendarItem) => { setSheetKey((key) => key + 1); setEditing(item); };
  const removeItem = async (item: CalendarItem) => {
    try {
      if (item.kind === 'card') await removeCardReminder(database, item.id);
      else await removeMessageReminder(database, item.id);
      setToast('Reminder removed');
      await reload();
    } catch { setToast('Could not remove reminder. Try again.'); }
  };
  const doneItem = async (item: CalendarItem) => {
    try { await completeReminder(database, item.kind, item.id); setToast('Reminder done'); await reload(); }
    catch { setToast('Could not complete reminder. Try again.'); }
  };
  const actions = (item: CalendarItem) => actionSheet({
    title: item.title,
    options: [
      { label: 'Open Note', icon: 'open-outline', onPress: () => openItem(item) },
      { label: 'Reschedule', icon: 'calendar-outline', onPress: () => editItem(item) },
      { label: 'Mark Reminder Done', icon: 'checkmark-circle-outline', onPress: () => void doneItem(item) },
      { label: 'Remove Reminder', icon: 'trash-outline', destructive: true, onPress: () => confirm({ type: 'destructive', icon: 'trash-outline', title: 'Remove reminder?', message: 'Your note stays in Chits.', confirmText: 'Remove Reminder', onConfirm: () => removeItem(item) }) },
    ],
  });
  const reminderRow = (item: CalendarItem) => <View key={`${item.kind}:${item.id}`} style={[styles.reminder, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title}, ${timeLabel(item.scheduledAt)}`} onPress={() => openItem(item)} style={styles.reminderMain}>
      <Text style={[styles.time, { color: theme.accentStrong }]}>{timeLabel(item.scheduledAt)}</Text>
      <View style={styles.reminderCopy}>
        <Text numberOfLines={2} style={[styles.reminderTitle, { color: theme.textPrimary }]}>{item.title}</Text>
        <View style={styles.metaLine}><Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>{item.source}</Text>
          {item.attachmentCount > 0 ? <View style={styles.attachmentMeta}><Ionicons accessible={false} name="attach-outline" size={13} color={theme.textMuted} /><Text style={[styles.meta, { color: theme.textMuted }]}>{item.attachmentCount}</Text></View> : null}
          {item.scheduledAt < now ? <Text style={[styles.overdue, { color: theme.danger }]}>Overdue</Text> : null}
        </View>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Reminder actions for ${item.title}`} onPress={() => actions(item)} style={styles.overflow}><Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} /></Pressable>
  </View>;

  const changePeriod = (step: number) => {
    const date = view === 'Week' ? addLocalDays(selected, step * 7) : new Date(selected.getFullYear(), selected.getMonth() + step, Math.min(selected.getDate(), 28));
    setSelected(date);
  };
  const monthFirst = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const monthStart = addLocalDays(monthFirst, -monthFirst.getDay());
  const monthCount = Math.ceil((monthFirst.getDay() + new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate()) / 7) * 7;
  const weekStart = addLocalDays(selected, -((selected.getDay() + 6) % 7));
  const dateCell = (date: Date, month = false) => {
    const key = localDayKey(date);
    const count = counts.get(key) ?? 0;
    const active = key === localDayKey(selected);
    const isToday = key === localDayKey(today);
    return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${dayLabel(date)}, ${count} ${count === 1 ? 'reminder' : 'reminders'}`} accessibilityState={{ selected: active }} onPress={() => { Keyboard.dismiss(); setSelected(date); }} style={[styles.dayCell, month && styles.monthCell, active && { backgroundColor: theme.accent }, !active && isToday && { backgroundColor: theme.accentSoft }]}>
      {month ? <Text style={[styles.dayNumber, { color: active ? theme.accentText : date.getMonth() === selected.getMonth() ? theme.textPrimary : theme.textMuted }]}>{date.getDate()}</Text>
        : <><Text style={[styles.weekName, { color: active ? theme.accentText : theme.textMuted }]}>{WEEKDAYS[date.getDay()].toUpperCase()}</Text><Text style={[styles.dayNumber, { color: active ? theme.accentText : theme.textPrimary }]}>{date.getDate()}</Text></>}
      <View style={styles.dayIndicators} accessible={false}>{Array.from({ length: Math.min(count, 3) }, (_, index) => <View key={index} style={[styles.dayDot, { backgroundColor: active ? theme.accentText : theme.accentStrong }]} />)}</View>
    </Pressable>;
  };

  const dateGrid = view === 'Agenda' ? null : (
    view === 'Month' ? <View style={styles.grid}>{WEEKDAYS.map((day) => <Text key={day} style={[styles.weekday, { color: theme.textMuted }]}>{day.toUpperCase()}</Text>)}{Array.from({ length: monthCount }, (_, index) => dateCell(addLocalDays(monthStart, index), true))}</View> : <View style={styles.weekStrip}>{Array.from({ length: 7 }, (_, index) => dateCell(addLocalDays(weekStart, index)))}</View>
  );

  return <Screen>
    <AppHeader title="Calendar" leading={<IconButton label="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<Pressable accessibilityRole="button" onPress={() => setSelected(startOfLocalDay(new Date()))} style={styles.todayButton}><Text style={[styles.todayText, { color: theme.accentStrong }]}>Today</Text></Pressable>} />
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" stickyHeaderIndices={[0]} contentContainerStyle={styles.content}>
      <View collapsable={false} style={[styles.calendarHeader, { backgroundColor: theme.background, borderBottomColor: theme.borderSubtle }]}>
        <View style={styles.headerContent}>
          <View style={styles.toolbar}>
            <View style={[styles.segments, { backgroundColor: theme.surfaceElevated }]}>
              {VIEWS.map((option) => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: view === option }} onPress={() => setView(option)} style={[styles.segment, view === option && { backgroundColor: theme.surface }]}><Text style={[styles.segmentText, { color: view === option ? theme.textPrimary : theme.textSecondary }]}>{option}</Text></Pressable>)}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={searchOpen ? 'Close search' : 'Search reminders'} accessibilityState={{ expanded: searchOpen }} onPress={() => { setSearchOpen(!searchOpen); if (searchOpen) { setQuery(''); Keyboard.dismiss(); } }} style={[styles.toolbarButton, searchOpen && { backgroundColor: theme.accentSoft }]}><Ionicons name={searchOpen ? 'close-outline' : 'search-outline'} size={20} color={searchOpen ? theme.accentStrong : theme.textSecondary} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Filter reminders, ${filter}`} onPress={() => actionSheet({ title: 'Show reminders', options: (['All', 'Chat', 'Boards', 'Spaces'] as SourceFilter[]).map((value) => ({ label: value, icon: filter === value ? 'checkmark-outline' : 'ellipse-outline', onPress: () => setFilter(value) })) })} style={[styles.toolbarButton, filter !== 'All' && { backgroundColor: theme.accentSoft }]}><Ionicons name="options-outline" size={20} color={filter !== 'All' ? theme.accentStrong : theme.textSecondary} /></Pressable>
          </View>
          {searchOpen ? <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}><Ionicons name="search-outline" size={17} color={theme.textMuted} /><TextInput autoFocus accessibilityLabel="Search scheduled reminders" value={query} onChangeText={setQuery} placeholder="Search reminders" placeholderTextColor={theme.textMuted} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={[styles.searchInput, { color: theme.textPrimary }]} /></View> : null}
          {filter !== 'All' ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${filter} filter`} onPress={() => setFilter('All')} style={styles.activeFilter}><Text style={[styles.filterText, { color: theme.accentStrong }]}>{filter} reminders</Text><Ionicons name="close-circle-outline" size={16} color={theme.accentStrong} /></Pressable> : null}
          {view !== 'Agenda' ? <>
            <View style={styles.period}>
              <Text accessibilityRole="header" style={[styles.periodTitle, { color: theme.textPrimary }]}>{view === 'Month' ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(selected) : `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(weekStart)} – ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(addLocalDays(weekStart, 6))}`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={view === 'Month' ? 'Previous month' : 'Previous week'} onPress={() => changePeriod(-1)} style={styles.toolbarButton}><Ionicons name="chevron-back" size={19} color={theme.textSecondary} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={view === 'Month' ? 'Next month' : 'Next week'} onPress={() => changePeriod(1)} style={styles.toolbarButton}><Ionicons name="chevron-forward" size={19} color={theme.textSecondary} /></Pressable>
            </View>
            {pinDateGrid ? dateGrid : null}
          </> : null}
        </View>
      </View>
      <View style={styles.listContent}>
        {!pinDateGrid ? dateGrid : null}
        {loading ? <Text style={[styles.muted, { color: theme.textSecondary }]}>Loading reminders…</Text> : error ? <Pressable accessibilityRole="button" onPress={() => void reload()}><Text style={[styles.muted, { color: theme.danger }]}>Could not load reminders. Tap to retry.</Text></Pressable> : items.length === 0 ? <View style={styles.empty}><EmptyState title="Nothing scheduled yet" description="Add a reminder to a note or card and it’ll appear here." /><Pressable accessibilityRole="button" onPress={() => router.navigate('/chat')} style={[styles.emptyAction, { backgroundColor: theme.accent }]}><Text style={{ color: theme.accentText, fontWeight: '700' }}>Go to Chat</Text></Pressable></View> : view !== 'Agenda' ? <>
          <View style={styles.listHeader}><Text accessibilityRole="header" style={[styles.listHeading, { color: theme.textPrimary }]}>{dayLabel(selected)}</Text><Text style={[styles.listCount, { color: theme.textMuted }]}>{selectedItems.length}</Text></View>
          {selectedItems.length ? selectedItems.map(reminderRow) : <View style={styles.dayEmpty}><Text style={[styles.dayEmptyTitle, { color: theme.textPrimary }]}>Nothing scheduled</Text><Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>{query.trim() || filter !== 'All' ? 'No reminders match your search or filter for this day.' : 'No reminders for this day.'}</Text></View>}
        </> : agenda.length ? agenda.map((group) => <View key={group.key} style={styles.agendaGroup}><View style={styles.listHeader}><Text accessibilityRole="header" style={[styles.listHeading, { color: theme.textPrimary }]}>{group.key === localDayKey(today) ? 'Today' : group.key === localDayKey(addLocalDays(today, 1)) ? 'Tomorrow' : dayLabel(group.date)}</Text><Text style={[styles.listCount, { color: theme.textMuted }]}>{group.items.length}</Text></View>{group.items.map(reminderRow)}</View>) : <Text style={[styles.muted, { color: theme.textSecondary }]}>No reminders match your search or filter.</Text>}
      </View>
    </ScrollView>
    <ReminderSheet key={sheetKey} visible={editing !== null} existing={editing?.scheduledAt ?? null} accent={theme.accent} accentOn={theme.accentText} onClose={() => setEditing(null)} onSave={async (date) => {
      if (!editing) return { ok: false, reason: 'failed' };
      const result = editing.kind === 'card' ? await setCardReminder(database, editing.id, date.getTime()) : await setMessageReminder(database, editing.id, date.getTime());
      if (result.ok) { setToast('Reminder rescheduled'); await reload(); }
      return result;
    }} onRemove={async () => { if (editing) await removeItem(editing); }} />
    <Toast message={toast} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  calendarHeader: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerContent: { maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.xxs, paddingBottom: spacing.sm, gap: spacing.xxs },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  segments: { flex: 1, flexDirection: 'row', padding: 3, borderRadius: radii.control },
  segment: { flex: 1, minHeight: layout.minimumTouchTarget, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '600' },
  toolbarButton: { width: 44, height: 44, borderRadius: radii.control, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, fontSize: 14, minHeight: 42 },
  activeFilter: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44 },
  filterText: { fontSize: 12, fontWeight: '600' },
  period: { flexDirection: 'row', alignItems: 'center' },
  periodTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.2857%', textAlign: 'center', fontSize: 10, fontWeight: '600', paddingVertical: spacing.xxs },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, minHeight: 52, gap: 2 },
  monthCell: { flex: undefined, width: '14.2857%', minHeight: 44 },
  weekStrip: { flexDirection: 'row' },
  weekName: { fontSize: 10, fontWeight: '600' },
  dayNumber: { fontSize: 14, fontWeight: '600' },
  dayIndicators: { height: 5, flexDirection: 'row', alignItems: 'center', gap: 2 },
  dayDot: { width: 3, height: 3, borderRadius: 2 },
  listContent: { maxWidth: layout.maxContentWidth, width: '100%', alignSelf: 'center', padding: spacing.md, gap: spacing.xs },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xxs },
  listHeading: { flex: 1, fontSize: 14, fontWeight: '700' },
  listCount: { fontSize: 12, fontWeight: '600' },
  agendaGroup: { gap: spacing.xs, marginBottom: spacing.sm },
  reminder: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.compactCard, minHeight: 72 },
  reminderMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm },
  reminderCopy: { flex: 1, gap: spacing.xxs },
  time: { width: 64, fontSize: 12, lineHeight: 20, fontWeight: '600' },
  reminderTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  metaLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  attachmentMeta: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  meta: { fontSize: 12, flexShrink: 1 },
  overdue: { fontSize: 12, fontWeight: '600' },
  overflow: { width: 44, minHeight: 44, alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center' },
  muted: { fontSize: 14, paddingVertical: spacing.md },
  todayButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  todayText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyAction: { minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radii.control, justifyContent: 'center' },
  dayEmpty: { paddingVertical: spacing.md, gap: spacing.xxs },
  dayEmptyTitle: { fontSize: 14, fontWeight: '600' },
  emptyDescription: { fontSize: 13, lineHeight: 19 },
});
