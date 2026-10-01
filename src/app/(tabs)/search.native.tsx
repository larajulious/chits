import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useBottomTabBarHeight } from 'expo-router/tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { AppHeader, EmptyState, IconButton, Screen, HeaderIcon, MenuIcon } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';

type Result = { id: string; title: string; context: string; kind: 'message' | 'card' | 'board' | 'file' };

export default function SearchScreen() {
  const { source, boardId, boardName } = useLocalSearchParams<{ source?: string; boardId?: string; boardName?: string }>();
  const scopedBoardId = source === 'board' ? boardId : undefined;
  return <SearchContent key={scopedBoardId ?? 'global'} scopedBoardId={scopedBoardId} boardName={boardName} />;
}

function SearchContent({ scopedBoardId, boardName }: { scopedBoardId?: string; boardName?: string }) {
  const database = useSQLiteContext();
  const { openDrawer } = useAppDrawer();
  const { tokens: theme } = useTheme();
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

  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader
      title={scopedBoardId ? `Search in ${boardName || 'Board'}` : 'Search'}
      leading={scopedBoardId
        ? <IconButton label="Go back" onPress={goBack}><HeaderIcon name="chevron-back" size={24} /></IconButton>
        : <IconButton label="Open navigation" onPress={openDrawer}><MenuIcon /></IconButton>}
      trailing={<IconButton label="Close search" onPress={goBack}><HeaderIcon name="close" size={24} /></IconButton>}
    />
    <TextInput
      value={term}
      onChangeText={(value) => { setTerm(value); queueSearch(value); }}
      placeholder={scopedBoardId ? 'Search cards in this board' : 'Search your thoughts'}
      placeholderTextColor={theme.textMuted}
      style={[styles.input, { borderColor: theme.borderSubtle, color: theme.textPrimary, backgroundColor: theme.background }]}
    />
    <Pressable accessibilityRole="button" onPress={() => { const next = !archived; setArchived(next); void search(term, next); }} style={[styles.filter, { backgroundColor: theme.surfaceElevated }]}>
      <Text style={[styles.filterText, { color: theme.textSecondary }]}>{archived ? 'Including archived' : 'Active items'}</Text>
    </Pressable>
    {term ? (showSearchLoader ? <ChitsLoader /> : <ScrollView contentContainerStyle={[styles.list, { paddingBottom: tabBarHeight + spacing.md }]}>
      {results.length ? results.map((result) => <Pressable key={`${result.kind}-${result.id}`} accessibilityRole="button" onPress={() => open(result)} style={[styles.result, { borderBottomColor: theme.borderSubtle }]}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{result.title}</Text>
        <Text style={[styles.context, { color: theme.textSecondary }]}>{result.context}</Text>
      </Pressable>) : <EmptyState title="No matches" description="Try a different word or include archived items." />}
    </ScrollView>) : <EmptyState title={scopedBoardId ? 'Find a card in this board' : 'Find anything later'} description={scopedBoardId ? 'Search card titles, thoughts, columns, and attachment names.' : 'Search messages, cards, boards, and attachment names.'} />}
  </Screen>;
}

const styles = StyleSheet.create({ input: { minHeight: 46, margin: spacing.md, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: 10, borderWidth: 1 }, filter: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', marginLeft: spacing.md, paddingHorizontal: spacing.sm, borderRadius: 16 }, filterText: { fontSize: 13, fontWeight: '600' }, list: { padding: spacing.md, gap: spacing.xs, flexGrow: 1 }, result: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth }, title: { fontSize: 16 }, context: { fontSize: 13, marginTop: 3 } });
