import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppDialogProvider, useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useChatBackground, attachmentBackgroundImage } from '@/components/chat/chat-background-provider';
import { ChatBackgroundPreview } from '@/components/chat/chat-background-preview';
import { useAttachmentExport } from './use-attachment-export';
import { useAttachmentDeletion } from './use-attachment-deletion';
import { exportActionLabel, shareAttachment } from '@/services/attachment-export';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import type { AttachmentLike } from '@/db/types';

function PhotoContent({ attachment, onDismiss }: { attachment: AttachmentLike; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  const { actionSheet } = useAppDialog();
  const { isCurrentBackground } = useChatBackground();
  const download = useAttachmentExport();
  const deletion = useAttachmentDeletion();
  const [preview, setPreview] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [shareError, setShareError] = useState(false);
  useEffect(() => { if (!shareError) return; const timer = setTimeout(() => setShareError(false), 2400); return () => clearTimeout(timer); }, [shareError]);
  const current = isCurrentBackground(attachment);
  const more = () => actionSheet({ title: 'Photo', message: current ? 'Current Chat Background' : undefined, options: [
    { label: 'Set as Chat Background', icon: 'image-outline', onPress: () => setPreview(true) },
    { label: exportActionLabel(attachment), icon: 'download-outline', disabled: download.busy, onPress: () => void download.exportAttachment(attachment) },
    { label: 'Share', icon: 'share-outline', onPress: () => void shareAttachment(attachment).then((shared) => setShareError(!shared)) },
    { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => deletion.confirmDelete(attachment, () => setDeleted(true)) },
  ] });
  if (preview) return <ChatBackgroundPreview image={attachmentBackgroundImage(attachment)} onCancel={() => setPreview(false)} onApplied={onDismiss} />;
  const notice = deletion.status ?? (shareError ? 'This photo could not be shared.' : download.status);
  return <SafeAreaView style={styles.screen}>
    {deleted ? <Text style={styles.deleted}>Photo removed</Text> : <Image source={resolveAttachmentUri(attachment.storagePath)} contentFit="contain" autoplay={false} style={StyleSheet.absoluteFill} />}
    <View style={[styles.toolbar, { top: insets.top + 8 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onDismiss} style={styles.icon}><Ionicons accessible={false} name="close" size={24} color="#FFFFFF" /></Pressable>
      {!deleted ? <Pressable accessibilityRole="button" accessibilityLabel="Photo options" onPress={more} style={styles.icon}><Ionicons accessible={false} name="ellipsis-horizontal" size={24} color="#FFFFFF" /></Pressable> : null}
    </View>
    {current && !deleted ? <View style={[styles.indicator, { bottom: insets.bottom + 16 }]}><Text style={styles.indicatorText}>Current Chat Background</Text></View> : null}
    {notice ? <View style={[styles.notice, { bottom: insets.bottom + 64 }]}><Text accessibilityRole={deletion.status ? 'alert' : undefined} accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text></View> : null}
  </SafeAreaView>;
}

// The photo and its background preview share one native modal host.
export function PhotoAttachmentViewer({ attachment, onDismiss }: { attachment: AttachmentLike; onDismiss: () => void }) {
  return <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={onDismiss}><SafeAreaProvider><AppDialogProvider><PhotoContent attachment={attachment} onDismiss={onDismiss} /></AppDialogProvider></SafeAreaProvider></Modal>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }, toolbar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)' }, indicator: { position: 'absolute', alignSelf: 'center', borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 14, paddingVertical: 8 }, indicatorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' }, notice: { position: 'absolute', maxWidth: '86%', alignSelf: 'center', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12 }, noticeText: { color: '#111111', textAlign: 'center', fontSize: 14 }, deleted: { color: '#FFFFFF', fontSize: 18 } });
