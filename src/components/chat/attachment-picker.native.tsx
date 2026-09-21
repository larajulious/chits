import { forwardRef, useCallback, useEffect, useImperativeHandle, useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { deleteAsync } from 'expo-file-system/legacy';

import { BottomSheetSurface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import type { Attachment, MessageType } from '@/db/types';
import { persistAttachment } from '@/services/attachment-storage';

export type AttachmentDraft = {
  attachment: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>;
  remove: () => Promise<void>;
};

type Props = {
  disabled?: boolean;
  onSelected: (draft: AttachmentDraft) => void;
  onError: (message: string) => void;
  onRecordingChange?: (recording: boolean) => void;
};

export type AttachmentPickerHandle = { startAudio: () => void };

function formatRecordingTime(durationMillis: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export const AttachmentPicker = forwardRef<AttachmentPickerHandle, Props>(function AttachmentPicker({ disabled = false, onSelected, onError, onRecordingChange }, ref) {
  const { tokens: theme } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const stage = async (sourceUri: string, type: MessageType, metadata: { originalName: string | null; mimeType: string | null; size: number | null; duration: number | null; width: number | null; height: number | null }) => {
    setSaving(true);
    try {
      const persisted = await persistAttachment(sourceUri, { type, ...metadata });
      onSelected(persisted);
    } catch (error) {
      console.warn('[attachment-import]', { type, operation: 'stage', error: error instanceof Error ? error.message : 'Unknown error', scheme: sourceUri.split(':', 1)[0] });
      onError(error instanceof Error ? error.message : 'The attachment could not be prepared.');
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const pickMedia = async (type: 'photo' | 'video') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { onError('Photo library access is needed to attach that item.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync(type === 'photo' ? {
      mediaTypes: ['images'],
      quality: 0.82,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    } : {
      mediaTypes: ['videos'],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      shouldDownloadFromNetwork: true,
      videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) { onError('That media item could not be read. Please try another one.'); return; }
    await stage(asset.uri, type, { originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, size: asset.fileSize ?? null, duration: asset.duration ?? null, width: asset.width || null, height: asset.height || null });
  };

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) { onError('That file could not be read. Please try another one.'); return; }
    await stage(asset.uri, 'file', { originalName: asset.name, mimeType: asset.mimeType ?? null, size: asset.size ?? null, duration: null, width: null, height: null });
  };

  const startRecording = useCallback(async () => {
    if (disabled || saving || recorderState.isRecording) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) { onError('Microphone access is needed to record audio.'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setOpen(false);
    } catch {
      onError('Audio recording could not start. Please try again.');
    }
  }, [disabled, onError, recorder, recorderState.isRecording, saving]);

  const finishRecording = async () => {
    try {
      const duration = Math.round(recorderState.durationMillis);
      await recorder.stop();
      if (!recorder.uri) throw new Error('The recording was unavailable.');
      await stage(recorder.uri, 'audio', { originalName: 'Voice note.m4a', mimeType: 'audio/m4a', size: null, duration, width: null, height: null });
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The recording could not be prepared.');
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
    }
  };

  const cancelRecording = async () => {
    const uri = recorder.uri;
    await recorder.stop();
    if (uri) await deleteAsync(uri, { idempotent: true });
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
  };

  const choose = (label: string, icon: ComponentProps<typeof Ionicons>['name'], onPress: () => void) => <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, { borderColor: theme.borderSubtle }]}><Ionicons accessible={false} name={icon} size={22} color={theme.textSecondary} /><Text style={[styles.choiceText, { color: theme.textPrimary }]}>{label}</Text></Pressable>;
  useImperativeHandle(ref, () => ({ startAudio: () => void startRecording() }), [startRecording]);
  useEffect(() => { onRecordingChange?.(recorderState.isRecording); }, [onRecordingChange, recorderState.isRecording]);
  useEffect(() => () => onRecordingChange?.(false), [onRecordingChange]);

  if (recorderState.isRecording) return <View style={styles.recording}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={() => void cancelRecording()} style={({ pressed }) => [styles.recordingAction, { backgroundColor: theme.surfaceElevated }, pressed && styles.actionPressed]}><Ionicons accessible={false} name="close" size={21} color={theme.textSecondary} /></Pressable>
    <View accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${formatRecordingTime(recorderState.durationMillis)}`} style={styles.recordingStatus}>
      <View style={styles.recordingLabel}><View style={[styles.recordingDot, { backgroundColor: theme.danger }]} /><Text style={[styles.recordingText, { color: theme.textSecondary }]}>Recording</Text></View>
      <Text style={[styles.recordingTime, { color: theme.textPrimary }]}>{formatRecordingTime(recorderState.durationMillis)}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Use recording" accessibilityHint="Stops recording and prepares it to send" onPress={() => void finishRecording()} style={({ pressed }) => [styles.recordingAction, { backgroundColor: theme.accent }, pressed && styles.actionPressed]}><Ionicons accessible={false} name="checkmark" size={22} color={theme.accentText} /></Pressable>
  </View>;

  return <><Pressable accessibilityRole="button" accessibilityLabel="Add attachment" accessibilityState={{ disabled: disabled || saving }} disabled={disabled || saving} onPress={() => setOpen(true)} style={[styles.trigger, (disabled || saving) && styles.disabled]}><Ionicons accessible={false} name="add" size={24} color={theme.textSecondary} /></Pressable><Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><Pressable style={styles.backdrop} onPress={() => setOpen(false)}><Pressable style={styles.sheetShield} onPress={() => undefined}><BottomSheetSurface><View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />{choose('Photo', 'image-outline', () => void pickMedia('photo'))}{choose('Video', 'videocam-outline', () => void pickMedia('video'))}{choose('Audio', 'mic-outline', () => void startRecording())}{choose('File', 'document-outline', () => void pickFile())}{choose('Cancel', 'close-outline', () => setOpen(false))}</BottomSheetSurface></Pressable></Pressable></Modal></>;
});

const styles = StyleSheet.create({
  trigger: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.22)' },
  sheetShield: { width: '100%' },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: spacing.xs },
  choice: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth },
  choiceText: { fontSize: 17 },
  recording: { flex: 1, width: '100%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxs },
  recordingStatus: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
  recordingLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recordingDot: { width: 8, height: 8, borderRadius: 4 },
  recordingText: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  recordingTime: { fontSize: 18, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  recordingAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  actionPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
