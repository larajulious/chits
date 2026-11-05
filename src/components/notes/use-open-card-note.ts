import { useCallback, useRef } from 'react';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { createBoardRepository } from '@/db/repositories';
import { cardDetailsRoute, cardNoteRoute } from '@/services/card-note-route';

/** Opens a card's note from outside a board. A repeated tap while the route resolves is ignored. */
export function useOpenCardNote() {
  const database = useSQLiteContext();
  const opening = useRef(false);
  return useCallback(async (cardId: string) => {
    if (opening.current) return;
    opening.current = true;
    try {
      router.push(await cardNoteRoute(createBoardRepository(database), cardId).catch(() => cardDetailsRoute(cardId)));
    } finally {
      opening.current = false;
    }
  }, [database]);
}
