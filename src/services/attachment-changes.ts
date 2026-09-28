const listeners = new Set<() => void>();
export function notifyAttachmentsChanged() { for (const listener of listeners) listener(); }
export function subscribeToAttachmentChanges(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
