// "My order" on the Notes cards list: one arrangement of every note, kept as
// a list of note keys (top first) in app_settings. Notes the list doesn't
// know yet (new ones, or a thought just filed into a card) sit above it,
// newest first, so whatever was just captured is on top.
//
// Pure functions (no React Native) so tests can drive them directly.

export const NOTE_ORDER_KEY = 'cards_note_order';
export const NOTE_ORDER_MODE_KEY = 'cards_order_mode';
export type NoteOrderMode = 'recent' | 'custom';

type Orderable = { kind: 'card' | 'thought'; id: string; createdAt: number };

export const noteKey = (item: { kind: 'card' | 'thought'; id: string }) => `${item.kind}:${item.id}`;

export function parseNoteOrder(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

/** The items in My order: unplaced ones first (newest first), then the saved arrangement. */
export function arrangeNotes<T extends Orderable>(items: readonly T[], order: readonly string[]): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  const placed: T[] = [];
  const unplaced: T[] = [];
  for (const item of items) (rank.has(noteKey(item)) ? placed : unplaced).push(item);
  unplaced.sort((a, b) => b.createdAt - a.createdAt);
  placed.sort((a, b) => rank.get(noteKey(a))! - rank.get(noteKey(b))!);
  return [...unplaced, ...placed];
}

/**
 * The whole arrangement after a drag. `everything` is every note's key in its
 * current My order; `shown` is the dragged section as it now reads (a filter
 * may show only some notes). The moved note lands just before the note now
 * after it, or just after the one before it, so notes outside the filter keep
 * their places. Keys of notes that no longer exist drop out.
 */
export function moveNote(everything: readonly string[], shown: readonly string[], moved: string): string[] {
  const at = shown.indexOf(moved);
  const rest = everything.filter((key) => key !== moved);
  if (at < 0) return [...everything];
  const next = shown[at + 1];
  const previous = shown[at - 1];
  const index = next !== undefined ? rest.indexOf(next) : previous !== undefined ? rest.indexOf(previous) + 1 : 0;
  rest.splice(index < 0 ? 0 : index, 0, moved);
  return rest;
}

/** `list` with the item at `from` moved to `to`. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
