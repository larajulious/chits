// Chits schedules local reminders only. Expo SDK 57's package entry point also
// imports DevicePushTokenAutoRegistration.fx, which reads iOS push-registration
// keychain data at startup. Import the local APIs directly to avoid starting that
// unused registration flow. Keep these SDK-specific paths in this adapter and
// verify them when upgrading expo-notifications.
export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
export { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
export { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync';
export { getAllScheduledNotificationsAsync } from 'expo-notifications/build/getAllScheduledNotificationsAsync';
export {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  clearLastNotificationResponse,
  getLastNotificationResponse,
} from 'expo-notifications/build/NotificationsEmitter';
export { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
export { IosAuthorizationStatus } from 'expo-notifications/build/NotificationPermissions.types';
export type { NotificationPermissionsStatus } from 'expo-notifications/build/NotificationPermissions.types';
export { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
export type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
