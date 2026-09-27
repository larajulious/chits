import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import type { Attachment, MessageType } from '@/db/types';
import { persistAttachment } from '@/services/attachment-storage';
import { dismissKeyboardAsync } from '@/services/keyboard';

// An attachment already copied into Chits storage but not yet saved on a
// note. `remove` deletes that copy if the user discards it.
export type AttachmentDraft = {
  attachment: Omit<Attachment, 'id' | 'messageId' | 'createdAt'>;
  remove: () => Promise<void>;
};

type Metadata = { originalName: string | null; mimeType: string | null; size: number | null; duration: number | null; width: number | null; height: number | null };

/** Copies a picked/recorded file into Chits storage (photos are optimized) and returns it as a draft. */
export async function stageAttachment(sourceUri: string, type: MessageType, metadata: Metadata): Promise<AttachmentDraft> {
  try {
    return await persistAttachment(sourceUri, { type, ...metadata });
  } catch (error) {
    console.warn('[attachment-import]', { type, operation: 'stage', error: error instanceof Error ? error.message : 'Unknown error', scheme: sourceUri.split(':', 1)[0] });
    throw error instanceof Error ? error : new Error('The attachment could not be prepared.');
  }
}

/**
 * Shared by Chat's composer and the Add note sheet: opens the photo or video
 * library and stages the chosen item. Resolves null if the user cancels;
 * throws an Error with a user-facing message otherwise.
 */
export async function pickAndStageMedia(type: 'photo' | 'video'): Promise<AttachmentDraft | null> {
  // The library permission prompt is a dialog-style activity on Android; see dismissKeyboardAsync.
  await dismissKeyboardAsync();
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error(permission.canAskAgain ? 'Photo library access is needed to attach that item.' : 'Photo access is turned off for Chits. Turn it on in Settings › Apps › Chits › Permissions.');
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
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) throw new Error('That media item could not be read. Please try another one.');
  return stageAttachment(asset.uri, type, { originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, size: asset.fileSize ?? null, duration: asset.duration ?? null, width: asset.width || null, height: asset.height || null });
}

/** Opens the system document picker and stages the chosen file. Resolves null if cancelled. */
export async function pickAndStageFile(): Promise<AttachmentDraft | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) throw new Error('That file could not be read. Please try another one.');
  return stageAttachment(asset.uri, 'file', { originalName: asset.name, mimeType: asset.mimeType ?? null, size: asset.size ?? null, duration: null, width: null, height: null });
}
