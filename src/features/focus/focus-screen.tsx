import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { AppHeader, EmptyState, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { DeskMessage, DeskPage, PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_YELLOW, PaperAction, PaperDesk, PaperNote, PaperRound, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import Reanimated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
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
import { FocusDial } from './focus-dial';
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
  const { width, height } = useWindowDimensions();
  const editor = useRef<FocusEditorHandle>(null);
  const [note, setNote] = useState<RevisitNote | null>();
  const [session, setSession] = useState<FocusSession | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
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
  const assignSession = useCallback((next: FocusSession | null) => { loadGeneration.current++; sessionRef.current = next; selectedId.current = next?.id ?? null; setSession(next); if (isFocusActive(next) || next?.status === 'completed') setWorkspaceOpen(true); }, []);
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
  const completed = session?.status === 'completed';
  const inProgress = isFocusActive(session);
  const paused = session?.status !== 'running';
  const status = session ? tr(`focus.state.${session.status}`) : tr('focus.ready');
  const openHistory = () => { Keyboard.dismiss(); router.push('/focus-history'); };
  const exit = () => void run(() => leave(() => router.canGoBack() ? router.back() : router.replace('/')));
  // Each note keeps its own paper color from visit to visit.
  const notePaper = note ? PAPERS[Array.from(note.key).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 9973, 7) % 6] : PAPER_YELLOW;
  const customMinutes = minutes !== null && !PRESETS.includes(minutes);
  const dialSize = Math.max(120, Math.min(220, width - 140, height * 0.26));
  // State changes fade or drop in; nothing loops while someone is focusing.
  const enter = reduced ? undefined : FadeIn.duration(220);
  const drop = reduced ? undefined : FadeInDown.springify().damping(15).mass(0.8);

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader actionWidth={88} title={note?.title ?? tr('focus.title')} subtitle={tr('focus.title')}
      leading={<IconButton label={tr('focus.exit')} disabled={busy} onPress={exit}><HeaderIcon name="chevron-back" size={24} /></IconButton>}
      trailing={<View style={[focusStyles.row,rowStyle,{ flexWrap: 'nowrap', gap: 0 }]}>{showSpin ? <SpinEntry header /> : null}<IconButton label={tr('focus.history')} onPress={openHistory}><HeaderIcon name="time-outline" size={22} /></IconButton></View>} />
    <PaperDesk>
    {error ? <AppText accessibilityRole="alert" weight="600" style={[styles.error, { color: desk.danger }]}>{error}</AppText> : null}
    {note === undefined ? null : !note ? <Reanimated.View entering={enter} style={styles.unavailable}>
      <EmptyState title={tr('focus.unavailable')} description={tr('focus.historyKept')} />
      {inProgress ? <PaperAction label={tr('focus.finish')} onPress={finish} /> : null}
    </Reanimated.View> : !workspaceOpen ? <Reanimated.View key="setup" entering={enter} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.setup} keyboardShouldPersistTaps="handled">
        {preferences.companion ? <DeskMessage message={tr(session ? 'focus.welcomeBack' : 'focus.welcome')} /> : null}
        <PaperNote paper={notePaper} tilt={-1} pin style={styles.noteCard}>
          <AppText weight="700" style={styles.kicker}>{tr(session ? 'focus.continue' : 'focus.configure')}</AppText>
          <AppText accessibilityRole="header" numberOfLines={3} style={[handBold, styles.noteTitle]}>{note.title}</AppText>
          {note.total > note.completed ? <View style={[styles.line, rowStyle]}><Icon name="checkbox-outline" size={15} color={PAPER_INK_MUTED} /><AppText style={styles.caption}>{tr('focus.remaining', { count: note.total - note.completed })}</AppText></View> : null}
        </PaperNote>
        <FocusDial size={dialSize} label={session ? focusClock(session.focused_ms) : minutes === null ? tr('focus.untimed') : tr('focus.minutes', { minutes })} caption={session ? status : undefined} />
        {!session ? <View style={[styles.tabs, rowStyle]}>
          {PRESETS.map((value, index) => <PaperTab key={value} tilt={TILTS[index]} icon="time-outline" label={tr('focus.minutes', { minutes: value })} selected={minutes === value} accessibilityRole="button" onPress={() => setMinutes(value)} />)}
          <PaperTab tilt={-1.2} icon="infinite-outline" label={tr('focus.untimed')} selected={minutes === null} accessibilityRole="button" onPress={() => setMinutes(null)} />
          <PaperTab tilt={1} icon="create-outline" label={customMinutes ? tr('focus.minutes', { minutes }) : tr('focus.custom')} accessibilityLabel={tr('focus.custom')} selected={customMinutes} accessibilityRole="button" onPress={() => { setCustom(String(minutes ?? 25)); setCustomOpen(true); }} />
        </View> : null}
        <PaperAction primary label={tr(session ? 'focus.resume' : 'focus.start')} disabled={busy} onPress={start} />
        {active && active.note_key !== note.key ? <PaperNote paper={PAPERS[1]} tilt={0.8} style={styles.otherSession}>
          <AppText style={styles.body}>{tr('focus.activeOther')}</AppText>
          <PaperAction label={tr('focus.openActive')} onPress={() => router.replace({ pathname: '/focus', params: { note: active.note_key, session: active.id } })} />
        </PaperNote> : null}
        <View style={[styles.tabs, rowStyle]}>
          <PaperTab tilt={-1} icon="time-outline" label={tr('focus.history')} accessibilityRole="button" onPress={openHistory} />
          <PaperTab tilt={1.2} icon="settings-outline" label={tr('focus.settings')} accessibilityRole="button" onPress={() => router.push('/focus-settings')} />
        </View>
        <AppText style={[styles.deskNote, { color: desk.inkMuted }]}>{tr('focus.timerBehavior')}</AppText>
      </ScrollView>
    </Reanimated.View> : <Reanimated.View key="workspace" entering={enter} style={styles.flex}>
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
            {preferences.companion ? <AppText style={[hand, styles.cheer]}>{tr('focus.greatWork')}</AppText> : null}
          </PaperNote>
        </Reanimated.View>
        <View style={[styles.completionActions, rowStyle]}>
          <PaperAction primary label={tr('focus.return')} disabled={busy} onPress={exit} containerStyle={styles.completionAction} />
          <PaperAction label={tr('focus.newSession')} disabled={busy} containerStyle={styles.completionAction} onPress={() => void run(async () => { if (editor.current && !await editor.current.save()) return; assignSession(null); setWorkspaceOpen(false); })} />
        </View>
      </ScrollView> : <View style={styles.stripWrap}>
        <PaperNote paper={PAPER_YELLOW} tilt={-0.5} tape style={styles.strip}>
          <View style={[styles.stripRow, rowStyle]}>
            {preferences.companion ? <FocusCompanion small /> : null}
            <View style={styles.readout}>
              <FocusTimer session={session!} onComplete={completeTimer} color={PAPER_INK} progress={(fraction) => <FocusProgress fraction={fraction} fill={PAPER_INK} track="rgba(43,38,32,0.14)" />} />
              <AppText numberOfLines={1} style={[hand, styles.status]}>{status}</AppText>
            </View>
            <View style={[styles.controls, rowStyle]}>
              <PaperRound size={46} icon={paused ? 'play' : 'pause'} accessibilityLabel={tr(paused ? 'focus.resume' : 'focus.pause')} disabled={busy} onPress={() => void run(async () => assignSession(await repository.update(session!.id, paused ? 'resume' : 'pause')))} />
              <PaperRound size={46} icon="checkmark-done-outline" accessibilityLabel={tr('focus.finish')} disabled={busy} onPress={finish} />
              <PaperRound size={46} icon="create-outline" accessibilityLabel={tr('focus.capture')} disabled={busy} onPress={() => { Keyboard.dismiss(); setCapture(true); }} />
            </View>
          </View>
          {paused && preferences.companion && !keyboardVisible ? <AppText style={[hand, styles.stripHelp]}>{tr('focus.break')}</AppText> : null}
          {session?.clock_adjusted ? <AppText style={styles.caption}>{tr('focus.clockAdjusted')}</AppText> : null}
        </PaperNote>
      </View>}
      <ScrollView horizontal style={styles.toolsScroll} contentContainerStyle={[styles.tools, rowStyle]} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
        <PaperTab tilt={-1} icon="git-network-outline" label={tr('focus.related')} selected={related} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setRelated((value) => !value); }} />
        {note.key.startsWith('card:') ? <PaperTab tilt={1} icon="checkbox-outline" label={tr('cardsubtasks.subtasks')} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setTasks(true); }} /> : null}
        {attachments.length ? <PaperTab tilt={-0.6} icon="attach" label={tr('attachments.attachments')} accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setAttachmentsOpen(true); }} /> : null}
      </ScrollView>
      {related ? <Reanimated.View entering={enter}><DeskPage style={styles.related}><ScrollView contentContainerStyle={styles.relatedContent} keyboardShouldPersistTaps="handled"><ConnectedNotes noteKey={note.key} panel /></ScrollView></DeskPage></Reanimated.View> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <DeskPage style={styles.editorPage}><FocusNoteEditor key={note.key} ref={editor} noteKey={note.key} /></DeskPage>
        <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} />
      </KeyboardAvoidingView>
    </Reanimated.View>}
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
const PRESETS = [15, 25, 45, 60];
const TILTS = [-1.5, 1, -0.8, 1.4];
const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { paddingHorizontal: 16, paddingVertical: 8, textAlign: 'center' },
  unavailable: { flex: 1, padding: 16, gap: 12, justifyContent: 'center' },
  setup: { padding: 16, paddingTop: 14, paddingBottom: 32, gap: 18 },
  noteCard: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 4, marginHorizontal: 4 },
  kicker: { color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  noteTitle: { color: PAPER_INK, fontSize: 26, lineHeight: 34 },
  line: { alignItems: 'center', gap: 8 },
  caption: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  body: { color: PAPER_INK, fontSize: 14, lineHeight: 20 },
  tabs: { flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  otherSession: { padding: 14, gap: 10 },
  deskNote: { fontSize: 13, lineHeight: 19, textAlign: 'center', paddingHorizontal: 8 },
  completion: { flexGrow: 0, flexShrink: 1 },
  completionContent: { padding: 16, paddingTop: 18, gap: 14 },
  completionNote: { padding: 16, gap: 8 },
  completionTitle: { color: PAPER_INK, fontSize: 26, lineHeight: 34 },
  cheer: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
  completionActions: { flexWrap: 'wrap', gap: 12 },
  completionAction: { flexGrow: 1, flexBasis: 140 },
  stripWrap: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 2 },
  strip: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10, gap: 4 },
  stripRow: { alignItems: 'center', gap: 10 },
  readout: { flex: 1, minWidth: 84 },
  status: { color: PAPER_INK_MUTED, fontSize: 16, lineHeight: 21 },
  controls: { alignItems: 'center', gap: 8 },
  stripHelp: { color: PAPER_INK, fontSize: 16, lineHeight: 22 },
  toolsScroll: { flexGrow: 0, flexShrink: 0 },
  tools: { alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  related: { maxHeight: 200, marginHorizontal: 12, marginBottom: 10 },
  relatedContent: { paddingHorizontal: 12, paddingVertical: 8 },
  editorPage: { flex: 1, marginHorizontal: 12, marginBottom: 8 },
  toast: { position: 'absolute', top: 10, left: 0, right: 0, alignItems: 'center' },
  toastNote: { paddingHorizontal: 16, paddingVertical: 6 },
  toastText: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
});
