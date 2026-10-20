import { useEffect, useState } from 'react';
import { View, Switch } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/primitives';
import { widgetPrivacy, WIDGET_PRIVACY_KEY, type WidgetPrivacy } from './snapshot';
export function WidgetPrivacySettings() {
  'use no memo';
  useLocale();
  const database = useSQLiteContext();
  const { tokens } = useTheme();
  const [privacy, setPrivacy] = useState<WidgetPrivacy>('hidden');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted = true;
    void database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', WIDGET_PRIVACY_KEY)
      .then(row => { if (mounted) setPrivacy(widgetPrivacy(row?.value)); })
      .catch(() => { if (mounted) setError(true); })
      .finally(() => { if (mounted) setBusy(false); });
    return () => { mounted = false; };
  }, [database]);
  const change = async (next: WidgetPrivacy) => {
    setBusy(true); setError(false);
    try {
      await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', WIDGET_PRIVACY_KEY, next, Date.now());
      setPrivacy(next);
    } catch { setError(true); }
    finally { setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    <AppText style={{ color: tokens.textSecondary }}>{tr('anywhere.warning')}</AppText>
    {(['titles', 'previews'] as const).map(key => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <AppText style={{ flex: 1, color: tokens.textPrimary }}>{tr(`anywhere.${key}`)}</AppText>
      <Switch accessibilityLabel={tr(`anywhere.${key}`)} disabled={busy || (key === 'previews' && privacy === 'hidden')} value={key === 'titles' ? privacy !== 'hidden' : privacy === 'previews'} onValueChange={enabled => { void change(key === 'titles' ? enabled ? 'titles' : 'hidden' : enabled ? 'previews' : 'titles'); }} />
    </View>)}
    {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('settings.thatSettingCouldNotBeSavedPleaseTry')}</AppText> : null}
  </View>;
}
