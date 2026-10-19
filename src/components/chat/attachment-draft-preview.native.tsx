import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';

import type { AttachmentDraft } from '@/components/chat/attachment-picker';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { resolveAttachmentUri } from '@/services/attachment-storage';

function formatDuration(duration: number | null) {
  if (!duration) return '0:00';
  return `${Math.floor(duration / 60000)}:${String(Math.floor(duration / 1000) % 60).padStart(2, '0')}`;
}

function formatSize(size: number | null) {
  if (!size) return null;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readableType(mimeType: string | null, name: string | null) {
  const extension = name?.split('.').pop()?.toUpperCase();
  if (extension && extension.length <= 8) return extension;
  if (mimeType?.includes('pdf')) return 'PDF';
  return tr("addcardattachmentsheet.file");
}

function VideoPoster({ uri, duration, aspectRatio, compact }: { uri: string; duration: number | null; aspectRatio: number; compact: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    let active = true;
    try {
      const player = createVideoPlayer(uri);
      void player.generateThumbnailsAsync(0).then(([frame]) => { if (active && frame) setThumbnail(frame); }).catch(() => undefined).finally(() => player.release());
    } catch { /* The stable video placeholder remains visible. */ }
    return () => { active = false; };
  }, [uri]);
  return <View style={[styles.media, compact ? styles.mediaCompact : styles.mediaExpanded, { aspectRatio, backgroundColor: tokens.surfaceElevated }]}>{thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Icon name="videocam-outline" size={28} color={tokens.textMuted} />}<View style={styles.playBadge}><Icon name="play" size={16} color="#FFFFFF" /></View><View style={styles.durationBadge}><AppText style={styles.durationText}>{formatDuration(duration)}</AppText></View></View>;
}

function PhotoPreview({ uri, aspectRatio, compact }: { uri: string; aspectRatio: number; compact: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const [failed, setFailed] = useState(false);
  const mediaStyle = [styles.media, compact ? styles.mediaCompact : styles.mediaExpanded, { aspectRatio }];
  if (failed) return <View accessibilityLabel={tr("attachmentdraftpreview.photoUnavailable")} style={[mediaStyle, { backgroundColor: tokens.surfaceElevated }]}><Icon name="image-outline" size={26} color={tokens.textMuted} /><AppText style={[styles.unavailable, { color: tokens.textSecondary }]}>{tr("attachmentdraftpreview.photoUnavailable")}</AppText></View>;
  return <Image source={uri} contentFit="cover" transition={120} allowDownscaling onError={() => setFailed(true)} style={mediaStyle} />;
}

function AudioDraft({ uri, duration }: { uri: string; duration: number | null }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const total = status.duration || (duration ?? 0) / 1000;
  const progress = total ? Math.min(1, status.currentTime / total) : 0;
  const toggle = () => {
    if (status.playing) { player.pause(); return; }
    if (status.didJustFinish || (total && status.currentTime >= total)) void player.seekTo(0);
    player.play();
  };
  return <View style={styles.audio}><Pressable accessibilityRole="button" accessibilityLabel={status.playing ? tr("attachmentdraftpreview.pauseRecordingPreview") : tr("attachmentdraftpreview.playRecordingPreview")} onPress={toggle} style={[styles.audioButton, { backgroundColor: tokens.accent }]}><Icon name={status.playing ? 'pause' : 'play'} size={16} color={tokens.accentText} /></Pressable><View style={styles.audioCopy}><View style={[styles.track, { backgroundColor: tokens.borderSubtle }]}><View style={[styles.progress, { width: `${progress * 100}%`, backgroundColor: tokens.accent }]} /></View><AppText style={[styles.meta, { color: tokens.textMuted }]}>{formatDuration(duration)}</AppText></View></View>;
}

export function AttachmentDraftPreview({ draft, compact, onRemove }: { draft: AttachmentDraft; compact: boolean; onRemove: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const { attachment } = draft;
  const uri = resolveAttachmentUri(attachment.storagePath) ?? '';
  const size = formatSize(attachment.size);
  const aspectRatio = attachment.width && attachment.height ? Math.max(0.72, Math.min(1.9, attachment.width / attachment.height)) : 4 / 3;
  return <View accessibilityLabel={tr("chat.valueAttachmentReadyToSend", { value1: attachment.type })} style={[styles.container, compact && styles.containerCompact, { backgroundColor: tokens.accentSoft, borderColor: tokens.accentBorder }]}>
    {attachment.type === "photo" ? <PhotoPreview uri={uri} aspectRatio={aspectRatio} compact={compact} /> : null}
    {attachment.type === "video" ? <VideoPoster uri={uri} duration={attachment.duration} aspectRatio={aspectRatio} compact={compact} /> : null}
    {attachment.type === "audio" ? <AudioDraft uri={uri} duration={attachment.duration} /> : null}
    {attachment.type === "file" ? <View style={styles.file}><View style={[styles.fileIcon, { backgroundColor: tokens.surface }]}><Icon name="document-outline" size={22} color={tokens.accent} /></View><View style={styles.fileCopy}><AppText numberOfLines={2} style={[styles.fileName, { color: tokens.textPrimary }]}>{attachment.originalName ?? tr("attachments.document")}</AppText><AppText style={[styles.meta, { color: tokens.textMuted }]}>{[readableType(attachment.mimeType, attachment.originalName), size].filter(Boolean).join(' · ')}</AppText></View></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={tr("attachmentdraftpreview.removeAttachment")} hitSlop={6} onPress={onRemove} style={[styles.remove, { backgroundColor: tokens.surface }]}><Icon name="close" size={17} color={tokens.textPrimary} /></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  container: { position: 'relative', overflow: 'hidden', maxHeight: 160, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  containerCompact: { maxHeight: 92 },
  media: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  mediaExpanded: { minHeight: 112, maxHeight: 152 },
  mediaCompact: { minHeight: 72, maxHeight: 84 },
  playBadge: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -17, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.62)' },
  durationBadge: { position: 'absolute', right: spacing.xs, bottom: spacing.xs, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.68)' },
  durationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  unavailable: { fontSize: 12, fontWeight: '600', marginTop: spacing.xxs },
  audio: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm },
  audioButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  audioCopy: { flex: 1, gap: spacing.xs },
  track: { height: 3, overflow: 'hidden', borderRadius: 2 },
  progress: { height: 3, borderRadius: 2 },
  file: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingRight: 48 },
  fileIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', lineHeight: 18 },
  meta: { fontSize: 11, marginTop: 3 },
  remove: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, elevation: 2 },
});
