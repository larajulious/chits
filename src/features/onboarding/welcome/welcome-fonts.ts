import { useFonts } from 'expo-font';

import { STICKY_FONTS, WORKSPACE_FONT_FAMILIES } from '@/constants/style-fonts';

/**
 * Pins Fredoka and Nunito on the onboarding screens, whatever theme is on (a
 * theme with its own heading face would otherwise show it there). Until they
 * register, or if they can't, faces are undefined and the system face shows.
 */
export function useWelcomeFonts() {
  const [loaded] = useFonts(STICKY_FONTS);
  if (!loaded) return { display: undefined, text: undefined, textBold: undefined };
  return WORKSPACE_FONT_FAMILIES;
}
