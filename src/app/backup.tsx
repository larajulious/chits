import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { Text, View } from 'react-native';
export default function BackupPreview() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}><Text>{tr("backup.backupRestoreIsAvailableInTheChitsIos")}</Text></View>;
}
