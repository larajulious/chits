import { countLabel, getFormattingLocale, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
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
import { PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PaperAction, PaperDesk, PaperNote, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { headingFontFamily } from '@/constants/theme';
import { ChitsLoaderOverlay } from '@/components/ui/chits-loader';
import { HeaderIcon, IconButton, TopBarBackground, useHeaderInk } from '@/components/ui/primitives';
import { triggerAppReset } from '@/services/app-reset';
import type { BackupProgress } from '@/services/backup-operation';
// eslint-disable-next-line import/no-unresolved -- Expo selects the native service on iOS/Android.
import { backupErrorMessage, createBackup, discardCreatedBackup, discardValidatedBackup, RestoreError, restoreBackup, saveBackupFile, validateBackup, type CreatedBackup, type ValidatedBackup } from '@/services/backup-service';

function sizeLabel(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function quantity(count: number, noun: string) { return countLabel(noun, count); }
export default function BackupScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { look } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
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
    if (!saved) { setNotice(tr("backup.backupCreatedChooseSaveBackupFileToKeep")); return; }
    // Export success is independent of the optional local "last backup" display.
    const now = Date.now();
    await database.runAsync("INSERT INTO app_settings (key, value, updated_at) VALUES ('last_backup_at', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", String(now), now).catch(() => undefined);
    setNotice(tr("backup.backupSaved"));
    await discardCreatedBackup(backup.uri);
    createdRef.current = null;
    setNeedsSave(false);
  };
  const create = async () => {
    if (!start(tr("backup.preparingBackup"))) return;
    try {
      if (createdRef.current) await discardCreatedBackup(createdRef.current.uri);
      setCreated(null); setNeedsSave(false); createdRef.current = null;
      const backup = await createBackup(database, updateProgress);
      createdRef.current = backup; setCreated(backup);
      setNeedsSave(true);
      updateProgress({ label: tr("backup.savingBackup") });
      await save(backup);
    } catch (cause) {
      console.warn('[backup] create/save failed', cause);
      setError(backupErrorMessage(cause, tr("backup.theBackupCouldNotBeSavedChooseAnother")));
    } finally { finish(); }
  };
  const saveAgain = async () => {
    if (!createdRef.current || !start(tr("backup.savingBackup"))) return;
    try { await save(createdRef.current); }
    catch (cause) { setError(backupErrorMessage(cause, tr("backup.theBackupCouldNotBeSavedChooseAnother"))); }
    finally { finish(); }
  };
  const cancelRestore = async (backup: ValidatedBackup) => {
    pendingRef.current = null; setPending(null);
    await discardValidatedBackup(backup);
  };
  const restore = async (backup: ValidatedBackup) => {
    if (!start(tr("backup.preparingRestore"))) return;
    // The confirmation dialog closes as soon as its synchronous callback returns.
    try {
      await restoreBackup(backup, database, updateProgress);
      pendingRef.current = null;
      const missing = backup.manifest.missingAttachments.length;
      triggerAppReset({ type: missing ? 'warning' : 'success', title: tr("backup.restoreComplete"), message: missing ? tr('backup.restoredMissing', { count: missing }) : tr("backup.yourChitsDataAndAttachmentsHaveBeenRestored") });
    } catch (cause) {
      const message = backupErrorMessage(cause, tr("backup.theBackupCouldNotBeRestoredYourPrevious"));
      pendingRef.current = null;
      await discardValidatedBackup(backup);
      if (cause instanceof RestoreError && cause.liveClosed) {
        triggerAppReset({ type: 'warning', title: tr("backup.restoreFailed"), message });
        return;
      }
      setPending(null); setError(message);
    } finally { finish(); }
  };
  const choose = async () => {
    if (!start(tr("backup.chooseABackupFile"))) return;
    let pickedUri: string | null = null;
    let selected: ValidatedBackup | null = null;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', multiple: false, copyToCacheDirectory: true });
      if (picked.canceled) return;
      pickedUri = picked.assets[0]?.uri ?? null;
      if (!pickedUri) throw new Error(tr("backup.noFileSelected"));
      const validation = await validateBackup(pickedUri, updateProgress);
      if (!validation.valid) { setError(validation.reason); return; }
      selected = validation;
    } catch (cause) {
      setError(backupErrorMessage(cause, tr("backup.chitsCouldNotOpenTheBackupFileChoose")));
    } finally {
      // DocumentPicker explicitly copies into cache; never delete a provider's original.
      if (pickedUri && FS.cacheDirectory && pickedUri.startsWith(FS.cacheDirectory)) await FS.deleteAsync(pickedUri, { idempotent: true }).catch(() => undefined);
      finish();
    }
    if (!selected) return;
    const validation = selected;
    pendingRef.current = validation; setPending(validation);
    const manifest = validation.manifest;
    const warning = manifest.missingAttachments.length ? '\n\n' + tr('backup.missingWarning', { count: manifest.missingAttachments.length }) : '';
    confirm({ type: 'destructive', icon: 'refresh-outline', title: tr("backup.restoreThisBackup"), confirmText: tr("backup.restoreBackup"), cancelText: tr("chat.cancel"), dismissOnBackdrop: false,
      message: tr("backup.yourCurrentChitsDataWillBeReplacedWith", { value1: new Date(manifest.createdAt).toLocaleString(getFormattingLocale()), value2: quantity(manifest.chatItemCount, 'chat item'), value3: quantity(manifest.boardCount, 'board'), value4: quantity(manifest.cardCount, 'card'), value5: quantity(manifest.attachmentCount, 'attachment'), value6: sizeLabel(validation.size), value7: warning }),
      onConfirm: () => { void restore(validation); }, onCancel: () => cancelRestore(validation),
    });
  };
  const disabled = progress !== null || pending !== null;
  return <SafeAreaView style={[styles.screen, { backgroundColor: desk.desk }]}>
    <View style={styles.header}><TopBarBackground /><IconButton label={tr("backup.backToSettings")} disabled={disabled} onPress={() => router.back()}><HeaderIcon name="arrow-back-outline" size={23} /></IconButton><Text accessibilityRole="header" style={[styles.title, { color: headerInk.ink, fontFamily: headingFontFamily(look.headingFont) }]}>{tr("backup.backupRestore")}</Text><View style={{ width: 44 }} /></View>
    <PaperDesk>
    <ScrollView contentContainerStyle={styles.content}>
      <PaperNote paper={PAPER_WHITE} tilt={-0.6} tape style={styles.section}>
        <Text accessibilityRole="header" style={[handBold, styles.heading]}>{tr("backup.backupYourChits")}</Text>
        <Text style={styles.body}>{tr("backup.createACopyOfYourChatsBoardsSettings")}</Text>
        <PaperAction primary label={tr("backup.createBackup")} accessibilityState={{ disabled }} disabled={disabled} onPress={() => void create()} containerStyle={styles.action} />
        {created ? <View accessibilityLiveRegion="polite" style={styles.result}>
          <Text style={[handBold, styles.resultTitle]}>{created.manifest.missingAttachments.length ? tr('backup.missing', { count: created.manifest.missingAttachments.length }) : tr("backup.backupCreated")}</Text>
          <Text style={styles.body}>{created.manifest.missingAttachments.length ? tr("backup.allAvailableFilesAreIncludedFilesAlreadyMissing") : tr("backup.yourChitsDataAndAttachmentsAreSafelyIncluded")}</Text>
          <Text style={styles.detail}>{sizeLabel(created.size)} · {quantity(created.manifest.attachmentCount, 'attachment')} · {new Date(created.manifest.createdAt).toLocaleString(getFormattingLocale())}</Text>
          {needsSave ? <Pressable accessibilityRole="button" disabled={disabled} onPress={() => void saveAgain()} style={styles.save}><Text style={[handBold, styles.saveText]}>{tr("backup.saveBackupFile")}</Text></Pressable> : null}
        </View> : null}
      </PaperNote>
      <PaperNote paper={PAPERS[3]} tilt={0.5} style={styles.section}>
        <Text accessibilityRole="header" style={[handBold, styles.heading]}>{tr("backup.restoreFromBackup")}</Text>
        <Text style={styles.body}>{tr("backup.restoreChitsFromAPreviouslyCreatedBackupFile")}</Text>
        <PaperAction label={tr("backup.chooseBackupFile")} accessibilityState={{ disabled }} disabled={disabled} onPress={() => void choose()} containerStyle={styles.action} />
        <Text style={styles.detail}>{tr("backup.restoringABackupReplacesTheDataCurrentlyStored")}</Text>
      </PaperNote>
      {notice ? <Text accessibilityLiveRegion="polite" style={[styles.deskText, { color: desk.ink }]}>{notice}</Text> : null}
      {error ? <Text accessibilityRole="alert" style={[styles.deskText, { color: desk.danger }]}>{error}</Text> : null}
    </ScrollView>
    </PaperDesk>
    {progress ? <ChitsLoaderOverlay label={progress.total ? tr("backup.valueValueOfValue", { value1: progress.label, value2: progress.completed ?? 0, value3: progress.total }) : progress.label} /> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }, title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32, gap: 24 },
  section: { gap: 10, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18 },
  heading: { color: PAPER_INK, fontSize: 26, lineHeight: 33 }, body: { color: PAPER_INK_MUTED, fontSize: 15, lineHeight: 23 }, detail: { color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 19 },
  action: { marginTop: 6 },
  result: { gap: 6, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: 'rgba(43,38,32,0.2)' }, resultTitle: { color: PAPER_INK, fontSize: 21, lineHeight: 27 },
  save: { minHeight: 44, justifyContent: 'center' }, saveText: { color: PAPER_INK, fontSize: 18, lineHeight: 24, textDecorationLine: 'underline' },
  deskText: { fontSize: 15, lineHeight: 23, textAlign: 'center' },
});
