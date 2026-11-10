import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState, Dimensions } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { useLanguage } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { databaseTransactionState, subscribeToDatabaseTransactions } from '@/services/database-transactions';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { readSpaceBoard, subscribeToBoardSize } from './board-size';
import { loadStickyWidgetRows } from './data';
import { publishStickyWidget } from './publish';
import { STICKY_WIDGET_TABLES, stickyWidgetSnapshot } from './snapshot';

/** SQLite reports the schema alias separately from the file; match the provider's file. */
const sameDatabase = (eventPath: string, databasePath: string) => {
  const normalize = (path: string) => {
    try { return decodeURIComponent(path.replace(/^file:\/\//, '')).replace(/^\/private\/var\//, '/var/'); } catch { return path; }
  };
  return normalize(eventPath) === normalize(databasePath);
};

/** Before Spaces has measured its board: the screen less its header and dock, as the board lays out. */
const estimatedBoard = () => {
  const window = Dimensions.get('window');
  const insets = initialWindowMetrics?.insets ?? { top: 0, bottom: 0 };
  return { width: window.width, height: window.height - insets.top - insets.bottom - 172 };
};

/**
 * Keeps Sticky Notes widgets in step with Spaces: any change to a placed
 * note's words, paper, color, position or Space republishes, so a widget never
 * needs a manual refresh. Nothing is published mid-transaction or from a rolled-back
 * one, identical snapshots are skipped, and failures never log note text.
 */
export function StickyWidgetCoordinator() {
  const database = useSQLiteContext();
  const { language } = useLanguage();
  useEffect(() => {
    let disposed = false;
    let running = false;
    let pending = false;
    let dirty = true;
    let transactionChanged = false;
    let previous = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      if (disposed || databaseTransactionState(database).active) return;
      if (running) { pending = true; return; }
      running = true;
      const revision = databaseTransactionState(database).revision;
      try {
        if (!dirty && previous) return;
        dirty = false;
        const [rows, board] = await Promise.all([loadStickyWidgetRows(database), readSpaceBoard(database)]);
        const transaction = databaseTransactionState(database);
        if (transaction.active || transaction.revision !== revision) { dirty = true; schedule(); return; }
        const { snapshot, photos } = stickyWidgetSnapshot(rows, {
          locale: language, rtl: language === 'ar', board: board ?? estimatedBoard(),
          labels: { hidden: tr('index.hiddenChit'), voice: tr('cardlistrow.voiceNote'), choose: tr('stickyWidget.choose') },
          // The board's own words for an empty Space.
          empty: (spaceName) => tr('spaces.nothingHereYetStickANoteOnYour', { value1: spaceName }),
        });
        const serialized = JSON.stringify({ snapshot, photos });
        if (!disposed && serialized !== previous) { await publishStickyWidget(snapshot, photos); previous = serialized; }
      } catch (error) {
        dirty = true;
        // Never note text in logs: only what failed, and only in development. The next change or foreground tries again.
        if (__DEV__) console.warn('[sticky-widget] publish failed:', error instanceof Error ? error.name : typeof error);
      }
      finally { running = false; if (pending) { pending = false; schedule(); } }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void sync(); }, 250); };
    const changed = () => { dirty = true; schedule(); };
    const changes = addDatabaseChangeListener((event) => {
      if (!STICKY_WIDGET_TABLES.includes(event.tableName) || !sameDatabase(event.databaseFilePath, database.databasePath)) return;
      transactionChanged = true;
      changed();
    });
    const stopTransactions = subscribeToDatabaseTransactions(database, () => { if (transactionChanged) { transactionChanged = false; changed(); } });
    const stopSpaces = subscribeToSpaceChanges(changed);
    const stopBoard = subscribeToBoardSize(changed);
    // Coming back, or leaving right after an edit: publish whatever is newest.
    const state = AppState.addEventListener('change', (next) => { if (next === 'active' || next === 'background') { previous = ''; dirty = true; void sync(); } });
    void sync();
    return () => { disposed = true; clearTimeout(timer); changes.remove(); stopTransactions(); stopSpaces(); stopBoard(); state.remove(); };
  }, [database, language]);
  return null;
}
