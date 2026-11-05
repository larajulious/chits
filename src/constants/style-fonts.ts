import { Fredoka_500Medium } from '@expo-google-fonts/fredoka/500Medium';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_600SemiBold_Italic } from '@expo-google-fonts/nunito/600SemiBold_Italic';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_700Bold_Italic } from '@expo-google-fonts/nunito/700Bold_Italic';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_800ExtraBold_Italic } from '@expo-google-fonts/nunito/800ExtraBold_Italic';

import type { STICKY_FONT_FAMILIES } from './style-tokens';

// Sticky's faces, bundled with the app (Open Font License) — nothing is
// fetched at runtime. Keys are the families style-tokens.ts names.
export const STICKY_FONTS: Record<typeof STICKY_FONT_FAMILIES[number], number> = { Fredoka_500Medium, Fredoka_600SemiBold, Nunito_600SemiBold, Nunito_600SemiBold_Italic, Nunito_700Bold, Nunito_700Bold_Italic, Nunito_800ExtraBold, Nunito_800ExtraBold_Italic };

/** The shared faces for Getting Started, workspace heroes and paper content. */
export const WORKSPACE_FONT_FAMILIES = {
  display: 'Fredoka_600SemiBold',
  text: 'Nunito_600SemiBold',
  textBold: 'Nunito_800ExtraBold',
} as const;
