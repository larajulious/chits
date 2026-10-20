import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { localizedDate, localizedNumber, tr } from '@/localization/runtime';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { createRevisitRepository } from '@/db/revisit-repository';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen, Surface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { type FocusSession } from '@/services/focus-timer';
import type { NoteKey } from '@/services/revisit-engine';
import { FocusText as AppText, FocusAction } from './focus-ui';

export default function FocusHistoryScreen() {
  'use no memo'; useLocale();
  const { rowStyle } = useDirection();
  const database = useSQLiteContext();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const { tokens, styleTokens } = useTheme();
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
  return <Screen><AppHeader title={tr('focus.history')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<IconButton label={tr('focus.settings')} onPress={() => router.push('/focus-settings')}><HeaderIcon name="settings-outline" size={22} /></IconButton>} />
    <ScrollView contentContainerStyle={styles.content}>
      {error ? <><AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('focus.error')}</AppText><FocusAction onPress={() => void load()}>{tr('focus.reload')}</FocusAction></> : null}
      {!ready ? <AppText>{tr('focus.loading')}</AppText> : <>
        <Surface fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} outline={StyleSheet.hairlineWidth} edge={false} style={styles.summary}>
          <AppText style={[styles.metadata, { color: tokens.textSecondary }]}>{tr('focus.totalTime')}</AppText>
          <AppText weight="700" style={styles.total}>{durationLabel(totals.focusedMs)}</AppText>
          <AppText style={styles.summaryCount}>{tr('focus.completedCount', { count: totals.completed })}</AppText>
        </Surface>
        {!sessions.length ? <EmptyState title={tr('focus.emptyHistory')} description={tr('focus.historyHelp')} /> : <>
          <View style={styles.section}>
          <AppText accessibilityRole="header" weight="700" style={styles.sectionTitle}>{tr('focus.byNote')}</AppText>
          {notes.map((note) => <View key={note.key} style={[styles.noteRow, rowStyle, { borderBottomColor: tokens.borderSubtle }]}><AppText weight="600" style={styles.noteTitle}>{note.title ?? tr('focus.unavailable')}</AppText><AppText style={[styles.noteTime, { color: tokens.textPrimary }]}>{durationLabel(note.focusedMs)}</AppText></View>)}
          </View>
          <View style={styles.section}>
          <AppText accessibilityRole="header" weight="700" style={styles.sectionTitle}>{tr('focus.recent')}</AppText>
          {sessions.map((session) => <Surface key={session.id} fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} outline={StyleSheet.hairlineWidth} edge={false} style={styles.session}>
            <AppText weight="600" style={styles.sessionTitle}>{titles.get(session.note_key) ?? tr('focus.unavailable')}</AppText>
            <View style={[styles.sessionMeta, rowStyle]}>
              <AppText style={[styles.date, { color: tokens.textSecondary }]}>{localizedDate(session.started_at, { dateStyle: 'medium', timeStyle: 'short' })}</AppText>
              <View style={[styles.status, { backgroundColor: session.status === 'completed' ? tokens.accentSoft : tokens.surfaceElevated }]}><AppText weight="600" style={styles.statusText}>{tr(`focus.state.${session.status}`)}</AppText></View>
            </View>
            <View style={[styles.sessionDetails, { borderTopColor: tokens.borderSubtle }]}>
              <AppText weight="600" style={styles.focusedTime}>{tr('focus.timeSpent', { time: durationLabel(session.focused_ms) })}</AppText>
              <AppText style={[styles.metadata, { color: tokens.textSecondary }]}>{session.planned_ms === null ? tr('focus.untimed') : tr('focus.plannedTime', { time: durationLabel(session.planned_ms) })}</AppText>
              <AppText style={[styles.metadata, { color: tokens.textSecondary }]}>{tr('focus.pausedTime', { time: durationLabel(session.paused_ms) })}</AppText>
            </View>
            {titles.has(session.note_key) ? <View style={styles.sessionAction}><FocusAction quiet onPress={() => router.push({ pathname: '/focus', params: { note: session.note_key, session: session.id } })}>{tr(session.status === 'completed' ? 'focus.viewSession' : 'focus.resume')}</FocusAction></View> : null}
          </Surface>)}
          {sessions.length >= limit ? <FocusAction onPress={() => setLimit((current) => current + 50)}>{tr('focus.more')}</FocusAction> : null}
          </View>
        </>}
      </>}
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 32, gap: 20 },
  summary: { padding: 16, gap: 8 },
  total: { fontSize: 30, lineHeight: 38, fontVariant: ['tabular-nums'] },
  summaryCount: { fontSize: 15, lineHeight: 22 },
  section: { gap: 12 }, sectionTitle: { fontSize: 17, lineHeight: 24 },
  noteRow: { alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  noteTitle: { flexGrow: 1, flexBasis: 180, fontSize: 15, lineHeight: 22 },
  noteTime: { fontSize: 15, lineHeight: 22, fontVariant: ['tabular-nums'] },
  session: { padding: 16, gap: 10 }, sessionTitle: { fontSize: 17, lineHeight: 24 },
  sessionMeta: { alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  date: { flexGrow: 1, fontSize: 13, lineHeight: 20 },
  status: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }, statusText: { fontSize: 12, lineHeight: 18 },
  sessionDetails: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 6 },
  focusedTime: { fontSize: 17, lineHeight: 24, fontVariant: ['tabular-nums'] },
  metadata: { fontSize: 14, lineHeight: 21 }, sessionAction: { alignSelf: 'flex-end' },
});
