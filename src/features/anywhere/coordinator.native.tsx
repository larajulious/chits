import { databaseTransactionState, subscribeToDatabaseTransactions } from '@/services/database-transactions';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { addDatabaseChangeListener, useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/components/theme-provider';
import { useLanguage } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { listWidgetRecentNotes } from '@/db/repositories';
import { isWidgetDatabaseChange, widgetNotes, widgetPrivacy, WIDGET_PRIVACY_KEY, type WidgetPrivacy } from './snapshot';
import { publishWidget } from './publish';
export function AnywhereCoordinator() {
  const database = useSQLiteContext();
  const { tokens } = useTheme();
  const { language } = useLanguage();
  useEffect(() => {
    let disposed = false;
    let running = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = '';
    let notesDirty = true;
    let transactionChanged = false;
    let lastPrivacy: WidgetPrivacy | undefined;
    const sync = async () => {
      if (disposed || databaseTransactionState(database).active) return;
      if (running) { pending = true; return; }
      running = true;
      const revision = databaseTransactionState(database).revision;
      try {
        const setting = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', WIDGET_PRIVACY_KEY);
        const privacy = widgetPrivacy(setting?.value);
        if (!notesDirty && privacy === lastPrivacy && previous) return;
        notesDirty = false;
        const rows = privacy === 'hidden' ? [] : await listWidgetRecentNotes(database);
        const transaction = databaseTransactionState(database);
        if (transaction.active || transaction.revision !== revision) { notesDirty = true; schedule(); return; }
        const snapshot = { version: 1 as const, privacy, notes: widgetNotes(rows, privacy),
          brand: tr('anywhere.brand'), quick: tr('anywhere.quick'), recent: tr('anywhere.recent'), empty: tr('anywhere.empty'), hidden: tr('anywhere.hidden'),
          locale: language, rtl: language === 'ar', mascot: '',
          background: tokens.background, foreground: tokens.textPrimary, secondary: tokens.textSecondary, accent: tokens.accent, onAccent: tokens.accentText };
        const serialized = JSON.stringify(snapshot);
        if (!disposed && previous !== serialized) { await publishWidget(snapshot); previous = serialized; lastPrivacy = privacy; }
      } catch { /* No note data in logs. Retry on the next change or foreground. */ }
      finally { running = false; if (pending) { pending = false; schedule(); } }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void sync(); }, 150); };
    const changes = addDatabaseChangeListener(event => { if (isWidgetDatabaseChange(event, database.databasePath)) { if (event.tableName !== 'app_settings') notesDirty = true; transactionChanged = true; schedule(); } });
    const stopTransactions = subscribeToDatabaseTransactions(database, () => { if (transactionChanged) { transactionChanged = false; notesDirty = true; schedule(); } });
    const state = AppState.addEventListener('change', next => { if (next === 'active' || next === 'background') { previous = ''; void sync(); } });
    void sync();
    return () => { disposed = true; clearTimeout(timer); changes.remove(); stopTransactions(); state.remove(); };
  }, [database, language, tokens]);
  return null;
}
