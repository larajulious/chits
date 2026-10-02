import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createVideoPlayer, useVideoPlayer, VideoView, type VideoThumbnail } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { getInfoAsync } from 'expo-file-system/legacy';
import { useSQLiteContext } from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { radii, spacing } from '@/constants/theme';
import { useTheme } from '@/components/theme-provider';
import { MessageContentRenderer, MessageMetadata } from '@/components/chat/message-note-cards';
import { createBoardRepository } from '@/db/repositories';
import type { Attachment, AttachmentLike, Message } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { subscribeToAppReset } from '@/services/app-reset';
import { isPdfAttachment } from '@/services/pdf-attachment';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import { PhotoAttachmentViewer } from '@/components/attachments/photo-attachment-viewer';
import { useAttachmentExport } from '@/components/attachments/use-attachment-export';
import { exportActionLabel } from '@/services/attachment-export';

let activeAudio: { token: symbol; pause: () => void } | null = null;
const availabilityCache = new Map<string, boolean>();
// Whether each attachment file exists is cached for the session; a restore
// replaces the files on disk, so start over whenever the app resets.
subscribeToAppReset(() => availabilityCache.clear());

function formatTime(timestamp: number) { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp); }
function formatDuration(duration: number | null) { if (!duration) return '0:00'; return `${Math.floor(duration / 60000)}:${String(Math.floor(duration / 1000) % 60).padStart(2, '0')}`; }
function durationSeconds(duration: number | null) { return duration ? Math.max(1, Math.round(duration / 1000)) : null; }
function formatSeconds(seconds: number) { return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`; }
function formatSize(size: number | null) { if (!size) return null; if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB`; }
function typeLabel(attachment: AttachmentLike) {
  if (attachment.type === 'photo') return 'Photo';
  if (attachment.type === 'video') return 'Video';
  if (attachment.type === 'audio') return 'Audio note';
  if (isPdfAttachment(attachment)) return 'PDF file';
  const extension = attachment.originalName?.split('.').pop()?.toUpperCase();
  if (extension && extension.length <= 8) return `${extension} file`;
  if (attachment.mimeType?.includes('pdf')) return 'PDF file';
  return 'File';
}
function fileIcon(attachment: AttachmentLike): React.ComponentProps<typeof Ionicons>['name'] {
  if (isPdfAttachment(attachment)) return 'document-text-outline';
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

// Download + Close for the full-screen photo/video viewers, with the export
// feedback shown inside the viewer (it sits above the rest of the app).
// Absolutely positioned children ignore the SafeAreaView's padding, so the
// top inset is applied explicitly to keep both buttons out of the status bar.
function ViewerActions({ attachment, label, onDismiss }: { attachment: AttachmentLike; label: string; onDismiss: () => void }) {
  const download = useAttachmentExport();
  const insets = useSafeAreaInsets();
  const top = { top: insets.top + spacing.sm };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${exportActionLabel(attachment)}, ${label}`} disabled={download.busy} onPress={() => void download.exportAttachment(attachment)} style={[styles.viewerClose, styles.viewerSecondary, top]}><Ionicons accessible={false} name="download-outline" size={22} color="#FFFFFF" /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Close ${label}`} onPress={onDismiss} style={[styles.viewerClose, top]}><Ionicons accessible={false} name="close" size={24} color="#FFFFFF" /></Pressable>
    {download.status ? <View pointerEvents="none" style={[styles.viewerToast, { bottom: insets.bottom + spacing.xl }]}><Text accessibilityLiveRegion="polite" style={styles.viewerToastText}>{download.status}</Text></View> : null}
  </>;
}

function VideoViewer({ attachment, onDismiss }: { attachment: AttachmentLike; onDismiss: () => void }) {
  const player = useVideoPlayer(resolveAttachmentUri(attachment.storagePath) ?? '', (videoPlayer) => videoPlayer.play());
  return <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent={false} navigationBarTranslucent={false} onRequestClose={onDismiss}><SafeAreaProvider><SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.videoViewer}><VideoView player={player as never} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" style={styles.video} /><ViewerActions attachment={attachment} label="video" onDismiss={onDismiss} /></SafeAreaView></SafeAreaProvider></Modal>;
}

function mediaAspectRatio(attachment: Pick<Attachment, 'width' | 'height'>) {
  if (!attachment.width || !attachment.height) return 4 / 3;
  return Math.max(0.72, Math.min(1.9, attachment.width / attachment.height));
}

export function useVideoThumbnail(storagePath: string) {
  const uri = resolveAttachmentUri(storagePath) ?? '';
  const [thumbnail, setThumbnail] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    let active = true;
    try {
      const player = createVideoPlayer(uri);
      void player.generateThumbnailsAsync(0).then(([frame]) => { if (active && frame) setThumbnail(frame); }).catch(() => undefined).finally(() => player.release());
    } catch { /* The caller's own stable placeholder remains visible. */ }
    return () => { active = false; };
  }, [uri]);
  return thumbnail;
}

