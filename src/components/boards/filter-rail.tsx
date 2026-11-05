import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Pattern, Rect } from 'react-native-svg';

import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { useLocale } from '@/localization/provider';

export const FILTER_RAIL_HEIGHT = 45;
const ITEM_PADDING = 10;

type Option<Key extends string> = { key: Key; label: string; count?: number; accessibilityLabel: string };

/** Text tabs under one sliding underline, the same pattern as a board's column navigator. */
export function FilterRail<Key extends string>({ options, value, onChange }: { options: Option<Key>[]; value: Key; onChange: (key: Key) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { tokens } = useTheme();
  const reduced = useReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);
  const underlineX = useSharedValue(0);
  const underlineWidth = useSharedValue(0);
  const placed = useRef(false);
  const active = layouts[value];

  useEffect(() => {
    if (!active) { underlineWidth.set(0); return; }
    const x = active.x + ITEM_PADDING;
    const width = active.width - ITEM_PADDING * 2;
    const instant = reduced || !placed.current;
    underlineX.set(instant ? x : withTiming(x, { duration: 220 }));
    underlineWidth.set(instant ? width : withTiming(width, { duration: 220 }));
    placed.current = true;
    scroller.current?.scrollTo({ x: Math.max(0, active.x + active.width / 2 - viewportWidth / 2), animated: !reduced });
  }, [active, reduced, underlineWidth, underlineX, viewportWidth]);
  const underline = useAnimatedStyle(() => ({ width: underlineWidth.get(), transform: [{ translateX: underlineX.get() }] }));

  return <View style={[styles.rail, { borderBottomColor: tokens.borderSubtle }]}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.decoration}>
      <Svg width="100%" height="100%">
        <Pattern id="filterRailGrain" width={88} height={44} patternUnits="userSpaceOnUse">
          <Circle cx={14} cy={8} r={1} fill={tokens.accentStrong} fillOpacity={0.16} />
          <Circle cx={65} cy={34} r={0.8} fill={tokens.accentStrong} fillOpacity={0.12} />
        </Pattern>
        <Rect width="100%" height="100%" fill="url(#filterRailGrain)" />
        <Circle cx="2%" cy={-34} r={44} fill={tokens.accent} fillOpacity={0.06} stroke={tokens.accentStrong} strokeOpacity={0.1} strokeWidth={1} />
        <Circle cx="96%" cy={74} r={42} fill={tokens.accent} fillOpacity={0.07} stroke={tokens.accentStrong} strokeOpacity={0.12} strokeWidth={1} />
        <Circle cx="96%" cy={74} r={38} fill="none" stroke={tokens.accentStrong} strokeOpacity={0.08} strokeWidth={1} />
      </Svg>
    </View>
    <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} onLayout={({ nativeEvent }) => setViewportWidth(nativeEvent.layout.width)} contentContainerStyle={styles.content}>
      {options.map((option) => {
        const selected = option.key === value;
        return <Pressable
          key={option.key}
          accessibilityRole="tab"
          accessibilityState={{ selected }}
          accessibilityLabel={option.accessibilityLabel}
          onPress={() => onChange(option.key)}
          onLayout={({ nativeEvent: { layout: { x, width } } }) => setLayouts((previous) => previous[option.key]?.x === x && previous[option.key]?.width === width ? previous : { ...previous, [option.key]: { x, width } })}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <AppText numberOfLines={1} weight={selected ? '700' : '600'} style={[styles.label, { color: selected ? desk.ink : desk.inkMuted }]}>{option.label}</AppText>
          {option.count !== undefined ? <AppText weight="600" style={[styles.count, { color: desk.inkMuted }]}>{option.count}</AppText> : null}
        </Pressable>;
      })}
      <Animated.View pointerEvents="none" style={[styles.underline, { backgroundColor: desk.ink }, underline]} />
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  rail: { borderBottomWidth: StyleSheet.hairlineWidth },
  decoration: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' },
  content: { paddingHorizontal: spacing.xxs },
  item: { minHeight: FILTER_RAIL_HEIGHT - 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: ITEM_PADDING },
  pressed: { opacity: 0.6 },
  label: { fontSize: 14, lineHeight: 20 },
  count: { fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  underline: { position: 'absolute', left: 0, bottom: 0, height: 2, borderRadius: 1 },
});
