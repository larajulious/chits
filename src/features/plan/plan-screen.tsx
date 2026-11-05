import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInput } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PaperDesk, useDesk } from '@/components/desk/paper-desk';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { NotePicker } from '@/components/spaces/note-picker';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { SceneMinuteContext } from '@/components/ui/header-scene-layer';
import { Icon } from '@/components/ui/icon';
import { HeaderIcon, HeaderIconButton, HeaderTitleTag, Screen, TopBarBackground, useHeaderInk } from '@/components/ui/primitives';
import { PAPER_INK } from '@/constants/paper';
import { layout, spacing } from '@/constants/theme';
import { listNoteCandidates } from '@/db/repositories';
import type { SpaceCandidate } from '@/db/types';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { getFormattingLocale, tr } from '@/localization/runtime';
import { ensureNotificationPermission } from '@/services/reminders';
import { useSQLiteContext } from 'expo-sqlite';
import { PlanAction } from './plan-action';
import { PlanAddInput } from './plan-add-input';
import { dateFromKey, moved, planMilestone, progressOf, wrapIsDue, type DailyTask, type PlanMilestone } from './plan-core';
import { PlanHero } from './plan-hero';
import { PLAN_LINE, PLAN_LINES } from './plan-lines';
import { PlanProgress } from './plan-progress';
import { PlanSlots } from './plan-slots';
import { PlanTaskRow } from './plan-task-row';
import { PlanTaskSheet } from './plan-task-sheet';
import { RecapView } from './recap-view';
import { usePlanDay, usePlanRepository, usePlanSurfaces, useToday } from './use-plan-day';
import { WrapUpView } from './wrap-up-view';

/** The room at dusk, whatever the clock says, for wrapping up early. */
const EVENING_MINUTE = 20 * 60 + 30;
const greetedDays = new Set<string>();
const reachedFrom = (done: number, total: number): PlanMilestone[] => [...(done >= 1 ? ['first' as const] : []), ...(total >= 4 && done * 2 >= total ? ['half' as const] : []), ...(total > 0 && done === total ? ['all' as const] : [])];

