import { useDirection } from '@/localization/provider';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View, type TextInput } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls, useStickySurface } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Icon } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { resolveDialogPalette, type DialogType } from './dialog-colors';

export type DialogIconName = ComponentProps<typeof Ionicons>['name'];

const DEFAULT_ICON: Record<DialogType, DialogIconName> = {
  default: 'help-circle-outline',
  destructive: 'trash-outline',
  warning: 'warning-outline',
  success: 'checkmark-circle-outline',
  info: 'information-circle-outline',
};

export type ActionSheetOption = { label: string; icon?: DialogIconName; destructive?: boolean; disabled?: boolean; onPress: () => void };

type BaseProps = {
  visible: boolean;
  type: DialogType;
  title?: string;
  message?: string;
  icon?: DialogIconName;
  accentColor?: string | null;
  dismissOnBackdrop?: boolean;
  onRequestClose: () => void;
  onDismissComplete?: () => void;
};

/** Type-to-confirm: the primary action stays disabled until the field matches `value` (case and extra spaces ignored). */
export type RequireText = { value: string; label: string };

type ConfirmProps = BaseProps & {
  kind: 'confirm';
  confirmText: string;
  cancelText: string;
  loading?: boolean;
  requireText?: RequireText;
  onConfirm: () => void;
  onCancel: () => void;
};

const normalizeConfirmation = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

type AlertProps = BaseProps & {
  kind: 'alert';
  actionText: string;
  onAction: () => void;
};

type ActionSheetProps = BaseProps & {
  kind: 'actionSheet';
  options: ActionSheetOption[];
  cancelText: string;
  onCancel: () => void;
};

export type AppDialogProps = ConfirmProps | AlertProps | ActionSheetProps;

