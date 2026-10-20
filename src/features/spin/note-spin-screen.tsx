import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { AppHeader, Chip, EmptyState, HeaderIcon, Icon, IconButton, PressableSurface, Screen, Surface } from '@/components/ui/primitives';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { useDirection, useLocale } from '@/localization/provider';
import { localizedDate, tr } from '@/localization/runtime';
import { createSpinRepository } from '@/db/spin-repository';
import { createRevisitRepository } from '@/db/revisit-repository';
import { AddNoteSheet, type NoteSubmission } from '@/components/boards/add-note-sheet';
import { createMessageRepository, createBoardRepository } from '@/db/repositories';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { SPIN_CATEGORIES, SPIN_WHEEL_CATEGORIES, SPIN_DEFAULTS, spinOptions, spinOptionKey, selectSpin, spinLanding, spinSourceRoute, type SpinCandidate, type SpinPreferences, type SpinEnergy, type SpinWheelCategory } from '@/services/spin-engine';
import type { RevisitNote } from '@/services/revisit-engine';
import { FocusAction, FocusCompanion, FocusReveal, FocusText as AppText, focusStyles } from '@/features/focus/focus-ui';
import { SpinWheel } from './spin-wheel';
import { SpinCelebration } from './spin-celebration';
import { FormSheet } from '@/components/ui/form-sheet';
import { SPACES, resolveSpaceId } from '@/constants/spaces';

