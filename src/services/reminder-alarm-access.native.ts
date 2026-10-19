import { tr } from '@/localization/runtime';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type ReminderAlarmModule = {
  canScheduleAsync(): Promise<boolean>;
  openSettingsAsync(): Promise<void>;
  restorePendingAsync(): Promise<void>;
};
const native = Platform.OS === 'android' ? requireOptionalNativeModule<ReminderAlarmModule>("ChitsReminderAlarm") : null;

export async function hasExactReminderAccess(): Promise<boolean> {
  return Platform.OS !== 'android' || (native ? native.canScheduleAsync() : false);
}
export async function openReminderAlarmSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!native) throw new Error(tr("reminderalarmaccess.rebuildChitsToEnableAndroidReminderAlarmAccess"));
  await native.openSettingsAsync();
}
export async function restorePendingReminderAlarms(): Promise<void> {
  await native?.restorePendingAsync();
}