export function VideoPoster({ attachment, style }: { attachment: AttachmentLike; style?: StyleProp<ViewStyle> }) {
  const { tokens: theme } = useTheme();
  const thumbnail = useVideoThumbnail(attachment.storagePath);
  return <View style={[styles.media, style, { backgroundColor: theme.surfaceElevated }]}>{thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Ionicons accessible={false} name="videocam-outline" size={36} color={theme.textMuted} />}<View style={styles.videoPlay}><Ionicons accessible={false} name="play" size={23} color="#FFFFFF" /></View><View style={styles.durationBadge}><Text style={styles.durationText}>{formatDuration(attachment.duration)}</Text></View></View>;
}

const WAVEFORM_BAR_COUNT = 34;

// No real amplitude data exists for recorded notes — this derives a stable,
// attachment-specific bar pattern (not re-randomized per render/replay) so the
// waveform reads as a genuine per-note shape rather than a generic pulse.
function waveformBars(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  const bars: number[] = [];
  for (let index = 0; index < WAVEFORM_BAR_COUNT; index += 1) {
    hash = (hash * 1103515245 + 12345) >>> 0;
    bars.push(4 + (hash % 1000) / 1000 * 14);
  }
  return bars;
}

function AudioPlayer({ attachment }: { attachment: AttachmentLike }) {
  const { tokens: theme } = useTheme();
  const player = useAudioPlayer(resolveAttachmentUri(attachment.storagePath) ?? '', { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [playerToken] = useState(() => Symbol('audio-player'));
  const bars = useState(() => waveformBars(attachment.id))[0];
  const metadataDuration = (attachment.duration ?? 0) / 1000;
  const duration = status.duration || metadataDuration;
  const currentTime = Math.max(0, Math.min(status.currentTime, duration || status.currentTime));
  const progress = duration ? Math.min(1, currentTime / duration) : 0;
  const unavailable = Boolean(status.error);
  const loading = !unavailable && (!status.isLoaded || status.isBuffering);
  const disabled = !status.isLoaded || unavailable;
  const progressMax = Math.max(1, Math.round(duration));
  const progressNow = Math.min(progressMax, Math.round(currentTime));
  const playedBars = Math.round(progress * WAVEFORM_BAR_COUNT);
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
        name={unavailable ? 'alert-circle-outline' : loading ? 'ellipsis-horizontal' : status.playing ? 'pause' : 'play'}
        size={20}
        color={disabled ? theme.textMuted : theme.accentText}
        style={!status.playing && !loading && !unavailable ? styles.playIcon : undefined}
      />
    </Pressable>
    <View style={styles.audioBody}>
      <View style={styles.audioHeading}>
        <Text style={[styles.audioTitle, { color: theme.textPrimary }]}>Audio note</Text>
        <Text style={[styles.audioState, { color: unavailable ? theme.textMuted : theme.accentStrong }]}>{unavailable ? 'Unavailable' : loading ? 'Loading' : formatSeconds(duration)}</Text>
      </View>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Audio progress"
        accessibilityValue={{ min: 0, max: progressMax, now: progressNow, text: `${formatSeconds(currentTime)} of ${formatSeconds(duration)}` }}
        style={styles.waveform}
      >
        {bars.map((height, index) => <View key={index} style={[styles.waveformBar, { height, backgroundColor: index < playedBars ? theme.accent : theme.borderSubtle }]} />)}
      </View>
      <Text style={[styles.audioTime, { color: theme.textMuted }]}>{formatSeconds(currentTime)}</Text>
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

// `onOpen` (photo/video only): a tap hands off to the caller's multi-attachment
// gallery instead of this attachment's own single-item viewer.
export function AttachmentContent({ attachment, accessibilityLabel, overlay, variant = 'chat', accentColor, onLongPress, onOpen }: { attachment: AttachmentLike; accessibilityLabel?: string; overlay?: ReactNode; variant?: 'chat' | 'board' | 'detail' | 'thumbnail' | 'grid'; accentColor?: string; onLongPress?: () => void; onOpen?: () => void }) {
  const { tokens: theme } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const uri = resolveAttachmentUri(attachment.storagePath) ?? '';
  const available = useAttachmentAvailable(uri);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState(false);
  const aspectRatio = mediaAspectRatio(attachment);
  useEffect(() => {
    if (__DEV__ && available === false) console.warn('[attachment-missing]', { attachmentId: attachment.id, storagePath: attachment.storagePath });
  }, [attachment.id, attachment.storagePath, available]);
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
  // 'thumbnail': a small fixed square (e.g. the Cards tab's compact right-side
  // preview) — same fixed-box reasoning as 'board' above, just sized for a
  // corner thumbnail rather than a full-width card top.
  const mediaStyle = variant === 'board' ? [styles.media, styles.boardMedia] : variant === 'thumbnail' ? [styles.media, styles.thumbnailMedia] : variant === 'grid' ? [styles.media, styles.gridMedia] : variant === 'detail' ? [styles.media, styles.detailMedia, { aspectRatio }] : [styles.media, styles.chatMedia, { aspectRatio, maxHeight: Math.round(screenHeight * 0.6) }];
  if (available === null) return <AttachmentLoading attachment={attachment} style={mediaStyle} />;
  if (available === false || mediaError) return <Unavailable attachment={attachment} style={mediaStyle} />;
  const galleryHint = 'Opens all attachments on this card';
  if (attachment.type === 'photo') return <><View style={[mediaStyle, { backgroundColor: theme.surfaceElevated }]}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? 'Photo. Double tap to view fullscreen.'} accessibilityHint={onOpen ? galleryHint : 'Opens the photo fullscreen'} onPress={onOpen ?? (() => setViewerOpen(true))} onLongPress={onLongPress} delayLongPress={350} style={StyleSheet.absoluteFill}><Image source={uri} contentFit="cover" transition={120} allowDownscaling onError={() => setMediaError(true)} style={StyleSheet.absoluteFill} /></Pressable>{overlay}</View>{viewerOpen ? <PhotoAttachmentViewer attachment={attachment} onDismiss={() => setViewerOpen(false)} /> : null}</>;
  if (attachment.type === 'video') return <><View style={mediaStyle}><Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `Video${attachment.duration ? `, ${durationSeconds(attachment.duration)} seconds` : ''}. Play video.`} accessibilityHint={onOpen ? galleryHint : 'Opens the video player'} onPress={onOpen ?? (() => setViewerOpen(true))} onLongPress={onLongPress} delayLongPress={350} style={StyleSheet.absoluteFill}><VideoPoster attachment={attachment} style={StyleSheet.absoluteFill} /></Pressable>{overlay}</View>{viewerOpen ? <VideoViewer attachment={attachment} onDismiss={() => setViewerOpen(false)} /> : null}</>;
  if (attachment.type === 'audio') return <AudioPlayer attachment={attachment} />;
  // PDFs open in Chits' own viewer; every other document keeps the existing
  // system share/open-with flow.
  const pdf = isPdfAttachment(attachment);
  const meta = [typeLabel(attachment).replace(/ file$/, ''), formatSize(attachment.size)].filter(Boolean).join(' · ');
  if (pdf) return <><Pressable accessibilityRole="button" accessibilityLabel={`Open PDF, ${attachment.originalName ?? 'document'}${attachment.size ? `, ${formatSize(attachment.size)}` : ''}`} accessibilityHint="Opens the PDF in Chits" onPress={() => setViewerOpen(true)} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [styles.fileTile, pressed && styles.fileTilePressed]}><View style={[styles.fileIcon, { backgroundColor: theme.surface }]}><Ionicons accessible={false} name="document-text-outline" size={22} color={accentColor ?? theme.accent} /><Text style={[styles.pdfBadge, { color: accentColor ?? theme.accent }]}>PDF</Text></View><View style={styles.fileCopy}><Text numberOfLines={2} style={[styles.fileName, { color: theme.textPrimary }]}>{attachment.originalName ?? 'Document.pdf'}</Text><Text style={[styles.attachmentMeta, { color: theme.textMuted }]}>{meta}</Text></View><Ionicons accessible={false} name="chevron-forward" size={18} color={theme.textMuted} />{overlay}</Pressable>{viewerOpen ? <PdfViewer attachment={attachment} onDismiss={() => setViewerOpen(false)} /> : null}</>;
  const open = async () => { setOpenError(null); try { if (!uri || !await Sharing.isAvailableAsync()) throw new Error(); await Sharing.shareAsync(uri, { mimeType: attachment.mimeType ?? undefined }); } catch { setOpenError('This file could not be opened.'); } };
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${typeLabel(attachment)}, ${attachment.originalName ?? 'document'}${attachment.size ? `, ${formatSize(attachment.size)}` : ''}`} onPress={() => void open()} onLongPress={onLongPress} delayLongPress={350} style={styles.fileTile}><View style={[styles.fileIcon, { backgroundColor: theme.surface }]}><Ionicons accessible={false} name={fileIcon(attachment)} size={24} color={accentColor ?? theme.accent} /></View><View style={styles.fileCopy}><Text numberOfLines={2} style={[styles.fileName, { color: theme.textPrimary }]}>{attachment.originalName ?? 'Document'}</Text><Text style={[styles.attachmentMeta, { color: theme.textMuted }]}>{openError ?? meta}</Text></View><Ionicons accessible={false} name="open-outline" size={18} color={theme.textMuted} />{overlay}</Pressable>;
}

// `timestampLeft`: the bottom-right corner is taken (a video's duration or the
// "+N" badge), so the timestamp moves to the bottom-left instead.
function MediaMetadata({ message, timestampLeft = false, onActions, onHideAgain }: { message: Message; timestampLeft?: boolean; onActions: () => void; onHideAgain?: () => void }) {
  const router = useRouter();
  const organization = message.organization;
  return <>
    {organization ? <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${organization.columnName} in ${organization.boardName}`}
      accessibilityHint="Opens this column on its board"
      onPress={(event) => {
        event.stopPropagation();
        router.push({ pathname: '/board/[id]', params: { id: organization.boardId, highlightColumnId: organization.columnId } });
      }}
      style={({ pressed }) => [styles.mediaBoardChip, pressed && styles.pressed]}
    ><Text numberOfLines={1} style={styles.mediaBoardChipText}>{organization.boardName} · {organization.columnName}</Text></Pressable> : null}
    <View style={[styles.mediaTimestamp, timestampLeft && styles.mediaTimestampLeft]}><Text style={styles.mediaTimestampText}>{formatTime(message.createdAt)}{message.updatedAt !== message.createdAt ? ' · edited' : ''}</Text>{message.pinned ? <Ionicons accessibilityLabel="Pinned" name="pin-outline" size={12} color="#FFFFFF" /> : null}{(message.reminderAt ?? message.organization?.reminderAt) != null ? <Ionicons accessibilityLabel="Reminder set" name="notifications-outline" size={12} color="#FFFFFF" /> : null}</View>
    {onHideAgain ? <Pressable accessibilityRole="button" accessibilityLabel="Hide again" onPress={onHideAgain} hitSlop={6} style={styles.mediaPrivacy}><Ionicons accessible={false} name="eye-off-outline" size={16} color="#FFFFFF" /></Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="Thought actions" onPress={onActions} hitSlop={6} style={styles.mediaActions}><Ionicons accessible={false} name="ellipsis-horizontal" size={17} color="#FFFFFF" /></Pressable>
  </>;
}

