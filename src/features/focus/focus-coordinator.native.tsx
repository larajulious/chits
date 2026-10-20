import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { observeFocusNotifications, syncFocusNotifications } from '@/services/focus-notifications';
import { resetFocusClocks } from '@/services/focus-clock';
import { isBackupOperationActive } from '@/services/backup-operation';

export function FocusCoordinator() {
  const database = useSQLiteContext();
  useEffect(() => {
    const repository = createFocusRepository(database);
    let mounted = true;
    let pending = Promise.resolve();
    const sync = () => {
      pending = pending.catch(() => undefined).then(async () => {
        if (!mounted || isBackupOperationActive()) return;
        await syncFocusNotifications(await repository.active(), await repository.preferences());
      }).catch(() => { /* Timer persistence never depends on notification permission or delivery. */ });
    };
    const checkpoint = async () => {
      if (isBackupOperationActive()) return;
      try {
        const session = await repository.active();
        if (!mounted || !session) return;
        await repository.update(session.id, 'checkpoint');
      } catch { /* The next foreground/checkpoint retries. UI actions surface write failures. */ }
    };
    void checkpoint().then(sync);
    const stop = subscribeToFocusChanges(sync);
    const timer = setInterval(() => { if (AppState.currentState === 'active') void checkpoint(); }, 15_000);
    const appState = AppState.addEventListener('change', () => { resetFocusClocks(database); void checkpoint().then(sync); });
    const stopNotifications = observeFocusNotifications((session, note) => {
      requestAnimationFrame(() => { if (mounted) router.push({ pathname: '/focus', params: { note, session } }); });
    });
    return () => { mounted = false; stop(); clearInterval(timer); appState.remove(); stopNotifications(); };
  }, [database]);
  return null;
}