// Restrained motion per the Chits dialog spec: backdrop + card fade, a subtle
// 0.96 -> 1 scale on the card, no spring/bounce/overshoot. Runs on the UI thread
// via Reanimated so it stays smooth even while the caller's async work (e.g. a
// delete) runs on the JS thread.
export function AppDialog(props: AppDialogProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const { tokens: theme, scheme, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  const controls = useStickyControls();
  // Sticky: an outlined card on a solid edge; rows divided by ink lines.
  const rowDivider = styleTokens.outline.width ? styleColors.outline : theme.borderSubtle;
  const { visible, type, title, message, icon, accentColor, onRequestClose } = props;
  const dismissOnBackdrop = props.dismissOnBackdrop ?? true;
  const palette = resolveDialogPalette(type, theme, scheme, accentColor);
  const resolvedIcon = icon ?? DEFAULT_ICON[type];

  const [mounted, setMounted] = useState(visible);
  const [typed, setTyped] = useState('');
  const confirmInput = useRef<TextInput>(null);
  // Mount immediately when `visible` flips true (adjusting state during render,
  // per React's own guidance) — the fade-in itself still runs in the effect below.
  // The confirmation field is cleared once the dialog has finished closing.
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(visible ? 1 : 0);
  const finishClosing = () => {
    setMounted(false);
    setTyped('');
    if (Platform.OS !== 'ios') requestAnimationFrame(() => props.onDismissComplete?.());
  };

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(finishClosing)();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `mounted`/`progress` intentionally excluded: this effect only reacts to `visible` changing.
  }, [visible]);

  // Android hardware back button: while the modal owns focus, back should cancel
  // the dialog rather than fall through to the screen underneath.
  const requestCloseRef = useRef(onRequestClose);
  useEffect(() => { requestCloseRef.current = onRequestClose; });
  useEffect(() => {
    if (Platform.OS !== 'android' || !visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { requestCloseRef.current(); return true; });
    return () => subscription.remove();
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ scale: 0.96 + progress.value * 0.04 }] }));

  const isConfirm = props.kind === 'confirm';
  const isAlert = props.kind === 'alert';
  const isActionSheet = props.kind === 'actionSheet';
  const busy = isConfirm && Boolean(props.loading);
  const requireText = isConfirm ? props.requireText : undefined;
  const confirmBlocked = Boolean(requireText) && normalizeConfirmation(typed) !== normalizeConfirmation(requireText?.value ?? '');
  const confirmDisabled = busy || confirmBlocked;

  return (
    // A field focuses once the modal window is up; autoFocus is unreliable inside an Android modal.
    <Modal transparent visible={mounted} statusBarTranslucent onShow={requireText ? () => confirmInput.current?.focus() : undefined} onRequestClose={onRequestClose} onDismiss={props.onDismissComplete} animationType="none">
      {/* Only a dialog with a field needs to rise above the keyboard. */}
      <KeyboardAvoidingView behavior={requireText ? (Platform.OS === 'ios' ? 'padding' : 'height') : undefined} style={[styles.wrap, { direction: 'ltr' }]}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable
            accessible={false}
            style={StyleSheet.absoluteFill}
            disabled={!dismissOnBackdrop || busy}
            onPress={dismissOnBackdrop && !busy ? onRequestClose : undefined}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityRole="alert"
          accessibilityLabel={title}
          style={[styles.card, { backgroundColor: theme.surface }, sticky({ fill: styleColors.controlFill, radius: styleTokens.radius.panel, edge: styleTokens.emptyState.button.edge }), cardStyle]}
        >
          {isActionSheet ? null : (
            <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
              <Icon name={resolvedIcon} size={26} color={palette.iconColor} />
            </View>
          )}

          {title ? <AppText accessibilityRole="header" variant="display" style={[styles.title, { color: theme.textPrimary }]}>{title}</AppText> : null}
          {message ? <AppText style={[styles.message, { color: theme.textSecondary }]}>{message}</AppText> : null}

          {requireText ? (
            <View style={styles.confirmField}>
              <AppText nativeID="dialog-confirm-label" style={[styles.confirmLabel, { color: theme.textSecondary }]}>{requireText.label}</AppText>
              <AppTextInput
                accessibilityLabel={requireText.label}
                accessibilityLabelledBy="dialog-confirm-label"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                editable={!busy}
                value={typed}
                onChangeText={setTyped}
                ref={confirmInput}
                placeholder={requireText.value}
                placeholderTextColor={theme.textMuted}
                returnKeyType="done"
                onSubmitEditing={() => { if (isConfirm && !confirmDisabled) props.onConfirm(); }}
                selectionColor={palette.ctaBg}
                style={[styles.confirmInput, controls.input, { backgroundColor: theme.background, borderColor: confirmBlocked ? theme.borderSubtle : palette.ctaBg, color: theme.textPrimary }]}
              />
            </View>
          ) : null}

          {isConfirm ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.confirmText}
                accessibilityState={{ disabled: confirmDisabled, busy }}
                disabled={confirmDisabled}
                onPress={props.onConfirm}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.ctaBg }, sticky({ radius: styleTokens.button.radius, edge: styleTokens.button.edge }, pressed), pressed && !confirmDisabled && styles.pressed, busy && styles.busy, confirmBlocked && !busy && styles.disabled]}
              >
                {busy ? <ActivityIndicator color={palette.ctaText} /> : <AppText style={[styles.primaryButtonText, { color: palette.ctaText }]}>{props.confirmText}</AppText>}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.cancelText}
                disabled={busy}
                onPress={props.onCancel}
                style={({ pressed }) => [styles.cancelButton, pressed && !busy && styles.pressed, busy && styles.disabled]}
              >
                <AppText style={[styles.cancelText, { color: theme.textSecondary }]}>{props.cancelText}</AppText>
              </Pressable>
            </View>
          ) : null}

          {isAlert ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.actionText}
                onPress={props.onAction}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.ctaBg }, sticky({ radius: styleTokens.button.radius, edge: styleTokens.button.edge }, pressed), pressed && styles.pressed]}
              >
                <AppText style={[styles.primaryButtonText, { color: palette.ctaText }]}>{props.actionText}</AppText>
              </Pressable>
            </View>
          ) : null}

          {isActionSheet ? (
            <View style={styles.sheetOptions}>
              {props.options.map((option, index) => (
                <Pressable
                  key={option.label}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  disabled={option.disabled}
                  onPress={option.onPress}
                  style={({ pressed }) => [styles.sheetRow, rowStyle, index > 0 && { borderTopColor: rowDivider, borderTopWidth: StyleSheet.hairlineWidth }, pressed && !option.disabled && styles.pressed, option.disabled && styles.disabled]}
                >
                  {option.icon ? <Icon name={option.icon} size={18} color={option.destructive ? theme.danger : theme.textPrimary} /> : null}
                  <AppText style={[styles.sheetRowText, { color: option.destructive ? theme.danger : theme.textPrimary }]}>{option.label}</AppText>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.cancelText}
                onPress={props.onCancel}
                style={({ pressed }) => [styles.cancelButton, styles.sheetCancel, pressed && styles.pressed]}
              >
                <AppText style={[styles.cancelText, { color: theme.textSecondary }]}>{props.cancelText}</AppText>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,12,12,0.44)' },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 26,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  iconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing.xxs, paddingHorizontal: spacing.xs },
  confirmField: { width: '100%', marginTop: spacing.md, gap: spacing.xs },
  confirmLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  confirmInput: { minHeight: 48, width: '100%', borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 16 },
  actions: { width: '100%', marginTop: spacing.lg, gap: spacing.xxs },
  primaryButton: { minHeight: layout.minimumTouchTarget, width: '100%', borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  cancelButton: { minHeight: layout.minimumTouchTarget, width: '100%', alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '600' },
  sheetOptions: { width: '100%', marginTop: spacing.lg, gap: 0 },
  sheetRow: { minHeight: 50, width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  sheetRowText: { fontSize: 16, flex: 1 },
  sheetCancel: { marginTop: spacing.sm },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
  busy: { opacity: 0.9 },
});
