import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { getMediaLibraryPermissionsAsync, requestMediaLibraryPermissionsAsync } from 'expo-image-picker';

import { resolvePermission } from './permission-state';

export { resolvePermission, type PermissionState } from './permission-state';

/**
 * For recording a voice note. (Picking photos/videos needs no permission: the
 * system picker runs outside Chits and returns only what the user chooses.)
 */
export function ensureMicrophonePermission() {
  return resolvePermission(getRecordingPermissionsAsync, requestRecordingPermissionsAsync);
}

/**
 * Add-only Photos access (iOS "Save to Photos"): lets Chits add a copy to the
 * library without reading it. The same access the native save requests, checked
 * here first so a just-declined prompt and a repeat attempt can be told apart.
 */
export function ensurePhotosAddPermission() {
  return resolvePermission(() => getMediaLibraryPermissionsAsync(true), () => requestMediaLibraryPermissionsAsync(true));
}
