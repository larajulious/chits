import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useKeyboardInset } from '@/hooks/use-keyboard-inset';

/**
 * Fills its space and keeps its bottom edge above the keyboard, on iOS and
 * Android alike. It assumes it runs to the screen's bottom edge, less
 * `reservedBottom` the screen already keeps clear below it (a bottom
 * safe-area edge, for one).
 */
export function KeyboardPane({ reservedBottom = 0, style, children }: PropsWithChildren<{ reservedBottom?: number; style?: StyleProp<ViewStyle> }>) {
  const inset = useKeyboardInset();
  return <View style={[styles.pane, style, { paddingBottom: Math.max(0, inset - reservedBottom) }]}>{children}</View>;
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
});
