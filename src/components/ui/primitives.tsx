import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/components/theme-provider';
import { layout, spacing, tokens } from '@/constants/theme';
import { AppText } from './app-text';
import { ChitsLoader } from './chits-loader';
import { HeaderChromeContext, IconButton } from './controls';
import { PressableSurface, Surface, useStickySheet } from './surface';
import { TopBarBackground, useHeaderInk } from './top-bar';

export { HeaderIcon, MenuIcon, TopBarBackground, useHeaderInk } from './top-bar';
export { AppText, useFontStyle } from './app-text';
export { Button, Chip, ChipRow, IconButton, SegmentedControl } from './controls';
export { EmptyState } from './empty-state';
export { Icon } from './icon';
export { NoteCard, NoteCategory } from './note-card';
export { PressableSurface, Surface, useStickySheet, useStickySurface } from './surface';

export function Screen({ children, style, edges }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; edges?: Edge[] }>) { const { tokens: theme } = useTheme(); return <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: theme.background }, style]}>{children}</SafeAreaView>; }
export const AppScreen = Screen;
/**
 * A screen's header. Classic: a centered title with its subtitle under it.
 * Sticky: a large left-aligned title with the subtitle (a count) beside it,
 * and the side actions as outlined tiles.
 */
export function AppHeader({ title, subtitle, leading, trailing, actionWidth = layout.minimumTouchTarget }: { title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; actionWidth?: number }) {
  const { styleTokens: t, styleColors } = useTheme();
  const { ink, inkMuted, border, banded } = useHeaderInk();
  const h = t.header;
  if (h.align === 'left') return <HeaderChromeContext.Provider value>
    <View style={[styles.header, styles.headerLeft, { minHeight: h.minHeight }]}><TopBarBackground />
      {leading}
      <View style={styles.headerCopyLeft}>
        <AppText accessibilityRole="header" accessibilityLabel={title} variant="title" numberOfLines={1} ellipsizeMode="tail" style={[styles.headerTitleLeft, { color: ink, fontSize: h.titleSize, lineHeight: h.titleLineHeight }]}>{title}</AppText>
        {subtitle ? <AppText accessibilityLabel={subtitle} weight="700" numberOfLines={1} style={[styles.headerCount, { color: banded ? inkMuted : styleColors.textSecondary, fontSize: h.countSize }]}>{subtitle}</AppText> : null}
      </View>
      {trailing}
    </View>
  </HeaderChromeContext.Provider>;
  return <View style={[styles.header, { minHeight: h.minHeight, borderBottomColor: border, borderBottomWidth: StyleSheet.hairlineWidth }]}><TopBarBackground /><View style={[styles.headerSide, { width: actionWidth }]}>{leading}</View><View style={styles.headerCopy}><AppText accessibilityRole="header" accessibilityLabel={title} variant="title" numberOfLines={1} ellipsizeMode="tail" style={[styles.headerTitle, { color: ink, fontSize: h.titleSize }]}>{title}</AppText>{subtitle ? <AppText accessibilityLabel={subtitle} style={[styles.headerSubtitle, { color: inkMuted, fontSize: h.countSize }]}>{subtitle}</AppText> : null}</View><View style={[styles.headerSide, styles.headerSideTrailing, { width: actionWidth }]}>{trailing}</View></View>;
}
export function BackHeader({ title, onBack, trailing }: { title: string; onBack: () => void; trailing?: ReactNode }) { const { ink } = useHeaderInk(); return <AppHeader title={title} leading={<IconButton label="Go back" onPress={onBack}><Text style={[styles.backIcon, { color: ink }]}>‹</Text></IconButton>} trailing={trailing} />; }
export function Divider() { const { tokens: theme } = useTheme(); return <View style={[styles.divider, { backgroundColor: theme.borderSubtle }]} />; }
export function LoadingState({ label = 'Preparing Chits…' }: { label?: string }) { return <SafeAreaView style={[styles.screen, styles.loadingScreen, { backgroundColor: tokens.background }]}><ChitsLoader size="large" label={label} /></SafeAreaView>; }
export function FloatingSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { const { tokens: theme, styleTokens, styleColors } = useTheme(); return <Surface fill={styleTokens.outline.width ? styleColors.controlFill : theme.surface} border={theme.borderSubtle} radius={styleTokens.radius.panel} shadow="floating" style={style}>{children}</Surface>; }
export function BottomSheetSurface({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { const { tokens: theme, styleTokens } = useTheme(); const stickySheet = useStickySheet(); const r = styleTokens.radius.sheet; return <Surface fill={theme.surface} border={theme.borderSubtle} radius={{ topLeft: r, topRight: r, bottomRight: 0, bottomLeft: 0 }} edge={false} style={[stickySheet(), style]}>{children}</Surface>; }
/** A full-width-capable accent button (no pressed dimming under Classic, as before). */
export function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { const { tokens: theme, styleTokens, styleColors } = useTheme(); const sticky = styleTokens.elevation === 'edge'; return <PressableSurface accessibilityRole="button" disabled={disabled} onPress={onPress} fill={sticky ? styleColors.accentFill : theme.accent} radius={styleTokens.button.radius} edge={styleTokens.button.edge || false} pressedStyle={null} style={[styles.button, disabled && styles.disabled]}><AppText weight={sticky ? '800' : '700'} style={{ color: sticky ? styleColors.onAccent : theme.accentText }}>{label}</AppText></PressableSurface>; }
export function SecondaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) { const { tokens: theme, styleTokens, styleColors } = useTheme(); const sticky = styleTokens.elevation === 'edge'; return <PressableSurface accessibilityRole="button" disabled={disabled} onPress={onPress} fill={sticky ? styleColors.controlFill : theme.surfaceElevated} radius={styleTokens.button.radius} edge={styleTokens.button.edge || false} pressedStyle={null} style={[styles.button, disabled && styles.disabled]}><AppText weight={sticky ? '700' : '600'} style={{ color: theme.textPrimary }}>{label}</AppText></PressableSurface>; }
export function DestructiveAction({ label, onPress }: { label: string; onPress: () => void }) { const { tokens: theme } = useTheme(); return <Pressable accessibilityRole="button" onPress={onPress} style={styles.destructiveAction}><AppText weight="700" style={[styles.destructiveText, { color: theme.danger }]}>{label}</AppText></Pressable>; }
export function SectionHeader({ title }: { title: string }) { const { tokens: theme } = useTheme(); return <AppText accessibilityRole="header" weight="700" style={[styles.sectionHeader, { color: theme.textMuted }]}>{title}</AppText>; }
export function ListRow({ title, detail, onPress, trailing }: { title: string; detail?: string; onPress?: () => void; trailing?: ReactNode }) { const { tokens: theme } = useTheme(); return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={[styles.listRow, { borderBottomColor: theme.borderSubtle }]}><View style={styles.listCopy}><AppText style={[styles.listTitle, { color: theme.textPrimary }]}>{title}</AppText>{detail ? <AppText style={[styles.listDetail, { color: theme.textSecondary }]}>{detail}</AppText> : null}</View>{trailing}</Pressable>; }
export function Toast({ message }: { message: string | null }) { const { tokens: theme, styleTokens } = useTheme(); if (!message) return null; return <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.toastWrap}><Surface fill={theme.textPrimary} radius={styleTokens.radius.toast} shadow="toast" outline={false} edge={false} style={styles.toast}><AppText weight="600" style={[styles.toastText, { color: theme.background }]}>{message}</AppText></Surface></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md }, headerLeft: { gap: 10 }, headerCopyLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }, headerTitleLeft: { flexShrink: 1 }, headerCount: { flexShrink: 0, fontVariant: ['tabular-nums'] }, headerSide: { width: layout.minimumTouchTarget, alignItems: 'flex-start', justifyContent: 'center' }, headerSideTrailing: { alignItems: 'flex-end' }, headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' }, headerTitle: { width: '100%', flexShrink: 1, textAlign: 'center' }, headerSubtitle: { marginTop: 1 }, backIcon: { fontSize: 30, lineHeight: 30 }, disabled: { opacity: 0.35 }, divider: { height: StyleSheet.hairlineWidth }, loadingScreen: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, loadingText: { color: tokens.textSecondary, fontSize: 15 }, button: { minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, destructiveAction: { minHeight: layout.minimumTouchTarget, justifyContent: 'center', paddingHorizontal: spacing.md }, destructiveText: { textAlign: 'center' }, sectionHeader: { fontSize: 11, letterSpacing: 0.8, marginTop: spacing.lg, marginBottom: spacing.xs }, listRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth }, listCopy: { flex: 1 }, listTitle: { fontSize: 16 }, listDetail: { fontSize: 13, marginTop: 3 }, toastWrap: { position: 'absolute', right: 0, bottom: 96, left: 0, alignItems: 'center' }, toast: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs }, toastText: { fontSize: 14 },
});
