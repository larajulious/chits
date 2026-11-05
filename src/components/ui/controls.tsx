import { createContext, useContext, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { layout, spacing } from '@/constants/theme';
import { AppText } from './app-text';
import { PressableSurface, surfaceStyle, useStickySurface } from './surface';

/** True inside a screen header, so its icon buttons dress as header chrome. */
export const HeaderChromeContext = createContext(false);
/** The ink for a glyph on an icon-button tile; null when there's no tile. */
export const TileInkContext = createContext<string | null>(null);

/** Layout and touch size; the smaller filled surface sits inside it. */
export const HEADER_ICON_BUTTON_SIZE = layout.minimumTouchTarget;
const HEADER_ICON_SURFACE_SIZE = 40;
type HeaderIconButtonProps = Omit<PressableProps, 'style' | 'children' | 'disabled' | 'accessibilityLabel'> & {
  label: string;
  children: ReactNode;
  disabled?: boolean;
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** One filled header control for screen headers, viewers and custom top bars. */
export function HeaderIconButton({ label, children, disabled = false, accent = false, style, accessibilityState, ...props }: HeaderIconButtonProps) {
  const { tokens, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  const reduced = useReducedMotion();
  const ink = accent ? (styleTokens.elevation === 'edge' ? styleColors.onAccent : tokens.accentText) : tokens.textPrimary;
  const radius = Math.min(styleTokens.header.iconButton.radius, HEADER_ICON_SURFACE_SIZE / 2);
  return <Pressable
    {...props}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ ...accessibilityState, disabled }}
    disabled={disabled}
    style={({ pressed }) => [
      styles.headerIconButton,
      style,
      disabled && styles.disabled,
      pressed && styles.headerPressed,
      pressed && !reduced && styles.headerPressedScale,
    ]}
  >{({ pressed }) => <View pointerEvents="none" style={[
    styles.headerIconSurface,
    { backgroundColor: accent ? tokens.accent : tokens.surfaceElevated, borderRadius: radius },
    sticky({ fill: accent ? styleColors.accentFill : styleColors.controlFill, radius, edge: styleTokens.header.iconButton.edge }, pressed),
  ]}>
    <View style={styles.headerIconContent}><TileInkContext.Provider value={ink}>{children}</TileInkContext.Provider></View>
  </View>}</Pressable>;
}

/**
 * Screen headers use the shared filled control. Other inline controls retain
 * their existing 44pt target and unfilled appearance.
 */
export function IconButton({ label, children, onPress, disabled = false, chrome, accent = false }: PropsWithChildren<{ label: string; onPress?: () => void; disabled?: boolean; chrome?: boolean; accent?: boolean }>) {
  const inHeader = useContext(HeaderChromeContext);
  if (chrome ?? inHeader) return <HeaderIconButton label={label} onPress={onPress} disabled={disabled} accent={accent}>{children}</HeaderIconButton>;
  const size = layout.minimumTouchTarget;
  return <PressableSurface
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    hitSlop={8}
    onPress={onPress}
    radius={size / 2}
    outline={false}
    edge={false}
    style={[styles.iconButton, { width: size, height: size }, disabled && styles.disabled]}
  ><TileInkContext.Provider value={null}>{children}</TileInkContext.Provider></PressableSurface>;
}

/** A filled call-to-action in the accent. `size="large"` is an empty state's. */
export function Button({ label, onPress, disabled = false, size = 'regular', style }: { label: string; onPress: () => void; disabled?: boolean; size?: 'regular' | 'large'; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Refresh native label rendering across palette/script changes.
  const { tokens, styleTokens: t, styleColors } = useTheme();
  const shape = size === 'large' ? t.emptyState.button : { height: layout.minimumTouchTarget, ...t.button };
  const sticky = t.elevation === 'edge';
  return <PressableSurface
    accessibilityRole="button"
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    fill={sticky ? styleColors.accentFill : tokens.accent}
    radius={shape.radius}
    edge={shape.edge || false}
    pressedStyle={styles.buttonPressed}
    style={[styles.button, { minHeight: shape.height, paddingHorizontal: size === 'large' ? spacing.lg : spacing.md }, disabled && styles.disabled, style]}
  >
    <AppText weight={sticky ? '800' : '700'} style={[styles.buttonText, size === 'large' && styles.buttonTextLarge, { color: sticky ? styleColors.onAccent : tokens.accentText }]}>{label}</AppText>
  </PressableSurface>;
}

/**
 * A filter chip. Classic: a soft accent tint marks the selection. Sticky:
 * outlined pills — the selected one filled with the accent on a small edge.
 */
export function Chip({ label, count, selected, onPress, accessibilityLabel }: { label: string; count?: number; selected: boolean; onPress: () => void; accessibilityLabel: string }) {
  const { tokens, styleTokens: t, styleColors } = useTheme();
  const { fontScale } = useWindowDimensions();
  const sticky = t.elevation === 'edge';
  const fill = sticky ? (selected ? styleColors.accentFill : styleColors.controlFill) : selected ? tokens.accentSoft : 'transparent';
  const ink = sticky ? (selected ? styleColors.onAccent : tokens.textPrimary) : selected ? tokens.accentStrong : tokens.textSecondary;
  const countInk = sticky ? ink : selected ? tokens.accentStrong : tokens.textMuted;
  return <PressableSurface
    accessibilityRole="button"
    accessibilityState={{ selected }}
    accessibilityLabel={accessibilityLabel}
    onPress={onPress}
    fill={fill}
    radius={t.chip.radius}
    border={selected ? tokens.accentBorder : 'transparent'}
    edge={selected && t.chip.activeEdge ? t.chip.activeEdge : false}
    pressedStyle={null}
    style={[styles.chip, { height: chipHeight(t.chip.height, t.chip.labelSize, fontScale), paddingHorizontal: t.chip.paddingHorizontal }]}
  >
    <AppText numberOfLines={1} weight={sticky ? '800' : '600'} style={{ fontSize: t.chip.labelSize, color: ink }}>
      {label}{count !== undefined ? <>{' '}<AppText weight={sticky ? '700' : '500'} style={{ fontSize: t.chip.countSize, color: countInk, opacity: sticky ? 0.8 : 0.72 }}>{count}</AppText></> : null}
    </AppText>
  </PressableSurface>;
}

/** A horizontally scrolling row of chips, sized to the chips (plus Sticky's edge). */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styleTokens: t } = useTheme();
  const { fontScale } = useWindowDimensions();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, { height: chipHeight(t.chip.height, t.chip.labelSize, fontScale) + t.chip.activeEdge }, style]} contentContainerStyle={[styles.chipRow, { gap: t.elevation === 'edge' ? spacing.xs : 6 }]}>{children}</ScrollView>;
}

