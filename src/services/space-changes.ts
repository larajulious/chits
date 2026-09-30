// Tells the Spaces nav badge, the board and the note menus that a note was
// stuck on, moved, recolored or removed — the same pattern as attachment-changes.
const listeners = new Set<() => void>();
export function notifySpacesChanged() { for (const listener of listeners) listener(); }
export function subscribeToSpaceChanges(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
