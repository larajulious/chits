import { memo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { headerPhotoFrame, type HeaderPhoto } from '@/services/header-photo';

export const HeaderPhotoLayer = memo(function HeaderPhotoLayer({ photo, onError }: { photo: HeaderPhoto; onError: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const uri = resolveAttachmentUri(photo.storagePath);
  return <View accessible={false} pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: '#151515' }]} onLayout={({ nativeEvent: { layout } }) => setSize((old) => old.width === layout.width && old.height === layout.height ? old : { width: layout.width, height: layout.height })}>
    {uri && size.width > 0 ? <Image source={{ uri }} cachePolicy="memory-disk" recyclingKey={uri} contentFit="fill" onError={onError} style={[{ position: 'absolute' }, headerPhotoFrame(photo, size.width, size.height)]} /> : null}
    {/* At least 60% black keeps even pure white pixels below #666: white text
        clears WCAG AA without decoding pixels or guessing image brightness. */}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${photo.overlay})` }]} />
    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.16)']} style={StyleSheet.absoluteFill} />
  </View>;
});
