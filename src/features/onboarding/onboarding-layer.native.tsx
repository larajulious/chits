import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { PrimaryButton, SecondaryButton, Toast } from '@/components/ui/primitives';
import { layout, spacing } from '@/constants/theme';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { subscribeToReminderChanges } from '@/services/reminders';
import { readChecklist } from './checklist';
import { ot, type OnboardingStringKey } from './strings';
import { ONBOARDING_KEYS, subscribeToOnboardingChanges } from './storage';
import { canResumeTour, endTour, parseTour, prepareLaunch, readTour, updateTour, type TourState } from './tour';
import { WELCOME_FADE_MS } from './welcome/mascot-machine';
import { useWelcomeFonts } from './welcome/welcome-fonts';

type Note = { id: string; text: string | null; type: 'text' | 'photo' | 'video' | 'audio' | 'file'; isHidden: number };
type Placement = { boardId: string; columnId: string; cardId: string };

/** A transient layer over the real Chat and Board screens. */
export function OnboardingLayer() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [tour, setTour] = useState<TourState | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const [hasBoard, setHasBoard] = useState(false);
  const [saved, setSaved] = useState(false);
  // A launch not yet decided, or one returning to an interrupted Welcome, hides
  // Home until Welcome is up. Read synchronously: this is the first frame.
  const [covering, setCovering] = useState(() => pathname === '/' && (!database.getFirstSync('SELECT 1 FROM app_settings WHERE key = ?', ONBOARDING_KEYS.firstRun) || canResumeTour(parseTour(database.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ONBOARDING_KEYS.tour)?.value ?? null))));
  const { tokens: theme } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const refresh = useCallback(async () => {
    const next = await readTour(database);
    setTour(next);
    if (next?.messageId) {
      const [row, board] = await Promise.all([
        database.getFirstAsync<Note>('SELECT id, text, type, is_hidden_content AS isHidden FROM messages WHERE id = ? AND deleted_at IS NULL', next.messageId),
        database.getFirstAsync<{ found: number }>('SELECT EXISTS(SELECT 1 FROM boards WHERE archived_at IS NULL) AS found'),
      ]);
      setNote(row ?? null);
      setHasBoard(board?.found === 1);
    } else setNote(null);
  }, [database]);
  useEffect(() => {
    let coverTimer: ReturnType<typeof setTimeout> | null = null;
    const frame = requestAnimationFrame(() => {
      void prepareLaunch(database, pathnameRef.current === '/')
        .then(async (start) => {
          await refresh();
          if (!start || pathnameRef.current !== '/') return false;
          router.push('/onboarding/welcome');
          return true;
        })
        .catch(() => false)
        .then((opened) => { coverTimer = setTimeout(() => setCovering(false), opened ? WELCOME_FADE_MS : 0); });
    });
    return () => { cancelAnimationFrame(frame); if (coverTimer) clearTimeout(coverTimer); };
  }, [database, refresh]);
  useEffect(() => subscribeToOnboardingChanges(() => { void refresh().catch(() => undefined); }), [refresh]);

  // Observe the rows saved by existing Chat and Add to Board actions.
  useEffect(() => {
    if (!tour || (tour.stage !== 'first-note' && tour.stage !== 'aha')) return;
    if (tour.stage === 'first-note' && pathname !== '/chat') return;
    if (tour.stage === 'aha' && (!tour.awaitingMove || !pathname.startsWith('/board/'))) return;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        if (tour.stage === 'first-note') {
          const row = await database.getFirstAsync<Note>('SELECT id, text, type, is_hidden_content AS isHidden FROM messages WHERE deleted_at IS NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 1', tour.since);
          if (row) {
            Keyboard.dismiss();
            setSaved(true);
            // A first run ends with the first note; the card tips stay on Replay.
            if (tour.mode === 'first-run') await endTour(database);
            else await updateTour(database, { stage: 'aha', messageId: row.id });
          }
        } else if (tour.awaitingMove && tour.messageId) {
          const placed = await database.getFirstAsync<Placement>('SELECT c.board_id AS boardId, c.column_id AS columnId, c.id AS cardId FROM card_messages cm INNER JOIN cards c ON c.id = cm.card_id WHERE cm.message_id = ? AND c.archived_at IS NULL ORDER BY c.created_at DESC LIMIT 1', tour.messageId);
          if (placed) {
            await updateTour(database, { stage: 'moved', ...placed, awaitingMove: false });
            // The existing Add to Board flow already opened this board with its
            // card highlighted. Do not push a duplicate board onto the stack.
          }
        }
      } catch { /* A tour must never block notes or boards. */ }
      finally { busy = false; }
    };
    void check();
    const timer = setInterval(() => void check(), 650);
    return () => clearInterval(timer);
  }, [database, pathname, tour]);
  useEffect(() => { if (!saved) return; const timer = setTimeout(() => setSaved(false), 1300); return () => clearTimeout(timer); }, [saved]);
  useEffect(() => {
    if (pathname === '/chat' && tour?.stage === 'aha' && tour.messageId && !saved) router.setParams({ messageId: tour.messageId });
  }, [pathname, saved, tour?.messageId, tour?.stage]);
  useEffect(() => {
    if (pathname === '/' || pathname === '/onboarding') void readChecklist(database).catch(() => undefined);
  }, [database, pathname]);
  useEffect(() => {
    const refreshChecklist = () => { void readChecklist(database).catch(() => undefined); };
    const stopSpace = subscribeToSpaceChanges(refreshChecklist);
    const stopReminder = subscribeToReminderChanges(refreshChecklist);
    return () => { stopSpace(); stopReminder(); };
  }, [database]);

  const finish = useCallback(async () => {
    if (pathnameRef.current === '/chat') router.setParams({ messageId: undefined });
    await endTour(database).catch(() => undefined);
    // Return to the existing tabs, removing the move/setup screens above them.
    router.dismissTo('/chat');
  }, [database]);
  useEffect(() => {
    if (!tour || (tour.stage !== 'aha' && tour.stage !== 'moved')) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { void finish(); return true; });
    return () => sub.remove();
  }, [finish, tour]);

  if (covering) return <View style={[StyleSheet.absoluteFill, { zIndex: 20, backgroundColor: theme.background }]} />;
  if (saved && pathname === '/chat') {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}><Toast message={ot('firstNote.saved')} /></View>;
  }
  if (!tour) return null;
  if (tour.stage === 'first-note' && pathname === '/chat') return <FirstNotePanel replay={tour.mode === 'replay'} top={insets.top + 65} onFinish={() => void finish()} />;
  if (tour.stage === 'aha' && pathname === '/chat') {
    return <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.center, { zIndex: 10 }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.textPrimary, opacity: 0.68 }]} />
      <ScrollView style={[styles.coach, { backgroundColor: theme.surface, borderColor: theme.accentBorder }]} contentContainerStyle={styles.coachContent}>
        <AppText style={[styles.eyebrow, { color: theme.accentStrong }]}>{note ? ot('aha.yourNote') : ot('aha.example')}</AppText>
        <View style={[styles.preview, { backgroundColor: theme.bubble }]}>
          <AppText numberOfLines={4} style={{ color: theme.bubbleText, fontSize: 16 }}>{note?.isHidden ? ot('aha.hidden') : note?.text || (note ? ot((note.type === 'text' ? 'aha.thought' : 'aha.' + note.type) as OnboardingStringKey) : ot('aha.exampleMessage'))}</AppText>
        </View>
        <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{ot('aha.title')}</AppText>
        <AppText style={[styles.body, { color: theme.textSecondary }]}>{ot('aha.body')}</AppText>
        {!hasBoard && tour.messageId ? <AppText style={[styles.body, { color: theme.textSecondary }]}>{ot('aha.personalHint')}</AppText> : null}
        {tour.messageId ? <PrimaryButton label={ot('aha.tryIt')} onPress={() => void updateTour(database, { awaitingMove: true }).then(() => router.push({ pathname: '/unorganized', params: { messageId: tour.messageId! } }))} /> : null}
        <SecondaryButton label={tour.messageId ? ot('aha.skip') : ot('aha.done')} onPress={() => void finish()} />
      </ScrollView>
    </View>;
  }
  if (tour.stage === 'aha' && tour.awaitingMove && pathname === '/unorganized') {
    return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={ot('firstNote.skip')} onPress={() => void finish()} style={[styles.moveSkip, { top: insets.top + spacing.sm, backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <AppText style={{ color: theme.textSecondary }}>{ot('firstNote.skip')}</AppText>
      </Pressable>
    </View>;
  }
  if (tour.stage === 'moved' && pathname.startsWith('/board/')) {
    return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 10, justifyContent: 'flex-end' }]}>
      <View style={[styles.trick, { marginBottom: insets.bottom + spacing.md, backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{ot('trick.title')}</AppText>
        <AppText style={[styles.body, { color: theme.textSecondary }]}>{ot('trick.body')}</AppText>
        <View style={styles.actionRow}>
          <View style={styles.action}><SecondaryButton label={ot('trick.back')} onPress={() => void finish()} /></View>
          <View style={styles.action}><PrimaryButton label={ot('trick.continue')} onPress={() => void (async () => {
            // Quick setup only ever creates the boards someone picks there.
            await updateTour(database, { stage: 'setup' });
            router.push('/onboarding/setup');
          })()} /></View>
        </View>
      </View>
    </View>;
  }
  return null;
}

/** The first-note prompt over the real Chat, in the same type as Welcome. */
function FirstNotePanel({ replay, top, onFinish }: { replay: boolean; top: number; onFinish: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { tokens: theme } = useTheme();
  const fonts = useWelcomeFonts();
  const showExistingNote = async () => {
    const row = await database.getFirstAsync<Note>('SELECT m.id, m.text, m.type, m.is_hidden_content AS isHidden FROM messages m WHERE m.deleted_at IS NULL AND m.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM card_messages cm WHERE cm.message_id = m.id) ORDER BY m.created_at DESC LIMIT 1');
    await updateTour(database, { stage: 'aha', messageId: row?.id ?? null });
  };
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
    <ScrollView style={[styles.notePanel, { top, backgroundColor: theme.surface, borderColor: theme.borderSubtle }]} contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="always">
      <AppText accessibilityRole="header" variant="title" family={fonts.display} style={[styles.panelTitle, { color: theme.textPrimary }]}>{ot('firstNote.title')}</AppText>
      <AppText family={fonts.text} style={[styles.body, { color: theme.textSecondary }]}>{ot('firstNote.body')}</AppText>
      <View accessibilityLabel={ot('firstNote.chipsLabel')} style={styles.chips}>
        {(['firstNote.chip.groceries', 'firstNote.chip.idea', 'firstNote.chip.remind'] as OnboardingStringKey[]).map((key) =>
          <Pressable key={key} accessibilityRole="button" accessibilityLabel={ot(key) + '. ' + ot('firstNote.chipHint')} onPress={() => router.setParams({ prefill: ot(key) })} style={[styles.chip, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }]}>
            <AppText weight="600" family={fonts.textBold} style={[styles.chipText, { color: theme.textPrimary }]}>{ot(key)}</AppText>
          </Pressable>)}
      </View>
      <View style={styles.smallActions}>
        {replay ? <Pressable accessibilityRole="button" onPress={() => void showExistingNote()} style={styles.textButton}><AppText family={fonts.textBold} style={{ color: theme.accentStrong }}>{ot('firstNote.next')}</AppText></Pressable> : null}
        <Pressable accessibilityRole="button" onPress={onFinish} style={styles.textButton}><AppText family={fonts.text} style={{ color: theme.textSecondary }}>{ot('firstNote.skip')}</AppText></Pressable>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  notePanel: { position: 'absolute', left: spacing.md, right: spacing.md, maxWidth: layout.maxContentWidth, maxHeight: '55%', alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, elevation: 6 },
  panelContent: { padding: spacing.md, gap: spacing.xs },
  title: { fontSize: 19, fontWeight: '700' }, panelTitle: { fontSize: 22, lineHeight: 28 }, body: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '600' }, smallActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md },
  textButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs }, center: { justifyContent: 'center', padding: spacing.md },
  coach: { width: '100%', maxWidth: 440, maxHeight: '85%', alignSelf: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 22 },
  coachContent: { padding: spacing.lg, gap: spacing.sm },
  eyebrow: { fontSize: 12, fontWeight: '700' }, preview: { alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 14, padding: spacing.md, marginBottom: spacing.xs },
  trick: { marginHorizontal: spacing.md, maxWidth: layout.maxContentWidth, alignSelf: 'center', width: '90%', borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: spacing.md, gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm }, action: { flex: 1 },
  moveSkip: { position: 'absolute', right: spacing.md, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: 22 },
});