function AttachmentMessage({ message, attachment, focused, onLongPress, onHideAgain }: { message: Message; attachment: Attachment; focused: boolean; onLongPress: (message: Message) => void; onHideAgain?: () => void }) {
  const { tokens: theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const database = useSQLiteContext();
  const [gallery, setGallery] = useState<{ items: AttachmentLike[]; initialIndex: number } | null>(null);
  const visual = attachment.type === 'photo' || attachment.type === 'video';
  // An organized thought's preview stands in for its whole card, so "+N" counts
  // every other attachment on that card — the same total the Board card and Card
  // Details show. An unorganized thought only ever has its own attachment(s).
  const cardId = message.organization?.cardId ?? null;
  const totalAttachments = message.organization?.attachmentCount ?? message.attachments.length;
  const moreCount = visual ? Math.max(totalAttachments - 1, 0) : 0;
  // This thought's own attachment first, then the rest of its card in Card Details' order.
  const mosaicItems = moreCount > 0 ? [attachment, ...(message.organization?.attachmentPreview ?? []).filter((item) => item.id !== attachment.id)].slice(0, MOSAIC_MAX_TILES) : [];
  // Opens on `startId` (a mosaic tile) or else this thought's own attachment.
  const openGallery = async (startId = attachment.id) => {
    // A failed/empty lookup still opens on the visible attachment rather than doing nothing.
    const items = await (cardId ? createBoardRepository(database).listCardAttachmentItems(cardId) : Promise.resolve(message.attachments as AttachmentLike[])).catch(() => [] as AttachmentLike[]);
    const list = items.length ? items : [attachment];
    const start = list.findIndex((item) => item.id === startId);
    setGallery({ items: list, initialIndex: Math.max(0, start >= 0 ? start : list.findIndex((item) => item.id === attachment.id)) });
  };
  const seconds = durationSeconds(attachment.duration);
  const moreLabel = moreCount ? ` ${moreCount} more attachment${moreCount === 1 ? '' : 's'}.` : '';
  const accessibilityLabel = attachment.type === 'photo'
    ? `Photo.${message.text ? ` Description: ${message.text}.` : ''}${moreLabel}`
    : attachment.type === 'video'
      ? `Video${seconds ? `, ${seconds} seconds` : ''}.${message.text ? ` Description: ${message.text}.` : ''}${moreLabel} Play video.`
      : undefined;
  // Wider than a short text bubble (this is the message surface, not a card inside
  // one), but capped well short of the full chat width so it still reads as a
  // message, not a full-bleed screen element.
  const chatWidth = screenWidth - spacing.md * 2;
  const messageMaxWidth = Math.min(520, Math.round(chatWidth * 0.8));
  return <Pressable accessible={false} onLongPress={() => onLongPress(message)} delayLongPress={350} style={({ pressed }) => [styles.attachmentMessage, { maxWidth: messageMaxWidth, backgroundColor: theme.surface, borderColor: focused ? theme.accentStrong : theme.borderSubtle }, focused && styles.focused, pressed && styles.pressed]}>
    {mosaicItems.length > 1
      ? <MediaMosaic items={mosaicItems} total={totalAttachments} firstLabel={accessibilityLabel} onOpen={(startId) => void openGallery(startId)} onLongPress={() => onLongPress(message)} overlay={!message.text ? <MediaMetadata message={message} timestampLeft onActions={() => onLongPress(message)} onHideAgain={onHideAgain} /> : null} />
      : <AttachmentContent attachment={attachment} accessibilityLabel={accessibilityLabel} onOpen={moreCount > 0 ? () => void openGallery() : undefined} overlay={visual && !message.text ? <MediaMetadata message={message} timestampLeft={attachment.type === 'video'} onActions={() => onLongPress(message)} onHideAgain={onHideAgain} /> : null} />}
    {message.text ? <View style={[styles.descriptionSurface, visual && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle }]}><Text accessible={!visual} style={[styles.attachmentDescription, { color: theme.textPrimary }]}>{message.text}</Text><MessageMetadata message={message} inside splitPills={attachment.type === 'audio'} onActions={() => onLongPress(message)} onHideAgain={onHideAgain} /></View> : null}
    {!visual && !message.text ? <MessageMetadata message={message} inside splitPills={attachment.type === 'audio'} onActions={() => onLongPress(message)} onHideAgain={onHideAgain} /> : null}
    {gallery ? <AttachmentGallery attachments={gallery.items} initialIndex={gallery.initialIndex} onDismiss={() => setGallery(null)} /> : null}
  </Pressable>;
}

