import { createContext, useContext, type PropsWithChildren } from 'react';
const BackgroundReadabilityContext = createContext(false);
export function BackgroundReadabilityProvider({ active, children }: PropsWithChildren<{ active: boolean }>) { return <BackgroundReadabilityContext.Provider value={active}>{children}</BackgroundReadabilityContext.Provider>; }
export function useBackgroundReadability() { return useContext(BackgroundReadabilityContext); }
