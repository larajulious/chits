import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme, type AppAppearance } from '@/components/theme-provider';
import { IconButton } from '@/components/ui/primitives';
import { ChitsLoaderOverlay } from '@/components/ui/chits-loader';
import { EditNoteSpaceNameSheet } from '@/components/settings/edit-notespace-name-sheet';
import { type ChatThemeKey } from '@/constants/theme';
// eslint-disable-next-line import/no-unresolved -- Expo resolves platform file suffixes at runtime.
import { createBackup, discardValidatedBackup, restoreBackup, validateBackup } from '@/services/backup-service';
import { triggerAppReset } from '@/services/app-reset';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Sheet = 'appearance' | 'backup' | null;
const appearanceNames = { system: 'System', light: 'Light', dark: 'Dark' };

function SettingsRow({ label, value, description, onPress, disabled }: { label: string; value?: string; description?: string; onPress?: () => void; disabled?: boolean }) {
  const { tokens } = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress || disabled} onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
    <View style={styles.rowCopy}><Text style={[styles.label, { color: tokens.textPrimary }]}>{label}</Text>{description ? <Text style={[styles.description, { color: tokens.textSecondary }]}>{description}</Text> : null}</View>
    {value ? <Text style={[styles.value, { color: tokens.textSecondary }]}>{value}</Text> : null}
    {onPress ? <Ionicons accessible={false} name="chevron-forward" size={17} color={tokens.textMuted} /> : null}
  </Pressable>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return <View style={styles.section}><Text accessibilityRole="header" style={[styles.sectionLabel, { color: tokens.textSecondary }]}>{title}</Text>{children}</View>;
}

