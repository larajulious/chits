import { getCalendars } from 'expo-localization';
import { useFocusEffect, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { AddNoteSheet, type NoteSubmission } from '@/components/boards/add-note-sheet';
import { DayPanel } from '@/components/calendar/calendar-entry';
import { MonthPickerSheet, ScheduleSheet } from '@/components/calendar/calendar-sheets';
import { CalendarNotePicker } from '@/components/calendar/calendar-note-picker';
import { EntryDetailSheet, type EntryAction } from '@/components/calendar/entry-detail-sheet';
import { AgendaView, DayView, SearchResults, WeekView } from '@/components/calendar/calendar-views';
import { MonthView } from '@/components/calendar/month-view';
import { defaultStartMinute, destinationKey, ScheduleFields } from '@/components/calendar/schedule-fields';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { showPermissionSettingsPrompt } from '@/components/permissions/permission-settings-prompt';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { useTheme } from '@/components/theme-provider';
import { HeaderChromeContext, IconButton, TileInkContext } from '@/components/ui/controls';
import { Icon } from '@/components/ui/icon';
import { AppText, HeaderIcon, MenuIcon, Screen, Toast, TopBarBackground, useHeaderInk } from '@/components/ui/primitives';
import { radii, spacing } from '@/constants/theme';
import { SPACE_LIST } from '@/constants/spaces';
import type { SpaceCandidate } from '@/db/types';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import { applySchedule, createCalendarNote, reminderInPast, reminderOutcomeMessage, type CalendarDestination, type ReminderOutcome, type ScheduleDraft } from '@/features/calendar/calendar-actions';
import {
  getCalendarItems, groupByDay, matchesCalendarSearch, removeCalendarEntry, subscribeToCalendarChanges, type CalendarItem, type CalendarNoteRef, type CalendarRange,
} from '@/features/calendar/calendar-data';
import {
  addLocalDays, addLocalMonths, DEFAULT_DURATION_MINUTES, DAY_MINUTES, localDayKey, minuteOfDay, monthFromIndex, monthGridRange, monthIndex,
  formatScheduleTime, parseDayKey, reminderPresetLabel, startOfLocalDay, startOfWeek, weekStartFromLocale,
} from '@/features/calendar/calendar-schedule';
import { completeReminder, removeCardReminder, removeMessageReminder, requestReminderSync, setCardReminder, setMessageReminder, subscribeToReminderChanges } from '@/services/reminders';
import { openReminderAlarmSettings } from '@/services/reminder-alarm-access';
import { formatReminder, dateFormat } from '@/services/reminder-time';
import { subscribeToSpaceChanges } from '@/services/space-changes';

type CalendarView = 'month' | 'week' | 'day' | 'agenda';
const VIEW_OPTIONS: { key: CalendarView; label: string; icon: React.ComponentProps<typeof Icon>['name'] }[] = [
  { key: 'month', label: 'Month', icon: 'calendar-outline' },
  { key: 'week', label: 'Week', icon: 'albums-outline' },
  { key: 'day', label: 'Day', icon: 'today-outline' },
  { key: 'agenda', label: 'Agenda', icon: 'list-outline' },
];
const CHAT: CalendarDestination = { type: 'chat' };
const FAB_SIZE = 56;

type Composer = { key: number; draft: ScheduleDraft; destination: CalendarDestination };
/** A note whose day, time and reminder are being edited — an entry already on the calendar, or an existing note being added. */
type Editing = { key: number; note: CalendarNoteRef; title: string; scheduled: boolean; previous: { reminderAt: number | null; reminderOffset: number | null }; draft: ScheduleDraft };

/** The range a view needs: its month grid and the ones either side (so swiping never waits). */
function windowAround(month: number, weekStart: number): CalendarRange {
  const before = monthFromIndex(month - 1);
  const after = monthFromIndex(month + 1);
  return { from: monthGridRange(before.year, before.month, weekStart).from, to: monthGridRange(after.year, after.month, weekStart).to };
}

/** "Thu, Oct 15 · 9:00 – 10:00 AM · 15 min before" for the composer's typing-mode line. */
function scheduleSummary(draft: ScheduleDraft): string {
  const day = parseDayKey(draft.dateKey);
  const parts = [day ? dateFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(day) : draft.dateKey, formatScheduleTime(draft)];
  if (draft.reminder.mode === 'offset') parts.push(reminderPresetLabel(draft, draft.reminder.offset) ?? 'Reminder');
  else if (draft.reminder.mode === 'custom') parts.push(`Remind ${formatReminder(new Date(draft.reminder.at), new Date())}`);
  return parts.join(' · ');
}

function draftFor(item: CalendarItem): ScheduleDraft {
  if (item.plan) {
    return {
      dateKey: item.plan.dateKey, startMinute: item.plan.startMinute, endMinute: item.plan.endMinute,
      reminder: item.reminderAt === null ? { mode: 'none' } : item.reminderOffset !== null ? { mode: 'offset', offset: item.reminderOffset } : { mode: 'custom', at: item.reminderAt },
    };
  }
  // A reminder-only note goes on the calendar at its reminder time, reminded right then.
  const start = minuteOfDay(new Date(item.scheduledAt));
  return { dateKey: item.dateKey, startMinute: start, endMinute: Math.min(DAY_MINUTES, start + DEFAULT_DURATION_MINUTES), reminder: { mode: 'offset', offset: 0 } };
}

export default function CalendarScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { actionSheet, confirm } = useAppDialog();
  const { tokens: theme } = useTheme();
  const { ink } = useHeaderInk();
  const tabBarHeight = useBottomTabBarHeight();
  const { width } = useWindowDimensions();
  const [weekStart] = useState(() => weekStartFromLocale(getCalendars()[0]?.firstWeekday));

  const [today, setToday] = useState(() => startOfLocalDay(new Date()));
  const [now, setNow] = useState(() => Date.now());
  const todayKey = localDayKey(today);
  const [view, setView] = useState<CalendarView>('month');
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [visibleMonth, setVisibleMonth] = useState(() => monthIndex(today));
  const [panelOpen, setPanelOpen] = useState(false);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [composer, setComposer] = useState<Composer | null>(null);
  const [destinations, setDestinations] = useState<CalendarDestination[]>([CHAT]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [picker, setPicker] = useState<{ key: number; dateKey: string; visible: boolean } | null>(null);
  const [reminderItem, setReminderItem] = useState<{ key: number; item: CalendarItem } | null>(null);
  const [monthPicker, setMonthPicker] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ item: CalendarItem; visible: boolean } | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sheetKey = useRef(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const selectedDate = parseDayKey(selectedKey) ?? today;
  // Month view loads around the month on screen; the others around the selected day.
  // Agenda and search read every date.
  const anchorMonth = view === 'month' ? visibleMonth : monthIndex(selectedDate);
  const range = useMemo(() => (view === 'agenda' || searchOpen ? null : windowAround(anchorMonth, weekStart)), [view, searchOpen, anchorMonth, weekStart]);
  const rangeKey = range ? `${range.from}:${range.to}` : 'all';

  const request = useRef(0);
  const reload = useCallback(async () => {
    const id = ++request.current;
    setNow(Date.now());
    try {
      const next = await getCalendarItems(database, range);
      // A newer request (the user kept swiping) wins.
      if (id !== request.current) return;
      setItems(next);
      setError(false);
    } catch (cause) {
      console.warn('[calendar] could not load', cause);
      if (id === request.current) setError(true);
    } finally {
      if (id === request.current) setLoaded(true);
    }
    // rangeKey stands in for `range` (same value, stable identity).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database, rangeKey]);

  useFocusEffect(useCallback(() => {
    const day = startOfLocalDay(new Date());
    setToday((current) => (current.getTime() === day.getTime() ? current : day));
    void reload();
    const stops = [subscribeToReminderChanges(() => void reload()), subscribeToCalendarChanges(() => void reload()), subscribeToSpaceChanges(() => void reload())];
    const clock = setInterval(() => {
      setNow(Date.now());
      const current = startOfLocalDay(new Date());
      setToday((value) => (value.getTime() === current.getTime() ? value : current));
    }, 60_000);
    return () => { for (const stop of stops) stop(); clearInterval(clock); };
  }, [reload]));

  // Search lists each note once, on its planned day (not again on its reminder's day).
  const visibleItems = useMemo(() => (searchOpen ? items.filter((item) => item.occurrence === 'plan' && matchesCalendarSearch(item, query)) : items), [items, searchOpen, query]);
  const itemsByDay = useMemo(() => groupByDay(items), [items]);
  const selectedItems = itemsByDay.get(selectedKey) ?? [];

  // ---------------------------------------------------------------------------
  // Navigation.

  const selectDay = useCallback((key: string) => {
    const date = parseDayKey(key);
    if (!date) return;
    Keyboard.dismiss();
    setSelectedKey(key);
    setVisibleMonth(monthIndex(date));
  }, []);
  const pressDay = useCallback((key: string) => { selectDay(key); setPanelOpen(true); }, [selectDay]);
  const changeMonth = useCallback((month: number) => {
    setVisibleMonth(month);
    // Keep the selection inside the month on screen: today in this month, otherwise the 1st.
    const { year, month: monthOfYear } = monthFromIndex(month);
    const current = new Date();
    setSelectedKey(current.getFullYear() === year && current.getMonth() === monthOfYear ? localDayKey(current) : localDayKey(new Date(year, monthOfYear, 1)));
  }, []);
  const step = (direction: 1 | -1) => {
    if (view === 'month') changeMonth(visibleMonth + direction);
    else if (view === 'week') selectDay(localDayKey(addLocalDays(selectedDate, direction * 7)));
    else if (view === 'day') selectDay(localDayKey(addLocalDays(selectedDate, direction)));
  };
  const goToday = () => { selectDay(localDayKey(new Date())); };
  const chooseView = () => actionSheet({
    title: 'View',
    options: VIEW_OPTIONS.map((option) => ({ label: option.label, icon: view === option.key ? 'checkmark-circle' : option.icon, onPress: () => { setView(option.key); setSearchOpen(false); setQuery(''); } })),
  });
  const toggleSearch = () => {
    if (searchOpen) { setSearchOpen(false); setQuery(''); Keyboard.dismiss(); } else setSearchOpen(true);
  };

  // ---------------------------------------------------------------------------
  // Adding notes.

  const openComposer = useCallback((dateKey: string, startMinute: number | null = null) => {
    sheetKey.current += 1;
    setComposer({
      key: sheetKey.current,
      destination: CHAT,
      draft: { dateKey, startMinute, endMinute: startMinute === null ? null : Math.min(DAY_MINUTES, startMinute + DEFAULT_DURATION_MINUTES), reminder: { mode: 'none' } },
    });
    // Boards (into their first column) and Spaces a new note can go to.
    void (async () => {
      try {
        const boards = createBoardRepository(database);
        const options: CalendarDestination[] = [CHAT];
        for (const board of await boards.listActive()) {
          const [column] = await boards.listColumns(board.id);
          if (column) options.push({ type: 'board', boardId: board.id, columnId: column.id, label: board.name });
        }
        for (const space of SPACE_LIST) options.push({ type: 'space', spaceId: space.id, label: space.name });
        setDestinations(options);
      } catch { setDestinations([CHAT]); }
    })();
  }, [database]);

  const editSchedule = (item: CalendarItem) => {
    sheetKey.current += 1;
    setEditing({ key: sheetKey.current, note: item, title: item.title, scheduled: item.scheduled, previous: { reminderAt: item.reminderAt, reminderOffset: item.reminderOffset }, draft: draftFor(item) });
  };
  // An existing note brought onto the calendar: the chosen day, at the next
  // sensible time, reminded at its start — the usual reason to add it.
  const scheduleExisting = (candidate: SpaceCandidate) => {
    const dateKey = picker?.dateKey ?? selectedKey;
    const start = defaultStartMinute(dateKey);
    sheetKey.current += 1;
    setEditing({
      key: sheetKey.current, note: { kind: candidate.kind === 'card' ? 'card' : 'message', id: candidate.id }, title: candidate.title, scheduled: false,
      previous: { reminderAt: null, reminderOffset: null },
      draft: { dateKey, startMinute: start, endMinute: Math.min(DAY_MINUTES, start + DEFAULT_DURATION_MINUTES), reminder: { mode: 'offset', offset: 0 } },
    });
  };
  // + and Add: write a new note, or plan one that already exists.
  const chooseAdd = (dateKey: string, startMinute: number | null = null) => actionSheet({
    title: dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(parseDayKey(dateKey) ?? today),
    options: [
      { label: 'New Note', icon: 'create-outline', onPress: () => openComposer(dateKey, startMinute) },
      { label: 'Existing Note or Card', icon: 'documents-outline', onPress: () => { sheetKey.current += 1; setPicker({ key: sheetKey.current, dateKey, visible: true }); } },
    ],
  });

  const longPressDay = useCallback((key: string) => { selectDay(key); openComposer(key); }, [selectDay, openComposer]);

  const reportOutcome = (outcome: ReminderOutcome, success: string) => {
    if (outcome === 'blocked') showPermissionSettingsPrompt('notifications');
    // Missing alarm access is the one people miss in a toast: say it in a dialog with the way out.
    if (outcome === 'exact-alarm') {
      confirm({
        type: 'warning', icon: 'alarm-outline', title: 'Reminder not set',
        message: 'Your note is saved, but Android needs Alarms & reminders turned on for Chits before it can remind you. Allow it, then set the reminder again from the note’s details.',
        confirmText: 'Open Settings', cancelText: 'Not Now',
        onConfirm: () => openReminderAlarmSettings().catch(() => setToast('Open Settings › Apps › Chits › Alarms & reminders.')),
      });
      return;
    }
    setToast(reminderOutcomeMessage(outcome) ?? success);
  };

  const submitNote = async (submission: NoteSubmission) => {
    if (!composer) return;
    const { draft, destination } = composer;
    const result = await createCalendarNote(database, submission, destination, draft);
    selectDay(draft.dateKey);
    if (view === 'month') setPanelOpen(true);
    if (result.spaceFull) setToast('Saved. That space is full, so the note stayed in Chat.');
    else reportOutcome(result.reminder, result.reminder === 'set' ? 'Note added with a reminder' : 'Note added');
    await reload();
  };

  // ---------------------------------------------------------------------------
  // Entry actions.

  // Tapping an entry opens its details: the card (a Chat note's card once it's
  // organized into one), or the note itself for an unorganized thought.
  const openItem = useCallback((item: CalendarItem) => {
    if (item.cardId) router.push({ pathname: '/card/[id]', params: { id: item.cardId } });
    else router.push({ pathname: '/card/edit-content', params: { messageId: item.id, autoFocus: '0' } });
  }, [router]);
  // Where the note lives, from the entry menu.
  const openSource = useCallback((item: CalendarItem) => {
    if (item.spaceId) router.push({ pathname: '/spaces', params: { spaceId: item.spaceId, noteId: item.id } });
    else router.push({ pathname: '/chat', params: { messageId: item.kind === 'message' ? item.id : '' } });
  }, [router]);

  const removeReminder = async (item: CalendarItem) => {
    try {
      if (item.kind === 'card') await removeCardReminder(database, item.id); else await removeMessageReminder(database, item.id);
      setToast('Reminder off');
    } catch { setToast('Could not turn off the reminder. Try again.'); }
    await reload();
  };
  const deleteNote = (item: CalendarItem) => confirm(item.kind === 'card'
    ? { type: 'destructive', icon: 'archive-outline', title: 'Archive card?', message: 'It leaves its board and the calendar. You can restore it from Archive.', confirmText: 'Archive Card', onConfirm: async () => { await createBoardRepository(database).archiveCard(item.id); void requestReminderSync(); setToast('Card archived'); await reload(); } }
    : { type: 'destructive', icon: 'trash-outline', title: 'Delete note?', message: 'It’s removed from Chat and the calendar, and its reminder is cancelled.', confirmText: 'Delete Note', onConfirm: async () => { await createMessageRepository(database).softDelete(item.id); void requestReminderSync(); setToast('Note deleted'); await reload(); } });

  // Tapping an entry (or its ⋯) shows it in a details sheet; its actions run from there.
  const showDetail = useCallback((item: CalendarItem) => { Keyboard.dismiss(); setDetail({ item, visible: true }); }, []);
  const runEntryAction = (action: EntryAction, item: CalendarItem) => {
    switch (action) {
      case 'open': openItem(item); break;
      case 'source': openSource(item); break;
      case 'schedule': editSchedule(item); break;
      case 'reminder': sheetKey.current += 1; setReminderItem({ key: sheetKey.current, item }); break;
      case 'reminder-off': void removeReminder(item); break;
      case 'reminder-done': void completeReminder(database, item.kind, item.id).then(() => setToast('Reminder done')).catch(() => setToast('Could not complete the reminder.')); break;
      case 'unschedule': void removeCalendarEntry(database, item).then(() => setToast('Removed from calendar — the note is still in Chits')); break;
      case 'delete': deleteNote(item); break;
    }
  };

  // ---------------------------------------------------------------------------
  // Header.

  const narrow = width < 400;
  const visible = monthFromIndex(visibleMonth);
  const weekFirst = startOfWeek(selectedDate, weekStart);
  const title = view === 'month'
    ? dateFormat(undefined, { month: narrow ? 'short' : 'long', year: 'numeric' }).format(new Date(visible.year, visible.month, 1))
    : view === 'week'
      ? `${dateFormat(undefined, { month: 'short', day: 'numeric' }).format(weekFirst)} – ${dateFormat(undefined, { month: weekFirst.getMonth() === addLocalDays(weekFirst, 6).getMonth() ? undefined : 'short', day: 'numeric' }).format(addLocalDays(weekFirst, 6))}`
      : view === 'day'
        ? dateFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(selectedDate)
        : 'Agenda';
  const stepUnit = view === 'month' ? 'month' : view === 'week' ? 'week' : 'day';
  const pickerMonth = view === 'month' ? visible : { year: selectedDate.getFullYear(), month: selectedDate.getMonth() };

  const header = (
    <HeaderChromeContext.Provider value>
      <View style={styles.header}>
        <TopBarBackground />
        <IconButton label="Open navigation" onPress={openDrawer}><MenuIcon /></IconButton>
        {view !== 'agenda' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${title}. Choose month`} onPress={() => { sheetKey.current += 1; setMonthPicker(sheetKey.current); }} style={({ pressed }) => [styles.titleButton, pressed && styles.pressed]}>
            <AppText accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.title, { color: ink }]}>{title}</AppText>
            <Icon name="chevron-down" size={16} color={ink} />
          </Pressable>
        ) : <AppText accessibilityRole="header" numberOfLines={1} style={[styles.title, styles.titleButton, { color: ink }]}>{title}</AppText>}
        {view !== 'agenda' ? <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Previous ${stepUnit}`} hitSlop={{ top: 4, bottom: 4 }} onPress={() => step(-1)} style={({ pressed }) => [styles.chevron, pressed && styles.pressed]}><Icon name="chevron-back" size={20} color={ink} /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Next ${stepUnit}`} hitSlop={{ top: 4, bottom: 4 }} onPress={() => step(1)} style={({ pressed }) => [styles.chevron, pressed && styles.pressed]}><Icon name="chevron-forward" size={20} color={ink} /></Pressable>
        </> : null}
        <IconButton label={searchOpen ? 'Close search' : 'Search calendar'} onPress={toggleSearch}><HeaderIcon name={searchOpen ? 'close' : 'search-outline'} size={21} /></IconButton>
        <IconButton label={`Today, ${dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(today)}`} onPress={goToday}>
          <TodayGlyph day={today.getDate()} />
        </IconButton>
        <IconButton label={`View: ${VIEW_OPTIONS.find((option) => option.key === view)!.label}. Change view`} onPress={chooseView}><HeaderIcon name={VIEW_OPTIONS.find((option) => option.key === view)!.icon} size={21} /></IconButton>
      </View>
    </HeaderChromeContext.Provider>
  );

  // ---------------------------------------------------------------------------
  // Body.

  const listInset = tabBarHeight + FAB_SIZE + spacing.lg;
  const handlers = { now, onOpen: showDetail, onActions: showDetail };
  let body: React.ReactNode;
  if (error && !items.length) {
    body = <Pressable accessibilityRole="button" onPress={() => void reload()} style={styles.center}><AppText style={{ color: theme.danger }}>Could not load the calendar. Tap to retry.</AppText></Pressable>;
  } else if (searchOpen) {
    body = <SearchResults items={query.trim() ? visibleItems : []} query={query} bottomInset={listInset} {...handlers} onOpen={(item) => { setSearchOpen(false); setQuery(''); setView('month'); pressDay(item.dateKey); }} />;
  } else if (view === 'month') {
    body = (
      <View style={[styles.flex, { paddingBottom: panelOpen ? 0 : tabBarHeight }]}>
        <View style={panelOpen ? styles.gridWithPanel : styles.flex}>
          <MonthView month={visibleMonth} onMonthChange={changeMonth} itemsByDay={itemsByDay} selectedKey={panelOpen ? selectedKey : null} todayKey={todayKey} weekStart={weekStart} reduceMotion={reduceMotion} onPressDay={pressDay} onLongPressDay={longPressDay} />
        </View>
        {panelOpen ? (
          <View style={[styles.panel, { paddingBottom: tabBarHeight }]}>
            <DayPanel dateKey={selectedKey} items={selectedItems} onAdd={() => chooseAdd(selectedKey)} onClose={() => setPanelOpen(false)} {...handlers} />
          </View>
        ) : null}
      </View>
    );
  } else if (view === 'week') {
    body = <WeekView weekStartDate={weekFirst} itemsByDay={itemsByDay} todayKey={todayKey} bottomInset={listInset} onAddOnDay={(key) => chooseAdd(key)} onPressDay={(key) => { selectDay(key); setView('day'); }} {...handlers} />;
  } else if (view === 'day') {
    body = <DayView dateKey={selectedKey} items={selectedItems} todayKey={todayKey} bottomInset={listInset} onAddAt={(minute) => openComposer(selectedKey, minute)} {...handlers} />;
  } else {
    body = loaded ? <AgendaView items={items} todayKey={todayKey} bottomInset={listInset} emptyText="Nothing coming up. Tap + to plan a note on a day." {...handlers} /> : null;
  }
  const showFab = !(view === 'month' && panelOpen) && !searchOpen;

  return <Screen>
    {header}
    {searchOpen ? (
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <Icon name="search-outline" size={17} color={theme.textMuted} />
        <TextInput autoFocus accessibilityLabel="Search notes and reminders" value={query} onChangeText={setQuery} placeholder="Search notes and reminders" placeholderTextColor={theme.textMuted} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={[styles.searchInput, { color: theme.textPrimary }]} />
      </View>
    ) : null}
    <View style={styles.flex}>{body}</View>
    {showFab ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add note on ${dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(view === 'agenda' ? today : selectedDate)}`}
        onPress={() => chooseAdd(view === 'agenda' ? todayKey : selectedKey, view === 'day' ? defaultStartMinute(selectedKey) : null)}
        style={({ pressed }) => [styles.fab, { bottom: tabBarHeight + spacing.md, backgroundColor: theme.accentStrong, shadowColor: theme.textPrimary }, pressed && styles.pressed]}
      >
        <Icon name="add" size={28} color={theme.background} />
      </Pressable>
    ) : null}

    {composer ? (
      <AddNoteSheet
        key={composer.key}
        visible
        title="New note"
        context={<AppText style={[styles.context, { color: theme.textSecondary }]}>A regular Chits note, planned on your calendar.</AppText>}
        canSubmit={!reminderInPast(composer.draft)}
        extraSummary={scheduleSummary(composer.draft)}
        onClose={() => setComposer(null)}
        onSubmit={submitNote}
        extra={<ScheduleFields
          value={composer.draft}
          onChange={(draft) => setComposer((current) => current && { ...current, draft })}
          destination={composer.destination}
          destinations={destinations}
          onDestinationChange={(destination) => setComposer((current) => current && destinationKey(current.destination) !== destinationKey(destination) ? { ...current, destination } : current)}
        />}
      />
    ) : null}
    {editing ? (
      <ScheduleSheet
        key={editing.key}
        visible
        title={editing.title}
        initial={editing.draft}
        scheduled={editing.scheduled}
        onClose={() => setEditing(null)}
        onSave={async (draft) => {
          const outcome = await applySchedule(database, editing.note, draft, editing.previous);
          reportOutcome(outcome, editing.scheduled ? 'Rescheduled' : 'Added to calendar');
          selectDay(draft.dateKey);
          await reload();
        }}
        onRemove={async () => { await removeCalendarEntry(database, editing.note); setToast('Removed from calendar — the note is still in Chits'); }}
      />
    ) : null}
    {reminderItem ? (
      <ReminderSheet
        key={reminderItem.key}
        visible
        existing={reminderItem.item.reminderAt}
        accent={theme.accentStrong}
        accentOn={theme.background}
        onClose={() => setReminderItem(null)}
        onSave={async (date) => {
          const { item } = reminderItem;
          const result = item.kind === 'card' ? await setCardReminder(database, item.id, date.getTime()) : await setMessageReminder(database, item.id, date.getTime());
          if (result.ok) { setToast('Reminder rescheduled'); await reload(); }
          return result;
        }}
        onRemove={() => removeReminder(reminderItem.item)}
      />
    ) : null}
    {picker ? (
      <CalendarNotePicker
        key={picker.key}
        visible={picker.visible}
        dayLabel={dateFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(parseDayKey(picker.dateKey) ?? today)}
        onClose={() => setPicker((current) => current && { ...current, visible: false })}
        onPick={scheduleExisting}
      />
    ) : null}
    <EntryDetailSheet
      item={detail?.item ?? null}
      visible={detail?.visible ?? false}
      now={now}
      onClose={() => setDetail((current) => current && { ...current, visible: false })}
      onAction={runEntryAction}
    />
    {monthPicker !== null ? (
      <MonthPickerSheet
        key={monthPicker}
        visible
        year={pickerMonth.year}
        month={pickerMonth.month}
        onClose={() => setMonthPicker(null)}
        onPick={(year, month) => {
          setMonthPicker(null);
          if (view === 'month') changeMonth(year * 12 + month);
          else selectDay(localDayKey(addLocalMonths(selectedDate, (year - selectedDate.getFullYear()) * 12 + month - selectedDate.getMonth())));
        }}
      />
    ) : null}
    <Toast message={toast} />
  </Screen>;
}

/** Today's date in a small calendar tile, inked like the header's other icons. */
function TodayGlyph({ day }: { day: number }) {
  const { ink: headerInk } = useHeaderInk();
  const ink = useContext(TileInkContext) ?? headerInk;
  return <View style={[styles.todayBadge, { borderColor: ink }]}><AppText maxFontSizeMultiplier={1} style={[styles.todayBadgeText, { color: ink }]}>{day}</AppText></View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  pressed: { opacity: 0.64 },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.xs },
  titleButton: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.xxs },
  title: { flexShrink: 1, fontSize: 19, fontWeight: '700' },
  chevron: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayBadge: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  todayBadgeText: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  search: { minHeight: 44, marginHorizontal: spacing.md, marginBottom: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.control, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, minHeight: 42 },
  gridWithPanel: { flex: 55 },
  panel: { flex: 45 },
  fab: { position: 'absolute', right: spacing.md, width: FAB_SIZE, height: FAB_SIZE, borderRadius: FAB_SIZE / 2, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.22, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  context: { marginTop: spacing.xxs, marginBottom: spacing.sm, fontSize: 13, lineHeight: 18 },
});
