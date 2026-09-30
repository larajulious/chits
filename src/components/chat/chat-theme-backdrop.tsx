import { memo, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';

// Deterministic scatter: the same spots on every launch and every render.
const scatter = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * The theme's own quiet decoration behind Chat (a few dots for Friends, soft
 * shapes for Love…). Shown only when the user hasn't chosen a Chat background
 * photo — their photo always wins. Kept to a few dozen static views at very
 * low opacity so it never competes with the conversation.
 */
export const ChatThemeBackdrop = memo(function ChatThemeBackdrop() {
  const { tokens, look } = useTheme();
  const { width, height } = useWindowDimensions();
  if (look.chatPattern === 'none') return null;
  const ink = tokens.accent;
  let shapes: ReactNode = null;
  if (look.chatPattern === 'soft-shapes') {
    shapes = <>
      <View style={[styles.shape, { left: width - 150, top: -90, width: 280, height: 280, borderRadius: 140, backgroundColor: ink, opacity: 0.06 }]} />
      <View style={[styles.shape, { left: -120, top: height * 0.55, width: 240, height: 240, borderRadius: 120, backgroundColor: ink, opacity: 0.05 }]} />
    </>;
  } else if (look.chatPattern === 'dots') {
    shapes = Array.from({ length: 36 }, (_, index) => {
      const size = 4 + scatter(index, 1) * 5;
      return <View key={index} style={[styles.shape, { left: scatter(index, 2) * width, top: scatter(index, 3) * height, width: size, height: size, borderRadius: size / 2, backgroundColor: ink, opacity: 0.1 + scatter(index, 4) * 0.06 }]} />;
    });
  } else if (look.chatPattern === 'cross') {
    // A quiet cross standing behind the conversation, a reminder of Jesus Christ.
    const length = Math.min(height * 0.5, width * 1.1);
    const beam = Math.max(16, width * 0.05);
    const top = height * 0.2;
    // One opacity for the whole cross, so the crossing point doesn't darken.
    shapes = <View style={[StyleSheet.absoluteFill, { opacity: 0.07 }]}>
      <View style={[styles.shape, { left: (width - beam) / 2, top, width: beam, height: length, borderRadius: beam / 3, backgroundColor: ink }]} />
      <View style={[styles.shape, { left: (width - length * 0.62) / 2, top: top + length * 0.28 - beam / 2, width: length * 0.62, height: beam, borderRadius: beam / 3, backgroundColor: ink }]} />
    </View>;
  } else if (look.chatPattern === 'grain') {
    // Fine analog grain: many tiny specks in the text color, barely there.
    shapes = Array.from({ length: 90 }, (_, index) => {
      const size = 1.5 + scatter(index, 13) * 1.5;
      return <View key={index} style={[styles.shape, { left: scatter(index, 14) * width, top: scatter(index, 15) * height, width: size, height: size, borderRadius: size / 2, backgroundColor: tokens.textPrimary, opacity: 0.07 + scatter(index, 16) * 0.05 }]} />;
    });
  } else if (look.chatPattern === 'geometric') {
    // A few floating rings, tiles and dots — soft depth, never busy.
    const colors = look.patternColors ?? [tokens.accent, tokens.accentBorder];
    shapes = Array.from({ length: 9 }, (_, index) => {
      const kind = index % 3;
      const size = kind === 2 ? 10 + scatter(index, 17) * 10 : 34 + scatter(index, 17) * 46;
      return <View key={index} style={[styles.shape, {
        left: scatter(index, 18) * (width - size / 2), top: scatter(index, 19) * height, width: size, height: size,
        borderRadius: kind === 1 ? size * 0.28 : size / 2,
        ...(kind === 0 ? { borderWidth: Math.max(3, size * 0.12), borderColor: colors[index % colors.length] } : { backgroundColor: colors[index % colors.length] }),
        opacity: 0.12, transform: [{ rotate: `${Math.round(scatter(index, 20) * 40 - 20)}deg` }],
      }]} />;
    });
  } else if (look.chatPattern === 'confetti') {
    const colors = look.patternColors ?? [tokens.accent, tokens.accentBorder, tokens.accentStrong];
    shapes = Array.from({ length: 22 }, (_, index) => {
      const bar = index % 3 === 2;
      const size = 6 + scatter(index, 5) * 7;
      return <View key={index} style={[styles.shape, {
        left: scatter(index, 6) * width, top: scatter(index, 7) * height,
        width: bar ? size * 2.2 : size, height: bar ? size * 0.5 : size, borderRadius: index % 3 === 0 ? size : 2,
        backgroundColor: colors[index % colors.length], opacity: 0.14, transform: [{ rotate: `${Math.round(scatter(index, 8) * 180)}deg` }],
      }]} />;
    });
  }
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.backdrop, { width, height }]}>{shapes}</View>;
});

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
  shape: { position: 'absolute' },
});
