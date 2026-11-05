import { useDirection } from '@/localization/provider';
import { navigationIconName } from '@/localization/text-layout';
import { memo, useContext, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeskDots, DOT_SPACING, useDesk } from '@/components/desk/desk-surface';
import { Decorations } from '@/components/share-note/share-note-template';
import { useTheme } from '@/components/theme-provider';
import { PAPER_WHITE } from '@/constants/paper';
import { useHeaderPhoto } from './header-photo-context';
import { HeaderPhotoLayer } from './header-photo-layer';
import { AppText } from './app-text';
import { TileInkContext } from './controls';
import { Icon, type IconName } from './icon';
import { TOP_BAR_IMAGE_SCRIM } from '@/constants/chits-themes';
import { THEME_IMAGES } from '@/constants/theme-images';
import { SHARE_NOTE_DESIGN_WIDTH } from '@/services/share-note';

/**
 * Text and icon colors for anything drawn in a screen header: the band's ink
 * under a personality theme, the desk's under Default.
 */
export function useHeaderInk() {
  const { tokens, topBar, deskHeader } = useTheme();
  const { photo } = useHeaderPhoto();
  const desk = useDesk();
  if (photo) return { ink: photo.ink?.text ?? '#ffffff', inkMuted: photo.ink?.muted ?? '#ffffff', border: 'transparent', banded: true };
  if (deskHeader) return { ink: desk.ink, inkMuted: desk.inkMuted, border: 'transparent', banded: false };
  return topBar
    ? { ink: topBar.ink, inkMuted: topBar.inkMuted, border: 'transparent', banded: true }
    : { ink: tokens.textPrimary, inkMuted: tokens.textMuted, border: tokens.borderSubtle, banded: false };
}

/** A header icon that stays readable on the theme's top bar (or on its button's tile). */
export function HeaderIcon({ name, size, muted = false }: { name: IconName; size: number; muted?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { ink, inkMuted } = useHeaderInk();
  const { direction } = useDirection();
  const tileInk = useContext(TileInkContext);
  return <Icon name={navigationIconName(name, direction)} size={size} color={tileInk ?? (muted ? inkMuted : ink)} />;
}

/**
 * A text glyph (the "‹" back arrow) in a header button: the header's ink, or
 * the tile's when Sticky draws the button as a tile — so it stays readable on
 * the tile whatever the header band behind it.
 */
/** A paper label under a header's title, so it reads over any room at any hour. Plain on a plain header. */
export function HeaderTitleTag({ children, start = false }: { children: ReactNode; /** For a left-aligned header. */ start?: boolean }) {
  const { banded } = useHeaderInk();
  return banded ? <View style={[styles.titleTag, start && styles.titleTagStart]}>{children}</View> : <>{children}</>;
}

export function HeaderGlyph({ children, style }: { children: string; style?: StyleProp<TextStyle> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { ink } = useHeaderInk();
  const { direction } = useDirection();
  const tileInk = useContext(TileInkContext);
  return <AppText accessible={false} style={[style, { color: tileInk ?? ink }]}>{direction === 'rtl' && children === '‹' ? '›' : children}</AppText>;
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
 * laid out. Under Default it's the desk, flowing into the page's own.
 */
export const TopBarBackground = memo(function TopBarBackground({ extendIntoStatusBar = true }: { extendIntoStatusBar?: boolean }) {
  const { topBar, deskHeader } = useTheme();
  const { photo, onError } = useHeaderPhoto();
  const desk = useDesk();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  if (photo) return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.band, { top: extendIntoStatusBar ? -insets.top : 0 }]}><HeaderPhotoLayer photo={photo} onError={onError} /></View>;
  if (deskHeader) return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.band, { top: extendIntoStatusBar ? -insets.top : 0, backgroundColor: desk.desk }]}>
    <View style={styles.deskDots}><DeskDots /></View>
  </View>;
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
  titleTag: { alignItems: 'center', maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 2, borderRadius: 3, backgroundColor: PAPER_WHITE, boxShadow: '0px 2px 5px rgba(80,60,30,0.2)', transform: [{ rotate: '-1deg' }] },
  titleTagStart: { alignSelf: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 7, paddingVertical: 1 },
  band: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  // Flipped, so the pattern starts at the band's bottom edge and the rows carry
  // on unbroken into the desk below. Android rounds a pattern tile to whole
  // pixels, so drawn from the top the rows drift out of line by the time they
  // reach that edge; this way any drift stays up under the status bar.
  deskDots: { position: 'absolute', left: 0, right: 0, bottom: 0, height: DOT_SPACING * 24, transform: [{ scaleY: -1 }] },
});
