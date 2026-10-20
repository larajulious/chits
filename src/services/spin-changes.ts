const listeners = new Set<() => void>();
export function notifySpinChanged() { for (const listener of listeners) listener(); }
export function subscribeToSpinChanges(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
