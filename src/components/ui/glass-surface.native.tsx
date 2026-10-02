import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useTheme } from '@/components/theme-provider';

export function GlassSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { scheme, tokens, styleTokens } = useTheme();
  // Sticky is solid paper, never glass.
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable() && styleTokens.elevation !== 'edge') return <GlassView glassEffectStyle="clear" tintColor={`${tokens.background}${scheme === 'dark' ? 'B8' : '80'}`} style={[styles.surface, { backgroundColor: tokens.surface }, style]}>{children}</GlassView>;
  return <View style={[styles.surface, { backgroundColor: tokens.surface }, style]}>{children}</View>;
}
const styles = StyleSheet.create({ surface: {} });
