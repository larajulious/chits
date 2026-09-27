import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { getContentUriAsync, getInfoAsync } from 'expo-file-system/legacy';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChitsFiles, ChitsPdfView, type PdfErrorEvent } from '../../../modules/chits-attachments';
import { useTheme } from '@/components/theme-provider';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { radii, spacing, type ThemeTokens } from '@/constants/theme';
import type { AttachmentLike } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { pdfDisplayName } from '@/services/pdf-attachment';
import { exportActionLabel } from '@/services/attachment-export';
import { useAttachmentExport } from '@/components/attachments/use-attachment-export';

type Status = 'loading' | 'ready' | 'error';
type Action = 'share' | 'open';

const UNABLE_TO_PREVIEW = 'Unable to preview this PDF.';

// The same file handed to Share / Open with / Save, under its original name.
// Falls back to the stored file (generated name) if the named link can't be made.
async function namedFileUri(uri: string, name: string) {
  try { return await ChitsFiles.prepareNamedFileAsync(uri, name); } catch (error) {
    if (__DEV__) console.warn('[pdf-viewer] named file unavailable, using stored file', error);
    return uri;
  }
}

/**
 * Full-screen, offline PDF viewer shared by every place an attachment tile can
 * appear (Chat, Card Details, Attachments, Archive). Presented as a Modal like
 * the existing photo/video viewers, so it also works from inside other modals
 * (the Attachments detail sheet) and Android's back button closes it.
 */
export function PdfViewer({ attachment, onDismiss }: { attachment: AttachmentLike; onDismiss: () => void }) {
  const { scheme, tokens: theme } = useTheme();
  return <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} navigationBarTranslucent={false} onRequestClose={onDismiss}>
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={[styles.screen, { backgroundColor: theme.background }]}>
        <PdfViewerContent attachment={attachment} onDismiss={onDismiss} theme={theme} dark={scheme === 'dark'} />
      </SafeAreaView>
    </SafeAreaProvider>
  </Modal>;
}

