import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PaperDesk, PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { Screen } from '@/components/ui/primitives';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection } from '@/localization/provider';

export function useCanvasPresentation() {
  const { scheme } = useTheme();
  const desk = useDesk();
  return { desk, fonts: useWelcomeFonts(), ...useDirection(), ...welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW }) };
}
export function CanvasPage({ header, children }: { header: ReactNode; children: ReactNode }) {
  const { desk } = useCanvasPresentation();
  return <Screen edges={['top', 'bottom', 'left', 'right']} style={{ backgroundColor: desk.desk }}>{header}<PaperDesk faint>{children}</PaperDesk></Screen>;
}
export function CanvasTool({ label, icon, onPress, selected = false, iconOnly = false }: { label: string; icon?: ComponentProps<typeof Icon>['name']; onPress: () => void; selected?: boolean; iconOnly?: boolean }) {
  const ui = useCanvasPresentation();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.tool, { backgroundColor: selected ? PAPER_YELLOW : pressed ? ui.track : 'transparent' }, iconOnly && styles.iconTool]}>
    {icon ? <Icon name={icon} size={20} color={selected ? PAPER_INK : ui.ink} /> : null}
    {!iconOnly ? <AppText family={ui.fonts.textBold} numberOfLines={1} style={{ color: selected ? PAPER_INK : ui.ink, fontSize: 11, lineHeight: 15 }}>{label}</AppText> : null}
  </Pressable>;
}
export const canvasStyles = StyleSheet.create({
  page: { flex: 1 },
  inset: { paddingHorizontal: 16 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toolbar: { borderRadius: 24, padding: 6, borderWidth: StyleSheet.hairlineWidth },
  dock: { position: 'absolute', bottom: 12, left: 12, right: 12, borderRadius: 24, padding: 6, borderWidth: StyleSheet.hairlineWidth },
  row: { alignItems: 'center', gap: 12 },
  card: { padding: 14, borderRadius: 16, alignItems: 'center', gap: 16 },
  heading: { fontSize: 28, lineHeight: 34 },
  caption: { fontSize: 14, lineHeight: 20 },
  titleInput: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 20, padding: 0 },
});
const styles = StyleSheet.create({
  tool: { minWidth: 48, minHeight: 48, paddingHorizontal: 9, paddingVertical: 5, gap: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  iconTool: { width: 44, minWidth: 44, minHeight: 44 },
});
