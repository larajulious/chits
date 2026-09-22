import { createContext, useCallback, useContext, useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from 'react';
import { AppDialog, type ActionSheetOption, type DialogIconName } from './app-dialog';
import type { DialogType } from './dialog-colors';

export type ConfirmOptions = {
  type?: DialogType;
  title: string;
  message?: string;
  icon?: DialogIconName;
  confirmText?: string;
  cancelText?: string;
  /** Board/card accent hex to tint the icon + primary CTA with (ignored for `destructive`, which always uses the semantic danger color). */
  accentColor?: string | null;
  dismissOnBackdrop?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
};

export type AlertOptions = {
  type?: DialogType;
  title: string;
  message?: string;
  icon?: DialogIconName;
  actionText?: string;
  accentColor?: string | null;
  onDismiss?: () => void | Promise<void>;
};

export type ActionSheetOptions = {
  title?: string;
  message?: string;
  options: ActionSheetOption[];
  cancelText?: string;
};

type AppDialogContextValue = {
  confirm: (options: ConfirmOptions) => void;
  alert: (options: AlertOptions) => void;
  actionSheet: (options: ActionSheetOptions) => void;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; loading: boolean }
  | { kind: 'alert'; options: AlertOptions }
  | { kind: 'actionSheet'; options: ActionSheetOptions }
  | null;

// Single active dialog is enough: every call site in Chits triggers a dialog from
// a direct user action (a tap), so calls never legitimately overlap. A newer call
// simply replaces whatever's showing.
export function AppDialogProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<DialogState>(null);
  const [visible, setVisible] = useState(false);
  const closingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    // Keep `state` mounted through the closing fade so content doesn't pop away
    // before the animation finishes; AppDialog's own effect drives the fade.
    if (closingTimer.current) clearTimeout(closingTimer.current);
    closingTimer.current = setTimeout(() => setState(null), 220);
  }, []);

  const open = useCallback((next: DialogState) => {
    if (closingTimer.current) clearTimeout(closingTimer.current);
    setState(next);
    setVisible(true);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => open({ kind: 'confirm', options, loading: false }), [open]);
  const alert = useCallback((options: AlertOptions) => open({ kind: 'alert', options }), [open]);
  const actionSheet = useCallback((options: ActionSheetOptions) => open({ kind: 'actionSheet', options }), [open]);

  const value = useMemo(() => ({ confirm, alert, actionSheet }), [confirm, alert, actionSheet]);

  const handleConfirmPrimary = useCallback(async () => {
    if (!state || state.kind !== 'confirm') return;
    const { onConfirm } = state.options;
    setState((current) => (current && current.kind === 'confirm' ? { ...current, loading: true } : current));
    try {
      await onConfirm();
      dismiss();
    } catch {
      // Failure stays on the dialog rather than silently closing — the caller's
      // own error surface (a notice/toast) is expected to explain what happened;
      // this just stops pretending the action succeeded and re-enables retry.
      setState((current) => (current && current.kind === 'confirm' ? { ...current, loading: false } : current));
    }
  }, [state, dismiss]);

  const handleConfirmCancel = useCallback(() => {
    if (!state || state.kind !== 'confirm' || state.loading) return;
    const { onCancel } = state.options;
    dismiss();
    void onCancel?.();
  }, [state, dismiss]);

  const handleAlertAction = useCallback(() => {
    if (!state || state.kind !== 'alert') return;
    const { onDismiss } = state.options;
    dismiss();
    void onDismiss?.();
  }, [state, dismiss]);

  let dialogElement: ReactNode = null;
  if (state?.kind === 'confirm') {
    const { options, loading } = state;
    dialogElement = (
      <AppDialog
        kind="confirm"
        visible={visible}
        type={options.type ?? 'default'}
        title={options.title}
        message={options.message}
        icon={options.icon}
        accentColor={options.accentColor}
        dismissOnBackdrop={(options.dismissOnBackdrop ?? true) && !loading}
        confirmText={options.confirmText ?? 'Confirm'}
        cancelText={options.cancelText ?? 'Cancel'}
        loading={loading}
        onConfirm={() => void handleConfirmPrimary()}
        onCancel={handleConfirmCancel}
        onRequestClose={handleConfirmCancel}
      />
    );
  } else if (state?.kind === 'alert') {
    const { options } = state;
    dialogElement = (
      <AppDialog
        kind="alert"
        visible={visible}
        type={options.type ?? 'info'}
        title={options.title}
        message={options.message}
        icon={options.icon}
        accentColor={options.accentColor}
        actionText={options.actionText ?? 'OK'}
        onAction={handleAlertAction}
        onRequestClose={handleAlertAction}
      />
    );
  } else if (state?.kind === 'actionSheet') {
    const { options } = state;
    dialogElement = (
      <AppDialog
        kind="actionSheet"
        visible={visible}
        type="default"
        title={options.title}
        message={options.message}
        options={options.options.map((option) => ({ ...option, onPress: () => { dismiss(); option.onPress(); } }))}
        cancelText={options.cancelText ?? 'Cancel'}
        onCancel={dismiss}
        onRequestClose={dismiss}
      />
    );
  }

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      {dialogElement}
    </AppDialogContext.Provider>
  );
}

export function useAppDialog() {
  const value = useContext(AppDialogContext);
  if (!value) throw new Error('useAppDialog must be used within AppDialogProvider.');
  return value;
}
