// Temporary route: export { default } from '../../tests/native/canvas-style.fixture';
// /canvas-style-qa?mode=light|dark&view=library|workspace|pin&id=canvas-style-sample&width=375
// All sample data stays in a separate QA database.
import { useCallback, useEffect } from 'react';
import { LogBox, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '@/components/theme-provider';
import { AppDialogProvider } from '@/components/dialogs/app-dialog-provider';
import { migrateDatabase } from '@/db/migrations';
import { whiteboards } from '@/features/whiteboard/repository';
import { newCanvas } from '@/features/whiteboard/document';
import Library from '@/app/canvases.native';
import Workspace from '@/features/whiteboard/workspace.native';
import Pin from '@/app/canvas-pin.native';

export default function CanvasStyleQA({ forceMode, forceView, forceWidth }: { forceMode?: string; forceView?: string; forceWidth?: number } = {}) {
  const { mode: paramMode = 'light', view: paramView = 'library', width: paramWidth } = useLocalSearchParams<{ mode?: string; view?: string; width?: string }>();
  const mode = forceMode ?? paramMode, view = forceView ?? paramView, width = forceWidth ?? paramWidth;
  useEffect(() => { LogBox.ignoreAllLogs(true); return () => LogBox.ignoreAllLogs(false); }, []);
  const init = useCallback(async (db: SQLiteDatabase) => {
    await migrateDatabase(db);
    await db.runAsync('INSERT OR REPLACE INTO app_settings VALUES (?, ?, ?)', 'app_appearance', mode, Date.now());
    await db.runAsync("INSERT OR IGNORE INTO messages (id,text,type,created_at,updated_at) VALUES ('canvas-style-note','Bring a notebook, a camera, and a little curiosity.','text',1,1)");
    const doc = { ...newCanvas(), id: 'canvas-style-sample', title: 'Little weekend ideas', guideDone: true };
    doc.objects = [
      { id: 'line', type: 'pen', x: 0, y: 0, width: 3, height: 0, color: '#356bb0', opacity: 1, points: Array.from({ length: 60 }, (_, i) => ({ x: 30 + i * 4, y: 100 + Math.sin(i / 8) * 25, pressure: .5 })) },
      { id: 'text', type: 'text', x: 30, y: 145, width: 240, height: 70, fontSize: 23, color: '#292820', text: 'A little room to explore.' },
      { id: 'note', type: 'note', x: 45, y: 245, width: 230, height: 160, color: '#292820', noteId: 'canvas-style-note', noteKind: 'thought' },
    ];
    await whiteboards(db).save(doc);
  }, [mode]);
  return <SQLiteProvider key={mode} databaseName={`canvas-style-qa-${mode}.db`} onInit={init} options={{ useNewConnection: true }}><ThemeProvider><AppDialogProvider>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    <View style={{ flex: 1, width: width ? Number(width) : '100%', maxWidth: '100%', alignSelf: 'center' }}>{view === 'workspace' ? <Workspace /> : view === 'pin' ? <Pin /> : <Library />}</View>
  </AppDialogProvider></ThemeProvider></SQLiteProvider>;
}
