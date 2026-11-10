// Temporarily mount at /notes-mascot-qa. Notes, theme and arranging stay in memory.
// Parameters: count=0 or count=200, mode=dark, accent=rose.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Appearance, View } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { NotesHeaderStage } from '@/components/notes/notes-pull-refresh.native';
import { NotesListing } from '@/components/notes/notes-listing.native';
import { BoardHeaderButton } from '@/components/boards/board-header-button';
import type { CardSection } from '@/components/boards/cards-collection.native';
import { PaperDesk } from '@/components/desk/paper-desk';
import { AppHeader, AppText, HeaderIcon, Screen } from '@/components/ui/primitives';
import type { CardListItem } from '@/db/types';
import { noteKey, type NoteOrderMode } from '@/services/note-order';

export default function NotesMascotQA() {
  const { mode = 'light', accent = 'logo' } = useLocalSearchParams<{ mode?: string; accent?: string }>();
  const { appearance } = useTheme();
  useEffect(() => () => Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance), [appearance]);
  const init = useCallback(async (db: SQLiteDatabase) => {
    await db.execAsync('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
    await db.runAsync('INSERT OR REPLACE INTO app_settings VALUES (?, ?, 0)', 'app_appearance', mode === 'dark' ? 'dark' : 'light');
    await db.runAsync('INSERT OR REPLACE INTO app_settings VALUES (?, ?, 0)', 'chat_color_theme', accent);
  }, [mode, accent]);
  return <SQLiteProvider key={`${mode}:${accent}`} databaseName=":memory:" options={{ useNewConnection: true }} onInit={init}><ThemeProvider><FixtureContent /></ThemeProvider></SQLiteProvider>;
}
function FixtureContent() {
  const { count = '200' } = useLocalSearchParams<{ count?: string }>();
  const total = Math.min(500, Math.max(0, Number(count)));
  const [opened, setOpened] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [orderMode, setOrderMode] = useState<NoteOrderMode>('recent');
  const [section, setSection] = useState<CardSection | null>(null);
  const [ordered, setOrdered] = useState<string[]>([]);
  const [arranged, setArranged] = useState(false);
  const items = useMemo(() => Array.from({ length: total }, (_, i): CardListItem => ({
    id: `qa-note-${i}`, kind: i % 3 === 0 ? 'card' : 'thought',
    title: ['An idea for the weekend', 'Remember the little things', 'A spark worth keeping'][i % 3],
    preview: ['Take the quiet route home. Stop somewhere new for a cup of coffee.', 'Fresh bread\nSomething green\nA little time to think', 'A few thoughts for the next project. Keep it simple, warm and useful.'][i % 3],
    boardId: i % 3 === 0 ? 'qa-board' : null, boardName: i % 3 === 0 ? 'Little everyday things' : null,
    boardAccent: i % 3 === 0 ? '#80BC9F' : null, columnId: i % 3 === 0 ? 'qa-column' : null, columnName: i % 3 === 0 ? 'Ideas' : null,
    createdAt: 1793761200000 - i * 60000, updatedAt: 1793761200000 - i * 60000, pinned: i < 2, hidden: i === 3,
    reminderAt: null, subtaskCount: 0, completedSubtaskCount: 0, photoCount: 0, videoCount: 0, fileCount: 0,
    previewMediaType: null, thumbnailPath: null, mediaDuration: null, mediaCount: 0,
  })), [total]);
  const sections = useMemo(() => {
    let visible = filter === 'unorganized' ? items.filter(item => item.kind === 'thought') : items;
    if (orderMode === 'custom' && ordered.length) {
      const map = new Map(visible.map(item => [noteKey(item), item]));
      visible = [...ordered.flatMap(key => map.get(key) ? [map.get(key)!] : []), ...visible.filter(item => !ordered.includes(noteKey(item)))];
    }
    const pinned = visible.filter(item => item.pinned);
    const notes = visible.filter(item => !item.pinned);
    return [
      ...(pinned.length ? [{ key: 'pinned', title: 'Pinned', pinned: true, count: pinned.length, data: pinned }] : []),
      ...(notes.length ? [{ key: 'notes', title: orderMode === 'custom' ? 'My notes' : 'Notes', count: notes.length, data: notes }] : []),
    ];
  }, [filter, items, ordered, orderMode]);
  const chips = [{ key: 'all', label: 'All', count: items.length }, { key: 'unorganized', label: 'Unorganized', count: items.filter(item => item.kind === 'thought').length }];
  const arrange = (_section: CardSection, keys: string[]) => { setOrdered(keys); setArranged(true); };
  return <Screen edges={['top', 'left', 'right']}>
    <NotesHeaderStage leadingWidth={46} trailingWidth={100}>
    <AppHeader title={section?.title ?? 'Chits'} subtitle={`${section?.count ?? total} notes${arranged ? ' · arranged' : ''}`} leadingWidth={46} actionWidth={100}
      leading={<BoardHeaderButton label="QA back" onPress={() => setOpened(null)}><HeaderIcon name="chevron-back" size={24} /></BoardHeaderButton>}
      trailing={<View style={{ flexDirection: 'row', gap: 8 }}>
        <BoardHeaderButton label="Toggle ordering" onPress={() => setOrderMode(mode => mode === 'recent' ? 'custom' : 'recent')}><HeaderIcon name={orderMode === 'recent' ? 'time-outline' : 'swap-vertical-outline'} size={22} /></BoardHeaderButton>
        <BoardHeaderButton label="QA search" onPress={() => setOpened('Search')}><HeaderIcon name="search-outline" size={23} /></BoardHeaderButton>
      </View>}
    />
    <PaperDesk faint>
      {opened ? <View style={{ flex: 1, padding: 24 }}><AppText accessibilityRole="header">Opened {opened}</AppText><AppText>Draft-only callback probe. Use QA back to return.</AppText></View> : <NotesListing
        board={null}
        empty={total === 0} onWrite={() => setOpened('Write a note')}
        sections={sections} chips={chips} filter={filter} onFilter={setFilter} orderMode={orderMode} onArrange={arrange}
        onOpen={item => setOpened(item.title)} onMore={item => setOpened(`Actions ${item.id}`)} onToggleSubtask={() => {}}
        onSectionChange={setSection} bottomInset={24}
        footer={<AppText accessibilityLabel={arranged ? 'Order changed in memory' : 'Order unchanged'} style={{ padding: 16 }}>{arranged ? 'Order changed in memory' : 'Order unchanged'}</AppText>}
      />}
    </PaperDesk>
    </NotesHeaderStage>
  </Screen>;
}