const MOSAIC_MAX_TILES = 4;

// Aspect ratio of the whole mosaic (2 tiles side by side read best a little wider).
function mosaicAspectRatio(count: number) { return count === 2 ? 4 / 3 : 1; }

function MosaicVideoFace({ item }: { item: AttachmentLike }) {
  const { tokens: theme } = useTheme();
  const thumbnail = useVideoThumbnail(item.storagePath);
  return <>
    {thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : <Ionicons accessible={false} name="videocam-outline" size={28} color={theme.textMuted} />}
    <View style={styles.mosaicPlay}><Ionicons accessible={false} name="play" size={16} color="#FFFFFF" /></View>
    <View style={styles.durationBadge}><Text style={styles.durationText}>{formatDuration(item.duration)}</Text></View>
  </>;
}

// Audio, PDFs and other files have no picture, so their tile is an icon + name.
function MosaicFileFace({ item }: { item: AttachmentLike }) {
  const { tokens: theme } = useTheme();
  const icon = item.type === 'photo' ? 'image-outline' : item.type === 'audio' ? 'volume-medium-outline' : fileIcon(item);
  const name = item.type === 'file' ? item.originalName ?? typeLabel(item) : typeLabel(item);
  return <View style={styles.mosaicFile}>
    <Ionicons accessible={false} name={icon} size={26} color={theme.accent} />
    <Text numberOfLines={2} style={[styles.mosaicFileName, { color: theme.textSecondary }]}>{name}</Text>
  </View>;
}

