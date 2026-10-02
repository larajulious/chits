import { Fredoka_500Medium } from '@expo-google-fonts/fredoka/500Medium';
import { Fredoka_600SemiBold } from '@expo-google-fonts/fredoka/600SemiBold';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';

import type { STICKY_FONT_FAMILIES } from './style-tokens';

// Sticky's faces, bundled with the app (Open Font License) — nothing is
// fetched at runtime. Keys are the families style-tokens.ts names.
export const STICKY_FONTS: Record<typeof STICKY_FONT_FAMILIES[number], number> = { Fredoka_500Medium, Fredoka_600SemiBold, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold };
