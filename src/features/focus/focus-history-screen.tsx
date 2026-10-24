import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { localizedDate, localizedNumber, tr } from '@/localization/runtime';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { createRevisitRepository } from '@/db/revisit-repository';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';
import { PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PaperAction, PaperDesk, PaperNote, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import Reanimated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { type FocusSession } from '@/services/focus-timer';
import type { NoteKey } from '@/services/revisit-engine';
import { FocusText as AppText } from './focus-ui';

export default function FocusHistoryScreen() {
  'use no memo'; useLocale();
  const { rowStyle } = useDirection();
  const database = useSQLiteContext();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const reduced = useReducedMotion();
  const durationLabel = (ms: number) => {
    const total = Math.floor(ms / 1000), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    return [h ? tr('focus.hours', { hours: localizedNumber(h) }) : '', m ? tr('focus.minutes', { minutes: localizedNumber(m) }) : '', s || !total ? tr('focus.seconds', { seconds: localizedNumber(s) }) : ''].filter(Boolean).join(' ');
  };
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [totals, setTotals] = useState({ focusedMs: 0, completed: 0 });
  const [notes, setNotes] = useState<{ key: NoteKey; title: string | null; focusedMs: number }[]>([]);
  const [titles, setTitles] = useState(new Map<string, string>());
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [history, summary, perNote] = await Promise.all([repository.history(limit), repository.totals(), repository.perNote()]);
      const keys = [...new Set([...history.map((item) => item.note_key as NoteKey), ...perNote.slice(0, 20).map((item) => item.noteKey)])];
      const resolved = new Map<string, string>();
      const reader = createRevisitRepository(database);
      // Resolve only current, visible sources. Hidden/deleted content is never
      // copied into history or exposed through a historical title snapshot.
      for (const key of keys) { const note = await reader.get(key); if (note) resolved.set(key, note.title); }
      if (request !== generation.current) return;
      setSessions(history); setTotals(summary ?? { focusedMs: 0, completed: 0 }); setTitles(resolved);
      setNotes(perNote.slice(0,20).map((row) => ({ key: row.noteKey, title: resolved.get(row.noteKey) ?? null, focusedMs: row.focusedMs })));
      setError(false); setReady(true);
    } catch { if (request === generation.current) setError(true); }
  }, [database, limit, repository]);
  useFocusEffect(useCallback(() => {
    void (async () => { const active = await repository.active(); if (active) await repository.update(active.id, 'checkpoint'); await load(); })().catch(() => setError(true));
    return () => { generation.current++; };
  }, [load, repository]));
  useEffect(() => subscribeToFocusChanges(() => void load()), [load]);
  const enter = reduced ? undefined : FadeIn.duration(220);
  return <Screen style={{ backgroundColor: desk.desk }}><AppHeader title={tr('focus.history')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<IconButton label={tr('focus.settings')} onPress={() => router.push('/focus-settings')}><HeaderIcon name="settings-outline" size={22} /></IconButton>} />
    <PaperDesk>
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <View style={styles.errorBox}><AppText accessibilityRole="alert" weight="600" style={[styles.deskText, { color: desk.danger }]}>{tr('focus.error')}</AppText><PaperAction label={tr('focus.reload')} onPress={() => void load()} /></View> : null}
      {ready ? <Reanimated.View entering={enter} style={styles.sections}>
        <PaperNote paper={PAPER_YELLOW} tilt={-1} pin style={styles.summary}>
          <AppText weight="700" style={styles.kicker}>{tr('focus.totalTime')}</AppText>
          <AppText numberOfLines={1} adjustsFontSizeToFit style={[handBold, styles.total]}>{durationLabel(totals.focusedMs)}</AppText>
          <AppText style={styles.body}>{tr('focus.completedCount', { count: totals.completed })}</AppText>
        </PaperNote>
        {!sessions.length ? <EmptyState title={tr('focus.emptyHistory')} description={tr('focus.historyHelp')} /> : <>
          <View style={styles.section}>
            <AppText accessibilityRole="header" style={[handBold, styles.sectionTitle, { color: desk.ink }]}>{tr('focus.byNote')}</AppText>
            <PaperNote paper={PAPER_WHITE} style={styles.sheet}>
              {notes.map((note, index) => <View key={note.key} style={[styles.noteRow, rowStyle, index > 0 && styles.ruled]}>
                <AppText weight="600" style={styles.noteTitle}>{note.title ?? tr('focus.unavailable')}</AppText>
                <AppText style={styles.noteTime}>{durationLabel(note.focusedMs)}</AppText>
              </View>)}
            </PaperNote>
          </View>
          <View style={styles.section}>
            <AppText accessibilityRole="header" style={[handBold, styles.sectionTitle, { color: desk.ink }]}>{tr('focus.recent')}</AppText>
            {sessions.map((session, index) => <PaperNote key={session.id} paper={PAPER_WHITE} tilt={index % 2 ? 0.5 : -0.5} style={styles.session}>
              <View style={[styles.sessionHead, rowStyle]}>
                <AppText weight="600" style={styles.sessionTitle}>{titles.get(session.note_key) ?? tr('focus.unavailable')}</AppText>
                <View style={[styles.stamp, { backgroundColor: STAMP[session.status] ?? PAPERS[6] }]}><AppText weight="700" style={styles.stampText}>{tr(`focus.state.${session.status}`)}</AppText></View>
              </View>
              <AppText style={styles.caption}>{localizedDate(session.started_at, { dateStyle: 'medium', timeStyle: 'short' })}</AppText>
              <View style={styles.sessionDetails}>
                <AppText style={[handBold, styles.focusedTime]}>{tr('focus.timeSpent', { time: durationLabel(session.focused_ms) })}</AppText>
                <AppText style={styles.caption}>{session.planned_ms === null ? tr('focus.untimed') : tr('focus.plannedTime', { time: durationLabel(session.planned_ms) })}</AppText>
                <AppText style={styles.caption}>{tr('focus.pausedTime', { time: durationLabel(session.paused_ms) })}</AppText>
              </View>
              {titles.has(session.note_key) ? <View style={[styles.sessionAction, rowStyle]}><PaperTab paper={PAPERS[3]} tilt={1} icon={session.status === 'completed' ? 'eye-outline' : 'play'} label={tr(session.status === 'completed' ? 'focus.viewSession' : 'focus.resume')} accessibilityRole="button" onPress={() => router.push({ pathname: '/focus', params: { note: session.note_key, session: session.id } })} /></View> : null}
            </PaperNote>)}
            {sessions.length >= limit ? <PaperAction label={tr('focus.more')} onPress={() => setLimit((current) => current + 50)} /> : null}
          </View>
        </>}
      </Reanimated.View> : null}
    </ScrollView>
    </PaperDesk>
  </Screen>;
}

