import type { SQLiteDatabase } from 'expo-sqlite';

// The size of the Spaces board as the user last saw it, in points. A note's
// stored x/y are fractions of the room on *that* board (see fromUnit), so the
// widget needs it to put every note back exactly where it was arranged.

export const SPACE_BOARD_SETTING_KEY = 'space_board_size';
export type BoardSize = { width: number; height: number };

const listeners = new Set<() => void>();
let remembered = '';

export function parseBoardSize(value: string | null | undefined): BoardSize | null {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(value ?? '');
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

/** Called by the Spaces board when it lays out; writes only when the size changes. */
export async function rememberSpaceBoard(database: SQLiteDatabase, board: BoardSize) {
  const value = `${Math.round(board.width)}x${Math.round(board.height)}`;
  if (value === remembered || !parseBoardSize(value)) return;
  remembered = value;
  try {
    await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', SPACE_BOARD_SETTING_KEY, value, Date.now());
    for (const listener of listeners) listener();
  } catch { remembered = ''; }
}

export function subscribeToBoardSize(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export async function readSpaceBoard(database: SQLiteDatabase): Promise<BoardSize | null> {
  try { return parseBoardSize((await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', SPACE_BOARD_SETTING_KEY))?.value); }
  catch { return null; }
}
