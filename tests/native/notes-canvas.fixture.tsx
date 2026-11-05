// Temporarily mount at /notes-canvas-qa (src/app/notes-canvas-qa.tsx re-exporting this). Notes stay in this fixture; positions go to
// a throwaway database. Parameters: count=0..2000, mode=dark. Logs "[qa] commits"
// every 2s: how many times React committed the board, which should stay flat while
// a finger pans inside a grid cell.
import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Appearance } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { NotesListing } from '@/components/notes/notes-listing.native';
import { PaperDesk } from '@/components/desk/paper-desk';
import { AppHeader, AppText, Screen } from '@/components/ui/primitives';
import { migrateDatabase } from '@/db/migrations';
import type { CardListItem } from '@/db/types';
import { noteKey } from '@/services/note-order';

const WORDS = ['Take the quiet route home and stop somewhere new for a cup of coffee.', 'Fresh bread\nSomething green\nA little time to think', 'A few thoughts for the next project. Keep it simple, warm and useful, and leave room for the things that surprise you along the way. Then write down what changed and why it mattered.'];
const BOARDS = [{ id: 'qa-home', name: 'Home projects', accent: '#E8A33D' }, { id: 'qa-work', name: 'Work', accent: '#6C9BD2' }, { id: 'qa-trip', name: 'Trip ideas', accent: '#D8739A' }];

function note(index: number): CardListItem {
  const board = index % 3 === 0 ? BOARDS[index / 3 % 3] : null;
  const kind = index % 9;
  const base: CardListItem = {
    id: `qa-${index}`, kind: board ? 'card' : 'thought', title: board ? `Note ${index}` : WORDS[index % 3].split('\n')[0], preview: WORDS[index % 3],
    boardId: board?.id ?? null, boardName: board?.name ?? null, boardAccent: board?.accent ?? null, columnId: null, columnName: null,
    createdAt: 1_790_000_000_000 - index * 3_600_000, updatedAt: 1_790_000_000_000 - index * 3_600_000, pinned: index % 40 === 0, hidden: index % 37 === 5, reminderAt: null,
    subtaskCount: 0, completedSubtaskCount: 0, photoCount: 0, videoCount: 0, fileCount: 0, previewMediaType: null, thumbnailPath: null, mediaDuration: null, mediaCount: 0,
  };
  if (base.hidden) return { ...base, title: 'Hidden', preview: null };
  if (kind === 1) return { ...base, previewMediaType: 'photo', thumbnailPath: 'chits-attachments/chat/qa-wide.jpg', mediaCount: 3, photoCount: 3, mediaWidth: 1600, mediaHeight: 900 };
  if (kind === 2) return { ...base, previewMediaType: 'photo', thumbnailPath: 'chits-attachments/chat/qa-tall.jpg', mediaCount: 1, photoCount: 1, preview: null, title: 'Photo', mediaWidth: 900, mediaHeight: 1400 };
  if (kind === 3) return { ...base, previewMediaType: 'audio', thumbnailPath: 'chits-attachments/chat/qa.m4a', mediaDuration: 42_000, mediaCount: 1, preview: null, title: 'Audio note' };
  if (kind === 4) return { ...base, title: 'Quarterly-report.pdf', preview: null, fileCount: 1 };
  if (kind === 5) return { ...base, fileCount: 2, reminderAt: 1_790_000_000_000 + index * 3_600_000 };
  if (kind === 6) return { ...base, title: 'Packing list', preview: null, subtaskCount: 6, completedSubtaskCount: 2, subtaskPreview: ['Passport', 'Charger', 'Rain jacket', 'Snacks'].map((title, row) => ({ id: `${index}-${row}`, title, isCompleted: row < 2 })) };
  return base;
}

export default function NotesCanvasQA() {
  const { mode = 'light' } = useLocalSearchParams<{ mode?: string }>();
  const { appearance } = useTheme();
  useEffect(() => () => Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance), [appearance]);
  const init = useCallback(async (db: SQLiteDatabase) => {
    await migrateDatabase(db);
    await db.execAsync('DELETE FROM note_canvas_positions');
    await db.runAsync("DELETE FROM app_settings WHERE key = 'notes_canvas_view'");
    await db.runAsync('INSERT OR REPLACE INTO app_settings VALUES (?, ?, 0)', 'app_appearance', mode === 'dark' ? 'dark' : 'light');
  }, [mode]);
  return <SQLiteProvider key={mode} databaseName="notes-canvas-qa.db" options={{ useNewConnection: true }} onInit={init}><ThemeProvider><FixtureContent /></ThemeProvider></SQLiteProvider>;
}

function FixtureContent() {
  const { count = '300' } = useLocalSearchParams<{ count?: string }>();
  const total = Math.min(2000, Math.max(0, Number(count)));
  const [items, setItems] = useState(() => Array.from({ length: total }, (_, index) => note(index)));
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const commits = useRef(0);
  useEffect(() => {
    const timer = setInterval(() => console.log(`[qa] commits ${commits.current}`), 2000);
    return () => clearInterval(timer);
  }, []);
  const shown = useMemo(() => items.filter((item) => filter === 'all' || (filter === 'unorganized' ? item.kind === 'thought' : item.boardId === filter)), [filter, items]);
  const shownKeys = useMemo(() => new Set(shown.map(noteKey)), [shown]);
  const chips = useMemo(() => [{ key: 'all', label: 'All', count: items.length }, { key: 'unorganized', label: 'Unorganized', count: items.filter((item) => item.kind === 'thought').length }, ...BOARDS.map((board) => ({ key: board.id, label: board.name, count: items.filter((item) => item.boardId === board.id).length }))], [items]);
  const toggleSubtask = (item: CardListItem, id: string) => setItems((list) => list.map((entry) => entry.id !== item.id ? entry : { ...entry, subtaskPreview: entry.subtaskPreview?.map((subtask) => subtask.id === id ? { ...subtask, isCompleted: !subtask.isCompleted } : subtask), completedSubtaskCount: entry.completedSubtaskCount + (entry.subtaskPreview?.find((subtask) => subtask.id === id)?.isCompleted ? -1 : 1) }));
  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader title={toast ?? 'Chits'} />
    <PaperDesk faint>
      <Profiler id="board" onRender={() => { commits.current += 1; }}>
        <NotesListing
          empty={total === 0} onWrite={() => setToast('Write')}
          sections={[]} chips={chips} filter={filter} onFilter={setFilter} orderMode="recent" onArrange={() => {}}
          onOpen={(item) => setToast(`Open ${item.id}`)} onMore={(item) => setToast(`Actions ${item.id}`)} onToggleSubtask={toggleSubtask} onSectionChange={() => {}} bottomInset={24}
          footer={<AppText style={{ padding: 8, textAlign: 'center' }}>{total} notes</AppText>}
          board={{ notes: items, shownKeys, focus: null, onFocusDone: () => {}, onToast: setToast, onToggleChecklist: () => {} }}
        />
      </Profiler>
    </PaperDesk>
  </Screen>;
}