function MosaicTile({ item, label, hiddenCount, onPress, onLongPress }: { item: AttachmentLike; label: string; hiddenCount: number; onPress: () => void; onLongPress: () => void }) {
  const { tokens: theme } = useTheme();
  const [photoFailed, setPhotoFailed] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={hiddenCount ? `${label} ${hiddenCount} more attachment${hiddenCount === 1 ? '' : 's'}.` : label} accessibilityHint="Opens the card's attachments" onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [styles.mosaicTile, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
    {item.type === 'photo' && !photoFailed ? <Image source={resolveAttachmentUri(item.storagePath)} contentFit="cover" transition={120} allowDownscaling recyclingKey={item.id} onError={() => setPhotoFailed(true)} style={StyleSheet.absoluteFill} />
      : item.type === 'video' ? <MosaicVideoFace item={item} />
      : <MosaicFileFace item={item} />}
    {hiddenCount > 0 ? <View style={styles.mosaicMore}><Text style={styles.mosaicMoreText}>+{hiddenCount}</Text></View> : null}
  </Pressable>;
}

// An organized thought whose card holds several attachments shows them as an
// album: 2 side by side, 3 as one large + two stacked, 4+ as a 2×2 grid. When the
// card has more than fit, the last tile is dimmed with "+N" — N being everything
// not fully visible, so "+3" always means three more to see. Any tile opens the
// gallery on that attachment.
function MediaMosaic({ items, total, firstLabel, onOpen, onLongPress, overlay }: { items: AttachmentLike[]; total: number; firstLabel?: string; onOpen: (startId: string) => void; onLongPress: () => void; overlay?: ReactNode }) {
  const { height: screenHeight } = useWindowDimensions();
  const hiddenCount = total > items.length ? total - (items.length - 1) : 0;
  const tile = (index: number) => {
    const item = items[index];
    const label = index === 0 && firstLabel ? firstLabel : `${typeLabel(item)}, ${index + 1} of ${total}.`;
    return <MosaicTile key={item.id} item={item} label={label} hiddenCount={index === items.length - 1 ? hiddenCount : 0} onPress={() => onOpen(item.id)} onLongPress={onLongPress} />;
  };
  return <View style={[styles.mosaic, { aspectRatio: mosaicAspectRatio(items.length), maxHeight: Math.min(340, Math.round(screenHeight * 0.6)) }]}>
    {items.length === 2 ? <>{tile(0)}{tile(1)}</>
      : items.length === 3 ? <>{tile(0)}<View style={styles.mosaicColumn}>{tile(1)}{tile(2)}</View></>
      : <><View style={styles.mosaicColumn}>{tile(0)}{tile(2)}</View><View style={styles.mosaicColumn}>{tile(1)}{tile(3)}</View></>}
    {overlay}
  </View>;
}

function GalleryVideo({ attachment }: { attachment: AttachmentLike }) {
  const player = useVideoPlayer(resolveAttachmentUri(attachment.storagePath) ?? '', (videoPlayer) => videoPlayer.play());
  return <VideoView player={player as never} nativeControls fullscreenOptions={{ enable: true }} contentFit="contain" style={styles.video} />;
}

// One full-screen page. Only the page in view mounts a video player, so swiping
// away stops (and releases) it. Audio/PDF/files reuse AttachmentContent's own
// player/viewer/open flow on a card, exactly as Card Details presents them.
function GalleryPage({ attachment, active, width }: { attachment: AttachmentLike; active: boolean; width: number }) {
  const { tokens: theme } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[styles.galleryPage, { width, paddingTop: insets.top + 60, paddingBottom: insets.bottom + spacing.md }]}>
    {attachment.type === 'photo' ? <Image source={resolveAttachmentUri(attachment.storagePath)} contentFit="contain" style={StyleSheet.absoluteFill} />
      : attachment.type === 'video' ? (active ? <GalleryVideo attachment={attachment} /> : <VideoPoster attachment={attachment} style={styles.video} />)
      : <View style={[styles.galleryCard, { backgroundColor: theme.surface }]}><AttachmentContent attachment={attachment} variant="detail" /></View>}
  </View>;
}

