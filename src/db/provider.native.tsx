import { Component, useCallback, useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';

import { ChitsLoader } from '@/components/ui/chits-loader';
import { discardAbandonedBackupExports, recoverInterruptedRestore } from '@/services/backup-recovery.native';
import { BackupError } from '@/services/backup-format';
import { migrateDatabase } from './migrations';

const OPEN_OPTIONS = { useNewConnection: true };
class DatabaseBoundary extends Component<PropsWithChildren<{ onRetry: () => void }>, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.warn('[database] initialization failed', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: '#FCFCFA' }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, color: '#191919' }}>Chits could not open your data</Text>
      <Text accessibilityRole="alert" style={{ fontSize: 15, lineHeight: 22, color: '#444444' }}>{this.state.error instanceof BackupError ? this.state.error.message : 'Your saved data could not be opened. Reopen Chits to try again. Your data has not been removed.'}</Text>
      <Pressable accessibilityRole="button" onPress={this.props.onRetry} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: '#5149A8', fontSize: 16 }}>Try again</Text></Pressable>
    </View>;
  }
}
function ReadyDatabase({ children }: PropsWithChildren) {
  const [checked, setChecked] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let mounted = true;
    void recoverInterruptedRestore().then(async () => {
      await discardAbandonedBackupExports().catch(() => undefined);
      if (mounted) setChecked(true);
    }).catch((cause) => { if (mounted) setError(cause instanceof Error ? cause : new Error('Your data could not be opened. Your safety copy has been kept.')); });
    return () => { mounted = false; };
  }, []);
  const initialize = useCallback(async (database: SQLiteDatabase) => {
    await migrateDatabase(database);
    setInitialized(true);
  }, []);
  if (error) throw error;
  if (!checked) return <ChitsLoader fullscreen label="Checking your Chits data…" />;
  // The non-Suspense provider opens a new connection on EVERY mount. SDK 57's
  // Suspense provider caches its promise globally, even after that connection is closed.
  return <View style={{ flex: 1 }}>
    <SQLiteProvider databaseName="chits.db" options={OPEN_OPTIONS} onInit={initialize}>{children}</SQLiteProvider>
    {!initialized ? <ChitsLoader fullscreen /> : null}
  </View>;
}
export function DatabaseProvider({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  return <DatabaseBoundary key={attempt} onRetry={() => setAttempt((value) => value + 1)}><ReadyDatabase>{children}</ReadyDatabase></DatabaseBoundary>;
}
