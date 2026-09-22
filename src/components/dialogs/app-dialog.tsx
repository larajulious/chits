import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, BackHandler, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/components/theme-provider';
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
};

type ConfirmProps = BaseProps & {
  kind: 'confirm';
  confirmText: string;
  cancelText: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

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
  const { tokens: theme, scheme } = useTheme();
  const { visible, type, title, message, icon, accentColor, onRequestClose } = props;
  const dismissOnBackdrop = props.dismissOnBackdrop ?? true;
  const palette = resolveDialogPalette(type, theme, scheme, accentColor);
  const resolvedIcon = icon ?? DEFAULT_ICON[type];

  const [mounted, setMounted] = useState(visible);
  // Mount immediately when `visible` flips true (adjusting state during render,
  // per React's own guidance) — the fade-in itself still runs in the effect below.
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      progress.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    } else if (mounted) {
      progress.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
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

  if (!mounted) return null;

  const isConfirm = props.kind === 'confirm';
  const isAlert = props.kind === 'alert';
  const isActionSheet = props.kind === 'actionSheet';
  const busy = isConfirm && Boolean(props.loading);

  return (
    <Modal transparent visible={mounted} statusBarTranslucent onRequestClose={onRequestClose} animationType="none">
      <View style={styles.wrap}>
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
          style={[styles.card, { backgroundColor: theme.surface }, cardStyle]}
        >
          {isActionSheet ? null : (
            <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
              <Ionicons accessible={false} name={resolvedIcon} size={26} color={palette.iconColor} />
            </View>
          )}

          {title ? <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{title}</Text> : null}
          {message ? <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text> : null}

          {isConfirm ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.confirmText}
                accessibilityState={{ disabled: busy, busy }}
                disabled={busy}
                onPress={props.onConfirm}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.ctaBg }, pressed && !busy && styles.pressed, busy && styles.busy]}
              >
                {busy ? <ActivityIndicator color={palette.ctaText} /> : <Text style={[styles.primaryButtonText, { color: palette.ctaText }]}>{props.confirmText}</Text>}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.cancelText}
                disabled={busy}
                onPress={props.onCancel}
                style={({ pressed }) => [styles.cancelButton, pressed && !busy && styles.pressed, busy && styles.disabled]}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{props.cancelText}</Text>
              </Pressable>
            </View>
          ) : null}

          {isAlert ? (
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.actionText}
                onPress={props.onAction}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: palette.ctaBg }, pressed && styles.pressed]}
              >
                <Text style={[styles.primaryButtonText, { color: palette.ctaText }]}>{props.actionText}</Text>
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
                  style={({ pressed }) => [styles.sheetRow, index > 0 && { borderTopColor: theme.borderSubtle, borderTopWidth: StyleSheet.hairlineWidth }, pressed && !option.disabled && styles.pressed, option.disabled && styles.disabled]}
                >
                  {option.icon ? <Ionicons accessible={false} name={option.icon} size={18} color={option.destructive ? theme.danger : theme.textPrimary} /> : null}
                  <Text style={[styles.sheetRowText, { color: option.destructive ? theme.danger : theme.textPrimary }]}>{option.label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={props.cancelText}
                onPress={props.onCancel}
                style={({ pressed }) => [styles.cancelButton, styles.sheetCancel, pressed && styles.pressed]}
              >
                <Text style={[styles.cancelText, { color: theme.textSecondary }]}>{props.cancelText}</Text>
              </Pressable>
            </View>
          ) : null}
        </Animated.View>
      </View>
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
