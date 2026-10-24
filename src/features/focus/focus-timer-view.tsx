import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/components/theme-provider';
import { tr } from '@/localization/runtime';
import { focusNow } from '@/services/focus-clock';
import { advanceFocus, focusClock, type FocusSession } from '@/services/focus-timer';
import { FocusText } from './focus-ui';

/**
 * The ticking clock. `color` inks it for a paper; `progress` draws something
 * under a timed session from its completed fraction (see FocusProgress).
 */
export function FocusTimer({ session, onComplete, compact = false, color, progress }: { session: FocusSession; onComplete: () => void; compact?: boolean; color?: string; progress?: (fraction: number) => ReactNode }) {
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
  const clock = <FocusText accessibilityLabel={tr(session.planned_ms === null ? 'focus.elapsed' : 'focus.timeLeft', { time })}
    weight="700" style={[styles.timer, compact && styles.compact, { color: color ?? tokens.textPrimary }]}>{time}</FocusText>;
  if (!progress || session.planned_ms === null || session.planned_ms <= 0) return clock;
  return <View style={styles.withBar}>{clock}{progress(Math.min(1, projected.focused_ms / session.planned_ms))}</View>;
}

const styles = StyleSheet.create({
  timer: { fontSize: 28, lineHeight: 36, fontVariant: ['tabular-nums'] },
  compact: { fontSize: 16, lineHeight: 24 },
  withBar: { gap: 6 },
});
