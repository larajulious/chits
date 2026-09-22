import { memo, useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createVideoPlayer, useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { getInfoAsync } from 'expo-file-system/legacy';

import { radii, spacing } from '@/constants/theme';
import { useTheme } from '@/components/theme-provider';
import { MessageContentRenderer, MessageMetadata } from '@/components/chat/message-note-cards';
import type { Attachment, AttachmentLike, Message } from '@/db/types';

let activeAudio: { token: symbol; pause: () => void } | null = null;
const availabilityCache = new Map<string, boolean>();

function formatTime(timestamp: number) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp); }
function formatDuration(duration: number | null) { if (!duration) return '0:00'; return `${Math.floor(duration / 60000)}:${String(Math.floor(duration / 1000) % 60).padStart(2, '0')}`; }
function durationSeconds(duration: number | null) { return duration ? Math.max(1, Math.round(duration / 1000)) : null; }
function formatSeconds(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`; }
function formatSize(size: number | null) { if (!size) return null; if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB`; }
function typeLabel(attachment: AttachmentLike) {
  if (attachment.type === 'photo') return 'Photo';
  if (attachment.type === 'video') return 'Video';
  if (attachment.type === 'audio') return 'Audio note';
  const extension = attachment.originalName?.split('.').pop()?.toUpperCase();
  if (extension && extension.length <= 8) return `${extension} file`;
  if (attachment.mimeType?.includes('pdf')) return 'PDF file';
  return 'File';
}
function fileIcon(attachment: AttachmentLike): React.ComponentProps<typeof Ionicons>['name'] {
  const value = `${attachment.mimeType ?? ''} ${attachment.originalName ?? ''}`.toLowerCase();
  if (value.includes('zip') || value.includes('archive') || value.includes('.rar')) return 'archive-outline';
  if (value.includes('sheet') || value.includes('excel') || value.includes('.csv') || value.includes('.xls')) return 'grid-outline';
  if (value.includes('image')) return 'image-outline';
  return 'document-outline';
}

function useAttachmentAvailable(uri: string) {
  const [available, setAvailable] = useState<boolean | null>(() => uri ? availabilityCache.get(uri) ?? null : false);
  useEffect(() => {
    if (!uri || availabilityCache.has(uri)) return;
    let active = true;
    void getInfoAsync(uri).then((info) => { availabilityCache.set(uri, info.exists); if (active) setAvailable(info.exists); }).catch(() => { availabilityCache.set(uri, false); if (active) setAvailable(false); });
    return () => { active = false; };
  }, [uri]);
  return available;
}

function PhotoViewer({ attachment, onDismiss }: { attachment: AttachmentLike; onDismiss: () => void }) {
  return <Modal visible transparent animationType="fade" onRequestClose={onDismiss}><View style={styles.viewer}><Image source={attachment.localUri} contentFit="contain" style={styles.fullImage} /><Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onDismiss} style={styles.viewerClose}><Ionicons accessible={false} name="close" size={24} color="#FFFFFF" /></Pressable></View></Modal>;
}

function VideoViewer({ attachment, onDismiss }: { attachment: AttachmentLike; onDismiss: () => void }) {
  const player = useVideoPlayer(attachment.localUri, (videoPlayer) => videoPlayer.play());
  return <Modal visible animationType="fade" onRequestClose={onDismiss}><View style={styles.videoViewer}><VideoView player={player as never} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" style={styles.video} /><Pressable accessibilityRole="button" accessibilityLabel="Close video" onPress={onDismiss} style={styles.viewerClose}><Ionicons accessible={false} name="close" size={24} color="#FFFFFF" /></Pressable></View></Modal>;
}

function mediaAspectRatio(attachment: Pick<Attachment, 'width' | 'height'>) {
  if (!attachment.width || !attachment.height) return 4 / 3;
  return Math.max(0.72, Math.min(1.9, attachment.width / attachment.height));
}

