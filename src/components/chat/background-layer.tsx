import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import type { ChatBackground } from '@/services/chat-background';

export function ChatBackgroundLayer({ background, onError }: { background: ChatBackground | null; onError?: () => void }) {
  if (!background) return null;
  const uri = resolveAttachmentUri(background.storagePath);
  if (!uri) return null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Image source={uri} contentFit="cover" blurRadius={background.blur ? 16 : 0} autoplay={false} cachePolicy="memory" style={StyleSheet.absoluteFill} onError={onError} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: background.dim }]} />
  </View>;
}
