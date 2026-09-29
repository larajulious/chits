// One process-wide lock also blocks reminder writes and navigation during a file swap.
export type BackupProgress = { label: string; completed?: number; total?: number };
let active = false;
const listeners = new Set<() => void>();
export const isBackupOperationActive = () => active;
export function subscribeToBackupOperation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function beginBackupOperation() {
  if (active) throw new Error('A backup or restore is already in progress.');
  active = true;
  for (const listener of listeners) listener();
  return () => {
    active = false;
    for (const listener of listeners) listener();
  };
}
