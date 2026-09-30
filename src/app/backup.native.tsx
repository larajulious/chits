import { usePreventRemove } from 'expo-router/react-navigation';
import * as DocumentPicker from 'expo-document-picker';
import * as FS from 'expo-file-system/legacy';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { headingFontFamily } from '@/constants/theme';
import { ChitsLoaderOverlay } from '@/components/ui/chits-loader';
import { HeaderIcon, IconButton, TopBarBackground, useHeaderInk } from '@/components/ui/primitives';
import { triggerAppReset } from '@/services/app-reset';
import type { BackupProgress } from '@/services/backup-operation';
// eslint-disable-next-line import/no-unresolved -- Expo selects the native service on iOS/Android.
import { backupErrorMessage, createBackup, discardCreatedBackup, discardValidatedBackup, RestoreError, restoreBackup, saveBackupFile, validateBackup, type CreatedBackup, type ValidatedBackup } from '@/services/backup-service';

function sizeLabel(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function quantity(count: number, noun: string) { return `${count} ${noun}${count === 1 ? '' : 's'}`; }
export default function BackupScreen() {
  const database = useSQLiteContext();
  const { tokens, look } = useTheme();
  const headerInk = useHeaderInk();
  const { confirm } = useAppDialog();
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedBackup | null>(null);
  const [needsSave, setNeedsSave] = useState(false);
  const [pending, setPending] = useState<ValidatedBackup | null>(null);
  const locked = useRef(false);
  const pendingRef = useRef<ValidatedBackup | null>(null);
  const createdRef = useRef<CreatedBackup | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingRef.current) void discardValidatedBackup(pendingRef.current);
      if (createdRef.current) void discardCreatedBackup(createdRef.current.uri);
    };
  }, []);
  usePreventRemove(progress !== null || pending !== null, () => {});
  const updateProgress = (next: BackupProgress) => { if (mounted.current) setProgress(next); };
  const start = (label: string) => {
    if (locked.current) return false;
    locked.current = true; setProgress({ label }); setError(null); setNotice(null);
    return true;
  };
  const finish = () => { locked.current = false; if (mounted.current) setProgress(null); };
  const save = async (backup: CreatedBackup) => {
    const saved = await saveBackupFile(backup.uri);
    if (!saved) { setNotice('Backup created. Choose Save Backup File to keep a copy.'); return; }
    // Export success is independent of the optional local "last backup" display.
    const now = Date.now();
    await database.runAsync("INSERT INTO app_settings (key, value, updated_at) VALUES ('last_backup_at', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", String(now), now).catch(() => undefined);
    setNotice('Backup saved');
    await discardCreatedBackup(backup.uri);
    createdRef.current = null;
    setNeedsSave(false);
  };
  const create = async () => {
    if (!start('Preparing backup…')) return;
    try {
      if (createdRef.current) await discardCreatedBackup(createdRef.current.uri);
      setCreated(null); setNeedsSave(false); createdRef.current = null;
      const backup = await createBackup(database, updateProgress);
      createdRef.current = backup; setCreated(backup);
      setNeedsSave(true);
      updateProgress({ label: 'Saving backup…' });
      await save(backup);
    } catch (cause) {
      console.warn('[backup] create/save failed', cause);
      setError(backupErrorMessage(cause, 'The backup could not be saved. Choose another location and try again.'));
    } finally { finish(); }
  };
  const saveAgain = async () => {
    if (!createdRef.current || !start('Saving backup…')) return;
    try { await save(createdRef.current); }
    catch (cause) { setError(backupErrorMessage(cause, 'The backup could not be saved. Choose another location and try again.')); }
    finally { finish(); }
  };
  const cancelRestore = async (backup: ValidatedBackup) => {
    pendingRef.current = null; setPending(null);
    await discardValidatedBackup(backup);
  };
  const restore = async (backup: ValidatedBackup) => {
    if (!start('Preparing restore…')) return;
    // The confirmation dialog closes as soon as its synchronous callback returns.
    try {
      await restoreBackup(backup, database, updateProgress);
      pendingRef.current = null;
      const missing = backup.manifest.missingAttachments.length;
      triggerAppReset({ type: missing ? 'warning' : 'success', title: 'Restore complete', message: missing ? `Your Chits data and available attachments have been restored. ${missing} attachment${missing === 1 ? ' was' : 's were'} already missing when this backup was created.` : 'Your Chits data and attachments have been restored.' });
    } catch (cause) {
      const message = backupErrorMessage(cause, 'The backup could not be restored. Your previous Chits data has been kept.');
      pendingRef.current = null;
      await discardValidatedBackup(backup);
      if (cause instanceof RestoreError && cause.liveClosed) {
        triggerAppReset({ type: 'warning', title: 'Restore failed', message });
        return;
      }
      setPending(null); setError(message);
    } finally { finish(); }
  };
  const choose = async () => {
    if (!start('Choose a backup file…')) return;
    let pickedUri: string | null = null;
    let selected: ValidatedBackup | null = null;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
      if (picked.canceled) return;
      pickedUri = picked.assets[0]?.uri ?? null;
      if (!pickedUri) throw new Error('No file selected');
      const validation = await validateBackup(pickedUri, updateProgress);
      if (!validation.valid) { setError(validation.reason); return; }
      selected = validation;
    } catch (cause) {
      setError(backupErrorMessage(cause, 'Chits could not open the backup file. Choose another file and try again.'));
    } finally {
      // DocumentPicker explicitly copies into cache; never delete a provider's original.
      if (pickedUri && FS.cacheDirectory && pickedUri.startsWith(FS.cacheDirectory)) await FS.deleteAsync(pickedUri, { idempotent: true }).catch(() => undefined);
      finish();
    }
    if (!selected) return;
    const validation = selected;
    pendingRef.current = validation; setPending(validation);
    const manifest = validation.manifest;
    const warning = manifest.missingAttachments.length ? `\n\n${quantity(manifest.missingAttachments.length, 'attachment')} ${manifest.missingAttachments.length === 1 ? 'is' : 'are'} missing from this backup and cannot be recovered from this file.` : '';
    confirm({ type: 'destructive', icon: 'refresh-outline', title: 'Restore this backup?', confirmText: 'Restore Backup', cancelText: 'Cancel', dismissOnBackdrop: false,
      message: `Your current Chits data will be replaced with the data stored in this backup.\n\nCreated ${new Date(manifest.createdAt).toLocaleString()}\n${quantity(manifest.chatItemCount, 'chat item')} · ${quantity(manifest.boardCount, 'board')} · ${quantity(manifest.cardCount, 'card')}\n${quantity(manifest.attachmentCount, 'attachment')} · ${sizeLabel(validation.size)}${warning}`,
      onConfirm: () => { void restore(validation); }, onCancel: () => cancelRestore(validation),
    });
  };
  const disabled = progress !== null || pending !== null;
  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <View style={styles.header}><TopBarBackground /><IconButton label="Back to settings" disabled={disabled} onPress={() => router.back()}><HeaderIcon name="arrow-back-outline" size={23} /></IconButton><Text accessibilityRole="header" style={[styles.title, { color: headerInk.ink, fontFamily: headingFontFamily(look.headingFont) }]}>Backup & Restore</Text><View style={{ width: 44 }} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.heading, { color: tokens.textPrimary }]}>Backup your Chits</Text>
        <Text style={[styles.body, { color: tokens.textSecondary }]}>Create a copy of your chats, boards, settings, and attachments.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void create()} style={[styles.button, { backgroundColor: tokens.accent }, disabled && styles.disabled]}><Text style={[styles.buttonText, { color: tokens.accentText }]}>Create Backup</Text></Pressable>
        {created ? <View accessibilityLiveRegion="polite" style={[styles.result, { backgroundColor: tokens.surface }]}>
          <Text style={[styles.resultTitle, { color: tokens.textPrimary }]}>{created.manifest.missingAttachments.length ? `Backup completed with ${created.manifest.missingAttachments.length} missing attachment${created.manifest.missingAttachments.length === 1 ? '' : 's'}.` : 'Backup created'}</Text>
          <Text style={[styles.body, { color: tokens.textSecondary }]}>{created.manifest.missingAttachments.length ? 'All available files are included. Files already missing from Chits could not be included.' : 'Your Chits data and attachments are safely included in this backup.'}</Text>
          <Text style={[styles.detail, { color: tokens.textSecondary }]}>{sizeLabel(created.size)} · {quantity(created.manifest.attachmentCount, 'attachment')} · {new Date(created.manifest.createdAt).toLocaleString()}</Text>
          {needsSave ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void saveAgain()} style={styles.save}><Text style={{ color: tokens.accent, fontWeight: '600' }}>Save Backup File</Text></Pressable> : null}
        </View> : null}
      </View>
      <View style={[styles.section, styles.restoreSection, { borderTopColor: tokens.borderSubtle }]}>
        <Text accessibilityRole="header" style={[styles.heading, { color: tokens.textPrimary }]}>Restore from Backup</Text>
        <Text style={[styles.body, { color: tokens.textSecondary }]}>Restore Chits from a previously created backup file.</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => void choose()} style={[styles.button, { backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderSubtle }, disabled && styles.disabled]}><Text style={[styles.buttonText, { color: tokens.textPrimary }]}>Choose Backup File</Text></Pressable>
        <Text style={[styles.detail, { color: tokens.textSecondary }]}>Restoring a backup replaces the data currently stored in Chits.</Text>
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.textPrimary }]}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.body, { color: tokens.danger }]}>{error}</Text> : null}
    </ScrollView>
    {progress ? <ChitsLoaderOverlay label={progress.total ? `${progress.label}\n${progress.completed ?? 0} of ${progress.total}` : progress.label} /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }, title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 24, paddingBottom: 32, gap: 20 }, section: { gap: 12, paddingTop: 26 }, restoreSection: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 28 },
  heading: { fontSize: 21, fontWeight: '600' }, body: { fontSize: 15, lineHeight: 23 }, detail: { fontSize: 12, lineHeight: 19 }, button: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', padding: 12, marginTop: 8 }, buttonText: { fontSize: 16, fontWeight: '600' }, disabled: { opacity: 0.5 },
  result: { borderRadius: 14, padding: 16, gap: 8, marginTop: 4 }, resultTitle: { fontSize: 15, fontWeight: '600' }, save: { minHeight: 44, justifyContent: 'center' },
});
