import type { SQLiteDatabase } from 'expo-sqlite';
import { CUSTOM_SPIN_LIMIT, parseCustomSpinItems, validCustomSpinLabel } from '../services/spin-custom';
import { notifySpinChanged } from '../services/spin-changes';
import { tr } from '@/localization/runtime';

export const CUSTOM_SPIN_KEY = 'spin_custom_items';
export const SPIN_MODE_KEY = 'spin_mode';
export function createCustomSpinRepository(db: SQLiteDatabase) {
  async function items(database = db) {
    const row = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', CUSTOM_SPIN_KEY);
    return parseCustomSpinItems(row?.value ?? null);
  }
  async function mutate(change: (current: Awaited<ReturnType<typeof items>>) => Awaited<ReturnType<typeof items>>) {
    await db.withExclusiveTransactionAsync(async tx => {
      const next = change(await items(tx));
      await tx.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', CUSTOM_SPIN_KEY, JSON.stringify(next), Date.now());
    });
    notifySpinChanged();
  }
  return {
    items,
    async mode(): Promise<'notes' | 'custom'> {
      const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', SPIN_MODE_KEY);
      return row?.value === 'custom' ? 'custom' : 'notes';
    },
    async setMode(mode: 'notes' | 'custom') {
      await db.runAsync('INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at', SPIN_MODE_KEY, mode, Date.now());
      notifySpinChanged();
    },
    async save(label: string, id?: string) {
      if (!validCustomSpinLabel(label)) throw new Error(tr('spin.custom.invalidItem'));
      await mutate(current => {
        if (id) {
          if (!current.some(item => item.id === id)) throw new Error(tr('spin.changed'));
          return current.map(item => item.id === id ? { ...item, label: label.trim() } : item);
        }
        if (current.length >= CUSTOM_SPIN_LIMIT) throw new Error(tr('spin.custom.limit', { count: CUSTOM_SPIN_LIMIT }));
        // Local stable IDs; allocating inside the transaction prevents collisions.
        let suffix = current.length;
        let nextId = `${Date.now()}-${suffix}`;
        while (current.some(item => item.id === nextId)) nextId = `${Date.now()}-${++suffix}`;
        return [...current, { id: nextId, label: label.trim() }];
      });
    },
    async remove(id: string) { await mutate(current => current.filter(item => item.id !== id)); },
    async clear() { await mutate(() => []); },
  };
}
