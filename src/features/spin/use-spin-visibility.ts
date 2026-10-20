import { useCallback, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createSpinRepository } from '@/db/spin-repository';
import { subscribeToFocusChanges } from '@/db/focus-repository';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { subscribeToSpinChanges } from '@/services/spin-changes';

export function useSpinVisibility() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createSpinRepository(database), [database]);
  const [visible, setVisible] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      try {
        const next = await repository.entryAvailable();
        if (active && request === generation) setVisible(next);
      } catch { if (active && request === generation) setVisible(false); }
    };
    void refresh();
    const stopNotes = subscribeToNoteChanges(() => void refresh());
    const stopFocus = subscribeToFocusChanges(() => void refresh());
    const stopSpin = subscribeToSpinChanges(() => void refresh());
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    // Skips and snoozes can expire without a source write or navigation event.
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 60_000);
    return () => { active = false; generation++; clearInterval(timer); stopNotes(); stopFocus(); stopSpin(); app.remove(); };
  }, [repository]));
  return visible;
}
