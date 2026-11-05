// Temporarily mount at /notes-canvas-qa (src/app/notes-canvas-qa.tsx re-exporting this). Notes stay in this fixture; positions go to
// a throwaway database. Parameters: count=0..2000, mode=dark. Logs "[qa] commits"
// every 2s: how many times React committed the board, which should stay flat while
// a finger pans inside a grid cell.
import { Profiler, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Appearance, Pressable, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { NotesListing } from '@/components/notes/notes-listing.native';
import { PaperDesk } from '@/components/desk/paper-desk';
import { AppHeader, AppText, Screen } from '@/components/ui/primitives';
import { migrateDatabase } from '@/db/migrations';
import type { CardListItem } from '@/db/types';
import { noteKey } from '@/services/note-order';
import { createRevisitRepository } from '@/db/revisit-repository';
import type { NoteKey } from '@/services/revisit-engine';
import { createNoteOrderRepository } from '@/db/note-order-repository';
import { serializeDatabaseStatements } from '@/db/serialize-statements';
import { observeDatabaseTransactions } from '@/services/database-transactions';

const WORDS = ['Take the quiet route home and stop somewhere new for a cup of coffee.', 'Fresh bread\nSomething green\nA little time to think', 'A few thoughts for the next project. Keep it simple, warm and useful, and leave room for the things that surprise you along the way. Then write down what changed and why it mattered.'];
const BOARDS = [{ id: 'qa-home', name: 'Home projects', accent: '#E8A33D' }, { id: 'qa-work', name: 'Work', accent: '#6C9BD2' }, { id: 'qa-trip', name: 'Trip ideas', accent: '#D8739A' }];

function note(index: number): CardListItem {
  const board = index % 3 === 0 ? BOARDS[index / 3 % 3] : null;
  const kind = index % 9;
  const base: CardListItem = {
    id: `qa-${index}`, kind: board ? 'card' : 'thought', title: ['Chits Release', 'Bug Fixes', 'UI Improvements', 'Store Updates', 'Testing Checklist', 'Launch Notes'][index] ?? (board ? `Note ${index}` : WORDS[index % 3].split('\n')[0]), preview: WORDS[index % 3],
    boardId: board?.id ?? null, boardName: board?.name ?? null, boardAccent: board?.accent ?? null, columnId: null, columnName: null,
    createdAt: 1_790_000_000_000 - index * 3_600_000, updatedAt: 1_790_000_000_000 - index * 3_600_000, pinned: index % 40 === 0, hidden: index % 37 === 5, reminderAt: null,
    subtaskCount: 0, completedSubtaskCount: 0, photoCount: 0, videoCount: 0, fileCount: 0, previewMediaType: null, thumbnailPath: null, mediaDuration: null, mediaCount: 0,
  };
  if (index < 6) return { ...base, hidden: false };
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
  const { mode = 'light', count = '300', saved = '0', reset = '0' } = useLocalSearchParams<{ mode?: string; count?: string; saved?: string; reset?: string }>();
  const { appearance } = useTheme();
  useEffect(() => () => Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance), [appearance]);
  const init = useCallback(async (db: SQLiteDatabase) => {
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    await migrateDatabase(db);
    if (reset === '1') {
      await db.execAsync('DELETE FROM note_canvas_positions; DELETE FROM note_relationships;');
      await db.runAsync("DELETE FROM app_settings WHERE key IN ('notes_canvas_view','canvas_qa_graph_seeded')");
    }
    await db.runAsync('INSERT OR REPLACE INTO app_settings VALUES (?, ?, 0)', 'app_appearance', mode === 'dark' ? 'dark' : 'light');
    await db.withExclusiveTransactionAsync(async (tx) => {
      for (const board of BOARDS) {
        await tx.runAsync('INSERT OR IGNORE INTO boards(id,name,accent,created_at,updated_at) VALUES (?,?,?,1,2)', board.id, board.name, board.accent);
        await tx.runAsync('INSERT OR IGNORE INTO board_columns(id,board_id,name,position,created_at,updated_at) VALUES (?,?,?,0,1,2)', `${board.id}-column`, board.id, 'Notes');
      }
      for (let i = 0; i < Math.min(2000, Math.max(0, Number(count))); i++) {
        const item = note(i);
        if (item.kind === 'card') await tx.runAsync('INSERT OR IGNORE INTO cards(id,board_id,column_id,title,position,created_at,updated_at) VALUES (?,?,?,?,0,1,2)', item.id, item.boardId!, `${item.boardId}-column`, item.title);
        else await tx.runAsync("INSERT OR IGNORE INTO messages(id,text,type,created_at,updated_at) VALUES (?,?,'text',1,2)", item.id, item.title);
      }
      if (saved === '1') await tx.runAsync("INSERT OR IGNORE INTO note_canvas_positions VALUES ('card:qa-0',1000,1000,5,0)");
    });
    if (!await db.getFirstAsync("SELECT key FROM app_settings WHERE key = 'canvas_qa_graph_seeded'")) {
      const repository = createRevisitRepository(db);
      for (let i = 1; i < Math.min(6, Number(count)); i++) await repository.link(noteKey(note(0)) as NoteKey, noteKey(note(i)) as NoteKey, i === 1 ? 'reference' : 'related');
      await db.runAsync("INSERT OR REPLACE INTO app_settings VALUES ('canvas_qa_graph_seeded','1',0)");
    }
    serializeDatabaseStatements(db);
    observeDatabaseTransactions(db);
  }, [count, mode, reset, saved]);
  return <SQLiteProvider key={`${mode}:${count}:${saved}:${reset}`} databaseName="notes-canvas-qa.db" options={{ useNewConnection: true }} onInit={init}><ThemeProvider><FixtureContent /></ThemeProvider></SQLiteProvider>;
}

