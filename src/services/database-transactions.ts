import type { SQLiteDatabase } from 'expo-sqlite';
type State = { active: number; revision: number; listeners: Set<() => void> };
const states = new WeakMap<SQLiteDatabase, State>();

/** SQLite update hooks run before COMMIT. Observe settled transactions without
 * changing their task, return value, connection, or error behavior. */
export function observeDatabaseTransactions(database: SQLiteDatabase) {
  if (states.has(database)) return;
  const state: State = { active: 0, revision: 0, listeners: new Set() };
  states.set(database, state);
  const settled = () => {
    state.active--; state.revision++;
    if (state.active) return;
    for (const listener of state.listeners) { try { listener(); } catch { /* Observers cannot fail a saved transaction. */ } }
  };
  const transaction = database.withTransactionAsync.bind(database);
  const exclusive = database.withExclusiveTransactionAsync.bind(database);
  database.withTransactionAsync = async task => {
    state.active++; state.revision++;
    try { await transaction(task); } finally { settled(); }
  };
  database.withExclusiveTransactionAsync = async task => {
    state.active++; state.revision++;
    try { await exclusive(task); } finally { settled(); }
  };
}
export function databaseTransactionState(database: SQLiteDatabase) {
  const state = states.get(database);
  return { active: Boolean(state?.active), revision: state?.revision ?? 0 };
}
export function subscribeToDatabaseTransactions(database: SQLiteDatabase, listener: () => void) {
  const listeners = states.get(database)?.listeners;
  listeners?.add(listener);
  return () => { listeners?.delete(listener); };
}
