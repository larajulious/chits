import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { AppHeader, Chip, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { useDirection, useLocale } from '@/localization/provider';
import { localizedDate, tr } from '@/localization/runtime';
import { createSpinRepository } from '@/db/spin-repository';
import { createRevisitRepository } from '@/db/revisit-repository';
import { AddNoteSheet, type NoteSubmission } from '@/components/boards/add-note-sheet';
import { createMessageRepository, createBoardRepository } from '@/db/repositories';
import { cardNoteRoute } from '@/services/card-note-route';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { SPIN_CATEGORIES, SPIN_WHEEL_CATEGORIES, SPIN_DEFAULTS, spinOptions, spinOptionKey, selectSpin, spinLanding, spinSourceRoute, spinSummary, type SpinCandidate, type SpinPreferences, type SpinEnergy, type SpinWheelCategory } from '@/services/spin-engine';
import type { RevisitNote } from '@/services/revisit-engine';
import { FocusText as AppText, focusStyles } from '@/features/focus/focus-ui';
import { SpinWheel, spinTo } from './spin-wheel';
import { PAPER_INK, PAPER_INK_MUTED, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { SPIN_CATEGORY_PAPER } from './spin-paper';
import { SpinEmpty } from './spin-empty';
import { SpinOverdueChip } from './spin-overdue-chip';
import { SPIN_CONFIRM_MS, SpinActions, SpinFact, SpinResultCard } from './spin-result';
import { SpinStage, useSpinEntrance, useSpinWheelLayout } from './spin-stage';
import { SpinWorkspace } from './spin-workspace';
import { SpinCelebration } from './spin-celebration';
import { FormSheet } from '@/components/ui/form-sheet';
import { SPACES, resolveSpaceId } from '@/constants/spaces';

type Result = { candidate: SpinCandidate; id: number; done: boolean; challenge?: boolean };
const WELCOME_COPY = ['spin.hero.title', 'spin.hero.body'] as const;
/** Chits' heading and line for each moment. The bubble speaks; these explain. */
const HERO_COPY: Record<string, readonly [string, string]> = {
  welcome: WELCOME_COPY, before: WELCOME_COPY, spinning: WELCOME_COPY,
  result: ['spin.mascot.result', 'spin.hero.resultBody'],
  focus: ['spin.mascot.focus', 'spin.hero.resultBody'],
  completed: ['spin.mascot.completed', 'spin.mascot.before'],
  skipped: ['spin.mascot.skipped', 'spin.hero.body'],
  empty: ['spin.mascot.empty', 'spin.hero.emptyBody'],
};
let lastWheel: SpinWheelCategory[] = SPIN_WHEEL_CATEGORIES.filter(c => c !== 'suggestions' && SPIN_DEFAULTS.categories.includes(c));
export function NoteSpinScreen({ modeAction, modeNotice, onBusyChange }: { modeAction: ReactNode; modeNotice: ReactNode; onBusyChange: (busy: boolean) => void }) {
  'use no memo';
  useLocale();
  const db = useSQLiteContext();
  const repo = useMemo(() => createSpinRepository(db), [db]);
  const revisit = useMemo(() => createRevisitRepository(db), [db]);
  const { tokens } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const { rowStyle } = useDirection();
  const { confirm, actionSheet } = useAppDialog();
  const { fontScale } = useWindowDimensions();
  const accessibleLayout = fontScale > 1.3;
  const wheelLayout = useSpinWheelLayout();
  const entrance = useSpinEntrance();
  const scroll = useRef<ScrollView>(null);
  const reduced = useReducedMotion();
  const sound = useAudioPlayer(require('../../../assets/sounds/spin-land.wav'));
  const [preferences, setPreferences] = useState(SPIN_DEFAULTS);
  const preferencesRef = useRef(preferences);
  const [challenge, setChallenge] = useState(false);
  const challengeRef = useRef(false);
  const [candidates, setCandidates] = useState<SpinCandidate[]>([]);
  const [overdue, setOverdue] = useState<RevisitNote[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const resultRef = useRef(result);
  const [suggestion, setSuggestion] = useState<'new-note' | 'saved' | null>(null);
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [suggestionSkippedAt, setSuggestionSkippedAt] = useState<number | null>(null);
  const previousSelection = useRef<string | undefined>(undefined);
  const hasResult = !!result || suggestion !== null;
  const [busy, setBusy] = useState(false);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);
  const [celebration, setCelebration] = useState(0);
  const [frozenCategories, setFrozenCategories] = useState<SpinWheelCategory[]>([]);
  // Which result just landed (a restored one rises into nothing), and Chits' cue for it.
  const [revealKey, setRevealKey] = useState<string | null>(null);
  const [landing, setLanding] = useState({ count: 0, repeat: false });
  const [confirming, setConfirming] = useState(false);
  const restoring = useRef(false);
  const [advanced, setAdvanced] = useState(false);
  const [details, setDetails] = useState(false);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [message, setMessage] = useState('welcome');
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const focused = useRef(false);
  const restored = useRef(false);
  const generation = useRef(0);
  const [rotation] = useState(() => new Animated.Value(0));
  const angle = useRef(0);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const assignResult = useCallback((value: Result | null) => { resultRef.current = value; setResult(value); }, []);
  const fail = useCallback((cause: unknown) => {
    const expected = ['unavailable','changed','openFirst','editFirst','invalidMetadata'].map(k => tr(`spin.${k}`));
    if (mounted.current) setError(cause instanceof Error && expected.includes(cause.message) ? cause.message : tr('spin.error'));
  }, []);
  const load = useCallback(async () => {
    if (!focused.current) return;
    const request = ++generation.current;
    try {
      const previous = resultRef.current;
      const [data, earned, record] = await Promise.all([
        repo.candidates({ ...preferencesRef.current, categories: [...SPIN_CATEGORIES] }, challengeRef.current),
        repo.achievements(),
        previous ? repo.history(previous.id) : null,
      ]);
      const fresh = record ? await revisit.get(record.note_key) : null;
      if (!mounted.current || request !== generation.current) return;
      setCandidates(data.candidates); setOverdue(data.overdue); setAchievements(earned.map(a => a.id));
      if (previous && resultRef.current?.id === previous.id) {
        if (!fresh || !record) { assignResult(null); setMessage('empty'); setError(tr('spin.unavailable')); }
        else {
          if (record.completed_at !== null && !previous.done) setMessage('completed');
          assignResult({ ...previous, candidate: { ...previous.candidate, note: fresh }, done: record.completed_at !== null });
        }
      }
      setLoading(false);
    } catch (cause) { if (request === generation.current) { fail(cause); setLoading(false); } }
  }, [assignResult, fail, repo, revisit]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; animation.current?.stop(); rotation.removeAllListeners(); }; }, [rotation]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    // Back from Focus: the same result, exactly where it was. Nothing rerolls.
    setMessage(value => value === 'focus' ? 'result' : value);
    void Promise.all([repo.preferences(), restored.current ? null : repo.latest()]).then(([value, latest]) => {
      if (!focused.current) return;
      preferencesRef.current = value; setPreferences(value);
      if (!restored.current) {
        restored.current = true; assignResult(latest);
        if (latest) previousSelection.current = spinOptionKey(latest.candidate);
        if (latest) {
          setMessage(latest.done ? 'completed' : 'result');
          setFrozenCategories([latest.candidate.category]); rotation.setValue(0); angle.current = 0;
          restoring.current = true;
          challengeRef.current = latest.challenge; setChallenge(latest.challenge);
        }
      }
      void load();
    }).catch(fail);
    const stopNotes = subscribeToNoteChanges(() => { if (!locked.current) void load(); });
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') animation.current?.stop();
      else if (!locked.current) void load();
    });
    return () => { focused.current = false; generation.current++; stopNotes(); app.remove(); animation.current?.stop(); };
  }, [assignResult, fail, load, repo, rotation]));

  const celebrate = () => {
    if (preferencesRef.current.celebrations && !reduced && AppState.currentState === 'active') {
      setCelebration(value => value + 1);
    }
  };
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await operation(); }
    catch (cause) { fail(cause); }
    finally { locked.current = false; if (mounted.current) { setBusy(false); setSpinning(false); } }
  };
  const updatePreferences = (value: SpinPreferences) => void run(async () => {
    setCelebration(0);
    await repo.setPreferences(value);
    preferencesRef.current = value; setPreferences(value); setLoading(true); await load();
  });
  const eligible = spinOptions(candidates.filter(c => preferences.categories.includes(c.category)), preferences, suggestionSkippedAt);
  const categories = SPIN_WHEEL_CATEGORIES.filter(c => eligible.some(item => item.category === c));
  const availableCategories = SPIN_CATEGORIES.filter(c => candidates.some(item => item.category === c));
  // A result restored at launch gets the wheel it could have come from, resting on its slice.
  useEffect(() => {
    if (!restoring.current || loading || !result) return;
    restoring.current = false;
    const wheel = SPIN_WHEEL_CATEGORIES.filter(c => c === result.candidate.category || categories.includes(c));
    const rest = (360 - wheel.indexOf(result.candidate.category) * 360 / wheel.length) % 360;
    setFrozenCategories(wheel); rotation.setValue(rest); angle.current = rest;
  }, [categories, loading, result, rotation]);
  const spin = () => void run(async () => {
    const data = await repo.candidates(preferencesRef.current, challengeRef.current);
    const options = spinOptions(data.candidates, preferencesRef.current, suggestionSkippedAt);
    const chosen = selectSpin(options, previousSelection.current);
    if (!chosen) { setCandidates([]); setSuggestion(null); assignResult(null); setMessage('empty'); return; }
    const wheelCategories = SPIN_WHEEL_CATEGORIES.filter(c => options.some(item => item.category === c));
    // Freeze the exact wheel used to compute the target before animation begins.
    setCandidates(data.candidates); setOverdue(data.overdue); setFrozenCategories(wheelCategories);
    const id = chosen.kind === 'suggestion' ? null : await repo.select(chosen, challengeRef.current);
    setCelebration(0);
    const repeat = previousSelection.current === spinOptionKey(chosen);
    previousSelection.current = spinOptionKey(chosen);
    // The last result stays on the page until this one lands.
    scroll.current?.scrollTo({ y: 0, animated: !reduced });
    setDetails(false); setSpinning(true); setMessage('spinning');
    const target = spinLanding(angle.current, wheelCategories.indexOf(chosen.category), wheelCategories.length);
    if (!reduced) {
      let lastBoundary = -1; let lastTick = 0;
      const listener = rotation.addListener(({ value }) => {
        const boundary = Math.floor((value + 180 / wheelCategories.length) / (360 / wheelCategories.length));
        const now = Date.now();
        if (boundary !== lastBoundary && now - lastTick > 90 && AppState.currentState === 'active') { lastBoundary = boundary; lastTick = now; void Haptics.selectionAsync().catch(() => undefined); }
      });
      await new Promise<void>(resolve => {
        animation.current = spinTo(rotation, target, wheelCategories.length);
        animation.current.start(() => resolve());
      });
      rotation.removeListener(listener);
    }
    angle.current = target % 360; rotation.setValue(angle.current); animation.current = null;
    if (!mounted.current) return;
    setRevealKey(chosen.kind === 'suggestion' ? 'suggestion' : `result:${id}`);
    if (chosen.kind === 'suggestion') { assignResult(null); setSuggestion(chosen.action); }
    else if (id !== null) { setSuggestion(null); assignResult({ candidate: chosen, id, done: false, challenge: challengeRef.current }); }
    setSpinning(false); setMessage('result'); setLanding(value => ({ count: value.count + 1, repeat }));
    AccessibilityInfo.announceForAccessibility(chosen.kind === 'suggestion'
      ? `${tr('spin.mascot.result')} ${tr('spin.newNote')}. ${tr('spin.newNotePrompt')}`
      : `${tr('spin.mascot.result')} ${chosen.note.title}. ${tr(`spin.reason.${chosen.reason}`)}`);
    if (AppState.currentState === 'active') {
      if (!reduced) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (preferencesRef.current.sound) { try { await sound.seekTo(0); sound.play(); } catch { /* Optional feedback. */ } }
    }
    setAchievements((await repo.achievements()).map(a => a.id));
  });
  const saveSuggestedNote = async ({ text, attachment, blocks }: NoteSubmission) => {
    const messages = createMessageRepository(db);
    if (blocks) await messages.createNote({ blocks, attachment });
    else if (attachment) await messages.createAttachmentMessage(attachment, text || null);
    else await messages.createText(text);
    // From the empty state there's no suggestion to finish: the wheel simply refills.
    if (suggestion === 'new-note') { setSuggestion('saved'); setMessage('completed'); celebrate(); }
    AccessibilityInfo.announceForAccessibility(tr('calendar.noteAdded'));
    // The composer owns submission locking, attachment cleanup and error handling.
    // Saving succeeds independently of a subsequent refresh of wheel candidates.
    void load();
  };
  const open = (focus = false) => void run(async () => {
    const current = resultRef.current; if (!current) return;
    if (!await revisit.get(current.candidate.note.key)) throw new Error(tr('spin.unavailable'));
    await repo.open(current.id);
    if (focus) {
      setMessage('focus'); setConfirming(true);
      if (!reduced) await new Promise(resolve => setTimeout(resolve, SPIN_CONFIRM_MS));
      setConfirming(false);
      router.push({ pathname: '/focus', params: { note: current.candidate.note.key, spin: String(current.id), minutes: String(current.challenge ? 5 : current.candidate.minutes ?? preferences.minutes ?? 25) } });
    } else {
      const { key } = current.candidate.note;
      router.push(key.startsWith('card:') ? await cardNoteRoute(createBoardRepository(db), key.slice(5)) : spinSourceRoute(key));
    }
  });
  const skip = () => void run(async () => {
    if (!result) return;
    await repo.skip(result.id); assignResult(null); setMessage('skipped'); await load();
  });
  const complete = () => void run(async () => {
    if (!result) return;
    const current = result;
    const plan = await revisit.completionPlan(current.candidate.note.key);
    if (plan.count <= 0) throw new Error(tr('spin.changed'));
    confirm({ title: tr('revisit.completeChecklist'), message: tr('revisit.markAllValueRemainingItemsInValueComplete', { value1: plan.count, value2: current.candidate.note.title }), confirmText: tr('revisit.completeValueItems', { value1: plan.count }), onConfirm: async () => {
      try { await repo.complete(current.id, plan); assignResult({ ...current, done: true }); setMessage('completed'); celebrate(); await load(); }
      catch (cause) { fail(cause); throw cause; }
    } });
  });
  const confirmExercise = () => void run(async () => {
    if (!result) return;
    await repo.confirmExercise(result.id); assignResult({ ...result, done: true }); setMessage('completed'); celebrate(); await load();
  });
  const addToBoard = () => void run(async () => {
    if (!result || !result.candidate.note.key.startsWith('thought:')) return;
    const current = result;
    const boards = createBoardRepository(db);
    const choices = await boards.listActive();
    if (!choices.length) { setError(tr('spin.noBoards')); return; }
    actionSheet({ title: tr('spin.addBoard'), options: choices.map(board => ({ label: board.name, onPress: () => void run(async () => {
      if (!await revisit.get(current.candidate.note.key)) throw new Error(tr('spin.unavailable'));
      await repo.open(current.id);
      const added = await boards.organizeMessages(board.id, [current.candidate.note.key.slice(8)]);
      if (added.cardIds[0]) { await load(); router.push({ pathname: '/card/[id]', params: { id: added.cardIds[0] } }); }
    }) })) });
  });
  const setMetadata = (minutes: number | null, priority: number, energy: SpinEnergy | null) => void run(async () => {
    if (!result) return;
    await repo.setMetadata({ note_key: result.candidate.note.key, duration_minutes: minutes, priority, energy });
    assignResult({ ...result, candidate: { ...result.candidate, minutes: result.candidate.kind === 'task' ? minutes : 5, priority, metadata: { note_key: result.candidate.note.key, duration_minutes: minutes, priority, energy } } }); await load();
  });
  const moreResultActions = () => {
    if (!result) return;
    const { candidate, done } = result;
    actionSheet({ title: tr('attachments.moreActions'), options: [
      ...(!done && candidate.kind === 'task' && candidate.note.total > candidate.note.completed ? [{ label: tr('spin.complete'), onPress: complete }] : []),
      ...(!done && candidate.kind !== 'task' ? [{ label: tr('spin.confirmExercise'), onPress: confirmExercise }] : []),
      ...(!done && candidate.note.key.startsWith('thought:') && candidate.kind !== 'task' ? [{ label: tr('spin.addBoard'), onPress: addToBoard }] : []),
      ...(!done ? [{ label: tr('spin.skip'), onPress: skip }] : []),
      ...(candidate.related ? [{ label: tr('focus.related'), onPress: () => router.push({ pathname: '/revisit', params: { note: candidate.note.key } }) }] : []),
      { label: tr('spin.metadata'), onPress: () => setDetails(true) },
      { label: tr('spin.adjust'), onPress: () => { assignResult(null); setMessage('before'); void load(); } },
    ] });
  };
  const empty = !loading && !eligible.length && !hasResult && !spinning;
  const [heroTitle, heroBody] = HERO_COPY[empty ? 'empty' : loading ? 'before' : message] ?? WELCOME_COPY;
  // While the wheel's notes load, it shows the last wheel this session (or the
  // default categories) rather than a blank paper.
  const displayedCategories = hasResult || spinning ? frozenCategories : loading ? lastWheel : categories;
  useEffect(() => { if (!loading && !hasResult && !spinning) lastWheel = categories; });
  const note = result?.candidate.note;
  const landed = spinning ? null : result ? displayedCategories.indexOf(result.candidate.category) : suggestion ? displayedCategories.indexOf('suggestions') : null;
  const labelsKey = displayedCategories.map(c => tr(`spin.category.${c}`)).join('\n');
  const wheelLabels = useMemo(() => labelsKey ? labelsKey.split('\n') : [], [labelsKey]);
  const papersKey = displayedCategories.map(c => SPIN_CATEGORY_PAPER[c]).join(',');
  const wheelPapers = useMemo(() => papersKey ? papersKey.split(',') : [], [papersKey]);
  const spinRef = useRef(spin);
  useLayoutEffect(() => { spinRef.current = spin; });
  const spinFromWheel = useCallback(() => spinRef.current(), []);
  const timeLabel = preferences.minutes === null ? tr('spin.surprise') : tr('focus.minutes', { minutes: preferences.minutes });
  const chooseTime = () => actionSheet({ title: tr('spin.time'), options: ([5, 15, 30, 60, null] as const).map(minutes => ({
    label: minutes === null ? tr('spin.surprise') : tr('focus.minutes', { minutes }),
    icon: preferences.minutes === minutes ? 'checkmark-circle-outline' : 'time-outline',
    onPress: () => updatePreferences({ ...preferences, minutes }),
  })) });
  const chooseEnergy = () => actionSheet({ title: tr('spin.energy'), options: (['low', 'medium', 'high'] as const).map(energy => ({
    label: tr(`spin.energyHelp.${energy}`),
    icon: preferences.energy === energy ? 'checkmark-circle-outline' : 'flash-outline',
    onPress: () => updatePreferences({ ...preferences, energy }),
  })) });
  const toggleChallenge = () => { const value = !challengeRef.current; challengeRef.current = value; setChallenge(value); setLoading(true); void load(); };
  const resultKey = result ? `result:${result.id}` : suggestion ? 'suggestion' : null;
  const fresh = resultKey !== null && resultKey === revealKey;
  const adjust = () => { assignResult(null); setSuggestion(null); setMessage('before'); void load(); };
  const summary = note ? spinSummary(note) : '';
  const space = result ? resolveSpaceId(result.candidate.space) : null;
  const resultCard = note && result ? <SpinResultCard key={resultKey} paper={SPIN_CATEGORY_PAPER[result.candidate.category]} title={note.title} animate={fresh} confirming={confirming}
    action={<IconButton label={tr('attachments.moreActions')} disabled={busy} onPress={moreResultActions}><Icon name="ellipsis-horizontal" size={21} color={PAPER_INK} /></IconButton>}>
    <SpinFact icon={note.boardId ? 'albums-outline' : 'document-text-outline'}>{tr(note.boardId ? 'spin.source.card' : 'spin.source.note')} · {note.boardName ?? tr('index.unorganized')}{space ? ` · ${SPACES[space].name}` : ''}</SpinFact>
    <View style={[styles.facts,rowStyle]}>
      <SpinFact icon="time-outline">{result.candidate.minutes === null ? tr('spin.unestimated') : tr('focus.minutes', { minutes: result.candidate.minutes })}</SpinFact>
      <SpinFact icon="flag-outline">{tr(`spin.priority.${result.candidate.priority}`)}</SpinFact>
      <SpinFact icon="pie-chart-outline">{tr(`spin.category.${result.candidate.category}`)}</SpinFact>
      {note.total > 0 ? <SpinFact icon="checkbox-outline">{tr('spin.checklist', { done: note.completed, total: note.total })}</SpinFact> : null}
    </View>
    {result.candidate.plannedAt ? <AppText style={styles.resultCaption}>{tr('spin.planned', { date: localizedDate(result.candidate.plannedAt, { dateStyle: 'medium' }) })}</AppText> : null}
    {note.reminderAt ? <AppText style={styles.resultCaption}>{tr('spin.reminder', { date: localizedDate(note.reminderAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</AppText> : null}
    {summary ? <AppText numberOfLines={3} style={styles.resultBody}>{summary}</AppText> : null}
    <View style={styles.resultReason}>
      <AppText style={styles.resultBody}>{tr(`spin.reason.${result.candidate.reason}`)}</AppText>
      {result.candidate.kind !== 'task' ? <AppText weight="600" style={styles.resultBody}>{tr(result.candidate.category === 'unorganized' ? 'spin.prompt.unorganized' : result.candidate.kind === 'creative' ? result.candidate.related ? 'spin.prompt.connect' : 'spin.prompt.write' : 'spin.prompt.review')}</AppText> : null}
    </View>
    {result.done ? <View style={[styles.done,rowStyle]}><Icon name="checkmark-circle" size={20} color={PAPER_INK} /><AppText accessibilityLiveRegion="polite" style={[handBold, styles.doneText]}>{tr('spin.mascot.completed')}</AppText></View> : null}
  </SpinResultCard> : suggestion ? <SpinResultCard key={resultKey} paper={SPIN_CATEGORY_PAPER.suggestions} title={tr('spin.newNote')} animate={fresh}>
    <SpinFact icon="pie-chart-outline">{tr('spin.category.suggestions')}</SpinFact>
    <AppText style={styles.resultBody}>{tr(suggestion === 'saved' ? 'calendar.noteAdded' : 'spin.newNotePrompt')}</AppText>
  </SpinResultCard> : null;
  const startFocus = () => open(true);
  const openOriginal = () => open();
  const skipSuggestion = () => { setSuggestionSkippedAt(Date.now()); setSuggestion(null); setMessage('skipped'); void load(); };
  // Actions stay under the thumb, unless large text needs that room for reading.
  const actionProps = { animate: fresh && accessibleLayout, stacked: accessibleLayout };
  const afterwards = <SpinActions {...actionProps} primary={{ label: tr('spin.again'), disabled: busy, onPress: spin }} secondary={[{ label: tr('spin.adjust'), disabled: busy, onPress: adjust }]} />;
  const actions = result ? result.done ? afterwards
    : <SpinActions {...actionProps} primary={{ label: tr('focus.start'), disabled: busy, onPress: startFocus }} secondary={[{ label: tr('spin.open'), disabled: busy, onPress: openOriginal }, { label: tr('spin.again'), disabled: busy, onPress: spin }]} />
    : suggestion === 'saved' ? afterwards
      : suggestion ? <SpinActions {...actionProps} primary={{ label: tr('id.addNote'), disabled: busy, onPress: () => setAddNoteOpen(true) }} secondary={[{ label: tr('spin.again'), disabled: busy, onPress: spin }, { label: tr('spin.skip'), disabled: busy, onPress: skipSuggestion }]} /> : null;
  const tabs = <View pointerEvents={busy ? 'none' : 'auto'} accessibilityElementsHidden={spinning} importantForAccessibility={spinning ? 'no-hide-descendants' : 'auto'} style={[styles.tabs,rowStyle]}>
    <PaperTab paper={SPIN_CATEGORY_PAPER.unfinished} tilt={-2} icon="time-outline" label={timeLabel} accessibilityRole="button" accessibilityLabel={`${tr('spin.time')}: ${timeLabel}`} disabled={busy} onPress={chooseTime} />
    <PaperTab paper={SPIN_CATEGORY_PAPER.revisit} tilt={1.5} icon="flash-outline" label={tr(`spin.energyShort.${preferences.energy}`)} accessibilityRole="button" accessibilityLabel={`${tr('spin.energy')}: ${tr(`spin.energyHelp.${preferences.energy}`)}`} disabled={busy} onPress={chooseEnergy} />
    <PaperTab paper={challenge ? SPIN_CATEGORY_PAPER.tasks : SPIN_CATEGORY_PAPER.boards} tilt={-1} icon={challenge ? 'checkmark-circle' : 'timer-outline'} label={tr('spin.challenge')} accessibilityRole="switch" accessibilityState={{ checked: challenge, disabled: busy }} disabled={busy} onPress={toggleChallenge} />
  </View>;
  return <Screen edges={['top','left','right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader actionWidth={100} title={tr('spin.title')} subtitle={tr('spin.subtitle')} leading={<NavigationMenuButton />} trailing={<View style={[styles.headerActions,rowStyle]}>{modeAction}<IconButton label={tr('spin.preferences')} onPress={() => setAdvanced(true)}><HeaderIcon name="options-outline" size={22} /></IconButton></View>} />
    <SpinStage scrollRef={scroll} title={tr(heroTitle)} body={tr(heroBody)} moment={hasResult ? 'result' : empty ? 'empty' : 'idle'} spinning={spinning} landing={landing.count} repeat={landing.repeat} celebrate={preferences.celebrations} entrance={entrance} footer={!accessibleLayout ? actions : null} footerFresh={fresh}>
      {modeNotice}
      {error ? <AppText accessibilityRole="alert" weight="600" style={[styles.deskText,{ color: desk.danger }]}>{error}</AppText> : null}
      {overdue.length ? <SpinOverdueChip count={overdue.length} disabled={busy} onPress={() => actionSheet({ title: tr('spin.overdueShort', { count: overdue.length }), options: overdue.map(n => ({ label: n.title, onPress: () => void run(async () => { if (!await revisit.get(n.key)) throw new Error(tr('spin.unavailable')); router.push(spinSourceRoute(n.key)); }) })) })} /> : null}
      <SpinWorkspace size={wheelLayout.size} compactSize={wheelLayout.compactSize} showResult={hasResult} fresh={fresh} entrance={entrance} waiting={spinning}
        wheel={empty ? <SpinEmpty title={tr('spin.say.empty')} help={tr('spin.emptyHelp')} primary={{ label: tr('id.addNote'), onPress: () => setAddNoteOpen(true) }} secondary={{ label: tr('spin.adjust'), onPress: () => setAdvanced(true) }} />
          : <SpinWheel size={wheelLayout.size} rotation={rotation} labels={wheelLabels} papers={wheelPapers} spinning={spinning} highlight={landed !== null && landed >= 0 ? landed : null} onSpin={spinFromWheel} spinDisabled={busy || loading || !eligible.length} />}
        controls={tabs}
        result={<View style={styles.result}>{resultCard}{accessibleLayout ? actions : null}</View>} />
      {celebration > 0 && hasResult && preferences.celebrations && !reduced ? <SpinCelebration key={celebration} /> : null}
    </SpinStage>
    <AddNoteSheet visible={addNoteOpen} onClose={() => setAddNoteOpen(false)} onSubmit={saveSuggestedNote} />
    <FormSheet visible={details && !!result} onRequestClose={() => setDetails(false)} closeAccessibilityLabel={tr('attachments.close')} maxHeightPercent={85} accessibilityViewIsModal header={<View style={[styles.sheetHeader,rowStyle]}><AppText weight="700" style={styles.flex}>{tr('spin.metadata')}</AppText><IconButton label={tr('attachments.close')} onPress={() => setDetails(false)}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton></View>}>
      {result ? <>
        <View style={[focusStyles.panel,styles.sheetControls]} pointerEvents={busy ? 'none' : 'auto'}>
          <AppText>{tr('spin.estimatesHelp')}</AppText><View style={[focusStyles.row,rowStyle]}>{[null,5,15,30,60].map(minutes => { const label = minutes === null ? tr('spin.unestimated') : tr('focus.minutes', { minutes }); return <Chip key={minutes ?? 'none'} label={label} accessibilityLabel={label} selected={(result.candidate.metadata?.duration_minutes ?? null) === minutes} onPress={() => setMetadata(minutes,result.candidate.priority,result.candidate.metadata?.energy ?? null)} />; })}</View>
          <View style={[focusStyles.row,rowStyle]}>{[0,1,2].map(priority => <Chip key={priority} label={tr(`spin.priority.${priority}`)} accessibilityLabel={tr(`spin.priority.${priority}`)} selected={result.candidate.priority === priority} onPress={() => setMetadata(result.candidate.metadata?.duration_minutes ?? null,priority,result.candidate.metadata?.energy ?? null)} />)}</View>
          <AppText>{tr('spin.requiredEnergy')}</AppText><View style={[focusStyles.row,rowStyle]}>{(['low','medium','high'] as const).map(energy => <Chip key={energy} label={tr(`spin.energyShort.${energy}`)} accessibilityLabel={tr(`spin.energyHelp.${energy}`)} selected={result.candidate.metadata?.energy === energy} onPress={() => setMetadata(result.candidate.metadata?.duration_minutes ?? null,result.candidate.priority,result.candidate.metadata?.energy === energy ? null : energy)} />)}</View>
        </View>
      </> : null}
    </FormSheet>
    <FormSheet visible={advanced} onRequestClose={() => setAdvanced(false)} closeAccessibilityLabel={tr('chat.cancel')} maxHeightPercent={85} accessibilityViewIsModal header={<View style={[styles.sheetHeader,rowStyle]}><AppText weight="700" style={styles.flex}>{tr('spin.preferences')}</AppText><IconButton label={tr('chat.cancel')} onPress={() => setAdvanced(false)}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton></View>}>
          <View style={focusStyles.panel}>
            <AppText weight="600">{tr('spin.categories')}</AppText>
            <View style={[focusStyles.row,rowStyle]}>{availableCategories.map(category => <Chip key={category} label={tr(`spin.category.${category}`)} accessibilityLabel={tr(`spin.category.${category}`)} selected={preferences.categories.includes(category)} onPress={() => updatePreferences({ ...preferences, categories: preferences.categories.includes(category) ? preferences.categories.filter(c => c !== category) : [...preferences.categories, category] })} />)}</View>
            <View style={[styles.toggle,rowStyle]}><AppText style={styles.flex}>{tr('spin.category.suggestions')}</AppText><Switch accessibilityLabel={tr('spin.category.suggestions')} value={preferences.includeSuggestions} disabled={busy} onValueChange={value => updatePreferences({ ...preferences, includeSuggestions: value })} /></View>
            <AppText style={{ color: tokens.textSecondary }}>{tr('spin.estimatesHelp')}</AppText>
            {(['includeUnestimated','sound','rewards','celebrations'] as const).map(key => <View key={key} style={[styles.toggle,rowStyle]}><AppText style={styles.flex}>{tr(`spin.setting.${key}`)}</AppText><Switch accessibilityLabel={tr(`spin.setting.${key}`)} value={preferences[key]} onValueChange={value => updatePreferences({ ...preferences, [key]: value })} /></View>)}
            {preferences.rewards ? <><AppText weight="600">{tr('spin.achievements')}</AppText>{achievements.map(id => <View key={id}><AppText>{tr(`spin.achievement.${id}`)}</AppText><AppText style={{ color: tokens.textSecondary }}>{tr(`spin.achievementHelp.${id}`)}</AppText></View>)}</> : null}
          </View>
    </FormSheet>
  </Screen>;
}
const styles = StyleSheet.create({
  headerActions: { alignItems: 'center', flexWrap: 'nowrap', gap: 8 },
  deskText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  tabs: { flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  toggle: { alignItems: 'center', gap: 12, minHeight: 44 },
  flex: { flex: 1 },
  sheetControls: { gap: 8 },
  result: { gap: 10 },
  facts: { flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  resultCaption: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 18 },
  resultReason: { gap: 6, marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(43,38,32,0.25)' },
  resultBody: { color: PAPER_INK, fontSize: 14, lineHeight: 20 },
  done: { alignItems: 'center', gap: 6 },
  doneText: { color: PAPER_INK, fontSize: 20, lineHeight: 26 },
  sheetHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
});
