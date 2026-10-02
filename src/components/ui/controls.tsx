import { createContext, useContext, type PropsWithChildren, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { layout, spacing } from '@/constants/theme';
import { AppText } from './app-text';
import { PressableSurface } from './surface';

/** True inside a screen header, so its icon buttons dress as header chrome. */
export const HeaderChromeContext = createContext(false);
/** The ink for a glyph on an icon-button tile; null when there's no tile. */
export const TileInkContext = createContext<string | null>(null);

/**
 * A 44pt icon button. Classic: a bare glyph that dims when pressed. Sticky,
 * in a screen header (`chrome`): an outlined tile on a solid edge, filled
 * with the accent for the screen's main action (`accent`).
 */
export function IconButton({ label, children, onPress, disabled = false, chrome, accent = false }: PropsWithChildren<{ label: string; onPress?: () => void; disabled?: boolean; chrome?: boolean; accent?: boolean }>) {
  const { tokens, styleTokens: t, styleColors } = useTheme();
  const inHeader = useContext(HeaderChromeContext);
  const tile = (chrome ?? inHeader) && t.header.iconButton.filled;
  const size = tile ? t.header.iconButton.size : layout.minimumTouchTarget;
  return <PressableSurface
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    hitSlop={8}
    onPress={onPress}
    fill={tile ? (accent ? styleColors.accentFill : styleColors.controlFill) : undefined}
    radius={tile ? t.header.iconButton.radius : size / 2}
    outline={tile ? undefined : false}
    edge={tile ? t.header.iconButton.edge : false}
    style={[styles.iconButton, { width: size, height: size }, disabled && styles.disabled]}
  ><TileInkContext.Provider value={tile ? (accent ? styleColors.onAccent : tokens.textPrimary) : null}>{children}</TileInkContext.Provider></PressableSurface>;
}

/** A filled call-to-action in the accent. `size="large"` is an empty state's. */
export function Button({ label, onPress, disabled = false, size = 'regular', style }: { label: string; onPress: () => void; disabled?: boolean; size?: 'regular' | 'large'; style?: StyleProp<ViewStyle> }) {
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
    style={[styles.chip, { height: t.chip.height, paddingHorizontal: t.chip.paddingHorizontal }]}
  >
    <AppText numberOfLines={1} weight={sticky ? '800' : '600'} style={{ fontSize: t.chip.labelSize, color: ink }}>
      {label}{count !== undefined ? <>{' '}<AppText weight={sticky ? '700' : '500'} style={{ fontSize: t.chip.countSize, color: countInk, opacity: sticky ? 0.8 : 0.72 }}>{count}</AppText></> : null}
    </AppText>
  </PressableSurface>;
}

/** A horizontally scrolling row of chips, sized to the chips (plus Sticky's edge). */
export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { styleTokens: t } = useTheme();
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.chipScroll, { height: t.chip.height + t.chip.activeEdge }, style]} contentContainerStyle={[styles.chipRow, { gap: t.elevation === 'edge' ? spacing.xs : 6 }]}>{children}</ScrollView>;
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
    sticky ? { borderWidth: outline, borderColor: styleColors.outline, boxShadow: `0px ${s.edge}px 0px 0px ${styleColors.outline}` } : { height: s.height },
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
        style={[styles.segment, sticky && { height: s.height }]}
      >
        <AppText weight={sticky ? '800' : '600'} style={{ fontSize: s.labelSize, color: sticky ? (selected ? styleColors.onAccent : styleColors.textSecondary) : selected ? tokens.textPrimary : tokens.textMuted }}>{option.label}</AppText>
      </PressableSurface>;
    })}
  </View>;
}

const styles = StyleSheet.create({
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
