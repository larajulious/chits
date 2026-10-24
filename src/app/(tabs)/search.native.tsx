import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { AppHeader, AppText, EmptyState, IconButton, Screen, HeaderIcon, MenuIcon } from '@/components/ui/primitives';
import { PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PaperCard, PaperDesk, PaperTab, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { stableTilt } from '@/constants/style-tokens';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { SearchField } from '@/components/ui/search-field';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';

type Result = { id: string; title: string; context: string; kind: 'message' | 'card' | 'board' | 'file' };

export default function SearchScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { source, boardId, boardName } = useLocalSearchParams<{ source?: string; boardId?: string; boardName?: string }>();
  const scopedBoardId = source === 'board' ? boardId : undefined;
  return <SearchContent key={scopedBoardId ?? 'global'} scopedBoardId={scopedBoardId} boardName={boardName} />;
}

function SearchContent({ scopedBoardId, boardName }: { scopedBoardId?: string; boardName?: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { openDrawer } = useAppDrawer();
  const desk = useDesk();
  const handwriting = useHandwriting();
  const tabBarHeight = useBottomTabBarHeight();
  const repository = useMemo(() => createBoardRepository(database), [database]);
  const [term, setTerm] = useState('');
  const [archived, setArchived] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const showSearchLoader = useChitsLoading(searching);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  const search = useCallback(async (value: string, showArchived = archived) => {
    const currentRequest = ++requestId.current;
    const trimmed = value.trim();
    if (!trimmed) { setResults([]); setSearching(false); return; }
    setSearching(true);
    try {
      const matches = await repository.search(trimmed, showArchived, scopedBoardId);
      if (currentRequest === requestId.current) setResults(matches);
    } finally {
      if (currentRequest === requestId.current) setSearching(false);
    }
  }, [archived, repository, scopedBoardId]);

  const queueSearch = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void search(value); }, 220);
  }, [search]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); ++requestId.current; }, []);

  const open = (result: Result) => router.push(result.kind === 'board' ? `/board/${result.id}` : result.kind === 'card' ? `/card/${result.id}` : result.kind === 'message' || result.kind === 'file' ? `/chat?messageId=${result.id}` : '/search');
  const goBack = () => router.canGoBack() ? router.back() : router.navigate('/');

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader
      title={scopedBoardId ? tr("index.searchInValue", { value1: boardName || tr("id.board") }) : tr("search.search")}
      leading={scopedBoardId
        ? <IconButton label={tr("search.goBack")} onPress={goBack}><HeaderIcon name="chevron-back" size={24} /></IconButton>
        : <IconButton label={tr("archive.openNavigation")} onPress={openDrawer}><MenuIcon /></IconButton>}
      trailing={<IconButton label={tr("search.closeSearch")} onPress={goBack}><HeaderIcon name="close" size={24} /></IconButton>}
    />
    <PaperDesk>
    <View style={styles.searchWrap}>
      <SearchField
        accessibilityLabel={scopedBoardId ? tr("search.searchCardsInThisBoard") : tr("search.searchYourThoughts")}
        value={term}
        onChangeText={(value) => { setTerm(value); queueSearch(value); }}
        placeholder={scopedBoardId ? tr("search.searchCardsInThisBoard") : tr("search.searchYourThoughts")}
      />
    </View>
    <View style={styles.filter}>
      <PaperTab tilt={-1.2} icon={archived ? 'archive' : 'archive-outline'} label={archived ? tr("search.includingArchived") : tr("search.activeItems")} selected={archived} accessibilityRole="switch" accessibilityState={{ checked: archived }} onPress={() => { const next = !archived; setArchived(next); void search(term, next); }} />
    </View>
    {term ? (showSearchLoader || !handwriting.ready ? <ChitsLoader /> : <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.md }]}>
      {results.length ? results.map((result) => <PaperCard
        key={`${result.kind}-${result.id}`}
        paper={RESULT_PAPER[result.kind]}
        tilt={stableTilt(`search:${result.kind}:${result.id}`, 0.7)}
        accessibilityRole="button"
        onPress={() => open(result)}
        style={styles.result}
      >
        <AppText weight="700" style={styles.kind}>{result.kind}</AppText>
        <AppText numberOfLines={2} style={[handwriting.handBold, styles.title]}>{result.title}</AppText>
        <AppText numberOfLines={2} style={styles.context}>{result.context}</AppText>
      </PaperCard>) : <EmptyState title={tr("search.noMatches")} description={tr("search.tryADifferentWordOrIncludeArchivedItems")} />}
    </ScrollView>) : <EmptyState title={scopedBoardId ? tr("search.findACardInThisBoard") : tr("search.findAnythingLater")} description={scopedBoardId ? tr("search.searchCardTitlesThoughtsColumnsAndAttachmentNames") : tr("search.searchMessagesCardsBoardsAndAttachmentNames")} />}
    </PaperDesk>
  </Screen>;
}

// Each kind of result on its own paper: thoughts cream, cards lavender, boards yellow, files mint.
const RESULT_PAPER: Record<Result['kind'], string> = { message: PAPER_WHITE, card: PAPERS[5], board: PAPERS[0], file: PAPERS[2] };
const styles = StyleSheet.create({
  searchWrap: { marginHorizontal: spacing.md, marginTop: spacing.sm, marginBottom: spacing.xs },
  filter: { alignItems: 'flex-start', marginLeft: spacing.md, marginTop: 4, marginBottom: 4 },
  list: { padding: spacing.md, paddingTop: spacing.lg, gap: 16, flexGrow: 1 },
  result: { paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  kind: { color: PAPER_INK_MUTED, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: PAPER_INK, fontSize: 19, lineHeight: 25 },
  context: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 18 },
});