function FixtureContent() {
  const database = useSQLiteContext();
  const orderRepository = useMemo(() => createNoteOrderRepository(database), [database]);
  const { count = '300' } = useLocalSearchParams<{ count?: string }>();
  const total = Math.min(2000, Math.max(0, Number(count)));
  const [items, setItems] = useState(() => Array.from({ length: total }, (_, index) => note(index)));
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ key: string; nonce: number } | null>(null);
  const [canvas, setCanvas] = useState(true);
  const showToast = useCallback((message: string) => { console.log('[qa] toast', message); setToast(message); }, []);
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
    <AppHeader title={toast ?? 'Chits'} trailing={<View style={{ flexDirection: 'row', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={canvas ? 'Switch to masonry' : 'Switch to canvas'} onPress={() => {
        setCanvas(!canvas); void orderRepository.setLayout(canvas ? 'grid' : 'board').catch(() => {});
      }}><AppText>{canvas ? 'Grid' : 'Canvas'}</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Find release" disabled={!items.length} onPress={() => setFocus({ key: noteKey(items[0]), nonce: Date.now() })}><AppText>Find</AppText></Pressable>
    </View>} />
    <PaperDesk faint>
      <Profiler id="board" onRender={() => { commits.current += 1; }}>
        <NotesListing
          empty={total === 0} onWrite={() => setToast('Write')}
          sections={[{ key: 'all', title: '', count: shown.length, data: shown }]} chips={chips} filter={filter} onFilter={setFilter} orderMode="recent" onArrange={() => {}}
          onOpen={(item) => setToast(`Open ${item.id}`)} onMore={(item) => setToast(`Actions ${item.id}`)} onToggleSubtask={toggleSubtask} onSectionChange={() => {}} bottomInset={24}
          footer={<AppText style={{ padding: 8, textAlign: 'center' }}>{total} notes</AppText>}
          board={canvas ? { notes: items, shownKeys, focus, onFocusDone: () => setFocus(null), onToast: showToast, onToggleChecklist: () => {} } : null}
        />
      </Profiler>
    </PaperDesk>
  </Screen>;
}
