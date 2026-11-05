// Temporarily mount at /boards-mascot-qa. Every board and action stays in memory.
// Test count=0 or count=500; no repository, preferences or stored note is changed.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Appearance, Pressable, View } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { BoardsListing } from '@/components/boards/boards-listing.native';
import { PaperDesk } from '@/components/desk/paper-desk';
import { AppHeader, AppText, Icon, Screen } from '@/components/ui/primitives';
import type { Board } from '@/db/types';

const NAMES = ['Little everyday things', 'A spark of something', 'Work in progress', 'Places to wander'];
const ACCENTS = ['#D7B5EA', '#80BC9F', '#F0AF7C', null];
export default function BoardsMascotQA() {
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
  const { count = '500' } = useLocalSearchParams<{ count?: string }>();
  const [opened, setOpened] = useState<string | null>(null);
  const boards = useMemo(() => Array.from({ length: Math.min(500, Number(count)) }, (_, i): Board & { columnCount: number; cardCount: number } => ({
    id: `mascot-qa-${i}`, name: i < 4 ? NAMES[i] : `Ideas ${i + 1}`, accent: ACCENTS[i % 4], icon: i % 2 ? 'bulb-outline' : 'leaf-outline', createdAt: 0, updatedAt: 0, archivedAt: null, showColumnNavigator: true, columnCount: 2 + i % 4, cardCount: 3 + i,
  })), [count]);
  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader title="Chits" subtitle={`${boards.length} boards`} leading={<Pressable accessibilityRole="button" accessibilityLabel="QA back" onPress={() => setOpened(null)} style={{ padding: 12 }}><Icon name="arrow-back" size={24} color="#2B2620" /></Pressable>} />
    <PaperDesk faint>
      {opened ? <View style={{ flex: 1, padding: 24 }}><AppText accessibilityRole="header">Opened {opened}</AppText><AppText>Draft-only navigation probe. Use QA back to return.</AppText></View> : <BoardsListing boards={boards} unorganizedCount={7} bottomInset={24} onBoard={setOpened} onUnorganized={() => setOpened('Unorganized')} onCreate={() => setOpened('Create board')} />}
    </PaperDesk>
  </Screen>;
}