function PdfViewerContent({ attachment, onDismiss, theme, dark }: { attachment: AttachmentLike; onDismiss: () => void; theme: ThemeTokens; dark: boolean }) {
  const insets = useSafeAreaInsets();
  const uri = resolveAttachmentUri(attachment.storagePath) ?? '';
  const name = pdfDisplayName(attachment);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const download = useAttachmentExport();
  const toast = notice ?? download.status;
  const showLoader = useChitsLoading(status === 'loading');
  const canvasColor = dark ? '#0B0C0A' : theme.surfaceElevated;

  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 2400); return () => clearTimeout(timer); }, [notice]);

  const retry = useCallback(() => { setStatus('loading'); setPage(1); setPageCount(0); setAttempt((value) => value + 1); }, []);

  const handleError = useCallback((event: { nativeEvent: PdfErrorEvent }) => {
    // Kept in release builds too: this is the only trace of *why* a PDF failed.
    console.warn('[pdf-viewer] unable to preview', { attachmentId: attachment.id, storagePath: attachment.storagePath, code: event.nativeEvent.code, message: event.nativeEvent.message });
    setStatus('error');
  }, [attachment.id, attachment.storagePath]);

  const runAction = useCallback(async (action: Action) => {
    setMenuOpen(false);
    if (busy) return;
    setBusy(action);
    try {
      // Never hand another app a path that no longer exists (it would share an empty item).
      if (!uri || !(await getInfoAsync(uri).catch(() => ({ exists: false }))).exists) {
        setNotice('This PDF is no longer on this device.');
        return;
      }
      const fileUri = await namedFileUri(uri, name);
      if (action === 'share') {
        if (!await Sharing.isAvailableAsync()) throw new Error('Sharing is not available on this device.');
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: name });
      } else {
        const target = Platform.OS === 'android' ? await getContentUriAsync(fileUri) : fileUri;
        const opened = await ChitsFiles.openWithAsync(target, 'application/pdf');
        if (!opened) setNotice('No app on this device can open PDFs.');
      }
    } catch (error) {
      console.warn(`[pdf-viewer] ${action} failed`, { attachmentId: attachment.id, error });
      setNotice(action === 'share' ? 'This PDF could not be shared.' : 'This PDF could not be opened in another app.');
    } finally {
      setBusy(null);
    }
  }, [attachment.id, busy, name, uri]);

  return <View style={styles.flex}>
    <View style={[styles.header, { borderBottomColor: theme.borderSubtle }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close PDF" hitSlop={8} onPress={onDismiss} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text accessibilityRole="header" numberOfLines={1} ellipsizeMode="middle" style={[styles.title, { color: theme.textPrimary }]}>{name}</Text>
        <Text numberOfLines={1} style={[styles.subtitle, { color: theme.textMuted }]}>{status === 'ready' && pageCount ? `PDF · ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}` : 'PDF'}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="PDF actions" accessibilityState={{ expanded: menuOpen }} hitSlop={8} onPress={() => setMenuOpen((open) => !open)} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
        <Ionicons accessible={false} name="ellipsis-horizontal" size={22} color={theme.textPrimary} />
      </Pressable>
    </View>

    <View style={[styles.flex, { backgroundColor: canvasColor }]}>
      {uri ? <ChitsPdfView
        key={attempt}
        source={uri}
        canvasColor={canvasColor}
        accessibilityLabel={pageCount ? `${name}, page ${page} of ${pageCount}` : name}
        onLoadComplete={(event) => { setPageCount(event.nativeEvent.pageCount); setStatus('ready'); }}
        onPageChanged={(event) => { setPage(event.nativeEvent.page); setPageCount(event.nativeEvent.pageCount); }}
        onError={handleError}
        style={[styles.flex, status === 'error' && styles.hidden]}
      /> : null}

      {status === 'loading' && showLoader ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}><ChitsLoader label="Preparing PDF…" /></View> : null}

      {status === 'error' || !uri ? <View style={[StyleSheet.absoluteFill, styles.center, styles.errorWrap, { backgroundColor: theme.background }]}>
        <View style={[styles.errorIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name="document-text-outline" size={28} color={theme.textMuted} /></View>
        <Text accessibilityRole="alert" style={[styles.errorTitle, { color: theme.textPrimary }]}>{UNABLE_TO_PREVIEW}</Text>
        <Text style={[styles.errorCopy, { color: theme.textSecondary }]}>You can still try again, or open it with another app.</Text>
        <Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}><Text style={[styles.primaryButtonText, { color: theme.accentText }]}>Try Again</Text></Pressable>
        <View style={styles.errorActions}>
          <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void runAction('open')} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>Open in Another App</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void runAction('share')} style={({ pressed }) => [styles.secondaryButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}><Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>Share</Text></Pressable>
        </View>
      </View> : null}

      {status === 'ready' && pageCount > 1 ? <View pointerEvents="none" style={[styles.pageIndicator, { bottom: insets.bottom + spacing.md }]}>
        <Text accessibilityLiveRegion="polite" style={styles.pageIndicatorText}>{page} / {pageCount}</Text>
      </View> : null}

      {toast ? <View pointerEvents="none" style={[styles.notice, { bottom: insets.bottom + spacing.md + (status === 'ready' && pageCount > 1 ? 44 : 0), backgroundColor: theme.textPrimary }]}>
        <Text accessibilityLiveRegion="polite" style={[styles.noticeText, { color: theme.background }]}>{toast}</Text>
      </View> : null}
    </View>

    {menuOpen ? <>
      <Pressable accessibilityLabel="Close PDF actions" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
      <View accessibilityRole="menu" style={[styles.menu, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
        <MenuRow icon="share-outline" label="Share" theme={theme} busy={busy === 'share'} onPress={() => void runAction('share')} />
        <View style={[styles.menuDivider, { backgroundColor: theme.borderSubtle }]} />
        <MenuRow icon="open-outline" label="Open in Another App" theme={theme} busy={busy === 'open'} onPress={() => void runAction('open')} />
        <View style={[styles.menuDivider, { backgroundColor: theme.borderSubtle }]} />
        <MenuRow icon="download-outline" label={exportActionLabel(attachment)} theme={theme} busy={download.busy} onPress={() => { setMenuOpen(false); void download.exportAttachment(attachment); }} />
      </View>
    </> : null}
  </View>;
}

function MenuRow({ icon, label, theme, busy, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; theme: ThemeTokens; busy: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="menuitem" accessibilityLabel={label} disabled={busy} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: theme.surfaceElevated }]}>
    <Ionicons accessible={false} name={icon} size={19} color={theme.textSecondary} />
    <Text style={[styles.menuText, { color: theme.textPrimary }]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  hidden: { opacity: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
  title: { fontSize: 16, lineHeight: 21, fontWeight: '700' },
  subtitle: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  errorWrap: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  errorIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 18, marginBottom: spacing.xs },
  errorTitle: { fontSize: 17, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  errorCopy: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: spacing.sm },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xxs },
  primaryButton: { minHeight: 46, minWidth: 180, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.control },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.control },
  secondaryButtonText: { fontSize: 14, fontWeight: '600' },
  pageIndicator: { position: 'absolute', alignSelf: 'center', minHeight: 30, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.pill, backgroundColor: 'rgba(0,0,0,0.66)' },
  pageIndicatorText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  notice: { position: 'absolute', alignSelf: 'center', maxWidth: '86%', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radii.control },
  noticeText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  menu: { position: 'absolute', top: 56, right: spacing.xs, minWidth: 236, overflow: 'hidden', borderRadius: radii.compactCard, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000000', shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  menuRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  menuText: { fontSize: 15, fontWeight: '600' },
  menuDivider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md + 19 + spacing.sm },
});
