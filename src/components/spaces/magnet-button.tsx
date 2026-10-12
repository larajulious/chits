import { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/components/theme-provider';
import { luminance, mix } from '@/constants/style-tokens';
import { useInkSurface, useSpaceUI } from './ink-surface';

// A glossy accent-colored control; decorative pin magnets keep their own colors.

type Props = {
  size: number;
  icon: 'add' | 'checkmark';
  /** Without it the magnet is a mark (e.g. "selected"), not a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** The themed add control and accent-colored selection mark on a picked space. */
export const MagnetButton = memo(function MagnetButton({ size, icon, onPress, accessibilityLabel, style }: Props) {
  const inkSurface = useInkSurface();
  const ui = useSpaceUI();
  const { styleTokens } = useTheme();
  const radius = onPress && size >= 44 ? styleTokens.header.iconButton.radius : size / 2;
  const shine = mix(ui.accent, luminance(ui.accentText) > 0.5 ? '#000000' : '#FFFFFF', 0.14);
  const gloss = `radial-gradient(circle at 32% 28%, ${shine} 0%, ${ui.accent} 60%, ${ui.accent} 100%)`;
  const face = [styles.face, {
    width: size, height: size, borderRadius: radius,
    backgroundColor: ui.accent,
    experimental_backgroundImage: gloss,
    boxShadow: `inset 0px ${-size * 0.06}px ${size * 0.1}px rgba(0,0,0,0.3), 0px ${size * 0.08}px ${size * 0.16}px rgba(0,0,0,0.38)`,
  }, size >= 44 ? inkSurface({ radius }) : null];
  const glyph = <Icon name={icon} size={size * 0.46} color={ui.accentText} />;
  if (!onPress) return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[face, style]}>{glyph}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={Math.max(0, (44 - size) / 2)} onPress={onPress} style={({ pressed }) => [face, style, pressed && styles.pressed]}>{glyph}</Pressable>;
});

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.94 }] },
});