// Swipe through every attachment behind a "+N" preview, starting on the one
// that was tapped.
function AttachmentGallery({ attachments, initialIndex, onDismiss }: { attachments: AttachmentLike[]; initialIndex: number; onDismiss: () => void }) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const current = attachments[index] ?? attachments[0];
  const position = `${index + 1} of ${attachments.length}`;
  return <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent={false} navigationBarTranslucent={false} onRequestClose={onDismiss}><SafeAreaProvider><View style={styles.videoViewer}>
    <FlatList
      data={attachments}
      keyExtractor={(item) => item.id}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={initialIndex}
      getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
      onMomentumScrollEnd={({ nativeEvent }) => setIndex(Math.max(0, Math.min(attachments.length - 1, Math.round(nativeEvent.contentOffset.x / width))))}
      extraData={index}
      renderItem={({ item, index: itemIndex }) => <GalleryPage attachment={item} active={itemIndex === index} width={width} />}
    />
    <GalleryPosition label={position} />
    <ViewerActions attachment={current} label={`${typeLabel(current).toLowerCase()}, ${position}`} onDismiss={onDismiss} />
  </View></SafeAreaProvider></Modal>;
}

function GalleryPosition({ label }: { label: string }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.galleryPosition, { top: insets.top + spacing.sm }]}><Text accessibilityLiveRegion="polite" style={styles.galleryPositionText}>{label}</Text></View>;
}

function hiddenCopy(message: Message) {
  const type = message.attachments[0]?.type ?? message.type;
  if (type === 'photo') return { title: 'Photo hidden', accessibilityLabel: 'Hidden photo. Double tap to reveal.' };
  if (type === 'video') return { title: 'Video hidden', accessibilityLabel: 'Hidden video. Double tap to reveal.' };
  if (type === 'audio') return { title: 'Audio hidden', accessibilityLabel: 'Hidden audio. Double tap to reveal.' };
  if (type === 'file') return { title: 'File hidden', accessibilityLabel: 'Hidden file. Double tap to reveal.' };
  return { title: 'Hidden Chit', accessibilityLabel: 'Hidden Chit. Double tap to reveal.' };
}

