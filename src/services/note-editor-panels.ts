export type NoteEditorPanelState = Readonly<{
  mode: 'typing' | 'formatting' | 'idle';
  sheet: 'closed' | 'open' | 'closing';
  keyboardVisible: boolean;
  keyboardClosing: boolean;
  keyboardOpening: boolean;
  resumePending: boolean;
}>;
type Actions = { suppressKeyboard: (value: boolean) => void; hideKeyboard: () => void; resumeKeyboard: () => void };

/** One coordinator per editor. Native keyboard events and sheet completion,
 * rather than delays, decide when the other surface may open. */
export function createNoteEditorPanels(actions: Actions = { suppressKeyboard: () => {}, hideKeyboard: () => {}, resumeKeyboard: () => {} }, keyboardVisible = false) {
  let state: NoteEditorPanelState = { mode: 'typing', sheet: 'closed', keyboardVisible, keyboardClosing: false, keyboardOpening: false, resumePending: false };
  const listeners = new Set<(state: NoteEditorPanelState) => void>();
  let disposed = false;
  const update = (patch: Partial<NoteEditorPanelState>) => {
    if (disposed || Object.entries(patch).every(([key, value]) => state[key as keyof NoteEditorPanelState] === value)) return;
    state = { ...state, ...patch };
    listeners.forEach(listener => listener(state));
  };
  const settle = () => {
    if (disposed || state.sheet !== 'closed' || state.keyboardClosing) return;
    if (state.resumePending) {
      update({ resumePending: false, keyboardOpening: !state.keyboardVisible });
      actions.resumeKeyboard();
    } else if (state.mode === 'idle') actions.suppressKeyboard(false);
  };
  return {
    configure(next: Actions) { actions = next; },
    getState: () => state,
    subscribe: (listener: (state: NoteEditorPanelState) => void) => {
      listeners.add(listener); listener(state);
      return () => { listeners.delete(listener); };
    },
    openFormatting() {
      if (disposed) return;
      actions.suppressKeyboard(true);
      update({ mode: 'formatting', resumePending: false, keyboardOpening: false, keyboardClosing: state.keyboardVisible || state.keyboardClosing, sheet: state.keyboardVisible || state.keyboardClosing ? 'closed' : 'open' });
      actions.hideKeyboard();
    },
    requestTyping(force = false) {
      if (disposed || !force && state.mode === 'typing' && state.sheet === 'closed' && !state.keyboardClosing) return false;
      update({ mode: 'typing', resumePending: true, sheet: state.sheet === 'open' ? 'closing' : state.sheet });
      settle();
      return true;
    },
    dismiss() {
      if (disposed || state.sheet === 'closed' && state.mode !== 'formatting' && !state.keyboardVisible && !state.keyboardClosing && !state.keyboardOpening) return false;
      update({ mode: 'idle', resumePending: false, keyboardOpening: false, sheet: state.sheet === 'open' ? 'closing' : state.sheet, keyboardClosing: state.keyboardVisible || state.keyboardClosing });
      actions.hideKeyboard();
      settle();
      return true;
    },
    keyboardChanged(visible: boolean) {
      if (disposed) return;
      update({ keyboardVisible: visible, ...(visible ? { keyboardOpening: false } : { keyboardClosing: false }) });
      if (visible && (state.mode === 'formatting' || state.sheet !== 'closed' || state.keyboardClosing)) {
        update({ keyboardClosing: true });
        actions.hideKeyboard();
      } else if (!visible && state.mode === 'formatting' && state.sheet !== 'closing') update({ sheet: 'open' });
      settle();
    },
    sheetClosed() {
      if (disposed || state.sheet !== 'closing') return;
      update({ sheet: 'closed' });
      settle();
    },
    reset() {
      if (disposed) return;
      update({ mode: state.keyboardVisible ? 'typing' : 'idle', sheet: 'closed', keyboardClosing: false, keyboardOpening: false, resumePending: false });
      actions.suppressKeyboard(false);
    },
    activate() { disposed = false; },
    dispose() { disposed = true; listeners.clear(); },
  };
}
export type NoteEditorPanels = ReturnType<typeof createNoteEditorPanels>;
