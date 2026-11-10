import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { getInfoAsync } from 'expo-file-system/legacy';

import { VideoPoster, VideoViewer } from '@/components/chat/message-row.native';
import { Cassette, formatTapeTime } from '@/components/spaces/space-cassette';
import { PAPER_INK, PAPER_WHITE } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import type { AttachmentLike } from '@/db/types';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { resolveAttachmentUri } from '@/services/attachment-storage';

type Props = {
  attachment: AttachmentLike; caption: string; color: string; width?: number;
  onEdit: () => void; disabled?: boolean;
  onInlineTouch?: (action: () => void) => void;
  onInlineTap?: (action: () => void) => void;
};

/** Playback mounts only after a tap; idle cards keep their lightweight previews. */
export function NoteMediaPreview({ attachment, caption, color, width, onEdit, disabled = false, onInlineTouch, onInlineTap }: Props) {
  useLocale();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const [open, setOpen] = useState(false);
  const [missing, setMissing] = useState(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const audio = attachment.type === 'audio';
  const size = width ?? measuredWidth;
  const play = () => {
    if (disabled || pending.current) return;
    pending.current = true;
    const uri = resolveAttachmentUri(attachment.storagePath) ?? '';
    void getInfoAsync(uri).then(info => {
      if (!alive.current) return;
      setMissing(!info.exists);
      if (info.exists) setOpen(true);
    }, () => { if (alive.current) setMissing(true); }).finally(() => { pending.current = false; });
  };
  const activate = (event: GestureResponderEvent, action: () => void) => {
    event.stopPropagation();
    if (onInlineTap) onInlineTap(action); else action();
  };
  const playLabel = audio ? tr('stickyviewsheet.playVoiceNote') : tr('messagerow.videoValuePlayVideo', { value1: '' });
  return <View onLayout={event => { if (audio && width === undefined) setMeasuredWidth(event.nativeEvent.layout.width); }} style={audio ? undefined : styles.video}>
    <Pressable accessibilityRole="button" accessibilityLabel={playLabel} disabled={disabled}
      onPressIn={() => onInlineTouch?.(play)} onPress={event => activate(event, play)} onLongPress={() => {}}
      style={audio ? undefined : StyleSheet.absoluteFill}>
      <View pointerEvents="none">
        {audio ? size > 0 ? <Cassette width={size} color={color} caption={caption} duration={attachment.duration} /> : null : null}
      </View>
      {!audio ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <VideoPoster attachment={attachment} style={StyleSheet.absoluteFill} />
        <View style={styles.playBadge}><Icon name="play" size={23} color={PAPER_WHITE} /></View>
        {attachment.duration ? <View style={styles.duration}><AppText style={styles.white}>{formatTapeTime(attachment.duration)}</AppText></View> : null}
      </View> : null}
    </Pressable>
    <View style={audio ? styles.actions : styles.videoActions}>
      {audio ? <Pressable accessibilityRole="button" accessibilityLabel={playLabel} disabled={disabled}
        onPressIn={() => onInlineTouch?.(play)} onPress={event => activate(event, play)} onLongPress={() => {}} style={styles.control}>
        <Icon name="play" size={18} color={PAPER_INK} /><AppText maxFontSizeMultiplier={1.2} style={styles.actionText}>{tr('noteMedia.play')}</AppText>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={tr('id.edit')} disabled={disabled}
        onPressIn={() => onInlineTouch?.(onEdit)} onPress={event => activate(event, onEdit)} onLongPress={() => {}} style={styles.control}>
        <Icon name="create-outline" size={17} color={PAPER_INK} /><AppText maxFontSizeMultiplier={1.2} style={styles.actionText}>{tr('id.edit')}</AppText>
      </Pressable>
    </View>
    {missing ? <View pointerEvents="none" style={styles.unavailable}><AppText accessibilityRole="alert" style={styles.white}>{tr('messagerow.unavailable')}</AppText></View> : null}
    {open ? audio
      ? <RecordingViewer attachment={attachment} caption={caption} color={color} onDismiss={() => setOpen(false)} />
      : <VideoViewer attachment={attachment} onDismiss={() => setOpen(false)} /> : null}
  </View>;
}

function RecordingViewer({ attachment, caption, color, onDismiss }: Pick<Props, 'attachment' | 'caption' | 'color'> & { onDismiss: () => void }) {
  useLocale();
  const { width } = useWindowDimensions();
  const size = Math.max(120, Math.min(380, width - 48));
  const uri = resolveAttachmentUri(attachment.storagePath) ?? '';
  const player = useAudioPlayer(uri, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const duration = status.duration || (attachment.duration ?? 0) / 1000;
  const current = Math.max(0, Math.min(status.currentTime, duration || status.currentTime));
  const progress = duration ? Math.min(1, current / duration) : 0;
  const unavailable = missing || failed || Boolean(status.error);
  useEffect(() => {
    let alive = true;
    void getInfoAsync(uri).then(info => {
      if (!alive) return;
      setMissing(!info.exists);
      if (info.exists && AppState.currentState === 'active') {
        try { player.play(); } catch { setFailed(true); }
      }
    }, () => { if (alive) setMissing(true); });
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') player.pause(); });
    return () => { alive = false; subscription.remove(); };
  }, [uri, player]);
  const toggle = async () => {
    try {
      if (player.playing) { player.pause(); return; }
      if (player.duration > 0 && player.currentTime >= player.duration - 0.05) await player.seekTo(0);
      player.play();
    } catch { setFailed(true); }
  };
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onDismiss}>
    <SafeAreaProvider><SafeAreaView style={styles.viewer}>
      <View style={styles.viewerHeader}><AppText accessibilityRole="header" style={styles.viewerTitle}>{caption || tr('messagerow.audioNote')}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('attachments.close')} onPress={onDismiss} style={styles.control}><Icon name="close" size={24} color={PAPER_INK} /></Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.deck}>
        <Cassette width={size} color={color} caption={caption} duration={attachment.duration} spinning={status.playing} />
        <View accessible accessibilityRole="progressbar" accessibilityLabel={tr('stickyviewsheet.playback')} accessibilityValue={{ min: 0, max: Math.max(1, Math.round(duration)), now: Math.min(Math.max(1, Math.round(duration)), Math.round(current)) }} style={[styles.progress, { width: size }]}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
        <AppText style={styles.time}>{unavailable ? tr('messagerow.unavailable') : `${formatTapeTime(current * 1000)} / ${formatTapeTime(duration * 1000)}`}</AppText>
        <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? tr('stickyviewsheet.pauseVoiceNote') : tr('stickyviewsheet.playVoiceNote')} accessibilityState={{ disabled: unavailable }} disabled={unavailable} onPress={() => void toggle()} style={[styles.transport, unavailable && { opacity: 0.4 }]}>
          <Icon name={status.playing ? 'pause' : 'play'} size={28} color={PAPER_WHITE} />
        </Pressable>
      </ScrollView>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  video: { flex: 1, width: '100%' },
  playBadge: { position: 'absolute', alignSelf: 'center', top: '50%', marginTop: -22, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  duration: { position: 'absolute', left: 6, bottom: 6, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.6)', padding: 4 },
  white: { color: PAPER_WHITE, fontSize: 11 },
  unavailable: { position: 'absolute', left: 4, top: 4, padding: 6, borderRadius: 6, backgroundColor: PAPER_INK },
  actions: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  videoActions: { position: 'absolute', right: 4, bottom: 4, borderRadius: 12, backgroundColor: PAPER_WHITE },
  control: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionText: { color: PAPER_INK, fontSize: 12, fontWeight: '600' },
  viewer: { flex: 1, backgroundColor: '#EADFCB' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  viewerTitle: { flex: 1, fontSize: 19, fontWeight: '600', color: PAPER_INK },
  deck: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingVertical: 20 },
  progress: { height: 5, borderRadius: 3, backgroundColor: '#C8BAA3', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: PAPER_INK },
  time: { fontVariant: ['tabular-nums'], color: PAPER_INK },
  transport: { width: 64, height: 64, borderRadius: 32, backgroundColor: PAPER_INK, alignItems: 'center', justifyContent: 'center' },
});