export function useVideoThumbnail(localUri: string) {
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    let active = true;
    try {
      const player = createVideoPlayer(localUri);
      void player.generateThumbnailsAsync(0).then(([frame]) => { if (active && frame) setThumbnail(frame); }).catch(() => undefined).finally(() => player.release());
    } catch { /* The caller's own stable placeholder remains visible. */ }
    return () => { active = false; };
  }, [localUri]);
  return thumbnail;
}

export function VideoPoster({ attachment, style }: { attachment: AttachmentLike; style?: StyleProp<ViewStyle> }) {
  const { tokens: theme } = useTheme();
  const thumbnail = useVideoThumbnail(attachment.localUri);
  return <View style={[styles.media, style, { backgroundColor: theme.surfaceElevated }]}>{thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Ionicons accessible={false} name="videocam-outline" size={36} color={theme.textMuted} />}<View style={styles.videoPlay}><Ionicons accessible={false} name="play" size={23} color="#FFFFFF" /></View><View style={styles.durationBadge}><Text style={styles.durationText}>{formatDuration(attachment.duration)}</Text></View></View>;
}

function AudioPlayer({ attachment }: { attachment: AttachmentLike }) {
  const { tokens: theme } = useTheme();
  const player = useAudioPlayer(attachment.localUri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [playerToken] = useState(() => Symbol('audio-player'));
  const metadataDuration = (attachment.duration ?? 0) / 1000;
  const duration = status.duration || metadataDuration;
  const currentTime = Math.max(0, Math.min(status.currentTime, duration || status.currentTime));
  const progress = duration ? Math.min(1, currentTime / duration) : 0;
  const unavailable = Boolean(status.error);
  const disabled = !status.isLoaded || unavailable;
  const stateLabel = unavailable
    ? 'Unavailable'
    : !status.isLoaded || status.isBuffering
      ? 'Loading'
      : status.playing
        ? 'Playing'
        : status.didJustFinish
          ? 'Finished'
          : 'Ready';
  const progressMax = Math.max(1, Math.round(duration));
  const progressNow = Math.min(progressMax, Math.round(currentTime));
  useEffect(() => () => { if (activeAudio?.token === playerToken) activeAudio = null; }, [playerToken]);
  const toggle = () => {
    if (status.playing) { player.pause(); if (activeAudio?.token === playerToken) activeAudio = null; return; }
    if (activeAudio && activeAudio.token !== playerToken) activeAudio.pause();
    if (status.didJustFinish || (duration && status.currentTime >= duration)) void player.seekTo(0);
    activeAudio = { token: playerToken, pause: () => player.pause() };
    player.play();
  };
  return <View style={styles.audioPlayer}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Pause audio note' : 'Play audio note'}
      accessibilityHint={unavailable ? undefined : status.playing ? 'Pauses playback' : 'Starts playback'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={toggle}
      style={({ pressed }) => [
        styles.audioButton,
        { backgroundColor: disabled ? theme.surfaceElevated : theme.accent },
        pressed && styles.audioButtonPressed,
      ]}
    >
      <Ionicons
        accessible={false}
        name={unavailable ? 'alert-circle-outline' : status.isBuffering ? 'ellipsis-horizontal' : status.playing ? 'pause' : 'play'}
        size={20}
        color={disabled ? theme.textMuted : theme.accentText}
        style={!status.playing && !status.isBuffering && !unavailable ? styles.playIcon : undefined}
      />
    </Pressable>
    <View style={styles.audioBody}>
      <View style={styles.audioHeading}>
        <Text style={[styles.audioTitle, { color: theme.textPrimary }]}>Audio note</Text>
        <Text style={[styles.audioState, { color: unavailable ? theme.textMuted : theme.accentStrong }]}>{stateLabel}</Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Audio progress"
        accessibilityValue={{ min: 0, max: progressMax, now: progressNow, text: `${formatSeconds(currentTime)} of ${formatSeconds(duration)}` }}
        style={[styles.track, { backgroundColor: theme.borderSubtle }]}
      >
        <View style={[styles.trackFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.audioTimes}>
        <Text style={[styles.audioTime, { color: theme.textMuted }]}>{formatSeconds(currentTime)}</Text>
        <Text style={[styles.audioTime, { color: theme.textMuted }]}>{formatSeconds(duration)}</Text>
      </View>
    </View>
  </View>;
}

function Unavailable({ attachment, style }: { attachment: AttachmentLike; style?: StyleProp<ViewStyle> }) {
  const { tokens: theme } = useTheme();
  const icon = attachment.type === 'photo' ? 'image-outline' : attachment.type === 'video' ? 'videocam-outline' : attachment.type === 'audio' ? 'volume-medium-outline' : fileIcon(attachment);
  const label = attachment.type === 'photo' ? 'Photo unavailable' : attachment.type === 'video' ? 'Video unavailable' : 'Attachment unavailable';
  return <View accessibilityLabel={label} style={[styles.unavailable, style, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name={icon} size={25} color={theme.textMuted} /><Text style={[styles.unavailableText, { color: theme.textSecondary }]}>{label}</Text></View>;
}

function AttachmentLoading({ attachment, style }: { attachment: AttachmentLike; style?: StyleProp<ViewStyle> }) {
  const { tokens: theme } = useTheme();
  const icon = attachment.type === 'photo' ? 'image-outline' : attachment.type === 'video' ? 'videocam-outline' : attachment.type === 'audio' ? 'volume-medium-outline' : fileIcon(attachment);
  return <View accessibilityLabel={`${typeLabel(attachment)} loading`} style={[styles.unavailable, style, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name={icon} size={25} color={theme.textMuted} /></View>;
}

export function AttachmentContent({ attachment, accessibilityLabel, overlay, variant = 'chat', onLongPress }: { attachment: AttachmentLike; accessibilityLabel?: string; overlay?: ReactNode; variant?: 'chat' | 'board' | 'detail'; onLongPress?: () => void }) {
  const { tokens: theme } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const available = useAttachmentAvailable(attachment.localUri);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const aspectRatio = mediaAspectRatio(attachment);
  // Board card thumbnails get a fixed height rather than aspectRatio + min/maxHeight:
  // that combination only fully resolves once the image view reports its own
  // measurement, which reads as the thumbnail "growing in" after the card's title
  // has already settled. A fixed box is correct on the very first layout pass, before
  // any image data exists — the chat/detail variants keep the aspect-ratio behavior
  // since they show media at a size meant to preserve its real proportions.
  // Chat's cap is screen-relative (~60% of viewport height) rather than a flat pixel
  // value, so a very tall portrait photo never eats multiple screens' worth of chat on
  // any device; window dimensions are known synchronously, so this can't itself cause
  // a layout shift the way waiting on the image's own measurement would.
  const mediaStyle = variant === 'board' ? [styles.media, styles.boardMedia] : variant === 'detail' ? [styles.media, styles.detailMedia, { aspectRatio }] : [styles.media, styles.chatMedia, { aspectRatio, maxHeight: Math.round(screenHeight * 0.6) }];
  if (available === null) return <AttachmentLoading attachment={attachment} style={mediaStyle} />;
  if (available === false || mediaError) return <Unavailable attachment={attachment} style={mediaStyle} />;
  if (attachment.type === 'photo') return <><View style={[mediaStyle, { backgroundColor: theme.surfaceElevated }]}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? 'Photo. Double tap to view fullscreen.'} accessibilityHint="Opens the photo fullscreen" onPress={() => setViewerOpen(true)} onLongPress={onLongPress} delayLongPress={350} style={StyleSheet.absoluteFill}><Image source={attachment.localUri} contentFit="cover" transition={120} allowDownscaling onError={() => setMediaError(true)} style={StyleSheet.absoluteFill} /></Pressable>{overlay}</View>{viewerOpen ? <PhotoViewer attachment={attachment} onDismiss={() => setViewerOpen(false)} /> : null}</>;
  if (attachment.type === 'video') return <><View style={mediaStyle}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `Video${attachment.duration ? `, ${durationSeconds(attachment.duration)} seconds` : ''}. Play video.`} accessibilityHint="Opens the video player" onPress={() => setViewerOpen(true)} onLongPress={onLongPress} delayLongPress={350} style={StyleSheet.absoluteFill}><VideoPoster attachment={attachment} style={StyleSheet.absoluteFill} /></Pressable>{overlay}</View>{viewerOpen ? <VideoViewer attachment={attachment} onDismiss={() => setViewerOpen(false)} /> : null}</>;
  if (attachment.type === 'audio') return <AudioPlayer attachment={attachment} />;
  const meta = [typeLabel(attachment).replace(/ file$/, ''), formatSize(attachment.size)].filter(Boolean).join(' · ');
  const open = async () => { setOpenError(null); try { if (!await Sharing.isAvailableAsync()) throw new Error(); await Sharing.shareAsync(attachment.localUri, { mimeType: attachment.mimeType ?? undefined }); } catch { setOpenError('This file could not be opened.'); } };
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${typeLabel(attachment)}, ${attachment.originalName ?? 'document'}${attachment.size ? `, ${formatSize(attachment.size)}` : ''}`} onPress={() => void open()} onLongPress={onLongPress} delayLongPress={350} style={styles.fileTile}><View style={[styles.fileIcon, { backgroundColor: theme.surface }]}><Ionicons accessible={false} name={fileIcon(attachment)} size={24} color={theme.accent} /></View><View style={styles.fileCopy}><Text numberOfLines={2} style={[styles.fileName, { color: theme.textPrimary }]}>{attachment.originalName ?? 'Document'}</Text><Text style={[styles.attachmentMeta, { color: theme.textMuted }]}>{openError ?? meta}</Text></View><Ionicons accessible={false} name="open-outline" size={18} color={theme.textMuted} /></Pressable>;
}

function MediaMetadata({ message, video = false, onActions }: { message: Message; video?: boolean; onActions: () => void }) {
  return <>{message.organization ? <View accessibilityLabel={`Organized in ${message.organization.boardName}, ${message.organization.columnName}`} style={styles.mediaBoardChip}><Text numberOfLines={1} style={styles.mediaBoardChipText}>{message.organization.boardName} · {message.organization.columnName}</Text></View> : null}<View style={[styles.mediaTimestamp, video && styles.mediaTimestampLeft]}><Text style={styles.mediaTimestampText}>{formatTime(message.createdAt)}{message.updatedAt !== message.createdAt ? ' · edited' : ''}</Text>{message.pinned ? <Ionicons accessibilityLabel="Pinned" name="pin-outline" size={12} color="#FFFFFF" /> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="Thought actions" onPress={onActions} hitSlop={6} style={styles.mediaActions}><Ionicons accessible={false} name="ellipsis-horizontal" size={17} color="#FFFFFF" /></Pressable></>;
}

function AttachmentMessage({ message, attachment, focused, onLongPress }: { message: Message; attachment: Attachment; focused: boolean; onLongPress: (message: Message) => void }) {
  const { tokens: theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const visual = attachment.type === 'photo' || attachment.type === 'video';
  const seconds = durationSeconds(attachment.duration);
  const accessibilityLabel = attachment.type === 'photo'
    ? `Photo.${message.text ? ` Description: ${message.text}.` : ''}`
    : attachment.type === 'video'
      ? `Video${seconds ? `, ${seconds} seconds` : ''}.${message.text ? ` Description: ${message.text}.` : ''} Play video.`
      : undefined;
  // Wider than a short text bubble (this is the message surface, not a card inside
  // one), but capped well short of the full chat width so it still reads as a
  // message, not a full-bleed screen element.
  const chatWidth = screenWidth - spacing.md * 2;
  const messageMaxWidth = Math.min(520, Math.round(chatWidth * 0.8));
  return <Pressable accessible={false} onLongPress={() => onLongPress(message)} delayLongPress={350} style={({ pressed }) => [styles.attachmentMessage, { maxWidth: messageMaxWidth, backgroundColor: theme.surface, borderColor: focused ? theme.accentStrong : theme.borderSubtle }, focused && styles.focused, pressed && styles.pressed]}>
    <AttachmentContent attachment={attachment} accessibilityLabel={accessibilityLabel} overlay={visual && !message.text ? <MediaMetadata message={message} video={attachment.type === 'video'} onActions={() => onLongPress(message)} /> : null} />
    {message.text ? <View style={[styles.descriptionSurface, visual && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle }]}><Text accessible={!visual} style={[styles.attachmentDescription, { color: theme.textPrimary }]}>{message.text}</Text><MessageMetadata message={message} inside onActions={() => onLongPress(message)} /></View> : null}
    {!visual && !message.text ? <MessageMetadata message={message} inside onActions={() => onLongPress(message)} /> : null}
  </Pressable>;
}

function MessageRowComponent({ message, onLongPress, focused = false }: { message: Message; onLongPress: (message: Message) => void; focused?: boolean }) {
  const attachment = message.attachments[0];
  const actions = () => onLongPress(message);
  return <View style={styles.container}><MessageContentRenderer message={message} mode="compact" focused={focused} onActions={actions} renderAttachments={() => attachment ? <AttachmentMessage message={message} attachment={attachment} focused={focused} onLongPress={onLongPress} /> : null} /></View>;
}

export const MessageRow = memo(MessageRowComponent);

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'flex-end' },
  pressed: { opacity: 0.72 },
  focused: { borderWidth: 2 },
  attachmentMessage: { alignSelf: 'flex-end', overflow: 'hidden', width: '100%', maxWidth: 520, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.contentCard },
  descriptionSurface: { paddingTop: spacing.sm },
  attachmentDescription: { paddingHorizontal: spacing.md, fontSize: 16, lineHeight: 23 },
  media: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  chatMedia: { minHeight: 170, maxHeight: 340 },
  detailMedia: { minHeight: 220, maxHeight: 520 },
  boardMedia: { height: 108 },
  videoPlay: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -23, width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.62)' },
  durationBadge: { position: 'absolute', right: spacing.xs, bottom: spacing.xs, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.7)' },
  durationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  unavailable: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  unavailableText: { fontSize: 14, fontWeight: '600' },
  audioPlayer: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  audioButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 },
  audioButtonPressed: { opacity: 0.76, transform: [{ scale: 0.96 }] },
  playIcon: { marginLeft: 2 },
  audioBody: { flex: 1, minWidth: 0, gap: 7 },
  audioHeading: { minHeight: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  audioTitle: { flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  audioState: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
  track: { height: 5, overflow: 'hidden', borderRadius: 3 },
  trackFill: { height: 5, borderRadius: 3 },
  audioTimes: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  audioTime: { fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  fileTile: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  fileIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  fileCopy: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 15, fontWeight: '600', lineHeight: 19 },
  attachmentMeta: { fontSize: 11, lineHeight: 15 },
  mediaTimestamp: { position: 'absolute', right: spacing.xs, bottom: spacing.xs, minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: 7, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.68)' },
  mediaTimestampLeft: { right: undefined, left: spacing.xs },
  mediaTimestampText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  mediaBoardChip: { position: 'absolute', top: spacing.xs, left: spacing.xs, maxWidth: '68%', minHeight: 28, justifyContent: 'center', paddingHorizontal: spacing.xs, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.68)' },
  mediaBoardChipText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  mediaActions: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)' },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  fullImage: { width: '100%', height: '100%' },
  videoViewer: { flex: 1, justifyContent: 'center', backgroundColor: '#000000' },
  video: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: 54, right: spacing.md, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.56)' },
});
