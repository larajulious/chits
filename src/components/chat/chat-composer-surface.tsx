import type { PropsWithChildren } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useTheme } from '@/components/theme-provider';

export function ChatComposerSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { tokens } = useTheme();
  return <GlassSurface style={[styles.surface, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }, style]}>{children}</GlassSurface>;
}
const styles = StyleSheet.create({
  surface: { alignItems: 'stretch', minHeight: 56, paddingHorizontal: 8, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
});
