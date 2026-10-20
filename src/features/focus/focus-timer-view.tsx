import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/components/theme-provider';
import { tr } from '@/localization/runtime';
import { focusNow } from '@/services/focus-clock';
import { advanceFocus, focusClock, type FocusSession } from '@/services/focus-timer';
import { FocusText } from './focus-ui';

export function FocusTimer({ session, onComplete, compact = false }: { session: FocusSession; onComplete: () => void; compact?: boolean }) {
  const database = useSQLiteContext();
  const [now, setNow] = useState(() => focusNow(database, session));
  const { tokens } = useTheme();
  const finished = useRef(false);
  useEffect(() => {
    const tick = () => setNow(focusNow(database, session));
    tick();
    const timer = setInterval(tick, 1000);
    const subscription = AppState.addEventListener('change', tick);
    return () => { clearInterval(timer); subscription.remove(); };
  }, [database, session]);
  // Read the ticking state explicitly. A hidden clock read during render can
  // be memoized by React Compiler until the next database checkpoint.
  const projected = advanceFocus(session, Math.max(now, session.checkpoint_at));
  useEffect(() => {
    if (projected.status === 'completed' && !finished.current) { finished.current = true; onComplete(); }
    if (projected.status !== 'completed') finished.current = false;
  }, [onComplete, projected.status]);
  const time = focusClock(session.planned_ms === null ? projected.focused_ms : session.planned_ms - projected.focused_ms);
  return <FocusText accessibilityLabel={tr(session.planned_ms === null ? 'focus.elapsed' : 'focus.timeLeft', { time })}
    weight="700" style={[styles.timer, compact && styles.compact, { color: tokens.textPrimary }]}>{time}</FocusText>;
}

const styles = StyleSheet.create({ timer: { fontSize: 28, lineHeight: 36, fontVariant: ['tabular-nums'] }, compact: { fontSize: 16, lineHeight: 24 } });
