import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Keyboard, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { AppHeader, EmptyState, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { heroStageLayout } from '@/components/mascot/hero-stage-layout';
import { useStageViewport } from '@/components/mascot/mascot-stage';
import { useTheme } from '@/components/theme-provider';
import type { IconName } from '@/components/ui/icon';
import { KeyboardPane } from '@/components/ui/keyboard-pane';
import { DeskPage, PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PaperAction, PaperButton, PaperCard, PaperDesk, PaperNote, PaperRound, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import Reanimated, { FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { ConnectedNotes } from '@/components/notes/connected-notes.native';
import { createRevisitRepository } from '@/db/revisit-repository';
import { createMessageRepository } from '@/db/repositories';
import { subscribeToFocusChanges } from '@/db/focus-repository';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { loadFocusAttachments } from '@/services/focus-attachments';
import { parseNoteKey } from '@/services/revisit-service';
import { focusClock, isFocusActive, type FocusSession } from '@/services/focus-timer';
import type { RevisitNote } from '@/services/revisit-engine';
import type { AttachmentLike } from '@/db/types';
import { FocusNoteEditor, type FocusEditorHandle } from './focus-note-editor';
import { FocusText as AppText, FocusCompanion, focusErrorMessage, focusStyles } from './focus-ui';
import { DialReadout, FocusDial } from './focus-dial';
import { focusDialSize, focusFraction, focusCelebrates, focusOutcome, focusPhase, focusPrimaryKey } from './focus-phase';
import { FocusStage } from './focus-stage';
import { useFocusState } from './use-focus';
import { FocusTimer } from './focus-timer-view';
import { FocusProgress } from './focus-progress';
import { QuickCaptureSheet } from './quick-capture-sheet';
import { SubtasksSheet } from './subtasks-sheet';
import { AttachmentsSheet } from './attachments-sheet';
import { DurationSheet } from './duration-sheet';
import { useSpinVisibility } from '@/features/spin/use-spin-visibility';
import { SpinEntry } from '@/features/spin/spin-entry';
import { createSpinRepository } from '@/db/spin-repository';

export default function FocusScreen() {
  'use no memo';
  useLocale();
  const { rowStyle } = useDirection();
  const params = useLocalSearchParams<{ note?: string; session?: string; spin?: string; minutes?: string }>();
  const inputKey = parseNoteKey(params.note);
  const { repository, preferences, active } = useFocusState();
  const database = useSQLiteContext();
  const showSpin = useSpinVisibility();
  const desk = useDesk();
  const { hand, handBold } = useHandwriting();
  const reduced = useReducedMotion();
  const navigation = useNavigation();
  const { width, height, fontScale } = useWindowDimensions();
  // Large text needs the room for reading: actions join the page rather than covering the clock.
  const accessibleLayout = fontScale > 1.3;
  const viewport = useStageViewport();
  const { tokens } = useTheme();
  const editor = useRef<FocusEditorHandle>(null);
  const [note, setNote] = useState<RevisitNote | null>();
  const [session, setSession] = useState<FocusSession | null>(null);
  // The session's two views. The corner is the timer; the note is the working
  // editor. `workspaceOpen` keeps that editor mounted under the corner, so a
  // draft and Quick Capture's "add to current note" survive switching between them.
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  // A session finishing here, rather than a past one opened from history.
  const [finished, setFinished] = useState(0);
  // The note view replaces the corner. Coming back from it isn't an arrival.
  const [noteSeen, setNoteSeen] = useState(false);
  const sessionRef = useRef<FocusSession | null>(null);
  const selectedId = useRef(params.session ?? null);
  // The starting duration is known before the first frame: Spin's suggestion,
  // else the saved default. The first load sets it only if that read failed.
  const [startMinutes] = useState(() => {
    if (params.spin && [5,15,30,60].includes(Number(params.minutes))) return { value: Number(params.minutes), known: true };
    try { return { value: repository.preferencesSync().durationMinutes, known: true }; } catch { return { value: 25 as number | null, known: false }; }
  });
  const initialized = useRef(startMinutes.known);
  const [minutes, setMinutes] = useState<number | null>(startMinutes.value);
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [related, setRelated] = useState(false);
  const [tasks, setTasks] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentLike[]>([]);
  const [capture, setCapture] = useState(false);
  const [thought, setThought] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const allowExit = useRef(false);
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const assignSession = useCallback((next: FocusSession | null) => { loadGeneration.current++; if (isFocusActive(sessionRef.current) && next?.status === 'completed') setFinished((value) => value + 1); sessionRef.current = next; selectedId.current = next?.id ?? null; setSession(next); if (isFocusActive(next) || next?.status === 'completed') setWorkspaceOpen(true); }, []);
  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (!inputKey) { setNote(null); return; }
    try {
      const key = await repository.resolveKey(inputKey);
      const [next, current] = await Promise.all([
        createRevisitRepository(database).get(key),
        selectedId.current ? repository.get(selectedId.current) : repository.continuity(key),
      ]);
      const sourceAttachments = next ? await loadFocusAttachments(database, key) : [];
      if (!mounted.current || generation !== loadGeneration.current) return;
      // A removed/hidden source must not unmount an unsaved working draft.
      setNote((previous) => next ?? previous ?? null);
      setAttachments(sourceAttachments);
      if (!next) setError(tr('focus.unavailable'));
      if (current && current.note_key === key) assignSession(current);
      if (!initialized.current) { setMinutes(params.spin && [5,15,30,60].includes(Number(params.minutes)) ? Number(params.minutes) : (await repository.preferences()).durationMinutes); initialized.current = true; }
    } catch { if (mounted.current) setError(tr('focus.error')); }
  }, [assignSession, database, inputKey, repository, params.spin, params.minutes]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToFocusChanges(() => void load()), [load]);
  useEffect(() => subscribeToNoteChanges(() => void load()), [load]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(false), 2400); return () => clearTimeout(timer); }, [notice]);

  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await operation(); }
    catch (cause) { if (mounted.current) setError(focusErrorMessage(cause)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const leave = async (done: () => void) => {
    if (editor.current?.busy()) return;
    if (editor.current && !await editor.current.save()) return;
    if (sessionRef.current && isFocusActive(sessionRef.current)) assignSession(await repository.update(sessionRef.current.id, 'leave'));
    allowExit.current = true; done();
  };
  const leaveRef = useRef(leave);
  useLayoutEffect(() => { leaveRef.current = leave; });
  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowExit.current) return;
    event.preventDefault();
    if (locked.current) return;
    void run(() => leaveRef.current(() => navigation.dispatch(event.data.action)));
  }), [navigation]);
  const finish = () => void run(async () => {
    if (editor.current && !await editor.current.save()) return;
    if (sessionRef.current) assignSession(await repository.update(sessionRef.current.id, 'finish'));
    Keyboard.dismiss();
  });
  const completeTimer = useCallback(() => {
    const id = sessionRef.current?.id;
    if (id) void repository.update(id, 'checkpoint').then((next) => { if (mounted.current && sessionRef.current?.id === id) assignSession(next); }, () => { if (mounted.current) setError(tr('focus.error')); });
  }, [assignSession, repository]);
  const start = () => void run(async () => {
    if (!note) return;
    if (sessionRef.current && sessionRef.current.status !== 'completed') assignSession(await repository.update(sessionRef.current.id, 'resume'));
    else {
      const next = await repository.start(note.key, minutes === null ? null : minutes * 60_000);
      assignSession(next);
    }
    if (params.spin && /^\d+$/.test(params.spin) && sessionRef.current) await createSpinRepository(database).focus(Number(params.spin), sessionRef.current.id);
  });
  const saveCapture = (toChat: boolean) => void run(async () => {
    const text = thought.trim();
    if (!text) return;
    if (toChat) await createMessageRepository(database).createText(text);
    else if (!editor.current || !await editor.current.capture(text)) throw new Error(tr('focus.captureError'));
    setThought(''); setCapture(false); setNotice(true); Keyboard.dismiss();
  });
  const togglePause = () => void run(async () => assignSession(await repository.update(session!.id, paused ? 'resume' : 'pause')));
  const showNote = (open: boolean) => { Keyboard.dismiss(); setNoteOpen(open); if (open) setNoteSeen(true); };
  const startOver = () => void run(async () => { if (editor.current && !await editor.current.save()) return; assignSession(null); setWorkspaceOpen(false); setNoteOpen(false); setRecapOpen(false); });
  const phase = focusPhase(session);
  const outcome = session?.status === 'completed' ? focusOutcome(session) : null;
  const completed = session?.status === 'completed';
  const inProgress = isFocusActive(session);
  const paused = session?.status !== 'running';
  const status = session ? tr(`focus.state.${session.status}`) : tr('focus.ready');
  // State changes are announced once each; the clock itself never is.
  const announced = useRef(phase);
  useEffect(() => { if (announced.current !== phase) { announced.current = phase; AccessibilityInfo.announceForAccessibility(status); } }, [phase, status]);
  const calm = useSharedValue(0);
  useEffect(() => { const to = phase === 'running' ? 1 : 0; calm.set(reduced ? to : withTiming(to, { duration: 600 })); }, [calm, phase, reduced]);
  const quiet = useAnimatedStyle(() => ({ opacity: 1 - 0.42 * calm.get() }));
  const openHistory = () => { Keyboard.dismiss(); router.push('/focus-history'); };
  const exit = () => void run(() => leave(() => router.canGoBack() ? router.back() : router.replace('/')));
  // Each note keeps its own paper color from visit to visit.
  const notePaper = note ? PAPERS[Array.from(note.key).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 7) % 6] : PAPER_YELLOW;
  const customMinutes = minutes !== null && !PRESETS.includes(minutes);
  const dialSize = focusDialSize(width, viewport, preferences.companion ? heroStageLayout(width, height).height : 0);
  // State changes fade or drop in; nothing loops while someone is focusing.
  const enter = reduced ? undefined : FadeIn.duration(220);
  const drop = reduced ? undefined : FadeInDown.springify().damping(15).mass(0.8);

  const primary = () => { if (phase === 'completed') setRecapOpen(true); else if (inProgress) togglePause(); else start(); };
  const dialFor = (time: string, fraction: number | null) => <DialReadout size={dialSize} time={time} status={status} label={time} fraction={fraction} />;
  const staticTime = !session ? (minutes === null ? tr('focus.untimed') : tr('focus.minutes', { minutes }))
    : session.status === 'completed' || session.planned_ms === null ? focusClock(session.focused_ms) : focusClock(session.planned_ms - session.focused_ms);
  const wide = accessibleLayout ? undefined : styles.flex;
  const actions = recapOpen ? <View style={styles.footer}>
      <PaperAction primary paper={tokens.accent} ink={tokens.accentText} label={tr('focus.return')} disabled={busy} onPress={exit} />
      <View style={[styles.footerRow, accessibleLayout ? null : rowStyle]}>
        <PaperAction label={tr('focus.newSession')} disabled={busy} containerStyle={wide} onPress={startOver} />
        <PaperAction label={tr('focus.history')} disabled={busy} containerStyle={wide} onPress={openHistory} />
      </View>
    </View> : <View style={styles.footer}>
      <PaperAction primary paper={tokens.accent} ink={tokens.accentText} label={tr(focusPrimaryKey(phase))} disabled={busy} onPress={primary} />
      <Reanimated.View style={[styles.footerRow, accessibleLayout ? null : rowStyle, quiet]}>
        <PaperTab tilt={-0.4} icon="time-outline" label={tr('focus.history')} accessibilityRole="button" containerStyle={wide} onPress={openHistory} />
        <PaperTab tilt={0.4} icon="settings-outline" label={tr('focus.settings')} accessibilityRole="button" containerStyle={wide} onPress={() => router.push('/focus-settings')} />
      </Reanimated.View>
    </View>;
  const corner = note ? <FocusStage phase={phase} outcome={outcome} companion={preferences.companion} entrance={!noteSeen && !inProgress && !completed} finished={finished}
    footer={!accessibleLayout ? actions : null}>
    {recapOpen && session ? <Reanimated.View entering={drop}>
      <PaperNote paper={PAPER_WHITE} tilt={-0.8} tape style={styles.recap}>
        <AppText accessibilityRole="header" style={[handBold, styles.recapTitle]}>{tr(outcome === 'early' ? 'focus.recap.titleEarly' : outcome === 'brief' ? 'focus.recap.titleBrief' : 'focus.recap.title')}</AppText>
        <AppText numberOfLines={2} accessibilityLabel={note.title} style={styles.recapTask}>{note.title}</AppText>
        <View style={styles.recapFacts}>
          <View style={[styles.line, rowStyle]}><Icon name="time-outline" size={15} color={PAPER_INK_MUTED} /><AppText style={styles.caption}>{tr('focus.timeSpent', { time: focusClock(session.focused_ms) })}</AppText></View>
          {note.total > 0 ? <View style={[styles.line, rowStyle]}><Icon name="checkbox-outline" size={15} color={PAPER_INK_MUTED} /><AppText style={styles.caption}>{tr('focus.recap.tasks', { done: note.completed, total: note.total })}</AppText></View> : null}
          <View style={[styles.line, rowStyle]}><Icon name={outcome === 'full' ? 'checkmark-circle' : 'flag-outline'} size={15} color={PAPER_INK_MUTED} /><AppText style={styles.caption}>{tr(`focus.recap.status.${outcome ?? 'open'}`)}</AppText></View>
        </View>
      </PaperNote>
    </Reanimated.View> : <>
      <Pressable accessibilityRole={workspaceOpen ? 'button' : undefined} accessibilityHint={workspaceOpen ? tr('focus.openNote') : undefined} disabled={!workspaceOpen} onPress={() => showNote(true)}>
        <PaperCard paper={PAPER_WHITE} tilt={-0.4} style={styles.task}>
          <View style={[styles.taskRow, rowStyle]}>
            <View style={[styles.taskIcon, { backgroundColor: notePaper }]}><Icon name={note.key.startsWith('card:') ? 'albums-outline' : 'document-text-outline'} size={19} color={PAPER_INK} /></View>
            <View style={styles.flex}>
              <AppText weight="700" style={styles.kicker}>{tr(phase === 'unfinished' ? 'focus.continue' : 'focus.focusingOn')}</AppText>
              <AppText accessibilityRole="header" accessibilityLabel={note.title} numberOfLines={accessibleLayout ? 5 : 2} style={[handBold, styles.noteTitle]}>{note.title}</AppText>
              {note.total > note.completed ? <AppText style={styles.caption}>{tr('focus.remaining', { count: note.total - note.completed })}</AppText> : null}
            </View>
          </View>
        </PaperCard>
      </Pressable>
      <FocusDial size={dialSize} entrance={!noteSeen} finished={finished}>
        {inProgress ? <FocusTimer session={session!} onComplete={completeTimer} render={({ time, label, fraction }) => <DialReadout size={dialSize} time={time} status={status} label={label} fraction={fraction} />} /> : dialFor(staticTime, focusFraction(session))}
      </FocusDial>
      {session?.clock_adjusted ? <AppText style={[styles.deskNote, { color: desk.inkMuted }]}>{tr('focus.clockAdjusted')}</AppText> : null}
      {!session ? <ScrollView horizontal style={styles.slot} contentContainerStyle={[styles.durations, rowStyle]} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
        {PRESETS.map((value, index) => <PaperTab key={value} tilt={TILTS[index]} icon="time-outline" label={tr('focus.minutes', { minutes: value })} selected={minutes === value} accessibilityRole="button" onPress={() => setMinutes(value)} />)}
        <PaperTab tilt={1} icon="create-outline" label={customMinutes ? tr('focus.minutes', { minutes }) : tr('focus.custom')} accessibilityLabel={tr('focus.custom')} selected={customMinutes} accessibilityRole="button" onPress={() => { setCustom(String(minutes ?? 25)); setCustomOpen(true); }} />
        <PaperTab tilt={-1.2} icon="infinite-outline" label={tr('focus.untimed')} selected={minutes === null} accessibilityRole="button" onPress={() => setMinutes(null)} />
      </ScrollView> : workspaceOpen ? <Reanimated.View entering={enter} style={[styles.tools3, rowStyle]}>
        <FocusTool tilt={-0.6} icon="create-outline" label={tr('focus.openNote')} onPress={() => showNote(true)} />
        {inProgress ? <FocusTool tilt={0.5} icon="bulb-outline" label={tr('focus.capture')} disabled={busy} onPress={() => setCapture(true)} /> : null}
        {inProgress ? <FocusTool tilt={-0.3} icon="checkmark-done-outline" label={tr('focus.finish')} disabled={busy} onPress={finish} /> : null}
      </Reanimated.View> : null}
      {active && active.note_key !== note.key ? <PaperNote paper={PAPERS[1]} tilt={0.8} style={styles.otherSession}>
        <AppText style={styles.body}>{tr('focus.activeOther')}</AppText>
        <PaperAction label={tr('focus.openActive')} onPress={() => router.replace({ pathname: '/focus', params: { note: active.note_key, session: active.id } })} />
      </PaperNote> : null}
      {!workspaceOpen ? <AppText style={[styles.deskNote, { color: desk.inkMuted }]}>{tr('focus.timerBehavior')}</AppText> : null}
    </>}
    {accessibleLayout ? actions : null}
  </FocusStage> : null;

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader actionWidth={100} title={tr('focus.title')}
      leading={<NavigationMenuButton disabled={busy} />}
      trailing={<View style={[focusStyles.row,rowStyle,{ flexWrap: 'nowrap', gap: 8 }]}>{showSpin ? <SpinEntry header /> : null}<IconButton label={tr('focus.history')} onPress={openHistory}><HeaderIcon name="time-outline" size={22} /></IconButton></View>} />
    <PaperDesk>
    {error ? <AppText accessibilityRole="alert" weight="600" style={[styles.error, { color: desk.danger }]}>{error}</AppText> : null}
    {note === undefined ? null : !note ? <Reanimated.View entering={enter} style={styles.unavailable}>
      <EmptyState title={tr('focus.unavailable')} description={tr('focus.historyKept')} />
      {inProgress ? <PaperAction label={tr('focus.finish')} onPress={finish} /> : null}
    </Reanimated.View> : !noteOpen ? corner : null}
    {note && workspaceOpen ? <View style={[styles.flex, !noteOpen && styles.hidden]}>
      {completed ? <ScrollView style={[styles.completion, { maxHeight: height * 0.42 }]} contentContainerStyle={styles.completionContent} keyboardShouldPersistTaps="handled">
        <Reanimated.View entering={drop}>
          <PaperNote paper={PAPERS[2]} tilt={-1} pin style={styles.completionNote}>
            <View style={[styles.line, rowStyle]}>
              {preferences.companion ? <FocusCompanion small /> : null}
              <View style={styles.flex}>
                <AppText accessibilityRole="header" style={[handBold, styles.completionTitle]}>{tr('focus.state.completed')}</AppText>
                <AppText style={styles.caption}>{tr('focus.timeSpent', { time: focusClock(session!.focused_ms) })}</AppText>
              </View>
            </View>
            {preferences.companion && outcome && focusCelebrates(outcome) ? <AppText style={[hand, styles.cheer]}>{tr('focus.greatWork')}</AppText> : null}
          </PaperNote>
        </Reanimated.View>
        <View style={[styles.completionActions, rowStyle]}>
          <PaperAction primary paper={tokens.accent} ink={tokens.accentText} label={tr('focus.recap.view')} disabled={busy} onPress={() => { showNote(false); setRecapOpen(true); }} containerStyle={styles.completionAction} />
          <PaperAction label={tr('focus.return')} disabled={busy} onPress={exit} containerStyle={styles.completionAction} />
        </View>
      </ScrollView> : noteOpen ? <View style={styles.stripWrap}>
        <PaperNote paper={PAPER_WHITE} tilt={-0.5} tape style={styles.strip}>
          <View style={[styles.stripRow, rowStyle]}>
            {preferences.companion ? <FocusCompanion small /> : null}
            <View style={styles.readout}>
              <FocusTimer session={session!} onComplete={completeTimer} color={PAPER_INK} progress={(fraction) => <FocusProgress fraction={fraction} fill={PAPER_INK} track="rgba(43,38,32,0.14)" />} />
              <AppText numberOfLines={1} style={[hand, styles.status]}>{status}</AppText>
            </View>
            <View style={[styles.controls, rowStyle]}>
              <PaperRound size={46} icon={paused ? 'play' : 'pause'} accessibilityLabel={tr(paused ? 'focus.resume' : 'focus.pause')} disabled={busy} onPress={togglePause} />
              <PaperRound size={46} icon="checkmark-done-outline" accessibilityLabel={tr('focus.finish')} disabled={busy} onPress={finish} />
              <PaperRound size={46} icon="create-outline" accessibilityLabel={tr('focus.capture')} disabled={busy} onPress={() => { Keyboard.dismiss(); setCapture(true); }} />
            </View>
          </View>
          {paused && preferences.companion && !keyboardVisible ? <AppText style={[hand, styles.stripHelp]}>{tr('focus.break')}</AppText> : null}
          {session?.clock_adjusted ? <AppText style={styles.caption}>{tr('focus.clockAdjusted')}</AppText> : null}
        </PaperNote>
      </View> : null}
      <ScrollView horizontal style={styles.toolsScroll} contentContainerStyle={[styles.tools, rowStyle]} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
        <PaperTab tilt={0.8} icon="timer-outline" label={tr('focus.showTimer')} accessibilityRole="button" onPress={() => showNote(false)} />
        <PaperTab tilt={-1} icon="git-network-outline" label={tr('focus.related')} selected={related} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRelated((value) => !value); }} />
        {note.key.startsWith('card:') ? <PaperTab tilt={1} icon="checkbox-outline" label={tr('cardsubtasks.subtasks')} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setTasks(true); }} /> : null}
        {attachments.length ? <PaperTab tilt={-0.6} icon="attach" label={tr('attachments.attachments')} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setAttachmentsOpen(true); }} /> : null}
      </ScrollView>
      {related ? <Reanimated.View entering={enter}><DeskPage style={styles.related}><ScrollView contentContainerStyle={styles.relatedContent} keyboardShouldPersistTaps="handled"><ConnectedNotes noteKey={note.key} panel /></ScrollView></DeskPage></Reanimated.View> : null}
      {/* The editor brings its own page and, below it, the shared note toolbar. */}
      <KeyboardPane><FocusNoteEditor key={note.key} ref={editor} noteKey={note.key} /></KeyboardPane>
    </View> : null}
    {notice ? <Reanimated.View entering={drop} exiting={reduced ? undefined : FadeOut.duration(200)} pointerEvents="none" style={styles.toast}>
      <PaperNote paper={PAPERS[2]} tilt={-1.5} style={styles.toastNote}><AppText accessibilityLiveRegion="polite" style={[handBold, styles.toastText]}>{tr('focus.captured')}</AppText></PaperNote>
    </Reanimated.View> : null}
    </PaperDesk>
    <QuickCaptureSheet visible={capture} value={thought} busy={busy} error={error} onChange={setThought} onClose={() => setCapture(false)} onSave={saveCapture} />
    <DurationSheet visible={customOpen} title={tr('focus.custom')} value={custom} onChange={setCustom} onClose={() => setCustomOpen(false)} onSave={() => { setMinutes(Number(custom)); setCustomOpen(false); Keyboard.dismiss(); }} />
    <SubtasksSheet visible={tasks} cardId={note?.key.startsWith('card:') ? note.key.slice(5) : null} onClose={() => setTasks(false)} />
    <AttachmentsSheet visible={attachmentsOpen} attachments={attachments} onClose={() => setAttachmentsOpen(false)} />
  </Screen>;
}
/** A session control: an icon over its name, so a long translation wraps instead of being cut. */
function FocusTool({ tilt, icon, label, disabled, onPress }: { tilt: number; icon: IconName; label: string; disabled?: boolean; onPress: () => void }) {
  const { handBold } = useHandwriting();
  return <PaperButton paper={PAPER_WHITE} tilt={tilt} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} containerStyle={styles.tool} style={styles.toolButton} onPress={onPress}>
    <Icon name={icon} size={18} color={PAPER_INK} />
    <AppText numberOfLines={2} style={[handBold, styles.toolLabel]}>{label}</AppText>
  </PaperButton>;
}
const PRESETS = [15, 25, 45, 60];
const TILTS = [-1.5, 1, -0.8, 1.4];
const styles = StyleSheet.create({
  flex: { flex: 1 },
  hidden: { display: 'none' },
  footer: { gap: 8 },
  footerRow: { gap: 8, alignItems: 'stretch' },
  task: { paddingHorizontal: 12, paddingVertical: 8 },
  taskRow: { alignItems: 'center', gap: 10 },
  taskIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  slot: { flexGrow: 0, marginHorizontal: -16 },
  durations: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
  tools3: { flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  tool: { flexGrow: 1, flexBasis: 88 },
  toolButton: { minHeight: 52, paddingHorizontal: 6, paddingVertical: 6, gap: 2 },
  toolLabel: { color: PAPER_INK, fontSize: 14, lineHeight: 18, textAlign: 'center' },
  recap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 6 },
  recapTitle: { color: PAPER_INK, fontSize: 23, lineHeight: 29 },
  recapTask: { color: PAPER_INK, fontSize: 15, lineHeight: 21 },
  recapFacts: { gap: 6, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(43,38,32,0.25)' },
  error: { paddingHorizontal: 16, paddingVertical: 8, textAlign: 'center' },
  unavailable: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  kicker: { color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  noteTitle: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
  line: { alignItems: 'center', gap: 8 },
  caption: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  body: { color: PAPER_INK, fontSize: 14, lineHeight: 20 },
  otherSession: { padding: 14, gap: 10 },
  deskNote: { fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 8 },
  completion: { flexGrow: 0, flexShrink: 1 },
  completionContent: { padding: 14, paddingTop: 16, gap: 10 },
  completionNote: { padding: 14, gap: 6 },
  completionTitle: { color: PAPER_INK, fontSize: 24, lineHeight: 30 },
  cheer: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
  completionActions: { flexWrap: 'wrap', gap: 8 },
  completionAction: { flexGrow: 1, flexBasis: 140 },
  stripWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  strip: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8, gap: 4 },
  stripRow: { alignItems: 'center', gap: 8 },
  readout: { flex: 1, minWidth: 84 },
  status: { color: PAPER_INK_MUTED, fontSize: 16, lineHeight: 21 },
  controls: { alignItems: 'center', gap: 8 },
  stripHelp: { color: PAPER_INK, fontSize: 16, lineHeight: 22 },
  toolsScroll: { flexGrow: 0, flexShrink: 0 },
  tools: { alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8 },
  related: { maxHeight: 200, marginHorizontal: 12, marginBottom: 10 },
  relatedContent: { paddingHorizontal: 12, paddingVertical: 8 },
  toast: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  toastNote: { paddingHorizontal: 16, paddingVertical: 6 },
  toastText: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
});
