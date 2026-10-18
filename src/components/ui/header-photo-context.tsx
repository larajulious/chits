import { createContext, useContext } from 'react';
import { useTheme } from '@/components/theme-provider';
import type { HeaderPhoto } from '@/services/header-photo';

export const HeaderPhotoPreviewContext = createContext<{ photo: HeaderPhoto; onError: () => void } | null>(null);
export function useHeaderPhoto() {
  const preview = useContext(HeaderPhotoPreviewContext);
  const { customHeader, headerPhotoFailed, failHeaderPhoto } = useTheme();
  return preview ?? { photo: headerPhotoFailed ? null : customHeader, onError: failHeaderPhoto };
}
