import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { Icon, PressableSurface } from '@/components/ui/primitives';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { loadCardsFocus, type CardsFocus } from '@/services/focus-cards';
import { FocusText } from './focus-ui';
import { FocusTimer } from './focus-timer-view';
import { useSpinVisibility } from '@/features/spin/use-spin-visibility';
import { SpinEntry } from '@/features/spin/spin-entry';

export function FocusCardsBanner() {
  'use no memo';
  useLocale();
  const database = useSQLiteContext();
  const showSpin = useSpinVisibility();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const { tokens } = useTheme();
  const { rowStyle, isRTL } = useDirection();
  const [current, setCurrent] = useState<CardsFocus | null>(null);
  const generation = useRef(0);
  const focused = useRef(false);
  const load = useCallback(async () => {
    if (!focused.current) return;
    const request = ++generation.current;
    try { const next = await loadCardsFocus(database); if (request === generation.current) setCurrent(next); }
    catch { if (request === generation.current) setCurrent(null); }
  }, [database]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void load();
    const stopFocus = subscribeToFocusChanges(() => void load());
    const stopNotes = subscribeToNoteChanges(() => void load());
    return () => { focused.current = false; generation.current++; stopFocus(); stopNotes(); };
  }, [load]));
  const session = current?.session;
  const complete = useCallback(() => {
    if (session) void repository.update(session.id, 'checkpoint').then(load, load);
  }, [load, repository, session]);
  if (!current) return showSpin ? <View style={[styles.container,rowStyle]}><PressableSurface accessibilityRole="button" accessibilityLabel={tr('spin.title')} onPress={() => router.push('/spin')} outline={false} edge={false} shadow={false} style={[styles.banner,rowStyle]}><Icon name="shuffle-outline" size={18} color={tokens.accentStrong} /><FocusText style={{ color: tokens.accentStrong }}>{tr('spin.title')}</FocusText><FocusText style={[styles.invitation,{ color: tokens.textSecondary }]}>{tr('spin.subtitle')}</FocusText></PressableSurface></View> : null;
  const { title } = current;
  const label = tr(current.session.status === 'unfinished' ? 'focus.resume' : 'focus.openActive');
  return <View style={[styles.container,rowStyle]}><PressableSurface accessibilityRole="button" accessibilityLabel={`${label}. ${title ?? tr('focus.unavailable')}. ${tr(`focus.state.${current.session.status}`)}`}
    onPress={() => router.push({ pathname: '/focus', params: { note: current.session.note_key, session: current.session.id } })}
    edge={false} outline={false} shadow={false}
    style={[styles.banner, rowStyle]}>
    <Icon name="timer-outline" size={18} color={tokens.accentStrong} />
    <FocusText numberOfLines={1} weight="600" style={styles.note}>{title ?? tr('focus.unavailable')}</FocusText>
    <FocusText numberOfLines={1} style={[styles.status, { color: tokens.accentStrong }]}>{tr(`focus.state.${current.session.status}`)}</FocusText>
    <FocusTimer session={current.session} onComplete={complete} compact />
    <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={tokens.textMuted} />
  </PressableSurface>{showSpin ? <SpinEntry /> : null}</View>;
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 4 },
  banner: { flex: 1, minHeight: 44, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 8 },
  invitation: { flex: 1, fontSize: 12, lineHeight: 18 },
  status: { maxWidth: '25%', fontSize: 11, lineHeight: 17 },
  note: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20 },
});
