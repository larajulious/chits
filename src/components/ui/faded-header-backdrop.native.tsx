import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';

export const HEADER_BACKDROP_OVERHANG = spacing.xs;
export type FadedHeaderBackdropProps = { target: RefObject<View | null>; height: number; topInset?: number; color?: string };

/** A live blur that fades within its controls' measured bounds. */
export const FadedHeaderBackdrop = memo(function FadedHeaderBackdrop({ target, height, topInset = 0, color }: FadedHeaderBackdropProps) {
  const { scheme, tokens } = useTheme();
  const totalHeight = height + HEADER_BACKDROP_OVERHANG;
  const fadeStart = Math.min(Math.max(0, topInset), height);
  const stop = (fraction: number) => (fadeStart + (height - fadeStart) * fraction) / totalHeight;
  return <MaskedView pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.backdrop, { height: totalHeight }]} maskElement={<LinearGradient
    colors={['#000000', '#000000', '#000000FB', '#000000E5', '#000000B9', '#00000080', '#00000046', '#0000001A', '#00000004', '#00000000', '#00000000']}
    locations={[0, stop(0), stop(0.125), stop(0.25), stop(0.375), stop(0.5), stop(0.625), stop(0.75), stop(0.875), stop(1), 1]}
    style={StyleSheet.absoluteFill}
  />}>
    <BlurView blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={45} tint={scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: `${color ?? tokens.background}20` }]} />
  </MaskedView>;
});

const styles = StyleSheet.create({ backdrop: { position: 'absolute', top: 0, left: 0, right: 0 } });
