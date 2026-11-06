import { createContext, useContext, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { createMascotPreferenceStore } from './mascot-preference-store';

const MascotContext = createContext<ReturnType<typeof createMascotPreferenceStore> | null>(null);
const DEFAULT = { variant: 'classic' as const, saving: false };
const subscribeDefault = () => () => {};
const getDefault = () => DEFAULT;

export function MascotProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const store = useMemo(() => createMascotPreferenceStore(database), [database]);
  return <MascotContext.Provider value={store}>{children}</MascotContext.Provider>;
}

export function useMascotPreference() {
  const store = useContext(MascotContext);
  const snapshot = useSyncExternalStore(store?.subscribe ?? subscribeDefault, store?.getSnapshot ?? getDefault, getDefault);
  return { ...snapshot, select: store?.select };
}