export default function PlanScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const params = useLocalSearchParams<{ date?: string; wrap?: string; add?: string; task?: string }>();
  const router = useRouter();
  const database = useSQLiteContext();
  const { today, period } = useToday();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today;
  const isToday = date === today;
  const repository = usePlanRepository();
  const { day, ready } = usePlanDay(date);
  const surfaces = usePlanSurfaces();
  const { tokens } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const { rowStyle, isRTL } = useDirection();
  const headerInk = useHeaderInk();
  const insets = useSafeAreaInsets();
  const addInput = useRef<TextInput>(null);
  const [wrapping, setWrapping] = useState(params.wrap === '1');
  const [editing, setEditing] = useState<DailyTask | null>(null);
  const [reminderFor, setReminderFor] = useState<DailyTask | null>(null);
  const [pickerFor, setPickerFor] = useState<'new' | DailyTask | null>(null);

  const loadCandidates = useCallback((term: string) => listNoteCandidates(database, 'plan', term), [database]);
  const plan = day?.plan ?? null;
  const tasks = day?.tasks ?? [];
  // A widget or notification can land here while the screen is already open.
  const [seenLink, setSeenLink] = useState<string | null>(null);
  const link = `${params.wrap ?? ''}|${params.task ?? ''}`;
  if (ready && link !== seenLink) {
    setSeenLink(link);
    if (params.wrap === '1' && tasks.length) setWrapping(true);
    const linkedTask = params.task ? tasks.find((task) => task.id === params.task) : null;
    if (linkedTask) setEditing(linkedTask);
  }
  const { done, total } = progressOf(tasks);
  const wrapped = plan?.status === 'wrapped';
  const planning = !wrapped && (!plan || plan.status === 'planning') && date >= today;
  const evening = wrapping || wrapped;
  const rig = useMascotRig(PLAN_LINES.length, { compact: true, entrance: !greetedDays.has(date), sleepy: evening, cheerful: wrapped });
  const { say } = rig;

  // Each milestone once a day: what's already true when the screen opens doesn't count.
  const reached = useRef<PlanMilestone[] | null>(null);
  useEffect(() => { reached.current = null; }, [date]);
  useEffect(() => {
    if (!ready) return;
    if (reached.current === null) { reached.current = reachedFrom(done, total); return; }
    const next = planMilestone(done, total, reached.current);
    if (next && !wrapped) { reached.current = [...reached.current, next]; say(PLAN_LINE[next]); }
  }, [done, ready, say, total, wrapped]);
  useEffect(() => {
    if (!ready || greetedDays.has(date) || !isToday || wrapped) return;
    greetedDays.add(date);
    say(planning ? PLAN_LINE.morning : PLAN_LINE.afternoon);
  }, [date, isToday, planning, ready, say, wrapped]);

  const dateLabel = dateFromKey(date).toLocaleDateString(getFormattingLocale(), { weekday: 'long', month: 'long', day: 'numeric' });
  const ordered = [...tasks.filter((task) => task.completedAt === null), ...tasks.filter((task) => task.completedAt !== null)];
  const open = ordered.filter((task) => task.completedAt === null);
  const finished = ordered.filter((task) => task.completedAt !== null);
  const openIndex = editing ? open.findIndex((task) => task.id === editing.id) : -1;

  const heading = wrapping ? 'plan.wrap.heading' : wrapped ? 'plan.recap.heading' : planning ? (period === 'morning' ? 'plan.morning.heading' : 'plan.planning.heading') : period === 'afternoon' ? 'plan.hero.afternoon' : 'plan.heading';
  const body = wrapping ? 'plan.wrap.body' : wrapped ? 'plan.hero.wrapped' : planning ? 'plan.morning.body' : 'plan.body';

  const addTask = (title: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
    void repository.addTask(date, title).catch(() => undefined);
  };
  const toggle = (task: DailyTask) => {
    void Haptics.selectionAsync().catch(() => undefined);
    void repository.setDone(task.id, task.completedAt === null).catch(() => undefined);
  };
  const tapMascot = () => {
    const line = wrapped ? (done ? PLAN_LINE.evening : PLAN_LINE.zero) : planning ? PLAN_LINE.morning : period === 'evening' ? PLAN_LINE.evening : PLAN_LINE.afternoon;
    if (rig.tap(line)) void Haptics.selectionAsync().catch(() => undefined);
  };
  const start = () => { void repository.start(date).then(() => { void Haptics.selectionAsync().catch(() => undefined); say(PLAN_LINE.afternoon); }).catch(() => undefined); };
  const finish = (choices: { reflection: string; carry: string[]; complete: string[] }) => {
    const finishedCount = done + choices.complete.length;
    void repository.wrapUp(date, today, choices).then(() => {
      setWrapping(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      say(finishedCount === 0 ? PLAN_LINE.zero : finishedCount === total ? PLAN_LINE.all : PLAN_LINE.evening);
    }).catch(() => undefined);
  };
  const pick = (candidate: SpaceCandidate) => {
    const target = pickerFor;
    setPickerFor(null);
    const link = candidate.kind === 'card' ? { cardId: candidate.id } : { messageId: candidate.id };
    if (target === 'new') void repository.addTask(date, candidate.hidden ? tr('index.hiddenChit') : candidate.title, link).catch(() => undefined);
    else if (target) void repository.setLink(target.id, link).catch(() => undefined);
  };
  const openLink = (task: DailyTask) => {
    setEditing(null);
    router.push({ pathname: '/anywhere', params: task.cardId ? { kind: 'card', id: task.cardId } : { kind: 'thought', id: task.messageId ?? '' } });
  };
  const move = (delta: number) => {
    if (!editing) return;
    void repository.reorder([...moved(open, openIndex, delta), ...finished].map((task) => task.id)).catch(() => undefined);
  };

  const list = reduced ? undefined : LinearTransition.duration(220);
  const adding = <View style={styles.adding}>
    <PlanAddInput surfaces={surfaces} autoFocus={params.add === '1'} inputRef={addInput} onAdd={addTask} />
    <Pressable accessibilityRole="button" onPress={() => setPickerFor('new')} style={({ pressed }) => [styles.link, rowStyle, pressed && styles.pressed]}>
      <Icon name="document-text-outline" size={16} color={surfaces.inkMuted} />
      <AppText family={fonts.textBold} style={[styles.linkText, { color: surfaces.inkMuted }]}>{tr('plan.fromNotes')}</AppText>
    </Pressable>
  </View>;
  // While planning, the box stays put and the list grows under it. Once the day
  // is running the tasks come first, unless a link came here to add one.
  const addFirst = planning || params.add === '1';
  const onPlan = !wrapping && !(wrapped && plan);
  const rows = (items: DailyTask[]) => items.map((task) => <Animated.View key={task.id} layout={list} entering={reduced ? undefined : FadeInDown.duration(200)}>
    <PlanTaskRow task={task} surfaces={surfaces} onToggle={() => toggle(task)} onMore={() => setEditing(task)} />
  </Animated.View>);

  return <SceneMinuteContext.Provider value={evening ? EVENING_MINUTE : null}>
    <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
      <View style={[styles.header, rowStyle]}>
        <TopBarBackground />
        <HeaderIconButton label={tr('search.goBack')} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><HeaderIcon name="chevron-back" size={24} /></HeaderIconButton>
        <View style={styles.headerTitle}><HeaderTitleTag><AppText accessibilityRole="header" numberOfLines={1} family={fonts.display} style={[styles.dateTitle, { color: headerInk.banded ? PAPER_INK : headerInk.ink }]}>{dateLabel}</AppText></HeaderTitleTag></View>
        <HeaderIconButton label={tr('plan.history')} onPress={() => router.push('/plan-history')}><HeaderIcon name="time-outline" size={22} /></HeaderIconButton>
      </View>
      <PaperDesk faint>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: surfaces.paper }} contentContainerStyle={styles.scroll}>
            <PlanHero rig={rig} title={tr(heading)} body={tr(body)} paper={surfaces.paper} evening={evening} onTap={tapMascot} />
            {ready ? <Animated.View key={wrapping ? 'wrap' : wrapped ? 'recap' : 'plan'} entering={reduced ? undefined : FadeIn.duration(260)} style={styles.content}>
              {wrapping ? <WrapUpView tasks={tasks} surfaces={surfaces} initialReflection={plan?.reflection ?? null} onCancel={() => setWrapping(false)} onFinish={finish} />
                : wrapped && plan ? <RecapView key={plan.id} plan={plan} tasks={tasks} surfaces={surfaces} onReopen={() => { void repository.reopen(date).catch(() => undefined); }} onReflect={(text) => { void repository.setReflection(date, text).catch(() => undefined); }} />
                : <>
                  {total && !planning ? <PlanProgress done={done} total={total} surfaces={surfaces} /> : null}
                  {addFirst ? adding : null}
                  {planning && total < 3 ? <AppText family={fonts.text} style={[styles.helper, { color: surfaces.inkMuted, textAlign: isRTL ? 'right' : 'left' }]}>{tr('plan.helper')}</AppText> : null}
                  <View style={styles.tasks}>
                    {rows(open)}
                    {planning ? <PlanSlots total={total} surfaces={surfaces} onPress={() => addInput.current?.focus()} /> : null}
                  </View>
                  {!addFirst ? adding : null}
                  {finished.length ? <View style={styles.tasks}>
                    <AppText accessibilityRole="header" family={fonts.display} style={[styles.section, { color: surfaces.ink, textAlign: isRTL ? 'right' : 'left' }]}>{tr('plan.doneSection')}</AppText>
                    {rows(finished)}
                  </View> : null}
                </>}
            </Animated.View> : null}
          </ScrollView>
          {/* Held in reach however long the list gets. Nothing shows until there's a day to start. */}
          {ready && onPlan && total ? <Animated.View entering={reduced ? undefined : FadeInDown.duration(220)} style={[styles.footer, { backgroundColor: surfaces.paper, paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <View style={styles.footerAction}>
              {planning ? <PlanAction label={tr('plan.start')} surfaces={surfaces} onPress={start} />
                : <PlanAction label={tr('plan.wrapAction')} surfaces={surfaces} quiet={!wrapIsDue(period, done, total)} onPress={() => { setWrapping(true); say(done ? PLAN_LINE.evening : PLAN_LINE.zero); }} />}
            </View>
          </Animated.View> : null}
        </KeyboardAvoidingView>
      </PaperDesk>
      <PlanTaskSheet
        task={editing}
        canMoveUp={openIndex > 0}
        canMoveDown={openIndex >= 0 && openIndex < open.length - 1}
        onClose={() => setEditing(null)}
        onRename={(title) => { if (editing) void repository.renameTask(editing.id, title).catch(() => undefined); }}
        onRemind={() => { setReminderFor(editing); setEditing(null); }}
        onLink={() => { setPickerFor(editing); setEditing(null); }}
        onOpenLink={() => { if (editing) openLink(editing); }}
        onUnlink={() => { if (editing) void repository.setLink(editing.id, {}).catch(() => undefined); setEditing(null); }}
        onMove={(delta) => { move(delta); setEditing(null); }}
        onDelete={() => { if (editing) void repository.deleteTask(editing.id).catch(() => undefined); setEditing(null); }}
      />
      <ReminderSheet
        visible={reminderFor !== null}
        existing={reminderFor?.reminderAt ?? null}
        accent={tokens.accent}
        accentOn={tokens.accentText}
        onClose={() => setReminderFor(null)}
        onSave={async (at) => {
          const permission = await ensureNotificationPermission();
          if (permission !== 'granted') return { ok: false, reason: permission === 'blocked' ? 'blocked' : 'declined' };
          if (reminderFor) await repository.setReminder(reminderFor.id, at.getTime());
          return { ok: true };
        }}
        onRemove={async () => { if (reminderFor) await repository.setReminder(reminderFor.id, null); }}
      />
      <NotePicker visible={pickerFor !== null} spaceName="" title={tr('plan.pickTitle')} loadCandidates={loadCandidates} onClose={() => setPickerFor(null)} onPick={pick} />
    </Screen>
  </SceneMinuteContext.Provider>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { minHeight: 56, alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  headerTitle: { flex: 1, minWidth: 0, alignItems: 'center' },
  dateTitle: { fontSize: 15, lineHeight: 20 },
  scroll: { flexGrow: 1 },
  // The hero's paper already leaves room above, for Chits' hand.
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.xxs, paddingBottom: spacing.md, gap: spacing.sm },
  tasks: { gap: spacing.xs },
  adding: { gap: spacing.xxs },
  helper: { fontSize: 13, lineHeight: 18, paddingHorizontal: spacing.xxs },
  section: { fontSize: 17, lineHeight: 23, paddingTop: spacing.xxs },
  link: { minHeight: layout.minimumTouchTarget, alignItems: 'center', gap: 6, paddingHorizontal: spacing.xxs },
  linkText: { fontSize: 14 },
  pressed: { opacity: 0.6 },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  footerAction: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
});
