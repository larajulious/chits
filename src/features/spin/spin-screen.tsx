import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppHeader, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';
import { FocusAction, FocusText } from '@/features/focus/focus-ui';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { createCustomSpinRepository } from '@/db/spin-custom-repository';
import { NoteSpinScreen } from './note-spin-screen';
import { CustomSpinScreen } from './custom-spin-screen';

export default function SpinScreen() {
  'use no memo';
  useLocale();
  const db = useSQLiteContext();
  const repo = useMemo(() => createCustomSpinRepository(db), [db]);
  const { tokens } = useTheme();
  const { actionSheet } = useAppDialog();
  // Read before the first frame (one tiny settings row), so Spin never shows a
  // stand-in screen and then swaps in a second header.
  const [mode, setMode] = useState<'notes' | 'custom' | null>(() => { try { return repo.modeSync(); } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (mode !== null) return;
    let active = true;
    void repo.mode().then(value => { if (active) setMode(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [mode, repo]);
  const changeMode = async (next: 'notes' | 'custom') => {
    if (busy || saving || mode === next) return;
    setSaving(true); setError(false);
    try { await repo.setMode(next); setMode(next); }
    catch { setError(true); }
    finally { setSaving(false); }
  };
  const modeAction = <IconButton label={`${tr('spin.mode.change')}: ${tr(mode === 'custom' ? 'spin.mode.custom' : 'spin.mode.notes')}`} disabled={busy || saving} onPress={() => actionSheet({
    title: tr('spin.mode.change'),
    options: [
      { label: tr('spin.mode.notes'), icon: mode === 'notes' ? 'checkmark-circle-outline' : 'documents-outline', disabled: mode === 'notes', onPress: () => void changeMode('notes') },
      { label: tr('spin.mode.custom'), icon: mode === 'custom' ? 'checkmark-circle-outline' : 'pie-chart-outline', disabled: mode === 'custom', onPress: () => void changeMode('custom') },
    ],
  })}><HeaderIcon name={mode === 'custom' ? 'pie-chart-outline' : 'documents-outline'} size={22} /></IconButton>;
  const modeNotice = error ? <FocusText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('spin.error')}</FocusText> : null;
  if (mode === null) return <Screen><AppHeader title={tr('spin.title')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    {error ? <View style={styles.control}><FocusText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('spin.error')}</FocusText><FocusAction onPress={() => { setError(false); void repo.mode().then(setMode).catch(() => setError(true)); }}>{tr('spin.again')}</FocusAction></View> : <ActivityIndicator color={tokens.accent} />}
  </Screen>;
  return mode === 'custom' ? <CustomSpinScreen modeAction={modeAction} modeNotice={modeNotice} onBusyChange={setBusy} /> : <NoteSpinScreen modeAction={modeAction} modeNotice={modeNotice} onBusyChange={setBusy} />;
}
const styles = StyleSheet.create({ control: { gap: 8 } });
