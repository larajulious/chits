import type { PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useTheme } from '@/components/theme-provider';

export function GlassSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { scheme, tokens } = useTheme();
  if (Platform.OS === 'ios' && isGlassEffectAPIAvailable()) return <GlassView glassEffectStyle="clear" tintColor={scheme === 'dark' ? '#121311B8' : '#FFFFFF80'} style={[styles.surface, { backgroundColor: tokens.surface }, style]}>{children}</GlassView>;
  return <View style={[styles.surface, { backgroundColor: tokens.surface }, style]}>{children}</View>;
}
const styles = StyleSheet.create({ surface: {} });
