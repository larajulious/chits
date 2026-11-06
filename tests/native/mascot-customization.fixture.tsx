// Temporarily export this from /mascot-qa. This SQLite connection is isolated
// from the user's workspace; appearance, language and costume changes stay here.
import { useCallback, useEffect } from 'react';
import { Appearance } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { MascotProvider } from '@/components/mascot/mascot-provider';
import MascotScreen from '@/app/mascot';

export default function MascotCustomizationQA() {
  const { mode = 'light', style = 'classic' } = useLocalSearchParams<{ mode?: string; style?: string }>();
  const { appearance } = useTheme();
  useEffect(() => () => Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance), [appearance]);
  const init = useCallback(async (database: SQLiteDatabase) => {
    await database.execAsync('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
    for (const [key, value] of [['app_appearance', mode], ['app_style', style], ['mascot_variant', 'chits-ong']]) {
      await database.runAsync('INSERT INTO app_settings VALUES (?, ?, 0)', key, value);
    }
  }, [mode, style]);
  return <SQLiteProvider key={`${mode}:${style}`} databaseName=":memory:" options={{ useNewConnection: true }} onInit={init}><ThemeProvider><MascotProvider><MascotScreen /></MascotProvider></ThemeProvider></SQLiteProvider>;
}
