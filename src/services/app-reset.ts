// A minimal signal for "the whole app tree needs to remount" — used after a
// restore replaces chits.db and the attachments folder on disk, so every screen's
// local state and the live SQLite connection are discarded and re-created fresh
// against the restored data, rather than trying to hot-patch dozens of live
// component states and a single shared database connection in place.
type Listener = () => void;
export type ResetNotice = { type: 'success' | 'warning'; title: string; message: string };

let listeners: Listener[] = [];
// A message to show once the app has remounted (anything shown before the
// reset — dialogs included — is discarded along with the old tree).
let pendingNotice: ResetNotice | null = null;

export function subscribeToAppReset(listener: Listener): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter((entry) => entry !== listener); };
}

export function triggerAppReset(notice?: ResetNotice) {
  pendingNotice = notice ?? null;
  for (const listener of listeners) listener();
}

/** Returns (once) the notice passed to the last triggerAppReset, if any. */
export function consumeResetNotice(): ResetNotice | null {
  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}
