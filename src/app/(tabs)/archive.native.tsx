import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';

import { AppHeader, AppText, EmptyState, Icon, IconButton, Screen, HeaderIcon, MenuIcon } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { PAPER_INK, PAPER_INK_MUTED, PAPER_YELLOW, PaperCard, PaperDesk, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { stableTilt } from '@/constants/style-tokens';
import { spacing } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';

type Archived = { id: string; title: string; kind: 'message' | 'card' | 'board'; archivedAt: number };

export default function ArchiveScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const desk = useDesk();
  const handwriting = useHandwriting();
  const { confirm } = useAppDialog();
  // The floating bottom nav is absolutely positioned over this screen (see
  // PHASE: REDESIGN CHITS BOTTOM NAVIGATION) rather than reserving its own flex
  // space, so this screen's own scroll content has to reserve the matching
  // clearance itself.
  const tabBarHeight = useBottomTabBarHeight();
  const repo = useMemo(() => createBoardRepository(database), [database]);
  const messages = useMemo(() => createMessageRepository(database), [database]);
  const [items, setItems] = useState<Archived[]>([]);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // The loader also covers the moment the handwriting takes, so titles never reflow.
  const showLoader = useChitsLoading(!ready || !handwriting.ready);

  const load = useCallback(async () => { setItems(await repo.listArchived()); setReady(true); }, [repo]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const requestRestore = (item: Archived) => {
    setRestoreError(null);
    confirm({
      type: 'default',
      icon: 'arrow-undo-outline',
      title: tr("archive.restoreThisValue", { value1: item.kind }),
      message: tr("archive.valueWillReturnToItsPreviousLocation", { value1: item.title }),
      confirmText: tr("archive.restore"),
      onConfirm: async () => {
        try {
          if (item.kind === 'message') await messages.restore(item.id);
          else if (item.kind === 'card') await repo.restoreCard(item.id);
          else await repo.restoreBoard(item.id);
          await load();
        } catch {
          setRestoreError(tr("archive.thisItemCouldNotBeRestoredPleaseTry"));
        }
      },
    });
  };

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader
      title={tr("archive.archive")}
      leading={<IconButton label={tr("archive.openNavigation")} onPress={openDrawer}><MenuIcon /></IconButton>}
      trailing={<IconButton label={tr("archive.closeArchive")} onPress={() => router.canGoBack() ? router.back() : router.navigate('/')}><HeaderIcon name="close" size={24} /></IconButton>}
    />
    <PaperDesk>
    {restoreError ? <Text accessibilityRole="alert" style={[styles.errorBanner, { color: desk.danger }]}>{restoreError}</Text> : null}
    {!ready || !handwriting.ready ? (showLoader ? <View style={styles.loaderWrap}><ChitsLoader /></View> : null) : items.length ? <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.md }]}>
      {items.map((item) => <PaperCard
        key={`${item.kind}-${item.id}`}
        paper={MANILA}
        tilt={stableTilt(`archive:${item.kind}:${item.id}`, 0.8)}
        tape={stableTilt(`archive:${item.id}:tape`, 1) > 0.3}
        accessibilityRole="button"
        accessibilityLabel={tr("archive.restoreValueValue", { value1: item.kind, value2: item.title })}
        onPress={() => requestRestore(item)}
        style={styles.item}
      >
        <View style={styles.stamp}><AppText weight="700" style={styles.kind}>{item.kind}</AppText></View>
        <AppText numberOfLines={3} style={[handwriting.handBold, styles.title]}>{item.title}</AppText>
        <View style={styles.restore}>
          <Icon name="arrow-undo-outline" size={15} color={PAPER_INK} />
          <AppText style={[handwriting.handBold, styles.restoreText]}>{tr("archive.restore")}</AppText>
        </View>
      </PaperCard>)}
    </ScrollView> : <EmptyState title={tr("archive.nothingArchived")} description={tr("archive.archivedMessagesCardsAndBoardsRemainRecoverableHere")} />}
    </PaperDesk>
  </Screen>;
}

// Archived things are filed away on manila paper; their kind is stamped on.
const MANILA = '#EADCB8';
const styles = StyleSheet.create({
  list: { padding: spacing.md, paddingTop: spacing.lg, gap: 20 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  item: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 6 },
  stamp: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1.5, borderColor: 'rgba(43,38,32,0.55)', borderRadius: 3, transform: [{ rotate: '-3deg' }] },
  kind: { color: PAPER_INK_MUTED, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: PAPER_INK, fontSize: 21, lineHeight: 27 },
  restore: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 2, backgroundColor: PAPER_YELLOW, transform: [{ rotate: '1.5deg' }] },
  restoreText: { color: PAPER_INK, fontSize: 17, lineHeight: 23 },
  errorBanner: { marginHorizontal: spacing.md, marginTop: spacing.sm, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
