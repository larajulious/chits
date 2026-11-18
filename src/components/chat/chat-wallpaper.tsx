import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ChatBackground } from '@/services/chat-background';
import { ChatBackgroundLayer } from './background-layer';
import { useContentDimensions } from '@/hooks/use-adaptive-layout';

/** Full-window wallpaper, separate from the keyboard-adjusted conversation. */
export const ChatWallpaper = memo(function ChatWallpaper({ background }: { background: ChatBackground | null }) {
  // RN 0.86 Android uses WindowMetrics bounds for Dimensions.window, excluding
  // IME insets. Unlike onLayout, these stay full-size during adjustResize, while
  // still updating for rotation, split-screen and other real window changes.
  const { width, height } = useContentDimensions();
  if (!background) return null;
  return <View pointerEvents="none" style={[styles.wallpaper, { width, height }]}>
    <ChatBackgroundLayer background={background} />
  </View>;
});

const styles = StyleSheet.create({
  wallpaper: { position: 'absolute', top: 0, left: 0 },
});
