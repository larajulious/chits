import type { SQLiteDatabase } from 'expo-sqlite';
import { createFocusRepository } from '../db/focus-repository';
import { createRevisitRepository } from '../db/revisit-repository';
import type { NoteKey } from './revisit-engine';
import type { FocusSession } from './focus-timer';

export type CardsFocus = { session: FocusSession; title: string | null };

/** Cards exposes the saved session; opening it never resumes or creates one. */
export async function loadCardsFocus(database: SQLiteDatabase): Promise<CardsFocus | null> {
  const repository = createFocusRepository(database);
  const reader = createRevisitRepository(database);
  const active = await repository.active();
  if (active) return { session: active, title: (await reader.get(active.note_key as NoteKey))?.title ?? null };
  if (!(await repository.preferences()).continuity) return null;
  for (const session of await repository.continuityList()) {
    const note = await reader.get(session.note_key as NoteKey);
    if (note) return { session, title: note.title };
  }
  return null;
}
