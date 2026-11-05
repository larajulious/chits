import { useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { SettingsNote, SettingsToggleRow } from '@/components/settings/settings-rows';
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
  // Previews only exist alongside titles, so turning titles off turns both off.
  return <>
    <SettingsNote>{tr('anywhere.warning')}</SettingsNote>
    <SettingsToggleRow label={tr('anywhere.titles')} value={privacy !== 'hidden'} disabled={busy} onChange={(enabled) => { void change(enabled ? 'titles' : 'hidden'); }} />
    <SettingsToggleRow label={tr('anywhere.previews')} value={privacy === 'previews'} disabled={busy || privacy === 'hidden'} onChange={(enabled) => { void change(enabled ? 'previews' : 'titles'); }} />
    {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger, paddingHorizontal: 14, paddingVertical: 10 }}>{tr('settings.thatSettingCouldNotBeSavedPleaseTry')}</AppText> : null}
  </>;
}
