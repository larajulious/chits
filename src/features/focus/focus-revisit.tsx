import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { createFocusRepository, subscribeToFocusChanges } from '@/db/focus-repository';
import { FocusEntry } from './focus-entry';
import type { NoteKey } from '@/services/revisit-engine';

/** Continuity is a saved session reference, never a second reminder/link. */
export function FocusRevisit() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createFocusRepository(database), [database]);
  const [keys, setKeys] = useState<NoteKey[]>([]);
  const load = useCallback(async () => {
    try { setKeys((await repository.continuityList()).map((row) => row.note_key as NoteKey)); }
    catch { setKeys([]); }
  }, [repository]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => subscribeToFocusChanges(() => void load()), [load]);
  if (!keys.length) return null;
  return <View style={{ gap: 4 }}>{keys.map((key) => <FocusEntry key={key} noteKey={key} continuityOnly compact />)}</View>;
}
