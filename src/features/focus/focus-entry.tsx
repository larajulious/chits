import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { localizedDate, tr } from '@/localization/runtime';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { createRevisitRepository } from '@/db/revisit-repository';
import { Icon, IconButton, Surface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { focusClock, type FocusSession } from '@/services/focus-timer';
import type { NoteKey } from '@/services/revisit-engine';
import { preloadHandwriting } from '@/components/desk/paper-desk';
import { FocusText as AppText, FocusAction, FocusCompanion, focusStyles } from './focus-ui';

export function FocusEntry({ noteKey, continuityOnly = false, compact = false }: { noteKey: NoteKey; continuityOnly?: boolean; compact?: boolean }) {
  'use no memo';
  useLocale();
  const { rowStyle } = useDirection();
  const database = useSQLiteContext();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const { tokens } = useTheme();
  const [continuity, setContinuity] = useState<{ session: FocusSession; title: string; remaining: number; companion: boolean } | null>(null);
  const generation = useRef(0);
  const [available, setAvailable] = useState(false);
  // Warm Focus's handwriting while the app is idle, before anyone taps.
  useEffect(() => { const id = requestIdleCallback(preloadHandwriting); return () => cancelIdleCallback(id); }, []);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const key = await repository.resolveKey(noteKey);
      const [note, preferences, session] = await Promise.all([createRevisitRepository(database).get(key), repository.preferences(), repository.continuity(key)]);
      if (request !== generation.current) return;
      setAvailable(Boolean(note));
      setContinuity(note && preferences.continuity && session ? { session, title: note.title, remaining: note.total - note.completed, companion: preferences.companion } : null);
    } catch { if (request === generation.current) setContinuity(null); }
  }, [database, noteKey, repository]);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current++; }; }, [load]));
  useEffect(() => subscribeToFocusChanges(() => void load()), [load]);
  if (!available || (continuityOnly && !continuity)) return null;
  const open = (session?: string) => router.push({ pathname: '/focus', params: { note: noteKey, ...(session ? { session } : {}) } });
  const dismiss = () => { if (continuity) void repository.dismiss(continuity.session.id).then(() => { setContinuity(null); setError(false); }, () => setError(true)); };
  if (compact && !continuityOnly) return <Pressable accessibilityRole="button" accessibilityLabel={continuity ? tr('focus.resume') : tr('focus.action')}
    onPress={() => open(continuity?.session.id)} style={[styles.inlineAction, rowStyle]}>
    <Icon name="timer-outline" size={17} color={tokens.accentStrong} />
    <AppText numberOfLines={1} weight="600" style={[styles.inlineLabel, { color: tokens.accentStrong }]}>{tr('focus.action')}</AppText>
  </Pressable>;
  if (compact && continuityOnly && continuity) return <View>
    <View style={[styles.compactRow, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${tr('focus.resume')}. ${continuity.title}`} onPress={() => open(continuity.session.id)} style={[styles.compactOpen, rowStyle]}>
        <Icon name="play-circle-outline" size={22} color={tokens.accentStrong} /><View style={focusStyles.flex}><AppText numberOfLines={1} weight="600" style={styles.compactTitle}>{continuity.title}</AppText><AppText style={[styles.compactDetail, { color: tokens.textSecondary }]}>{tr('focus.timeSpent', { time: focusClock(continuity.session.focused_ms) })}</AppText></View>
      </Pressable>
      <IconButton label={tr('focus.dismiss')} onPress={dismiss}><Icon name="close-outline" size={20} color={tokens.textMuted} /></IconButton>
    </View>
    {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('focus.error')}</AppText> : null}
  </View>;
  return <View style={styles.entry}>
    {!continuityOnly ? <Pressable accessibilityRole="button" onPress={() => open()} style={[styles.action, rowStyle]}>
      <Icon name="timer-outline" size={19} color={tokens.accentStrong} /><AppText weight="600" style={{ color: tokens.accentStrong }}>{tr('focus.action')}</AppText>
    </Pressable> : null}
    {continuity ? <Surface style={focusStyles.panel}>
      {continuityOnly ? <AppText weight="600">{continuity.title}</AppText> : null}
      {continuity.companion ? <FocusCompanion message={tr('focus.welcomeBack')} small /> : null}
      <AppText weight="600">{tr('focus.continue')}</AppText>
      <AppText style={{ color: tokens.textSecondary }}>{localizedDate(continuity.session.started_at, { month: 'short', day: 'numeric' })} · {tr('focus.timeSpent', { time: focusClock(continuity.session.focused_ms) })}</AppText>
      {continuity.remaining > 0 ? <AppText>{tr('focus.remaining', { count: continuity.remaining })}</AppText> : null}
      <View style={[focusStyles.row, rowStyle]}><FocusAction primary onPress={() => open(continuity.session.id)}>{tr('focus.resume')}</FocusAction><FocusAction quiet onPress={dismiss}>{tr('focus.dismiss')}</FocusAction></View>
      {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('focus.error')}</AppText> : null}
    </Surface> : null}
  </View>;
}
const styles = StyleSheet.create({
  entry: { paddingHorizontal: 16, gap: 8 }, action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineAction: { minHeight: 44, maxWidth: '45%', alignItems: 'center', gap: 6 },
  inlineLabel: { flexShrink: 1, fontSize: 13, lineHeight: 19 },
  compactRow: { alignItems: 'center', gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  compactOpen: { flex: 1, minHeight: 52, alignItems: 'center', paddingVertical: 6, gap: 8 },
  compactTitle: { fontSize: 14, lineHeight: 20 }, compactDetail: { fontSize: 12, lineHeight: 18 },
});
