import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Pressable, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { Icon } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { getFormattingLocale, tr } from '@/localization/runtime';
import { navigationIconName } from '@/localization/text-layout';
import { PlanAction } from './plan-action';
import { addDays, dateFromKey, monthGroups, taskKey } from './plan-core';
import type { PlanHistoryDay, PlanRepository, TaskCopy } from './plan-repository';
import { PlanCheck } from './plan-task-row';
import { shortDay } from './recap-view';

/** One choosable task. `planned` ones are already on the day, so they show but can't be picked. */
type CopyItem = { key: string; copy: TaskCopy; detail: string | null; done: boolean; planned: boolean };

type SheetProps = {
  visible: boolean;
  surfaces: WelcomeSurfaces;
  title: string;
  body: string;
  /** Search, or the days to choose from. */
  top?: ReactNode;
  items: CopyItem[] | null;
  selected: ReadonlySet<string>;
  /** How many will be added, counting picks a search has hidden. */
  count: number;
  empty: string;
  busy: boolean;
  error: boolean;
  onToggle: (item: CopyItem) => void;
  onToggleAll: (on: boolean) => void;
  onAdd: () => void;
  onClose: () => void;
  /** Shown instead of the task list and its button, for picking something first. */
  browse?: ReactNode;
  /** What the hardware back button does while browsing, instead of closing. */
  onBack?: () => void;
};

/** The bottom sheet both ways of reusing tasks share: tick what to bring, then add it to the plan. */
function PlanCopySheet({ visible, surfaces, title, body, top, items, selected, count, empty, busy, error, onToggle, onToggleAll, onAdd, onClose, browse, onBack }: SheetProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const { rowStyle, isRTL } = useDirection();
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const choosable = (items ?? []).filter((item) => !item.planned);
  const allOn = choosable.length > 0 && choosable.every((item) => selected.has(item.key));
  const close = () => { if (!busy) onClose(); };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={browse && onBack ? onBack : close}>
    <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={close} />
      <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: surfaces.paper, borderTopLeftRadius: styleTokens.radius.sheet, borderTopRightRadius: styleTokens.radius.sheet }]}>
        <View style={[styles.handle, { backgroundColor: surfaces.track }]} />
        <View style={[styles.header, rowStyle]}>
          <View style={styles.headerCopy}>
            <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, align, { color: surfaces.ink }]}>{title}</AppText>
            <AppText family={fonts.text} style={[styles.body, align, { color: surfaces.inkMuted }]}>{body}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('attachments.close')} disabled={busy} hitSlop={8} onPress={close} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
            <Icon name="close" size={22} color={surfaces.inkMuted} />
          </Pressable>
        </View>
        {top}
        {browse ?? <>
        {choosable.length > 1 ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allOn }} onPress={() => onToggleAll(!allOn)} style={({ pressed }) => [styles.allRow, rowStyle, pressed && styles.pressed]}>
          <View style={styles.checkSlot}><PlanCheck checked={allOn} surfaces={surfaces} /></View>
          <AppText family={fonts.textBold} style={[styles.allText, align, { color: surfaces.ink }]}>{tr('plan.copy.selectAll')}</AppText>
        </Pressable> : null}
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={items ? <AppText family={fonts.text} style={[styles.empty, { color: surfaces.inkMuted }]}>{empty}</AppText> : <ActivityIndicator style={styles.loading} color={surfaces.inkMuted} />}
          renderItem={({ item }) => {
            const checked = selected.has(item.key);
            const linked = Boolean(item.copy.messageId || item.copy.cardId);
            const detail = item.planned ? tr('plan.copy.planned') : item.done ? tr('plan.copy.doneThatDay') : item.detail;
            return <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={detail ? `${item.copy.title}, ${detail}` : item.copy.title}
              accessibilityState={{ checked: item.planned || checked, disabled: item.planned }}
              disabled={item.planned}
              onPress={() => onToggle(item)}
              style={({ pressed }) => [styles.row, rowStyle, { borderRadius: styleTokens.button.radius },
                // What will be added is a card on the page, like an open task; the rest lies flat.
                checked && !item.planned ? { backgroundColor: surfaces.card } : null, item.planned && styles.planned, pressed && styles.pressed]}
            >
              <View style={styles.checkSlot}>{item.planned ? <Icon name="checkmark-done" size={20} color={surfaces.inkMuted} /> : <PlanCheck checked={checked} surfaces={surfaces} />}</View>
              <View style={styles.copy}>
                <AppText numberOfLines={2} family={fonts.text} style={[styles.rowTitle, align, { color: surfaces.ink }]}>{item.copy.title}</AppText>
                {detail || linked ? <View style={[styles.meta, rowStyle]}>
                  {detail ? <AppText family={fonts.text} style={[styles.metaText, { color: surfaces.inkMuted }]}>{detail}</AppText> : null}
                  {linked ? <View style={[styles.metaItem, rowStyle]}><Icon name="attach" size={13} color={surfaces.inkMuted} /><AppText family={fonts.text} style={[styles.metaText, { color: surfaces.inkMuted }]}>{tr('plan.task.linked')}</AppText></View> : null}
                </View> : null}
              </View>
            </Pressable>;
          }}
        />
        {error ? <AppText accessibilityRole="alert" family={fonts.text} style={[styles.error, align, { color: surfaces.ink }]}>{tr('plan.copy.error')}</AppText> : null}
        <View style={styles.footer}>
          <PlanAction label={tr('plan.copy.add', { number: count })} surfaces={surfaces} disabled={!count || busy} onPress={onAdd} />
        </View>
        </>}
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

