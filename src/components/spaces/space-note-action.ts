import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_SPACE_ID, SPACES } from '@/constants/spaces';
import { createSpaceRepository } from '@/db/repositories';
import type { SpaceNoteKind } from '@/db/types';

export const SPACE_FULL_MESSAGE = 'This space is full. Remove a note to make room.';

export type SpaceNoteAction = {
  noteId: string;
  label: string;
  icon: 'magnet-outline' | 'close-circle-outline';
  /** Does it, and returns the confirmation (or the "space is full" message) to show. */
  run: () => Promise<string>;
};

/**
 * The item every note menu offers (Chat's thought actions, the Cards list,
 * Card Details): "Stick to Fridge" — the space Spaces last showed, Fridge
 * until one is picked — or "Remove from Fridge" when the note is already on a
 * space. Sticking never picks a space for the user, so Spaces still opens on
 * Pick a Space the first time.
 */
export async function spaceNoteAction(database: SQLiteDatabase, kind: SpaceNoteKind, noteId: string): Promise<SpaceNoteAction> {
  const repository = createSpaceRepository(database);
  const placement = await repository.placementFor(kind, noteId);
  if (placement) {
    const { name } = SPACES[placement.spaceId];
    return { noteId, label: `Remove from ${name}`, icon: 'close-circle-outline', run: async () => { await repository.remove(placement.id); return `Removed from ${name}`; } };
  }
  const target = (await repository.getSelectedSpace()) ?? DEFAULT_SPACE_ID;
  const { name } = SPACES[target];
  return {
    noteId, label: `Stick to ${name}`, icon: 'magnet-outline',
    run: async () => ((await repository.stick(kind, noteId, target)).status === 'full' ? SPACE_FULL_MESSAGE : `Stuck on your ${name}`),
  };
}