// A session's status, stamped in its paper color.
const STAMP: Record<string, string> = { completed: PAPERS[2], running: PAPERS[0], paused: PAPERS[3], unfinished: PAPERS[1] };
const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 18, paddingBottom: 32 },
  sections: { gap: 24 },
  errorBox: { gap: 10, marginBottom: 16 },
  deskText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  summary: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 2, marginHorizontal: 4 },
  kicker: { color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  total: { color: PAPER_INK, fontSize: 36, lineHeight: 46 },
  body: { color: PAPER_INK, fontSize: 15, lineHeight: 22 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 24, lineHeight: 30, paddingHorizontal: 4 },
  sheet: { paddingHorizontal: 14, paddingVertical: 4 },
  noteRow: { alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 12 },
  ruled: { borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(43,38,32,0.2)' },
  noteTitle: { flexGrow: 1, flexBasis: 160, color: PAPER_INK, fontSize: 15, lineHeight: 22 },
  noteTime: { color: PAPER_INK, fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  session: { padding: 14, gap: 6 },
  sessionHead: { alignItems: 'flex-start', gap: 8 },
  sessionTitle: { flex: 1, color: PAPER_INK, fontSize: 16, lineHeight: 23 },
  stamp: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 3, transform: [{ rotate: '2deg' }] },
  stampText: { color: PAPER_INK, fontSize: 11.5, lineHeight: 16 },
  caption: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 19 },
  sessionDetails: { marginTop: 4, paddingTop: 8, gap: 2, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(43,38,32,0.2)' },
  focusedTime: { color: PAPER_INK, fontSize: 20, lineHeight: 27 },
  sessionAction: { justifyContent: 'flex-end', marginTop: 4 },
});