type Result = { candidate: SpinCandidate; id: number; done: boolean; challenge?: boolean };
export function NoteSpinScreen({ modeAction, modeNotice, onBusyChange }: { modeAction: ReactNode; modeNotice: ReactNode; onBusyChange: (busy: boolean) => void }) {
  'use no memo';
  useLocale();
  const db = useSQLiteContext();
  const repo = useMemo(() => createSpinRepository(db), [db]);
  const revisit = useMemo(() => createRevisitRepository(db), [db]);
  const { tokens, styleTokens } = useTheme();
  const { rowStyle } = useDirection();
  const { confirm, actionSheet } = useAppDialog();
  const { width, height, fontScale } = useWindowDimensions();
  const [wheelBounds, setWheelBounds] = useState({ width: 0, height: 0 });
  const [legendHeight, setLegendHeight] = useState(0);
  const landscape = width > height;
  const accessibleLayout = fontScale > 1.3;
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
  const [mascotOffset] = useState(() => new Animated.Value(0));
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
      const data = await repo.candidates({ ...preferencesRef.current, categories: [...SPIN_CATEGORIES] }, challengeRef.current);
      const earned = await repo.achievements();
      const previous = resultRef.current;
      const record = previous ? await repo.history(previous.id) : null;
      const fresh = record ? await revisit.get(record.note_key) : null;
      if (!mounted.current || request !== generation.current) return;
      setCandidates(data.candidates); setOverdue(data.overdue); setAchievements(earned.map(a => a.id));
      if (previous && resultRef.current?.id === previous.id) {
        if (!fresh || !record) { assignResult(null); setMessage('empty'); setError(tr('spin.unavailable')); }
        else assignResult({ ...previous, candidate: { ...previous.candidate, note: fresh }, done: record.completed_at !== null });
      }
      setLoading(false);
    } catch (cause) { if (request === generation.current) { fail(cause); setLoading(false); } }
  }, [assignResult, fail, repo, revisit]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; animation.current?.stop(); rotation.removeAllListeners(); }; }, [rotation]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void repo.preferences().then(async value => {
      if (!focused.current) return;
      preferencesRef.current = value; setPreferences(value);
      if (!restored.current) {
        const latest = await repo.latest();
        if (!focused.current) return;
        restored.current = true; assignResult(latest);
        if (latest) previousSelection.current = spinOptionKey(latest.candidate);
        if (latest) {
          setMessage(latest.done ? 'completed' : 'result');
          setFrozenCategories([latest.candidate.category]); rotation.setValue(0); angle.current = 0;
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

  useEffect(() => {
    if (reduced || (!spinning && !(message === 'completed' && preferences.celebrations))) { mascotOffset.setValue(0); return; }
    const bounce = Animated.sequence([
      Animated.timing(mascotOffset, { toValue: -3, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(mascotOffset, { toValue: 0, duration: 500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]);
    const motion = spinning ? Animated.loop(bounce) : bounce;
    motion.start();
    return () => { motion.stop(); mascotOffset.setValue(0); };
  }, [mascotOffset, message, preferences.celebrations, reduced, spinning]);

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
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const updatePreferences = (value: SpinPreferences) => void run(async () => {
    setCelebration(0);
    await repo.setPreferences(value);
    preferencesRef.current = value; setPreferences(value); setLoading(true); await load();
  });
  const eligible = spinOptions(candidates.filter(c => preferences.categories.includes(c.category)), preferences, suggestionSkippedAt);
  const categories = SPIN_WHEEL_CATEGORIES.filter(c => eligible.some(item => item.category === c));
  const availableCategories = SPIN_CATEGORIES.filter(c => candidates.some(item => item.category === c));
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
    previousSelection.current = spinOptionKey(chosen);
    setSuggestion(null); assignResult(null); setDetails(false); setSpinning(true); setMessage('spinning');
    const target = spinLanding(angle.current, wheelCategories.indexOf(chosen.category), wheelCategories.length);
    if (!reduced) {
      let lastBoundary = -1; let lastTick = 0;
      const listener = rotation.addListener(({ value }) => {
        const boundary = Math.floor((value + 180 / wheelCategories.length) / (360 / wheelCategories.length));
        const now = Date.now();
        if (boundary !== lastBoundary && now - lastTick > 90 && AppState.currentState === 'active') { lastBoundary = boundary; lastTick = now; void Haptics.selectionAsync().catch(() => undefined); }
      });
      await new Promise<void>(resolve => {
        animation.current = Animated.timing(rotation, { toValue: target, duration: 3400, easing: Easing.bezier(0.4,0,0.12,1), useNativeDriver: true });
        animation.current.start(() => resolve());
      });
      rotation.removeListener(listener);
    }
    angle.current = target % 360; rotation.setValue(angle.current); animation.current = null;
    if (!mounted.current) return;
    if (chosen.kind === 'suggestion') setSuggestion(chosen.action);
    else if (id !== null) assignResult({ candidate: chosen, id, done: false, challenge: challengeRef.current });
    setSpinning(false); setMessage('result'); celebrate();
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
    setSuggestion('saved'); setMessage('completed'); celebrate();
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
      setMessage('focus');
      router.push({ pathname: '/focus', params: { note: current.candidate.note.key, spin: String(current.id), minutes: String(current.challenge ? 5 : current.candidate.minutes ?? preferences.minutes ?? 25) } });
    } else {
      router.push(spinSourceRoute(current.candidate.note.key));
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
  const mascotMessage = loading ? 'before' : !eligible.length && !hasResult && message === 'welcome' ? 'empty' : message;
  const displayedCategories = hasResult || spinning ? frozenCategories : categories;
  const note = result?.candidate.note;
  const Reveal = preferences.celebrations && !reduced ? FocusReveal : View;
  return <Screen edges={['top','left','right','bottom']}>
    <AppHeader actionWidth={88} title={tr('spin.title')} subtitle={tr('spin.subtitle')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<View style={[styles.headerActions,rowStyle]}>{modeAction}<IconButton label={tr('spin.preferences')} onPress={() => setAdvanced(true)}><HeaderIcon name="options-outline" size={22} /></IconButton></View>} />
    <View style={[styles.viewport, landscape && styles.wideViewport]}>
      {modeNotice}
      <Animated.View style={{ transform: [{ translateY: mascotOffset }] }}><FocusCompanion small message={tr(`spin.mascot.${mascotMessage}`)} /></Animated.View>
      {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
      {overdue.length ? <FocusAction quiet disabled={busy} onPress={() => actionSheet({ title: tr('spin.overdue', { count: overdue.length }), options: overdue.map(n => ({ label: n.title, onPress: () => void run(async () => { if (!await revisit.get(n.key)) throw new Error(tr('spin.unavailable')); router.push(spinSourceRoute(n.key)); }) })) })}>{tr('spin.overdue', { count: overdue.length })} · {tr('spin.addressOverdue')}</FocusAction> : null}
      <View style={[styles.workspace, landscape && !hasResult && styles.landscape]}>
        {!hasResult ? <View style={[styles.wheelColumn, accessibleLayout && styles.accessibleWheel]} onLayout={({ nativeEvent }) => { const { width: nextWidth, height: nextHeight } = nativeEvent.layout; setWheelBounds(previous => previous.width === nextWidth && previous.height === nextHeight ? previous : { width: nextWidth, height: nextHeight }); }}>
          <View style={[styles.wheelSpace, !loading && !eligible.length && !hasResult && styles.emptySpace]}>
            {!loading && !eligible.length && !hasResult ? <ScrollView style={styles.flex} contentContainerStyle={styles.empty}><EmptyState title={tr('spin.mascot.empty')} description={tr('spin.emptyHelp')} /></ScrollView> : wheelBounds.height > 0 ? <SpinWheel size={Math.max(48,Math.min(340,wheelBounds.width-8,wheelBounds.height-legendHeight-12))} rotation={rotation} categories={displayedCategories} spinning={spinning} /> : null}
          </View>
          {!hasResult ? <View onLayout={({ nativeEvent }) => setLegendHeight(nativeEvent.layout.height)} style={[styles.legendRow, rowStyle]} accessibilityLabel={tr('spin.categories')}>
            {displayedCategories.map((category,index) => <AppText key={category} style={styles.legend}>{index+1} · {tr(`spin.category.${category}`)}</AppText>)}
          </View> : null}
        </View> : null}
      {!hasResult ? <Surface fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} shadow={false} edge={false} style={[styles.decisionPanel,(landscape || accessibleLayout) && styles.flex]}>
        <ScrollView style={[styles.controlsScroll, !landscape && !accessibleLayout && styles.fixedControls]} contentContainerStyle={styles.controls} showsVerticalScrollIndicator={accessibleLayout || landscape}>
          <View pointerEvents={busy ? 'none' : 'auto'} accessibilityElementsHidden={spinning} importantForAccessibility={spinning ? 'no-hide-descendants' : 'auto'} style={styles.controls}>
            <View style={styles.choiceGroup}>
              <AppText weight="700" style={styles.controlLabel}>{tr('spin.time')}</AppText>
              <Surface fill={tokens.surfaceElevated} radius={styleTokens.button.radius} outline={false} edge={false} shadow={false} style={[styles.choiceRow,rowStyle]}>
                {[5,15,30,60,null].map(minutes => { const label = minutes === null ? tr('spin.surprise') : tr('focus.minutes', { minutes }); return <SpinChoice key={minutes ?? 'any'} label={label} selected={preferences.minutes === minutes} disabled={busy} wide={minutes === null} onPress={() => updatePreferences({ ...preferences, minutes })} />; })}
              </Surface>
            </View>
            <View style={styles.choiceGroup}>
              <AppText weight="700" style={styles.controlLabel}>{tr('spin.energy')}</AppText>
              <Surface fill={tokens.surfaceElevated} radius={styleTokens.button.radius} outline={false} edge={false} shadow={false} style={[styles.choiceRow,rowStyle]}>
                {(['low','medium','high'] as const).map(energy => <SpinChoice key={energy} label={tr(`spin.energyShort.${energy}`)} accessibilityLabel={tr(`spin.energyHelp.${energy}`)} selected={preferences.energy === energy} disabled={busy} onPress={() => updatePreferences({ ...preferences, energy })} />)}
              </Surface>
            </View>
            <View style={[styles.challengeRow,rowStyle,{ borderTopColor: tokens.borderSubtle }]}>
              <Icon name="timer-outline" size={18} color={tokens.textSecondary} />
              <AppText style={[styles.flex,styles.challengeLabel]}>{tr('spin.challenge')}</AppText>
              <Switch accessibilityLabel={tr('spin.challenge')} value={challenge} disabled={busy} onValueChange={value => { challengeRef.current = value; setChallenge(value); setLoading(true); void load(); }} />
            </View>
          </View>
        </ScrollView>
        <FocusAction primary disabled={busy || loading || !eligible.length} onPress={spin}>{tr(spinning ? 'spin.spinning' : 'spin.spin')}</FocusAction>
      </Surface> : note ? <Surface fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} shadow={false} edge={false} style={styles.resultPanel}>
        <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
          <Reveal>
            <View style={styles.resultSummary}>
              <View style={[styles.resultHeading,rowStyle]}>
                <AppText weight="700" style={[styles.resultCategory,{ color: tokens.accentStrong }]}>{tr(`spin.category.${result.candidate.category}`)}</AppText>
                <IconButton label={tr('attachments.moreActions')} disabled={busy} onPress={moreResultActions}><Icon name="ellipsis-horizontal" size={21} color={tokens.textSecondary} /></IconButton>
              </View>
              <AppText accessibilityRole="header" weight="700" style={styles.resultTitle}>{note.title}</AppText>
              <View style={[styles.resultSource,rowStyle]}>
                <Icon name={note.boardId ? 'albums-outline' : 'document-text-outline'} size={14} color={tokens.textSecondary} />
                <AppText style={[styles.resultCaption,{ color: tokens.textSecondary }]}>{tr(note.boardId ? 'spin.source.card' : 'spin.source.note')} · {note.boardName ?? tr('index.unorganized')}{resolveSpaceId(result.candidate.space) ? ` · ${SPACES[resolveSpaceId(result.candidate.space)!].name}` : ''}</AppText>
              </View>
              <View style={[styles.resultMetadata,rowStyle,{ borderTopColor: tokens.borderSubtle }]}>
                <View style={[styles.resultSource,rowStyle]}><Icon name="time-outline" size={14} color={tokens.textSecondary} /><AppText style={styles.resultCaption}>{result.candidate.minutes === null ? tr('spin.unestimated') : tr('focus.minutes', { minutes: result.candidate.minutes })}</AppText></View>
                <View style={[styles.resultSource,rowStyle]}><Icon name="flag-outline" size={14} color={tokens.textSecondary} /><AppText style={styles.resultCaption}>{tr(`spin.priority.${result.candidate.priority}`)}</AppText></View>
              </View>
              {result.candidate.plannedAt ? <AppText style={[styles.resultCaption,{ color: tokens.textSecondary }]}>{tr('spin.planned', { date: localizedDate(result.candidate.plannedAt, { dateStyle: 'medium' }) })}</AppText> : null}
              {note.reminderAt ? <AppText style={[styles.resultCaption,{ color: tokens.textSecondary }]}>{tr('spin.reminder', { date: localizedDate(note.reminderAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</AppText> : null}
              <Surface fill={tokens.surfaceElevated} radius={styleTokens.button.radius} outline={false} edge={false} shadow={false} style={styles.resultReason}>
                <AppText style={[styles.resultBody,{ color: tokens.textSecondary }]}>{tr(`spin.reason.${result.candidate.reason}`)}</AppText>
                {result.candidate.kind !== 'task' ? <AppText style={styles.resultBody}>{tr(result.candidate.category === 'unorganized' ? 'spin.prompt.unorganized' : result.candidate.kind === 'creative' ? result.candidate.related ? 'spin.prompt.connect' : 'spin.prompt.write' : 'spin.prompt.review')}</AppText> : null}
              </Surface>
              {result.done ? <View style={[styles.resultSource,rowStyle]}><Icon name="checkmark-circle-outline" size={18} color={tokens.accentStrong} /><AppText accessibilityLiveRegion="polite" weight="700" style={[styles.resultBody,{ color: tokens.accentStrong }]}>{tr('spin.mascot.completed')}</AppText></View> : null}
            </View>
          </Reveal>
        </ScrollView>
        <View style={[styles.resultActions,{ borderTopColor: tokens.borderSubtle }]}>
          {!result.done ? <>
            <FocusAction primary disabled={busy} onPress={() => open(true)}>{tr('focus.start')}</FocusAction>
            <View style={[styles.resultActionRow,rowStyle]}>
              <View style={styles.flex}><FocusAction disabled={busy} onPress={() => open()}>{tr('spin.open')}</FocusAction></View>
              <View style={styles.flex}><FocusAction disabled={busy} onPress={spin}>{tr('spin.again')}</FocusAction></View>
            </View>
          </> : <>
            <FocusAction primary disabled={busy} onPress={spin}>{tr('spin.again')}</FocusAction>
            <FocusAction quiet disabled={busy} onPress={() => { assignResult(null); setMessage('before'); void load(); }}>{tr('spin.adjust')}</FocusAction>
          </>}
        </View>
      </Surface> : suggestion ? <Surface fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} shadow={false} edge={false} style={styles.resultPanel}>
        <ScrollView style={styles.resultScroll} contentContainerStyle={styles.resultContent}>
          <View style={styles.resultSummary}>
            <AppText weight="700" style={[styles.resultCategory,{ color: tokens.accentStrong }]}>{tr('spin.category.suggestions')}</AppText>
            <AppText accessibilityRole="header" weight="700" style={styles.resultTitle}>{tr('spin.newNote')}</AppText>
            <AppText style={[styles.resultBody,{ color: tokens.textSecondary }]}>{tr(suggestion === 'saved' ? 'calendar.noteAdded' : 'spin.newNotePrompt')}</AppText>
          </View>
        </ScrollView>
        <View style={[styles.resultActions,{ borderTopColor: tokens.borderSubtle }]}>
          {suggestion !== 'saved' ? <FocusAction primary disabled={busy} onPress={() => setAddNoteOpen(true)}>{tr('id.addNote')}</FocusAction> : null}
          <FocusAction primary={suggestion === 'saved'} disabled={busy} onPress={spin}>{tr('spin.again')}</FocusAction>
          <FocusAction quiet disabled={busy} onPress={() => { if (suggestion !== 'saved') setSuggestionSkippedAt(Date.now()); setSuggestion(null); setMessage(suggestion === 'saved' ? 'before' : 'skipped'); void load(); }}>{tr(suggestion === 'saved' ? 'spin.adjust' : 'spin.skip')}</FocusAction>
        </View>
      </Surface> : null}
      </View>
      {celebration > 0 && hasResult && preferences.celebrations && !reduced ? <SpinCelebration key={celebration} /> : null}
    </View>
    <AddNoteSheet visible={addNoteOpen} onClose={() => setAddNoteOpen(false)} onSubmit={saveSuggestedNote} />
    <FormSheet visible={details && !!result} onRequestClose={() => setDetails(false)} closeAccessibilityLabel={tr('attachments.close')} maxHeightPercent={85} accessibilityViewIsModal header={<View style={[styles.sheetHeader,rowStyle]}><AppText weight="700" style={styles.flex}>{tr('spin.metadata')}</AppText><IconButton label={tr('attachments.close')} onPress={() => setDetails(false)}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton></View>}>
      {result ? <>
        <View style={[focusStyles.panel,styles.controls]} pointerEvents={busy ? 'none' : 'auto'}>
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
function SpinChoice({ label, accessibilityLabel, selected, disabled, wide = false, onPress }: { label: string; accessibilityLabel?: string; selected: boolean; disabled: boolean; wide?: boolean; onPress: () => void }) {
  const { tokens, styleTokens } = useTheme();
  return <PressableSurface accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    fill={selected ? tokens.accentSoft : undefined} border={selected ? tokens.accentBorder : undefined} radius={styleTokens.button.radius} edge={false} outline={false} shadow={false}
    style={[styles.choice,wide && styles.wideChoice]}>
    <AppText weight="600" style={[styles.choiceLabel,{ color: selected ? tokens.accentStrong : tokens.textSecondary }]}>{label}</AppText>
  </PressableSurface>;
}
const styles = StyleSheet.create({
  headerActions: { alignItems: 'center', flexWrap: 'nowrap' },
  viewport: { flex: 1, minHeight: 0, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 6 },
  wideViewport: { maxWidth: 980 },
  workspace: { flex: 1, minHeight: 0, gap: 8 },
  landscape: { flexDirection: 'row', gap: 16 },
  wheelColumn: { flex: 1, minHeight: 0, minWidth: 0, gap: 8, alignItems: 'center', justifyContent: 'center' },
  wheelSpace: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  accessibleWheel: { flex: 0, height: 132 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 12, rowGap: 4 },
  legend: { fontSize: 12, lineHeight: 16, flexShrink: 1 },
  emptySpace: { flex: 1, minHeight: 0 },
  empty: { flexGrow: 1, justifyContent: 'center' },
  decisionPanel: { padding: 10, gap: 8 },
  controlsScroll: { flex: 1, minHeight: 0 },
  fixedControls: { flex: 0, flexGrow: 0, flexShrink: 0 },
  controls: { gap: 8 },
  choiceGroup: { gap: 4 },
  controlLabel: { fontSize: 12, lineHeight: 18 },
  choiceRow: { flexDirection: 'row', padding: 2, gap: 2 },
  choice: { flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 4 },
  wideChoice: { flex: 1.7 },
  choiceLabel: { textAlign: 'center', fontSize: 13, lineHeight: 17 },
  challengeRow: { alignItems: 'center', gap: 8, minHeight: 44, paddingTop: 4, borderTopWidth: StyleSheet.hairlineWidth },
  challengeLabel: { fontSize: 13, lineHeight: 19 },
  toggle: { alignItems: 'center', gap: 12, minHeight: 44 },
  flex: { flex: 1 },
  resultScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  resultPanel: { flexShrink: 1, minHeight: 0, padding: 12 },
  resultContent: { paddingBottom: 12 },
  resultSummary: { gap: 8 },
  resultHeading: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  resultCategory: { flex: 1, fontSize: 12, lineHeight: 18 },
  resultTitle: { fontSize: 21, lineHeight: 28 },
  resultSource: { alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  resultCaption: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  resultMetadata: { flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 2 },
  resultReason: { padding: 10, gap: 6, marginTop: 2 },
  resultBody: { fontSize: 13, lineHeight: 19 },
  resultActions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  resultActionRow: { gap: 8, alignItems: 'stretch' },
  sheetHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
});