export default function SettingsScreen() {
  const { openDrawer } = useAppDrawer();
  const { appearance, setAppearance, themeKey, setThemeKey, themes, tokens } = useTheme();
  const database = useSQLiteContext();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState<'backup' | 'restore' | null>(null);
  // Same single source of truth as Chat's header, Boards' header, and the drawer —
  // all independently read this same app_settings key, refetched here on focus so
  // a rename made elsewhere is reflected without restarting the app.
  const [noteSpaceName, setNoteSpaceName] = useState('Chits');
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [backup, titleRow] = await Promise.all([
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'last_backup_at'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
      ]);
      setLastBackup(backup?.value ?? null);
      setNoteSpaceName(titleRow?.value.trim() || 'Chits');
    } catch { setError('Some settings could not be loaded. Reopen Settings to try again.'); }
  }, [database]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  const saveNoteSpaceName = async (name: string) => {
    await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_title', name, Date.now());
    setNoteSpaceName(name);
    setToast('NoteSpace name updated');
  };
  const change = async (action: () => Promise<void>, close = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); if (close) setSheet(null); }
    catch { setError('That setting could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };
  const closeSheet = () => { if (!busy && !backupBusy) setSheet(null); };

  const createBackupFile = async () => {
    if (backupBusy) return;
    setBackupBusy('backup'); setError(null);
    try {
      const zipPath = await createBackup(database);
      // Sharing failing/being dismissed shouldn't block the "backup created"
      // confirmation below — the zip itself already exists on disk at this point,
      // which is what "success" actually means per the acceptance criteria.
      try { if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(zipPath, { mimeType: 'application/zip', dialogTitle: 'Save Chits backup' }); } catch { /* not fatal */ }
      const now = Date.now();
      await database.runAsync("INSERT INTO app_settings (key, value, updated_at) VALUES ('last_backup_at', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", String(now), now);
      setLastBackup(String(now));
      Alert.alert('Backup created', 'Your Chits backup is ready.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chits could not create a backup. Please try again.');
    } finally {
      setBackupBusy(null);
    }
  };

  const performRestore = async (extractedDir: string) => {
    setBackupBusy('restore');
    try {
      await restoreBackup(extractedDir);
      setBackupBusy(null);
      Alert.alert('Restore complete', 'Your Chits data has been restored.', [{ text: 'Continue', onPress: () => { setSheet(null); triggerAppReset(); } }]);
    } catch {
      setBackupBusy(null);
      Alert.alert('Restore failed', 'Your current data was not changed.');
    }
  };

  const pickAndRestoreBackup = async () => {
    if (backupBusy) return;
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: ['application/zip', 'application/x-zip-compressed', '*/*'], copyToCacheDirectory: true });
    } catch {
      setError('Chits could not open the file picker. Please try again.');
      return;
    }
    if (picked.canceled) return; // Cancelling is not an error — current data is untouched either way.
    const fileUri = picked.assets[0]?.uri;
    if (!fileUri) return;
    setBackupBusy('restore'); setError(null);
    const validation = await validateBackup(fileUri);
    setBackupBusy(null);
    if (!validation.valid) { Alert.alert('Invalid backup', validation.reason); return; }
    Alert.alert('Restore this backup?', 'Your current Chits data will be replaced by the data in this backup.', [
      { text: 'Cancel', style: 'cancel', onPress: () => void discardValidatedBackup(validation.extractedDir) },
      { text: 'Restore', style: 'destructive', onPress: () => void performRestore(validation.extractedDir) },
    ]);
  };

  const links = Constants.expoConfig?.extra ?? {};
  const externalRows = [['Support', links.supportUrl], ['Privacy Policy', links.privacyPolicyUrl], ['Terms', links.termsUrl]] as const;
  const validLink = (value: unknown): value is string => typeof value === 'string' && /^(https:\/\/|mailto:)/.test(value);
  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <View style={styles.header}><IconButton label="Open navigation" onPress={openDrawer}><Ionicons accessible={false} name="reorder-two-outline" size={24} color={tokens.textPrimary} /></IconButton><Text accessibilityRole="header" style={[styles.headerTitle, { color: tokens.textPrimary }]}>Settings</Text><View style={styles.headerBalance} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      {error && !sheet ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
      <Section title="NOTESPACE">
        <SettingsRow label="Edit NoteSpace name" description="Change the name shown across your NoteSpace" onPress={() => setEditNameOpen(true)} />
      </Section>
      <Section title="APPEARANCE">
        <SettingsRow label="App appearance" value={appearanceNames[appearance]} onPress={() => setSheet('appearance')} />
        <View style={styles.paletteBlock}>
          <Text style={[styles.label, { color: tokens.textPrimary }]}>App color theme</Text>
          <Text style={[styles.description, { color: tokens.textSecondary }]}>Used for controls and accents throughout Chits.</Text>
          <View style={[styles.preview, { backgroundColor: themeKey === 'light' ? tokens.accentSoft : tokens.accent }]}><Text style={{ color: themeKey === 'light' ? tokens.textPrimary : tokens.accentText }}>My thought</Text></View>
          <View style={styles.palette}>{(Object.keys(themes) as ChatThemeKey[]).map((key) => {
            const selected = themeKey === key;
            const color = key === 'light' ? '#E9E9E9' : themes[key].light.accent;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={themes[key].name} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => void change(() => setThemeKey(key))} style={({ pressed }) => [styles.swatchTarget, { borderColor: selected ? tokens.textPrimary : 'transparent' }, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: color }]}>{selected ? <Ionicons accessible={false} name="checkmark" size={18} color={key === 'light' ? '#0D0D0D' : '#FFFFFF'} /> : null}</View>
            </Pressable>;
          })}</View>
          <Text accessibilityLiveRegion="polite" style={[styles.description, { color: tokens.textSecondary }]}>{themes[themeKey].name}</Text>
        </View>
      </Section>
      <Section title="DATA"><SettingsRow label="Backup & Restore" description={lastBackup && !Number.isNaN(new Date(Number(lastBackup)).getTime()) ? 'Last backup: ' + new Date(Number(lastBackup)).toLocaleDateString() : 'Last backup: Never'} onPress={() => setSheet('backup')} /></Section>

    </ScrollView>
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: tokens.surface }]}>
          <View style={styles.sheetHeader}><Text accessibilityRole="header" style={[styles.sheetTitle, { color: tokens.textPrimary }]}>{sheet === 'appearance' ? 'App appearance' : 'Backup & Restore'}</Text><IconButton label="Close settings sheet" disabled={busy} onPress={closeSheet}><Ionicons name="close-outline" size={22} color={tokens.textSecondary} /></IconButton></View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {sheet === 'appearance' ? (['system', 'light', 'dark'] as AppAppearance[]).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: appearance === mode, disabled: busy }} disabled={busy} onPress={() => void change(() => setAppearance(mode), true)} style={styles.choice}><Text style={[styles.label, { color: tokens.textPrimary }]}>{appearanceNames[mode]}</Text>{appearance === mode ? <Ionicons name="checkmark" size={22} color={tokens.accent} /> : null}</Pressable>) : null}
            {sheet === 'backup' ? <>
              <Text style={[styles.body, { color: tokens.textSecondary }]}>Backups include your chats, boards, cards, comments, and attachments.</Text>
              <SettingsRow label="Last backup" value={lastBackup && !Number.isNaN(new Date(Number(lastBackup)).getTime()) ? new Date(Number(lastBackup)).toLocaleString() : 'Never'} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: backupBusy !== null }}
                disabled={backupBusy !== null}
                onPress={() => void createBackupFile()}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: tokens.accent }, backupBusy !== null && styles.disabled, pressed && styles.pressed]}
              >
                {backupBusy === 'backup' ? <ActivityIndicator color={tokens.accentText} /> : <Text style={[styles.primaryButtonText, { color: tokens.accentText }]}>Create Backup</Text>}
              </Pressable>
              <Text style={[styles.body, { color: tokens.textSecondary }]}>Restore your chats, boards, and attachments from a previous backup.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: backupBusy !== null }}
                disabled={backupBusy !== null}
                onPress={() => void pickAndRestoreBackup()}
                style={({ pressed }) => [styles.secondaryButton, { backgroundColor: tokens.background, borderColor: tokens.borderSubtle }, backupBusy !== null && styles.disabled, pressed && styles.pressed]}
              >
                {backupBusy === 'restore' ? <ActivityIndicator color={tokens.textPrimary} /> : <Text style={[styles.secondaryButtonText, { color: tokens.textPrimary }]}>Restore Backup</Text>}
              </Pressable>
            </> : null}
            {busy ? <ActivityIndicator accessibilityLabel="Saving setting" color={tokens.accent} /> : null}
            {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    <EditNoteSpaceNameSheet visible={editNameOpen} currentName={noteSpaceName} onClose={() => setEditNameOpen(false)} onSave={saveNoteSpaceName} />
    {toast ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.toastWrap}><View style={[styles.toast, { backgroundColor: tokens.textPrimary }]}><Text style={[styles.toastText, { color: tokens.background }]}>{toast}</Text></View></View> : null}
    {backupBusy ? <ChitsLoaderOverlay label={backupBusy === 'backup' ? 'Creating backup…' : 'Restoring backup…'} /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' }, headerBalance: { width: 44 },
  content: { paddingHorizontal: 20, paddingBottom: 28 }, section: { marginTop: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1 }, label: { fontSize: 16 }, description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  value: { fontSize: 14, flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
  paletteBlock: { paddingTop: 12, paddingBottom: 2 }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  swatchTarget: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  preview: { alignSelf: 'flex-end', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 8 },
  pressed: { opacity: 0.65 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 8 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '600' }, sheetContent: { paddingHorizontal: 20, paddingBottom: 20 },
  choice: { minHeight: 50, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { fontSize: 15, lineHeight: 22, marginVertical: 8 },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 6 },
  primaryButtonText: { fontSize: 16, fontWeight: '700' },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, marginTop: 6, borderWidth: StyleSheet.hairlineWidth },
  secondaryButtonText: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  toastWrap: { position: 'absolute', right: 0, bottom: 32, left: 0, alignItems: 'center' },
  toast: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  toastText: { fontSize: 14, fontWeight: '600' },
});