type Props = { visible: boolean; date: string; repository: PlanRepository; surfaces: WelcomeSurfaces; onClose: () => void; /** How many tasks landed; 0 when all were already planned. */ onAdded: (count: number) => void };

/** "Recent tasks": things planned on other days, newest first, searchable, to bring back in one go. */
export function RecentTasksSheet({ visible, date, repository, surfaces, onClose, onAdded }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { styleTokens } = useTheme();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CopyItem[] | null>(null);
  // Picks are kept by task, so they survive a search that hides them.
  const [picked, setPicked] = useState<ReadonlyMap<string, TaskCopy>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // A short pause while typing, so each keystroke doesn't query.
    const timer = setTimeout(() => {
      void repository.recentTasks(date, query).then((rows) => {
        if (!cancelled) setItems(rows.map((row) => ({ key: taskKey(row.title), copy: { title: row.title, messageId: row.messageId, cardId: row.cardId }, detail: shortDay(row.date), done: false, planned: row.planned })));
      }).catch(() => { if (!cancelled) setItems([]); });
    }, query ? 150 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [date, query, repository, visible]);
  // Opens fresh next time: no leftover search, list or picks.
  const reset = () => { setQuery(''); setItems(null); setPicked(new Map()); setBusy(false); setError(false); };
  const close = () => { reset(); onClose(); };
  const toggle = (item: CopyItem) => setPicked((current) => {
    const next = new Map(current);
    if (next.has(item.key)) next.delete(item.key); else next.set(item.key, item.copy);
    return next;
  });
  const toggleAll = (on: boolean) => setPicked((current) => {
    const next = new Map(current);
    for (const item of items ?? []) if (!item.planned) { if (on) next.set(item.key, item.copy); else next.delete(item.key); }
    return next;
  });
  const add = () => {
    setBusy(true); setError(false);
    void repository.addCopies(date, [...picked.values()]).then((count) => { reset(); onAdded(count); }).catch(() => { setBusy(false); setError(true); });
  };
  const search = <View style={[styles.search, rowStyle, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}>
    <Icon name="search-outline" size={17} color={surfaces.inkMuted} />
    <TextInput accessibilityLabel={tr('plan.recent.search')} value={query} onChangeText={setQuery} placeholder={tr('plan.recent.search')} placeholderTextColor={surfaces.inkMuted} returnKeyType="search" autoCorrect={false} style={[styles.searchInput, { color: surfaces.ink, textAlign: isRTL ? 'right' : 'left' }]} />
    {query ? <Pressable accessibilityRole="button" accessibilityLabel={tr('unorganized.clearSearch')} hitSlop={12} onPress={() => setQuery('')}><Icon name="close-circle" size={16} color={surfaces.inkMuted} /></Pressable> : null}
  </View>;
  return <PlanCopySheet
    visible={visible}
    surfaces={surfaces}
    title={tr('plan.recent.title')}
    body={tr('plan.recent.body')}
    top={search}
    items={items}
    selected={new Set(picked.keys())}
    count={picked.size}
    empty={query ? tr('plan.recent.noMatch') : tr('plan.recent.empty')}
    busy={busy}
    error={error}
    onToggle={toggle}
    onToggleAll={toggleAll}
    onAdd={add}
    onClose={close}
  />;
}

/** The days shown as chips; anything older waits behind "Earlier days". */
const RECENT_DAYS = 7;

/** "Reuse previous plan": an earlier day's tasks, Yesterday first, copied in without touching that day. */
export function ReusePlanSheet({ visible, date, today, repository, surfaces, onClose, onAdded }: Props & { today: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const fonts = useWelcomeFonts();
  const { rowStyle, isRTL, direction } = useDirection();
  const { styleTokens } = useTheme();
  const chipRow = useRef<ScrollView>(null);
  const [browsing, setBrowsing] = useState(false);
  const [days, setDays] = useState<PlanHistoryDay[] | null>(null);
  const [planned, setPlanned] = useState<ReadonlySet<string>>(new Set());
  const [chosen, setChosen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<{ date: string; items: CopyItem[] } | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const yesterday = addDays(today, -1);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // About a year back: older days are still found through Recent tasks' search.
    void Promise.all([repository.history(400, date), repository.day(date)]).then(([earlier, current]) => {
      if (cancelled) return;
      setDays(earlier);
      setPlanned(new Set((current?.tasks ?? []).map((task) => taskKey(task.title))));
      // The day before is the usual one to repeat; otherwise the latest there is.
      setChosen(earlier.find((day) => day.date === addDays(date, -1))?.date ?? earlier[0]?.date ?? null);
    }).catch(() => { if (!cancelled) { setDays([]); setChosen(null); } });
    return () => { cancelled = true; };
  }, [date, repository, visible]);
  useEffect(() => {
    if (!visible || !chosen) return;
    let cancelled = false;
    // A day that has gone missing in the meantime simply shows nothing to reuse.
    void repository.day(chosen).then((day) => {
      if (cancelled) return;
      const next = (day?.tasks ?? []).map((task): CopyItem => ({ key: task.id, copy: { title: task.title, messageId: task.messageId, cardId: task.cardId }, detail: null, done: task.completedAt !== null, planned: planned.has(taskKey(task.title)) }));
      setLoaded({ date: chosen, items: next });
      // Reusing a plan usually means all of it: everything not already planned starts picked.
      setSelected(new Set(next.filter((item) => !item.planned && !(onlyOpen && item.done)).map((item) => item.key)));
    }).catch(() => { if (!cancelled) setLoaded({ date: chosen, items: [] }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onlyOpen` only shapes the first picks; flipping it filters below instead of reloading.
  }, [chosen, planned, repository, visible]);
  // Still loading is null; no earlier days at all is an empty list.
  const items = !days ? null : !chosen ? [] : loaded?.date === chosen ? loaded.items : null;
  const shown = items ? items.filter((item) => !(onlyOpen && item.done)) : null;
  const reset = () => { setBrowsing(false); setDays(null); setPlanned(new Set()); setChosen(null); setLoaded(null); setSelected(new Set()); setOnlyOpen(false); setBusy(false); setError(false); };
  const close = () => { reset(); onClose(); };
  const toggle = (item: CopyItem) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(item.key)) next.delete(item.key); else next.add(item.key);
    return next;
  });
  const toggleAll = (on: boolean) => setSelected(on ? new Set((shown ?? []).filter((item) => !item.planned).map((item) => item.key)) : new Set());
  const toggleOpenOnly = () => {
    const next = !onlyOpen;
    setOnlyOpen(next);
    // Finished tasks leave the picks when they leave the list.
    if (next && items) setSelected((current) => new Set([...current].filter((key) => !items.find((item) => item.key === key)?.done)));
  };
  const picks = (shown ?? []).filter((item) => selected.has(item.key) && !item.planned);
  const add = () => {
    setBusy(true); setError(false);
    void repository.addCopies(date, picks.map((item) => item.copy)).then((count) => { reset(); onAdded(count); }).catch(() => { setBusy(false); setError(true); });
  };
  const radius = styleTokens.button.radius;
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  // A day from another year says which, so last December never reads as this one.
  const dayName = (key: string) => key === yesterday ? tr('plan.reuse.yesterday')
    : key.slice(0, 4) === today.slice(0, 4) ? shortDay(key)
    : dateFromKey(key).toLocaleDateString(getFormattingLocale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  // A week of chips stays one short swipe; an older day picked from the list joins them.
  const recent = days?.slice(0, RECENT_DAYS) ?? [];
  const olderChoice = chosen && !recent.some((day) => day.date === chosen) ? days?.find((day) => day.date === chosen) ?? null : null;
  const chips = olderChoice ? [...recent, olderChoice] : recent;
  const hasEarlier = (days?.length ?? 0) > RECENT_DAYS;
  const pickDay = (key: string) => { setChosen(key); setBrowsing(false); };
  const browse = browsing && days ? <SectionList
    sections={monthGroups(days).map((group) => ({ key: group.month, title: dateFromKey(`${group.month}-01`).toLocaleDateString(getFormattingLocale(), { month: 'long', year: 'numeric' }), data: group.days }))}
    keyExtractor={(day) => day.id}
    stickySectionHeadersEnabled={false}
    style={styles.list}
    contentContainerStyle={styles.browseContent}
    renderSectionHeader={({ section }) => <AppText accessibilityRole="header" family={fonts.display} style={[styles.month, align, { color: surfaces.ink }]}>{section.title}</AppText>}
    renderItem={({ item }) => {
      const on = item.date === chosen;
      return <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pickDay(item.date)} style={({ pressed }) => [styles.dayRow, rowStyle, { borderRadius: radius }, on && { backgroundColor: surfaces.card }, pressed && styles.pressed]}>
        <View style={styles.copy}>
          <AppText family={fonts.textBold} style={[styles.rowTitle, align, { color: surfaces.ink }]}>{dayName(item.date)}</AppText>
          <AppText family={fonts.text} style={[styles.metaText, align, { color: surfaces.inkMuted }]}>{tr('plan.progress', { done: item.done, total: item.total })}</AppText>
        </View>
        {on ? <Icon name="checkmark" size={18} color={surfaces.ink} /> : <Icon name={navigationIconName('chevron-forward', direction)} size={17} color={surfaces.inkMuted} />}
      </Pressable>;
    }}
  /> : undefined;
  const back = <Pressable accessibilityRole="button" onPress={() => setBrowsing(false)} style={({ pressed }) => [styles.back, rowStyle, pressed && styles.pressed]}>
    <Icon name={navigationIconName('chevron-back', direction)} size={18} color={surfaces.ink} />
    <AppText family={fonts.textBold} style={[styles.dayText, { color: surfaces.ink }]}>{tr('unorganized.back')}</AppText>
  </Pressable>;
  const top = browsing ? back : days && days.length ? <View style={styles.reuseTop}>
    <ScrollView ref={chipRow} horizontal showsHorizontalScrollIndicator={false} accessibilityRole="radiogroup" contentContainerStyle={[styles.days, rowStyle]} onContentSizeChange={() => { if (olderChoice) chipRow.current?.scrollToEnd({ animated: false }); }}>
      {chips.map((day) => {
        const on = day.date === chosen;
        return <Pressable key={day.id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${dayName(day.date)}, ${tr('plan.progress', { done: day.done, total: day.total })}`} onPress={() => setChosen(day.date)} style={({ pressed }) => [styles.day, { borderRadius: radius, backgroundColor: on ? surfaces.action : surfaces.control }, pressed && styles.pressed]}>
          <AppText family={fonts.textBold} style={[styles.dayText, { color: on ? surfaces.onAction : surfaces.ink }]}>{dayName(day.date)}</AppText>
        </Pressable>;
      })}
      {hasEarlier ? <Pressable accessibilityRole="button" onPress={() => setBrowsing(true)} style={({ pressed }) => [styles.day, styles.earlier, rowStyle, { borderRadius: radius, borderColor: surfaces.track }, pressed && styles.pressed]}>
        <Icon name="calendar-outline" size={15} color={surfaces.ink} />
        <AppText family={fonts.textBold} style={[styles.dayText, { color: surfaces.ink }]}>{tr('plan.reuse.earlier')}</AppText>
      </Pressable> : null}
    </ScrollView>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: onlyOpen }} onPress={toggleOpenOnly} style={({ pressed }) => [styles.allRow, rowStyle, pressed && styles.pressed]}>
      <View style={styles.checkSlot}><PlanCheck checked={onlyOpen} surfaces={surfaces} /></View>
      <AppText family={fonts.text} style={[styles.allText, { color: surfaces.ink, textAlign: isRTL ? 'right' : 'left' }]}>{tr('plan.reuse.unfinishedOnly')}</AppText>
    </Pressable>
  </View> : null;
  return <PlanCopySheet
    visible={visible}
    surfaces={surfaces}
    title={tr('plan.reuse.title')}
    body={browsing ? tr('plan.reuse.pickDay') : tr('plan.reuse.body')}
    top={top}
    browse={browse}
    onBack={() => setBrowsing(false)}
    items={shown}
    selected={selected}
    count={picks.length}
    empty={days && !days.length ? tr('plan.reuse.empty') : tr('plan.reuse.dayEmpty')}
    busy={busy}
    error={error}
    onToggle={toggle}
    onToggleAll={toggleAll}
    onAdd={add}
    onClose={close}
  />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { maxHeight: '88%', paddingTop: spacing.xs, paddingBottom: spacing.xs },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: spacing.xs },
  header: { alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 14, lineHeight: 19 },
  close: { width: layout.minimumTouchTarget, height: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.xs, marginEnd: -spacing.xs },
  search: { minHeight: layout.minimumTouchTarget, alignItems: 'center', gap: spacing.xs, marginHorizontal: spacing.md, marginBottom: spacing.xs, paddingHorizontal: spacing.sm },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  reuseTop: { gap: 2 },
  days: { gap: spacing.xs, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  day: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm },
  dayText: { fontSize: 14, lineHeight: 19 },
  earlier: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed' },
  back: { minHeight: layout.minimumTouchTarget, alignSelf: 'flex-start', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md - 4 },
  browseContent: { paddingHorizontal: spacing.md - spacing.xs, paddingBottom: spacing.lg },
  month: { fontSize: 16, lineHeight: 22, paddingHorizontal: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.xxs },
  dayRow: { minHeight: 56, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  allRow: { minHeight: layout.minimumTouchTarget, alignItems: 'center', paddingHorizontal: spacing.md },
  allText: { flex: 1, fontSize: 15, lineHeight: 20 },
  checkSlot: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { paddingHorizontal: spacing.md - spacing.xs, paddingBottom: spacing.sm, gap: 2 },
  row: { minHeight: 52, alignItems: 'center', paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
  planned: { opacity: 0.6 },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontSize: 15, lineHeight: 20 },
  meta: { flexWrap: 'wrap', columnGap: spacing.sm, alignItems: 'center' },
  metaItem: { alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, lineHeight: 16 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  loading: { paddingVertical: spacing.lg },
  error: { fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  pressed: { opacity: 0.7 },
});
