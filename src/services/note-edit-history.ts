import type { NoteCursor, NoteDraftBlock } from './note-content.ts';

type Snapshot = { blocks: NoteDraftBlock[]; cursor: NoteCursor };

/** Session-local history. Call reset when external content or image files change. */
export function createNoteEditHistory(limit = 100) {
  let past: Snapshot[] = [], future: Snapshot[] = [];
  return {
    record(snapshot: Snapshot) { past.push(snapshot); if (past.length > limit) past.shift(); future = []; },
    travel(direction: 'undo' | 'redo', current: Snapshot) {
      const target = (direction === 'undo' ? past : future).pop();
      if (target) (direction === 'undo' ? future : past).push(current);
      return target;
    },
    reset() { past = []; future = []; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
