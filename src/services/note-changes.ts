const listeners = new Set<(messageId: string) => void>();
export function notifyNoteChanged(messageId: string) { for (const listener of listeners) listener(messageId); }
export function subscribeToNoteChanges(listener: (messageId: string) => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