function hiddenFallbackHeight(message: Message, width: number, screenHeight: number) {
  const attachment = message.attachments[0];
  if (!attachment) {
    const estimatedLines = Math.max(1, Math.min(8, Math.ceil((message.text?.length ?? 1) / 34)));
    return Math.max(72, 38 + estimatedLines * 20);
  }
  if (attachment.type === 'photo' || attachment.type === 'video') {
    const mediaHeight = Math.max(170, Math.min(Math.round(width / mediaAspectRatio(attachment)), Math.round(screenHeight * 0.6)));
    const mosaicCount = Math.min(MOSAIC_MAX_TILES, message.organization?.attachmentCount ?? 1);
    const height = mosaicCount > 1 ? Math.min(Math.round(width / mosaicAspectRatio(mosaicCount)), 340, Math.round(screenHeight * 0.6)) : mediaHeight;
    return height + (message.text ? 72 : 0);
  }
  if (attachment.type === 'audio') return message.text ? 146 : 112;
  return message.text ? 136 : 102;
}

function HiddenMessageCover({ message, height, focused, onReveal, onLongPress }: { message: Message; height: number; focused: boolean; onReveal: (message: Message) => void; onLongPress: (message: Message) => void }) {
  const { scheme, tokens: theme } = useTheme();
  const blurTargetRef = useRef<View | null>(null);
  const copy = hiddenCopy(message);
  return <Pressable
    accessible
    accessibilityRole="button"
    accessibilityLabel={copy.accessibilityLabel}
    accessibilityHint="Temporarily reveals this content for the current Chat session"
    onPress={() => onReveal(message)}
    onLongPress={() => onLongPress(message)}
    delayLongPress={350}
    style={({ pressed }) => [styles.hiddenCover, { minHeight: height, backgroundColor: theme.surfaceElevated, borderColor: focused ? theme.accentStrong : theme.borderSubtle }, focused && styles.focused, pressed && styles.hiddenCoverPressed]}
  >
    <BlurTargetView ref={blurTargetRef} accessible={false} style={StyleSheet.absoluteFill}>
      <View style={[styles.hiddenVeilOrb, styles.hiddenVeilOrbTop, { backgroundColor: theme.accentSoft }]} />
      <View style={[styles.hiddenVeilOrb, styles.hiddenVeilOrbBottom, { backgroundColor: theme.accentStrong }]} />
      <View style={[styles.hiddenVeilGlow, { backgroundColor: theme.surface }]} />
    </BlurTargetView>
    <BlurView
      blurTarget={blurTargetRef}
      blurMethod="dimezisBlurViewSdk31Plus"
      intensity={95}
      tint={scheme === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
      style={StyleSheet.absoluteFill}
    />
    <View accessible={false} style={[StyleSheet.absoluteFill, styles.hiddenPrivacyWash, { backgroundColor: theme.surface }]} />
    <View style={[styles.hiddenBadge, { backgroundColor: `${theme.surfaceElevated}D9`, borderColor: `${theme.borderSubtle}B8` }]}>
      <View style={[styles.hiddenBadgeIcon, { backgroundColor: `${theme.accentSoft}E6` }]}><Ionicons accessible={false} name="eye-off-outline" size={18} color={theme.accentStrong} /></View>
      <View style={styles.hiddenBadgeCopy}>
        <Text style={[styles.hiddenTitle, { color: theme.textPrimary }]}>{copy.title}</Text>
        <Text style={[styles.hiddenHint, { color: theme.textMuted }]}>Tap to reveal</Text>
      </View>
    </View>
  </Pressable>;
}

function MessageRowComponent({ message, onLongPress, onReveal, onHideAgain, temporarilyRevealed = false, focused = false }: { message: Message; onLongPress: (message: Message) => void; onReveal: (message: Message) => void; onHideAgain: (message: Message) => void; temporarilyRevealed?: boolean; focused?: boolean }) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const attachment = message.attachments[0];
  const actions = () => onLongPress(message);
  const covered = message.isHiddenContent && !temporarilyRevealed;
  const availableWidth = Math.min(520, Math.round((screenWidth - spacing.md * 2) * 0.8));
  const coverHeight = measuredHeight ?? hiddenFallbackHeight(message, availableWidth, screenHeight);
  return <View
    style={styles.container}
    onLayout={covered ? undefined : ({ nativeEvent }) => {
      const next = Math.ceil(nativeEvent.layout.height - spacing.sm * 2);
      if (next > 0) setMeasuredHeight((current) => current === next ? current : next);
    }}
  >
    {covered
      ? <HiddenMessageCover message={message} height={coverHeight} focused={focused} onReveal={onReveal} onLongPress={onLongPress} />
      : <View style={styles.revealedWrap}>
          <MessageContentRenderer message={message} mode="compact" focused={focused} onActions={actions} onHideAgain={message.isHiddenContent ? () => onHideAgain(message) : undefined} renderAttachments={() => attachment ? <AttachmentMessage message={message} attachment={attachment} focused={focused} onLongPress={onLongPress} onHideAgain={message.isHiddenContent ? () => onHideAgain(message) : undefined} /> : null} />
        </View>}
  </View>;
}

