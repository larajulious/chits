import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { FOCUS_DEFAULTS, type FocusPreferences, type FocusSession } from '@/services/focus-timer';
import { tr } from '@/localization/runtime';

export function useFocusState() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const [preferences, setPreferences] = useState<FocusPreferences>(FOCUS_DEFAULTS);
  const [active, setActive] = useState<FocusSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const [nextPreferences, nextActive] = await Promise.all([repository.preferences(), repository.active()]);
      if (request !== generation.current) return;
      setPreferences(nextPreferences); setActive(nextActive); setError(null);
    } catch { if (request === generation.current) setError(tr('focus.error')); }
  }, [repository]);
  useEffect(() => {
    const counter = generation;
    const stop = subscribeToFocusChanges(() => void refresh());
    return () => { counter.current++; stop(); };
  }, [refresh]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  return { repository, preferences, active, refresh, error };
}
