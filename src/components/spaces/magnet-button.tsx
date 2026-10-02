import { memo } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { useInkSurface } from './ink-surface';

// A glossy red fridge magnet: a highlight up and to the left, a darker rim,
// shade on its underside, and a shadow where it meets the surface.
const GLOSS = 'radial-gradient(circle at 32% 28%, #F2856A 0%, #D8432A 46%, #A12B14 100%)';

type Props = {
  size: number;
  icon: 'add' | 'checkmark';
  /** Without it the magnet is a mark (e.g. "selected"), not a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** The round red magnet: "Stick a note" (60), and the check on a picked space (30). */
export const MagnetButton = memo(function MagnetButton({ size, icon, onPress, accessibilityLabel, style }: Props) {
  const inkSurface = useInkSurface();
  const face = [styles.face, {
    width: size, height: size, borderRadius: size / 2,
    experimental_backgroundImage: GLOSS,
    boxShadow: `inset 0px ${-size * 0.06}px ${size * 0.1}px rgba(0,0,0,0.3), 0px ${size * 0.08}px ${size * 0.16}px rgba(0,0,0,0.38)`,
  }, size >= 44 ? inkSurface({ radius: size / 2 }) : null];
  const glyph = <Icon name={icon} size={size * 0.46} color="#FFFFFF" />;
  if (!onPress) return <View accessible={false} importantForAccessibility="no-hide-descendants" style={[face, style]}>{glyph}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={Math.max(0, (44 - size) / 2)} onPress={onPress} style={({ pressed }) => [face, style, pressed && styles.pressed]}>{glyph}</Pressable>;
});

const styles = StyleSheet.create({
  face: { alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.94 }] },
});
