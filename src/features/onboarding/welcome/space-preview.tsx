import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { SpaceSurface } from '@/components/spaces/space-surface';
import { StickyPaper } from '@/components/spaces/sticky-note';
import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { PressableSurface, Surface } from '@/components/ui/surface';
import { SPACES, STICKY_COLORS, STICKY_SIZE, type SpaceId } from '@/constants/spaces';
import { DOCK_LABELS } from '@/constants/spaces-theme';
import { layout, spacing } from '@/constants/theme';
import { ot } from '../strings';
import { useWelcomeFonts } from './welcome-fonts';
import type { WelcomeSurfaces } from './welcome-surfaces';

const ORDER: SpaceId[] = ['desk', 'fridge', 'cork', 'wall'];
// The same two sample notes Pick a Space uses, so the spaces compare like for like.
const SAMPLES = [
  { title: null, get text() { return tr("pick.oatMilkEggs"); }, hidden: false, color: STICKY_COLORS[0].hex, rotation: -6 },
  { title: null, get text() { return tr("pick.bigIdea"); }, hidden: false, color: STICKY_COLORS[2].hex, rotation: 5 },
];

/** A look at each space, drawn with the real surfaces and stickies. Nothing here is saved. */
export function SpacePreview({ surfaces, onPick }: { surfaces: WelcomeSurfaces; /** Heard on every change of space, so Chits can take an interest. */ onPick?: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const [selected, setSelected] = useState<SpaceId>('desk');
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const space = SPACES[selected];
  // The notes fill the frame at any height, side by side and centered in it.
  const unit = size ? Math.min(0.95, (size.height - 28) / STICKY_SIZE.height, (size.width - 44) / (STICKY_SIZE.width * 2)) : 0.5;
  const noteWidth = STICKY_SIZE.width * unit;
  const noteTop = size ? (size.height - STICKY_SIZE.height * unit) / 2 : 0;

  return <View style={styles.root}>
    <Surface
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${space.name}. ${space.description}.`}
      radius={styleTokens.button.radius}
      clip
      style={styles.preview}
      onLayout={({ nativeEvent: { layout: frame } }) => setSize((current) => (current?.width === frame.width && current.height === frame.height ? current : { width: frame.width, height: frame.height }))}
    >
      {size ? <Animated.View key={selected} entering={reduced ? undefined : FadeIn.duration(240)} style={StyleSheet.absoluteFill}>
        <SpaceSurface spaceId={selected} width={size.width} height={size.height} />
        <View style={[styles.sample, { left: size.width / 2 - noteWidth - 6, top: noteTop - 4 * unit }]}><StickyPaper note={SAMPLES[0]} space={selected} seed={1} unit={unit} /></View>
        <View style={[styles.sample, { left: size.width / 2 + 6, top: noteTop + 6 * unit }]}><StickyPaper note={SAMPLES[1]} space={selected} seed={2} unit={unit} /></View>
        <View style={styles.tag}><AppText numberOfLines={1} weight="600" family={fonts.text} style={styles.tagText}>{space.description}</AppText></View>
      </Animated.View> : null}
    </Surface>
    <View accessibilityRole="radiogroup" accessibilityLabel={ot('spaces.title')} style={styles.options}>
      {ORDER.map((id) => {
        const active = id === selected;
        return <PressableSurface
          key={id}
          accessibilityRole="radio"
          accessibilityLabel={SPACES[id].name}
          accessibilityState={{ selected: active }}
          onPress={() => { if (id !== selected) onPick?.(); setSelected(id); }}
          fill={active ? PAPER_YELLOW : surfaces.control}
          radius={styleTokens.button.radius}
          style={styles.option}
        >
          <AppText numberOfLines={1} adjustsFontSizeToFit weight={active ? '800' : '600'} family={active ? fonts.textBold : fonts.text} style={[styles.optionLabel, { color: active ? PAPER_INK : surfaces.ink }]}>{DOCK_LABELS[id]}</AppText>
        </PressableSurface>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  // Fills whatever the step leaves; the step scrolls once this minimum no longer fits.
  root: { flex: 1, gap: spacing.xs },
  preview: { flex: 1, minHeight: 88, overflow: 'hidden' },
  sample: { position: 'absolute' },
  options: { flexDirection: 'row', gap: spacing.xs },
  option: { flex: 1, minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxs },
  optionLabel: { fontSize: 13 },
  // A paper tag on the preview, so the words stay with the picture they describe.
  tag: { position: 'absolute', left: spacing.xs, bottom: spacing.xs, maxWidth: '86%', paddingHorizontal: spacing.xs, paddingVertical: 3, borderRadius: 3, backgroundColor: PAPER_WHITE, transform: [{ rotate: '-1deg' }] },
  tagText: { color: PAPER_INK, fontSize: 13, lineHeight: 18 },
});
