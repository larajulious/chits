// The tour demos' rules, as plain data. Everything here lives in component state
// and disappears with the screen: nothing in a demo ever reaches the database.

// --- Boards ---------------------------------------------------------------

export const DEMO_COLUMNS = 3;
export type DemoCardId = 'trip' | 'paint' | 'dentist';
export type DemoCard = { id: DemoCardId; column: number };
export const DEMO_CARDS: readonly DemoCard[] = [{ id: 'trip', column: 0 }, { id: 'paint', column: 0 }, { id: 'dentist', column: 2 }];

/** The card goes to the bottom of its new column; dropped where it started, nothing changes. */
export function moveDemoCard(cards: readonly DemoCard[], id: DemoCardId, column: number): readonly DemoCard[] {
  const card = cards.find((item) => item.id === id);
  if (!card || card.column === column) return cards;
  return [...cards.filter((item) => item.id !== id), { id, column }];
}

/** How far down its column a card sits. */
export const demoCardRow = (cards: readonly DemoCard[], id: DemoCardId) => {
  const column = cards.find((item) => item.id === id)?.column;
  return cards.filter((item) => item.column === column).findIndex((item) => item.id === id);
};

/** Where a column sits on screen. Right-to-left boards run the other way. */
export const demoVisualColumn = (column: number, rtl: boolean) => {
  'worklet';
  return rtl ? DEMO_COLUMNS - 1 - column : column;
};

/** The column under a point. Runs on the UI thread while a card is dragged. */
export function demoColumnAt(x: number, columnWidth: number, gap: number, rtl: boolean) {
  'worklet';
  const visual = Math.min(DEMO_COLUMNS - 1, Math.max(0, Math.floor(x / (columnWidth + gap))));
  return demoVisualColumn(visual, rtl);
}

// --- Focus ----------------------------------------------------------------

/** One minute, so the ring visibly moves. The real timer's length is the person's own. */
export const DEMO_FOCUS_MS = 60_000;
export type DemoFocusStatus = 'ready' | 'running' | 'paused' | 'completed';
export type DemoFocus = { status: DemoFocusStatus; leftMs: number };
export type DemoFocusAction = 'start' | 'pause' | 'tick' | 'reset';
export const DEMO_FOCUS_START: DemoFocus = { status: 'ready', leftMs: DEMO_FOCUS_MS };

export function demoFocusReducer(state: DemoFocus, action: DemoFocusAction): DemoFocus {
  switch (action) {
    case 'start': return state.status === 'ready' || state.status === 'paused' ? { ...state, status: 'running' } : state;
    case 'pause': return state.status === 'running' ? { ...state, status: 'paused' } : state;
    case 'tick': {
      if (state.status !== 'running') return state;
      const leftMs = Math.max(0, state.leftMs - 1000);
      return { leftMs, status: leftMs === 0 ? 'completed' : 'running' };
    }
    case 'reset': return DEMO_FOCUS_START;
  }
}

// --- Plan -----------------------------------------------------------------

export const DEMO_TASKS = ['one', 'two', 'three'] as const;
export type DemoTaskId = typeof DEMO_TASKS[number];

export const toggleDemoTask = (done: readonly DemoTaskId[], id: DemoTaskId): readonly DemoTaskId[] =>
  done.includes(id) ? done.filter((item) => item !== id) : [...done, id];

/** Chits' line for a tick, using the planner's own: first, past half, all done. */
export function demoPlanLine(done: number): 'plan.say.first' | 'plan.say.half' | 'plan.say.all' | null {
  if (done >= DEMO_TASKS.length) return 'plan.say.all';
  if (done === 2) return 'plan.say.half';
  return done === 1 ? 'plan.say.first' : null;
}
