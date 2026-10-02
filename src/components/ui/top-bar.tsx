import { memo, useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Decorations } from '@/components/share-note/share-note-template';
import { useTheme } from '@/components/theme-provider';
import { TileInkContext } from './controls';
import { Icon, type IconName } from './icon';
import { TOP_BAR_IMAGE_SCRIM } from '@/constants/chits-themes';
import { THEME_IMAGES } from '@/constants/theme-images';
import { SHARE_NOTE_DESIGN_WIDTH } from '@/services/share-note';

/**
 * Text and icon colors for anything drawn in a screen header: the band's ink
 * under a personality theme, the ordinary tokens under Default.
 */
export function useHeaderInk() {
  const { tokens, topBar } = useTheme();
  return topBar
    ? { ink: topBar.ink, inkMuted: topBar.inkMuted, border: 'transparent', banded: true }
    : { ink: tokens.textPrimary, inkMuted: tokens.textMuted, border: tokens.borderSubtle, banded: false };
}

/** A header icon that stays readable on the theme's top bar (or on its button's tile). */
export function HeaderIcon({ name, size, muted = false }: { name: IconName; size: number; muted?: boolean }) {
  const { ink, inkMuted } = useHeaderInk();
  const tileInk = useContext(TileInkContext);
  return <Icon name={name} size={size} color={tileInk ?? (muted ? inkMuted : ink)} />;
}

/**
 * The navigation menu icon: three rounded lines of decreasing length, like the
 * lines of a note. Drawn rather than taken from the icon font so it matches
 * Chits; colored like every other header icon.
 */
export function MenuIcon({ size = 24 }: { size?: number }) {
  const { ink: headerInk } = useHeaderInk();
  const { styleTokens } = useTheme();
  const ink = useContext(TileInkContext) ?? headerInk;
  const unit = size / 24;
  const thickness = Math.max(styleTokens.iconStroke || 2, 2 * unit);
  return <View accessible={false} style={{ width: size, height: size, justifyContent: 'center', gap: 4 * unit, paddingLeft: 3 * unit }}>
    {[18, 13, 8].map((width) => <View key={width} style={{ width: width * unit, height: thickness, borderRadius: thickness / 2, backgroundColor: ink }} />)}
  </View>;
}

/**
 * The theme's Share Note background — its gradient and decoration at full
 * strength — behind a screen header, reaching up under the status bar. A theme
 * with a band picture (Game Changer) shows that instead, anchored to its top
 * and tinted with the band's first color so the header ink stays readable.
 * Place it as the header's first child; the header itself stays exactly as
 * laid out. Renders nothing under Default.
 */
export const TopBarBackground = memo(function TopBarBackground({ extendIntoStatusBar = true }: { extendIntoStatusBar?: boolean }) {
  const { topBar } = useTheme();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (!topBar) return null;
  const { share, colors } = topBar;
  const u = size ? size.width / SHARE_NOTE_DESIGN_WIDTH : 1;
  return <View
    pointerEvents="none"
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    onLayout={({ nativeEvent: { layout } }) => setSize((current) => current && current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height })}
    style={[styles.band, { top: extendIntoStatusBar ? -insets.top : 0, backgroundColor: colors[0] }]}
  >
    {topBar.image ? <>
      <Image source={THEME_IMAGES[topBar.image]} contentFit="cover" contentPosition="top" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors[0], opacity: TOP_BAR_IMAGE_SCRIM }]} />
    </> : <>
      {share.backgroundType === 'gradient' ? <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
      {size ? <Decorations theme={share} u={u} canvas={{ width: SHARE_NOTE_DESIGN_WIDTH, height: size.height / u }} /> : null}
    </>}
  </View>;
});

const styles = StyleSheet.create({
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
});
