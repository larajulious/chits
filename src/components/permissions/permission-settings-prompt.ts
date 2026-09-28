import { Alert, Linking, Platform } from 'react-native';

export type SettingsPromptKind = 'microphone' | 'notifications' | 'photos';

const settingsName = Platform.OS === 'ios' ? 'iOS Settings' : 'Settings';
const COPY: Record<SettingsPromptKind, { title: string; message: string }> = {
  microphone: { title: 'Microphone Access Required', message: `To record a voice note, Chits needs access to your microphone. You can enable microphone access in ${settingsName}.` },
  photos: { title: 'Photos Access Required', message: `To save photos and videos, Chits needs permission to add them to your photo library. You can enable this in ${settingsName}.` },
  notifications: { title: 'Notifications Required', message: `To remind you about this card, Chits needs permission to send notifications. You can allow notifications in ${settingsName}.` },
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
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: () => void Linking.openSettings() },
  ]);
}
