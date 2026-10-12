import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { PhotoAttachmentViewer } from '@/components/attachments/photo-attachment-viewer';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import type { AttachmentLike } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import type { NoteImageDetails } from '@/services/note-content';

type Props = {
  image: NoteImageDetails;
  width: number;
  height: number;
  // Saved images retain their photo actions; editor drafts open a preview only.
  attachment?: AttachmentLike | null;
  previewOnly?: boolean;
  accessibilityLabel?: string;
  overlay?: ReactNode;
  onLongPress?: () => void;
};

// One image inside a note, drawn at exactly the box its caller computed from
// the image's own proportions (see imageRows) — `contain` avoids rounding-related
// cropping or stretching. A subtle spinner shows while it decodes, and a file
// that's gone (deleted, or missing after a restore) becomes a quiet placeholder.
export function NoteImage({ image, width, height, attachment, previewOnly = false, accessibilityLabel, overlay, onLongPress }: Props) {
  const { tokens: theme } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const uri = resolveAttachmentUri(image.storagePath);
  const box = { width, height, backgroundColor: theme.surfaceElevated };
  if (!uri || failed) {
    return <View accessibilityLabel="Image unavailable" style={[styles.frame, styles.center, box]}>
      <Icon name="image-outline" size={22} color={theme.textMuted} />
      {height >= 72 ? <AppText style={[styles.unavailable, { color: theme.textSecondary }]}>Image unavailable</AppText> : null}
      {overlay}
    </View>;
  }
  const picture = <>
    <Image source={uri} contentFit="contain" transition={120} allowDownscaling recyclingKey={image.storagePath} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} style={StyleSheet.absoluteFill} />
    {!loaded ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator size="small" color={theme.textMuted} /></View> : null}
  </>;
  const previewAttachment: AttachmentLike = attachment ?? { id: `draft:${image.storagePath}`, type: 'photo', ...image, duration: null, createdAt: 0 };
  return <View style={[styles.frame, box]}>
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={accessibilityLabel ?? 'Image'} accessibilityHint="Opens the image full screen" onPress={() => setViewerOpen(true)} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}>{picture}</Pressable>
    {overlay}
    {viewerOpen ? <PhotoAttachmentViewer attachment={previewAttachment} previewOnly={previewOnly || !attachment} onDismiss={() => setViewerOpen(false)} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderRadius: 12 },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.xxs },
  unavailable: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.86 },
});
