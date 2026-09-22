// A minimal signal for "the whole app tree needs to remount" — used after a
// restore replaces chits.db and the attachments folder on disk, so every screen's
// local state and the live SQLite connection are discarded and re-created fresh
// against the restored data, rather than trying to hot-patch dozens of live
// component states and a single shared database connection in place.
type Listener = () => void;
let listeners: Listener[] = [];

export function subscribeToAppReset(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((entry) => entry !== listener); };
}

export function triggerAppReset() {
  for (const listener of listeners) listener();
}
