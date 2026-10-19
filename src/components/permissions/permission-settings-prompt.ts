import { tr } from '@/localization/runtime';
import { Alert, Linking, Platform } from 'react-native';

export type SettingsPromptKind = 'microphone' | 'notifications' | 'photos';

const settingsName = Platform.OS === 'ios' ? 'iOS' : 'Android';
const COPY: Record<SettingsPromptKind, { title: string; message: string }> = {
  microphone: { get title() { return tr("permissionsettingsprompt.microphoneAccessRequired"); }, get message() { return tr("permissionsettingsprompt.toRecordAVoiceNoteChitsNeedsAccess", { value1: settingsName }); } },
  photos: { get title() { return tr("permissionsettingsprompt.photosAccessRequired"); }, get message() { return tr("permissionsettingsprompt.toSavePhotosAndVideosChitsNeedsPermission", { value1: settingsName }); } },
  notifications: { get title() { return tr("permissionsettingsprompt.notificationsRequired"); }, get message() { return tr("permissionsettingsprompt.toRemindYouAboutThisCardChitsNeeds", { value1: settingsName }); } },
};

/**
 * Only for a permission that is 'blocked' (see services/permissions) — i.e.
 * the user tried the feature again after declining earlier. Never call it
 * right after the system prompt was declined. Settings opens only on an
 * explicit tap. A native alert is used so it can appear over an open sheet.
 */
export function showPermissionSettingsPrompt(kind: SettingsPromptKind) {
  const copy = COPY[kind];
  Alert.alert(copy.title, copy.message, [
    { text: tr("chat.cancel"), style: 'cancel' },
    { text: tr("calendar.openSettings"), onPress: () => void Linking.openSettings() },
  ]);
}
