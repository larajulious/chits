import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { dayPeriod, localDateKey, nextMidnight } from './plan-core';
import { createPlanRepository, subscribeToPlanChanges, type PlanDay } from './plan-repository';

export function usePlanRepository() {
  const database = useSQLiteContext();
  return useMemo(() => createPlanRepository(database), [database]);
}

export function usePlanSurfaces() {
  const { scheme } = useTheme();
  return welcomeSurfaces(scheme, useDesk(), { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
}

/** Today's key and period, kept right across midnight and while the app was away. */
export function useToday() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      timer = setTimeout(refresh, Math.min(nextMidnight(current).getTime() - current.getTime(), 30 * 60_000));
    };
    timer = setTimeout(refresh, 0);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  return { today: localDateKey(now), period: dayPeriod(now.getHours()) };
}

/** One saved day, reloaded whenever any plan changes or the screen comes back. */
export function usePlanDay(date: string) {
  const repository = usePlanRepository();
  const [loaded, setLoaded] = useState<{ date: string; day: PlanDay | null } | null>(null);
  const reload = useCallback(async () => {
    const day = await repository.day(date);
    setLoaded({ date, day });
  }, [date, repository]);
  useFocusEffect(useCallback(() => {
    void reload().catch(() => undefined);
    return subscribeToPlanChanges(() => { void reload().catch(() => undefined); });
  }, [reload]));
  const current = loaded?.date === date ? loaded : null;
  return { day: current?.day ?? null, ready: current !== null };
}
