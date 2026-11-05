import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { subscribeToReminderChanges } from '@/services/reminders';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { readChecklist, type ChecklistItem } from '../checklist';
import { ONBOARDING_KEYS, readOnboardingValue, subscribeToOnboardingChanges, writeOnboardingValue } from '../storage';

/** The checklist as the hub and the Notes card both see it, and where each item leads. */
export function useChecklist() {
  const database = useSQLiteContext();
  const router = useRouter();
  const [done, setDone] = useState<ChecklistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  // The first read paints as it is; only what changes after that animates.
  const [settled, setSettled] = useState(false);
  const [homeShown, setHomeShown] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    const [next, home] = await Promise.all([readChecklist(database), readOnboardingValue(database, ONBOARDING_KEYS.checklistHome)]);
    setDone(next);
    setHomeShown(home === 'shown');
    setLoaded(true);
    requestAnimationFrame(() => setSettled(true));
  }, [database]);
  useFocusEffect(useCallback(() => {
    void refresh().catch(() => undefined);
    const changed = () => { void refresh().catch(() => undefined); };
    const stopOnboarding = subscribeToOnboardingChanges(changed);
    const stopSpace = subscribeToSpaceChanges(changed);
    const stopReminder = subscribeToReminderChanges(changed);
    return () => { stopOnboarding(); stopSpace(); stopReminder(); };
  }, [refresh]));

  const open = useCallback(async (item: ChecklistItem) => {
    if (item === 'firstNote') router.push('/chat');
    else if (item === 'firstCard') {
      const note = await database.getFirstAsync<{ id: string }>('SELECT m.id FROM messages m WHERE m.deleted_at IS NULL AND m.archived_at IS NULL AND NOT EXISTS (SELECT 1 FROM card_messages cm WHERE cm.message_id = m.id) ORDER BY m.created_at DESC LIMIT 1');
      router.push(note ? { pathname: '/unorganized', params: { messageId: note.id, openBoardPicker: '1' } } : '/chat');
    } else if (item === 'reminder') {
      const card = await database.getFirstAsync<{ id: string }>('SELECT id FROM cards WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 1');
      router.push(card ? { pathname: '/card/[id]', params: { id: card.id } } : '/unorganized');
    } else router.push('/spaces/pick');
  }, [database, router]);

  const dismissFromHome = useCallback(() => writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'dismissed'), [database]);
  const showOnHome = useCallback(async () => {
    await writeOnboardingValue(database, ONBOARDING_KEYS.checklistHome, 'shown');
    setHomeShown(true);
  }, [database]);

  return { done, loaded, settled, homeShown, open, showOnHome, dismissFromHome };
}
