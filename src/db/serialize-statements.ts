import type { SQLiteDatabase } from 'expo-sqlite';

// SDK 57 Android can release a native statement while another statement on
// the same connection is still in flight. Keep each convenience call's full
// prepare/execute/finalize lifecycle together, across every repository that
// shares the provider's connection.
const installed = new WeakSet<SQLiteDatabase>();

export function serializeDatabaseStatements(database: SQLiteDatabase): void {
  if (installed.has(database)) return;
  installed.add(database);

  let tail: Promise<void> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  for (const name of ['getAllAsync', 'getFirstAsync', 'runAsync', 'execAsync'] as const) {
    const original = database[name].bind(database) as (...args: unknown[]) => Promise<unknown>;
    (database as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[name] =
      (...args: unknown[]) => enqueue(() => original(...args));
  }
}
