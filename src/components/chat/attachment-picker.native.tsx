import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ComponentProps } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { deleteAsync } from 'expo-file-system/legacy';

import { BottomSheetSurface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import type { MessageType } from '@/db/types';
import { pickAndStageFile, pickAndStageMedia, stageAttachment, type AttachmentDraft } from '@/services/attachment-import';
import { dismissKeyboardAsync } from '@/services/keyboard';
import { ensureMicrophonePermission } from '@/services/permissions';
import { showPermissionSettingsPrompt } from '@/components/permissions/permission-settings-prompt';

export type { AttachmentDraft } from '@/services/attachment-import';

type Props = {
  disabled?: boolean;
  onSelected: (draft: AttachmentDraft) => void;
  onError: (message: string) => void;
  onRecordingChange?: (recording: boolean) => void;
  // Lets the composer know the attachment sheet itself is open — a real,
  // in-progress attachment workflow that must keep the composer expanded even
  // if the sheet's own Modal happens to blur the TextInput underneath it (see
  // PHASE: FIX INCONSISTENT CHAT COMPOSER EXPANSION). Mirrors onRecordingChange.
  onOpenChange?: (open: boolean) => void;
};

export type AttachmentPickerHandle = { startAudio: () => void };

function formatRecordingTime(durationMillis: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMillis / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

export const AttachmentPicker = forwardRef<AttachmentPickerHandle, Props>(function AttachmentPicker({ disabled = false, onSelected, onError, onRecordingChange, onOpenChange }, ref) {
  const { tokens: theme } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Picking/staging is shared with the Add note sheet (services/attachment-import).
  // As before, cancelling a picker leaves the attachment sheet open; choosing
  // something (or an error) closes it.
  // Ref, not state: a fast double tap must not open two pickers or two
  // permission prompts before `saving` re-renders.
  const busy = useRef(false);
  const run = async (task: () => Promise<AttachmentDraft | null>) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      const draft = await task();
      if (!draft) return;
      onSelected(draft);
      setOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The attachment could not be prepared.');
      setOpen(false);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const stage = (sourceUri: string, type: MessageType, metadata: Parameters<typeof stageAttachment>[2]) => run(() => stageAttachment(sourceUri, type, metadata));
  const pickMedia = (type: 'photo' | 'video') => run(() => pickAndStageMedia(type));
  const pickFile = () => run(pickAndStageFile);

  const startRecording = useCallback(async () => {
    if (disabled || saving || recorderState.isRecording || busy.current) return;
    busy.current = true;
    try {
      // Close the keyboard *before* any permission prompt can appear (see
      // dismissKeyboardAsync) and only ask when access isn't already granted.
      await dismissKeyboardAsync();
      const access = await ensureMicrophonePermission();
      // Declined at the system prompt just now: stop quietly (no banner, no
      // Settings), leaving the sheet and any draft as they were.
      if (access === 'denied') return;
      // Declined on an earlier attempt and tried again: offer Settings.
      if (access === 'blocked') { showPermissionSettingsPrompt('microphone'); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, interruptionMode: 'doNotMix', shouldPlayInBackground: false, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setOpen(false);
    } catch {
      onError('Audio recording could not start. Please try again.');
    } finally {
      busy.current = false;
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

  const choose = (label: string, icon: ComponentProps<typeof Ionicons>['name'], onPress: () => void) => <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, { borderColor: theme.borderSubtle }]}><Icon name={icon} size={22} color={theme.textSecondary} /><AppText style={[styles.choiceText, { color: theme.textPrimary }]}>{label}</AppText></Pressable>;
  useImperativeHandle(ref, () => ({ startAudio: () => void startRecording() }), [startRecording]);
  useEffect(() => { onRecordingChange?.(recorderState.isRecording); }, [onRecordingChange, recorderState.isRecording]);
  useEffect(() => () => onRecordingChange?.(false), [onRecordingChange]);
  useEffect(() => { onOpenChange?.(open); }, [onOpenChange, open]);
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);

  if (recorderState.isRecording) return <View style={styles.recording}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={() => void cancelRecording()} style={({ pressed }) => [styles.recordingAction, { backgroundColor: theme.surfaceElevated }, pressed && styles.actionPressed]}><Icon name="close" size={21} color={theme.textSecondary} /></Pressable>
    <View accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${formatRecordingTime(recorderState.durationMillis)}`} style={styles.recordingStatus}>
      <View style={styles.recordingLabel}><View style={[styles.recordingDot, { backgroundColor: theme.danger }]} /><AppText style={[styles.recordingText, { color: theme.textSecondary }]}>Recording</AppText></View>
      <AppText style={[styles.recordingTime, { color: theme.textPrimary }]}>{formatRecordingTime(recorderState.durationMillis)}</AppText>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Use recording" accessibilityHint="Stops recording and prepares it to send" onPress={() => void finishRecording()} style={({ pressed }) => [styles.recordingAction, { backgroundColor: theme.accent }, pressed && styles.actionPressed]}><Icon name="checkmark" size={22} color={theme.accentText} /></Pressable>
  </View>;

  return <><Pressable accessibilityRole="button" accessibilityLabel="Add attachment" accessibilityState={{ disabled: disabled || saving }} disabled={disabled || saving} onPress={() => setOpen(true)} style={[styles.trigger, (disabled || saving) && styles.disabled]}><Icon name="add" size={24} color={theme.textSecondary} /></Pressable><Modal transparent visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><Pressable style={styles.backdrop} onPress={() => setOpen(false)}><Pressable style={styles.sheetShield} onPress={() => undefined}><BottomSheetSurface><View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />{choose('Photo', 'image-outline', () => void pickMedia('photo'))}{choose('Video', 'videocam-outline', () => void pickMedia('video'))}{choose('Audio', 'mic-outline', () => void startRecording())}{choose('File', 'document-outline', () => void pickFile())}{choose('Cancel', 'close-outline', () => setOpen(false))}</BottomSheetSurface></Pressable></Pressable></Modal></>;
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
