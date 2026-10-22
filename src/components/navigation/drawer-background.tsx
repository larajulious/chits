import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { useTheme } from '@/components/theme-provider';
import { DRAWER_BACKGROUND } from '@/constants/theme-images';

/**
 * The side panel's pastel sticky-note wallpaper. It's pale enough for the
 * panel's dark text in light mode; dark mode keeps the plain surface, since
 * the picture would wash out light text.
 */
export const DrawerBackground = memo(function DrawerBackground() {
  const { scheme } = useTheme();
  if (scheme === 'dark') return null;
  return <Image source={DRAWER_BACKGROUND} contentFit="cover" accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill} />;
});
