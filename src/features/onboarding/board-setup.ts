import type { SQLiteDatabase } from 'expo-sqlite';
import { createBoardRepository } from '@/db/repositories';

/** Only called after the person taps Create. Existing board names are reused. */
export async function createSelectedBoards(database: SQLiteDatabase, names: readonly string[]) {
  const repository = createBoardRepository(database);
  const existing = await repository.listActive();
  const byName = new Map(existing.map((board) => [board.name.trim().toLowerCase(), board.id]));
  const ids: string[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    let id = byName.get(key);
    if (!id) {
      id = (await repository.create({ name })).id;
      byName.set(key, id);
    }
    ids.push(id);
  }
  return ids;
}