export const MessageRow = memo(MessageRowComponent);

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'flex-end' },
  revealedWrap: { position: 'relative', width: '100%', alignItems: 'flex-end' },
  hiddenCover: { alignSelf: 'flex-end', width: '80%', maxWidth: 520, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.contentCard, overflow: 'hidden' },
  hiddenCoverPressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
  hiddenVeilOrb: { position: 'absolute', borderRadius: radii.pill, opacity: 0.9 },
  hiddenVeilOrbTop: { width: 220, height: 220, top: -132, right: -34 },
  hiddenVeilOrbBottom: { width: 180, height: 180, bottom: -116, left: -28 },
  hiddenVeilGlow: { position: 'absolute', width: '58%', height: '180%', top: '-38%', left: '22%', borderRadius: radii.pill, opacity: 0.72, transform: [{ rotate: '18deg' }] },
  hiddenPrivacyWash: { opacity: 0.28 },
  hiddenBadge: { minWidth: 174, maxWidth: '90%', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.pill, shadowColor: '#000000', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  hiddenBadgeIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  hiddenBadgeCopy: { flexShrink: 1, paddingRight: spacing.xs },
  hiddenTitle: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  hiddenHint: { marginTop: 1, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  pressed: { opacity: 0.72 },
  focused: { borderWidth: 2 },
  attachmentMessage: { alignSelf: 'flex-end', overflow: 'hidden', width: '100%', maxWidth: 520, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.contentCard },
  descriptionSurface: { paddingTop: spacing.sm },
  attachmentDescription: { paddingHorizontal: spacing.md, fontSize: 16, lineHeight: 23 },
  media: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  chatMedia: { minHeight: 170, maxHeight: 340 },
  detailMedia: { minHeight: 220, maxHeight: 520 },
  boardMedia: { height: 108 },
  thumbnailMedia: { width: 68, height: 68, borderRadius: 10, overflow: 'hidden' },
  // Fills its parent's own explicit size (the Attachments library grid gives
  // each cell a computed square footprint) rather than a fixed pixel box —
  // same fixed-box-not-aspectRatio reasoning as 'board'/'thumbnail' above.
  gridMedia: { width: '100%', height: '100%', borderRadius: radii.compactCard, overflow: 'hidden' },
  videoPlay: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -23, width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.62)' },
  durationBadge: { position: 'absolute', right: spacing.xs, bottom: spacing.xs, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.7)' },
  durationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  // 2px gutters between tiles; the bubble's own surface shows through them.
  mosaic: { width: '100%', flexDirection: 'row', gap: 2 },
  mosaicColumn: { flex: 1, gap: 2 },
  mosaicTile: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  mosaicPlay: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', paddingLeft: 2, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.62)' },
  mosaicFile: { alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  mosaicFileName: { fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
  mosaicMore: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.52)' },
  mosaicMoreText: { color: '#FFFFFF', fontSize: 26, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
  waveform: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveformBar: { flex: 1, minWidth: 2, borderRadius: 1 },
  audioTime: { fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
  fileTile: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.sm },
  fileIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  fileTilePressed: { opacity: 0.72 },
  pdfBadge: { marginTop: -1, fontSize: 9, lineHeight: 11, fontWeight: '800', letterSpacing: 0.4 },
  fileCopy: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 15, fontWeight: '600', lineHeight: 19 },
  attachmentMeta: { fontSize: 11, lineHeight: 15 },
  mediaTimestamp: { position: 'absolute', right: spacing.xs, bottom: spacing.xs, minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: 7, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.68)' },
  mediaTimestampLeft: { right: undefined, left: spacing.xs },
  mediaTimestampText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  mediaBoardChip: { position: 'absolute', top: spacing.xs, left: spacing.xs, maxWidth: '68%', minHeight: 28, justifyContent: 'center', paddingHorizontal: spacing.xs, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.68)' },
  mediaBoardChipText: { color: '#FFFFFF', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  mediaActions: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)' },
  mediaPrivacy: { position: 'absolute', top: spacing.xs, right: 48, width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)' },
  viewer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  fullImage: { width: '100%', height: '100%' },
  videoViewer: { flex: 1, justifyContent: 'center', backgroundColor: '#000000' },
  video: { width: '100%', height: '100%' },
  viewerClose: { position: 'absolute', top: spacing.sm, right: spacing.md, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.56)' },
  viewerSecondary: { right: spacing.md + 44 + spacing.xs },
  galleryPage: { height: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  galleryCard: { width: '100%', maxWidth: 520, overflow: 'hidden', paddingBottom: spacing.sm, borderRadius: radii.contentCard },
  galleryPosition: { position: 'absolute', left: spacing.md, minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.56)' },
  galleryPositionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  viewerToast: { position: 'absolute', bottom: spacing.xl * 2, alignSelf: 'center', maxWidth: '86%', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.control, backgroundColor: 'rgba(255,255,255,0.94)' },
  viewerToastText: { color: '#111111', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