// Leave room for scaled complex-script ascenders/descenders; retain normal size.
function chipHeight(minimum: number, labelSize: number, fontScale: number) {
  return Math.max(minimum, Math.ceil(labelSize * 1.5 * fontScale + 8));
}

/**
 * Two or three exclusive views (Cards | Boards). Classic: a tinted track with
 * a raised white segment. Sticky: an outlined white tray on an edge, the
 * selected segment an outlined accent tile.
 */
export function SegmentedControl<Key extends string>({ options, value, onChange }: { options: { key: Key; label: string; accessibilityLabel: string }[]; value: Key; onChange: (next: Key) => void }) {
  const { tokens, styleTokens: t, styleColors } = useTheme();
  const sticky = t.elevation === 'edge';
  const s = t.segmented;
  const outline = t.outline.width;
  return <View style={[
    styles.segmentTrack,
    { padding: s.padding, borderRadius: s.radius, backgroundColor: sticky ? styleColors.controlFill : tokens.surfaceElevated },
    sticky ? surfaceStyle(t, styleColors, { edge: s.edge }) : { minHeight: s.height },
  ]}>
    {options.map((option) => {
      const selected = option.key === value;
      return <PressableSurface
        key={option.key}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={option.accessibilityLabel}
        onPress={() => onChange(option.key)}
        fill={selected ? (sticky ? styleColors.accentFill : tokens.surface) : undefined}
        radius={s.optionRadius}
        outline={sticky && selected ? outline : false}
        edge={false}
        pressedStyle={null}
        style={[styles.segment, sticky && { minHeight: s.height }]}
      >
        <AppText weight={sticky ? '800' : '600'} style={{ fontSize: s.labelSize, color: sticky ? (selected ? styleColors.onAccent : styleColors.textSecondary) : selected ? tokens.textPrimary : tokens.textMuted }}>{option.label}</AppText>
      </PressableSurface>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  headerIconButton: { width: HEADER_ICON_BUTTON_SIZE, height: HEADER_ICON_BUTTON_SIZE, minWidth: HEADER_ICON_BUTTON_SIZE, minHeight: HEADER_ICON_BUTTON_SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  headerIconSurface: { width: HEADER_ICON_SURFACE_SIZE, height: HEADER_ICON_SURFACE_SIZE, alignItems: 'center', justifyContent: 'center' },
  headerIconContent: { alignItems: 'center', justifyContent: 'center', transform: [{ scale: 0.9 }] },
  headerPressed: { opacity: 0.58 },
  headerPressedScale: { transform: [{ scale: 0.96 }] },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.35 },
  button: { alignItems: 'center', justifyContent: 'center' },
  buttonPressed: { opacity: 0.58 },
  buttonText: { fontSize: 15 },
  buttonTextLarge: { fontSize: 16 },
  chip: { flexDirection: 'row', alignItems: 'center' },
  // Fixed, content-only height — flexGrow/flexShrink pinned to 0 so a
  // horizontal ScrollView never stretches to fill a flex column.
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.md },
  segmentTrack: { flexDirection: 'row' },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
