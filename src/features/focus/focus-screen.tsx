import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, Chip, EmptyState, HeaderIcon, Icon, IconButton, Screen, Surface } from '@/components/ui/primitives';
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
import { FocusText as AppText, FocusAction, FocusCompanion, FocusReveal, focusErrorMessage, focusStyles } from './focus-ui';
import { useFocusState } from './use-focus';
import { FocusTimer } from './focus-timer-view';
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
  const { tokens } = useTheme();
  const navigation = useNavigation();
  const { height } = useWindowDimensions();
  const editor = useRef<FocusEditorHandle>(null);
  const [note, setNote] = useState<RevisitNote | null>();
  const [session, setSession] = useState<FocusSession | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const sessionRef = useRef<FocusSession | null>(null);
  const selectedId = useRef(params.session ?? null);
  const initialized = useRef(false);
  const [minutes, setMinutes] = useState<number | null>(25);
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
      const next = await createRevisitRepository(database).get(key);
      const current = selectedId.current ? await repository.get(selectedId.current) : await repository.continuity(key);
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

  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader actionWidth={88} title={note?.title ?? tr('focus.title')} subtitle={tr('focus.title')}
      leading={<IconButton label={tr('focus.exit')} disabled={busy} onPress={() => void run(() => leave(() => router.canGoBack() ? router.back() : router.replace('/')))}><HeaderIcon name="chevron-back" size={24} /></IconButton>}
      trailing={<View style={[focusStyles.row,rowStyle,{ flexWrap: 'nowrap', gap: 0 }]}>{showSpin ? <SpinEntry header /> : null}<IconButton label={tr('focus.history')} onPress={openHistory}><HeaderIcon name="time-outline" size={22} /></IconButton></View>} />
    {error ? <AppText accessibilityRole="alert" style={[styles.error, { color: tokens.danger }]}>{error}</AppText> : null}
    {note === undefined ? <AppText style={styles.panel}>{tr('focus.loading')}</AppText> : !note ? <>
      <EmptyState title={tr('focus.unavailable')} description={tr('focus.historyKept')} />
      {inProgress ? <FocusAction onPress={finish}>{tr('focus.finish')}</FocusAction> : null}
    </> : <>
      {!workspaceOpen ? <ScrollView contentContainerStyle={focusStyles.content} keyboardShouldPersistTaps="handled">
        {preferences.companion ? <FocusCompanion message={tr(session ? 'focus.welcomeBack' : 'focus.welcome')} /> : null}
        <AppText variant="title">{tr(session ? 'focus.continue' : 'focus.configure')}</AppText>
        <AppText style={{ color: tokens.textSecondary }}>{tr('focus.timerBehavior')}</AppText>
        {session ? <AppText>{tr('focus.timeSpent', { time: focusClock(session.focused_ms) })}</AppText> : <View style={[focusStyles.row, rowStyle]}>
          {[15, 25, 45, 60, null].map((value) => <Chip key={value ?? 'untimed'} label={value === null ? tr('focus.untimed') : tr('focus.minutes', { minutes: value })} accessibilityLabel={value === null ? tr('focus.untimed') : tr('focus.minutes', { minutes: value })} selected={minutes === value} onPress={() => setMinutes(value)} />)}
          <FocusAction quiet onPress={() => { setCustom(String(minutes ?? 25)); setCustomOpen(true); }}>{tr('focus.custom')}</FocusAction>
          {minutes !== null && ![15,25,45,60].includes(minutes) ? <AppText>{tr('focus.minutes', { minutes })}</AppText> : null}
        </View>}
        {note.total > note.completed ? <AppText>{tr('focus.remaining', { count: note.total - note.completed })}</AppText> : null}
        <FocusAction primary disabled={busy} onPress={start}>{tr(session ? 'focus.resume' : 'focus.start')}</FocusAction>
        {active && active.note_key !== note.key ? <Surface style={focusStyles.panel}><AppText>{tr('focus.activeOther')}</AppText><FocusAction onPress={() => router.replace({ pathname: '/focus', params: { note: active.note_key, session: active.id } })}>{tr('focus.openActive')}</FocusAction></Surface> : null}
        <View style={[focusStyles.row, rowStyle]}><FocusAction quiet onPress={openHistory}>{tr('focus.history')}</FocusAction><FocusAction quiet onPress={() => router.push('/focus-settings')}>{tr('focus.settings')}</FocusAction></View>
      </ScrollView> : <>
      {completed ? <ScrollView style={[styles.completion, { maxHeight: height * 0.32, borderBottomColor: tokens.borderSubtle }]} contentContainerStyle={styles.completionPadding} keyboardShouldPersistTaps="handled"><FocusReveal><View style={styles.completionContent}>
        <View style={[styles.completionHeading, rowStyle]}>
        {preferences.companion ? <FocusCompanion small /> : null}
        <View style={styles.completionDetails}>
        <AppText accessibilityRole="header" variant="title">{tr('focus.state.completed')}</AppText>
        <AppText>{tr('focus.timeSpent', { time: focusClock(session!.focused_ms) })}</AppText>
        </View>
        </View>
        {preferences.companion ? <AppText style={{ color: tokens.textSecondary, fontSize: 14 }}>{tr('focus.greatWork')}</AppText> : null}
        <View style={[styles.completionActions, rowStyle]}>
        <View style={styles.completionAction}>
        <FocusAction primary disabled={busy} onPress={() => void run(() => leave(() => router.canGoBack() ? router.back() : router.replace('/')))}>{tr('focus.return')}</FocusAction>
        </View><View style={styles.completionAction}>
        <FocusAction quiet disabled={busy} onPress={() => void run(async () => { if (editor.current && !await editor.current.save()) return; assignSession(null); setWorkspaceOpen(false); })}>{tr('focus.newSession')}</FocusAction>
        </View>
        </View>
      </View></FocusReveal></ScrollView> : <ScrollView style={{ maxHeight: height * 0.24, flexGrow: 0 }} keyboardShouldPersistTaps="handled"><View style={styles.timerPanel}>
          <View style={[styles.timerHeading, rowStyle]}>
            {preferences.companion ? <FocusCompanion small /> : null}
            <View style={styles.timerReadout}><FocusTimer session={session!} onComplete={completeTimer} /><AppText style={[styles.timerStatus, { color: tokens.textSecondary }]}>{status}</AppText></View>
            <View style={[styles.timerActions, rowStyle]}>
              <IconButton label={tr(paused ? 'focus.resume' : 'focus.pause')} disabled={busy} onPress={() => void run(async () => assignSession(await repository.update(session!.id, paused ? 'resume' : 'pause')))}><Icon name={paused ? 'play' : 'pause'} size={22} color={tokens.accentStrong} /></IconButton>
              <IconButton label={tr('focus.finish')} disabled={busy} onPress={finish}><Icon name="checkmark-done-outline" size={22} color={tokens.textPrimary} /></IconButton>
              <IconButton label={tr('focus.capture')} disabled={busy} onPress={() => { Keyboard.dismiss(); setCapture(true); }}><Icon name="create-outline" size={22} color={tokens.textPrimary} /></IconButton>
            </View>
          </View>
          {paused && preferences.companion && !keyboardVisible ? <AppText style={[styles.timerHelp, { color: tokens.textSecondary }]}>{tr('focus.break')}</AppText> : null}
          {session?.clock_adjusted ? <AppText style={{ color: tokens.textSecondary }}>{tr('focus.clockAdjusted')}</AppText> : null}
        </View></ScrollView>}
        <ScrollView horizontal style={styles.toolsScroll} contentContainerStyle={[styles.tools, rowStyle]} keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false}>
          <FocusAction quiet onPress={() => { Keyboard.dismiss(); setRelated((value) => !value); }}>{tr('focus.related')}</FocusAction>
          {note.key.startsWith('card:') ? <FocusAction quiet onPress={() => { Keyboard.dismiss(); setTasks(true); }}>{tr('cardsubtasks.subtasks')}</FocusAction> : null}
          {attachments.length ? <FocusAction quiet onPress={() => { Keyboard.dismiss(); setAttachmentsOpen(true); }}>{tr('attachments.attachments')}</FocusAction> : null}
        </ScrollView>
        {related ? <FocusReveal><ScrollView style={styles.related} contentContainerStyle={styles.relatedContent} keyboardShouldPersistTaps="handled"><ConnectedNotes noteKey={note.key} panel /></ScrollView></FocusReveal> : null}
        <KeyboardAvoidingView style={focusStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <FocusNoteEditor key={note.key} ref={editor} noteKey={note.key} />
          <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} />
        </KeyboardAvoidingView>
      </>}
    </>}
    {notice ? <AppText accessibilityLiveRegion="polite" style={styles.feedback}>{tr('focus.captured')}</AppText> : null}
    <QuickCaptureSheet visible={capture} value={thought} busy={busy} error={error} onChange={setThought} onClose={() => setCapture(false)} onSave={saveCapture} />
    <DurationSheet visible={customOpen} title={tr('focus.custom')} value={custom} onChange={setCustom} onClose={() => setCustomOpen(false)} onSave={() => { setMinutes(Number(custom)); setCustomOpen(false); Keyboard.dismiss(); }} />
    <SubtasksSheet visible={tasks} cardId={note?.key.startsWith('card:') ? note.key.slice(5) : null} onClose={() => setTasks(false)} />
    <AttachmentsSheet visible={attachmentsOpen} attachments={attachments} onClose={() => setAttachmentsOpen(false)} />
  </Screen>;
}
const styles = StyleSheet.create({
  panel: { padding: 16 }, error: { paddingHorizontal: 16, paddingVertical: 8 },
  completion: { flexGrow: 0, flexShrink: 1, borderBottomWidth: StyleSheet.hairlineWidth },
  completionPadding: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  completionContent: { gap: spacing.sm },
  completionHeading: { alignItems: 'center', gap: spacing.sm },
  completionDetails: { flex: 1, gap: spacing.xs },
  completionActions: { flexWrap: 'wrap', gap: spacing.sm },
  completionAction: { flexGrow: 1, flexBasis: 140 },
  timerPanel: { paddingHorizontal: 16, paddingVertical: 6, gap: 4 },
  timerHeading: { alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  timerReadout: { flexGrow: 1, minWidth: 96 },
  timerStatus: { fontSize: 12, lineHeight: 18 },
  timerActions: { alignItems: 'center' },
  timerHelp: { fontSize: 13, lineHeight: 19 },
  toolsScroll: { flexGrow: 0, flexShrink: 0 },
  tools: { alignItems: 'center', gap: 4, paddingHorizontal: 16 },
  related: { maxHeight: 200, flexGrow: 0 },
  relatedContent: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  feedback: { paddingHorizontal: 16, paddingVertical: 8 },
});
