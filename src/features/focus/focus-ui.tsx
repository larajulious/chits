import { type ComponentProps, type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { useDirection } from '@/localization/provider';
import { tr } from '@/localization/runtime';
// Reuse the established, theme-aware quiet and primary action controls.
export { RevisitAction as FocusAction } from '@/features/revisit/revisit-components';

export function focusErrorMessage(cause: unknown) {
  const expected = ['focus.activeOther','focus.unavailable','focus.conflict','focus.invalidDuration','focus.captureError'].map((key) => tr(key));
  return cause instanceof Error && expected.includes(cause.message) ? cause.message : tr('focus.error');
}

export function FocusText({ style, ...props }: ComponentProps<typeof AppText>) {
  const { tokens } = useTheme();
  return <AppText {...props} style={[{ color: tokens.textPrimary }, style]} />;
}

export function FocusCompanion({ message, small = false }: { message?: string; small?: boolean }) {
  const { rowStyle } = useDirection();
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  // The approved mascot, rendered as a still image: no competing character,
  // animation loop, WebView, new pose or color changes during concentration.
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(180)} style={[styles.companion, rowStyle]}>
    <Image accessible={false} source={require('@/assets/images/chits-mascot-animated.svg')} contentFit="contain" style={{ width: small ? 32 : 64, height: small ? 32 : 64 }} />
    {message ? <AppText style={[styles.message, { color: tokens.textSecondary }]}>{message}</AppText> : null}
  </Animated.View>;
}
export function FocusReveal({ children }: PropsWithChildren) {
  const reduced = useReducedMotion();
  return <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} layout={reduced ? undefined : LinearTransition.duration(160)}>{children}</Animated.View>;
}
export const focusStyles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  panel: { padding: spacing.md, gap: spacing.sm },
  flex: { flex: 1 },
  input: { minHeight: 48, padding: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, fontSize: 16 },
});
const styles = StyleSheet.create({ companion: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, message: { flex: 1, fontSize: 14, lineHeight: 21 } });
