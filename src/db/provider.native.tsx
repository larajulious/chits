import type { PropsWithChildren } from 'react';
import { SQLiteProvider } from 'expo-sqlite';

import { migrateDatabase } from './migrations';

export function DatabaseProvider({ children }: PropsWithChildren) {
  return <SQLiteProvider databaseName="chits.db" onInit={migrateDatabase} useSuspense>{children}</SQLiteProvider>;
}
