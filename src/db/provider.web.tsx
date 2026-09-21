import type { PropsWithChildren } from 'react';

// expo-sqlite web is alpha in SDK 57. Keep the preview navigable until its worker
// bundling is stable; Chits' persisted MVP target is native iOS and Android.
export function DatabaseProvider({ children }: PropsWithChildren) {
  return children;
}
