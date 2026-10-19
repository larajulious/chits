/** Display-only bidi/typography helpers. Never normalize or rewrite stored text. */
export type TextDirection = 'ltr' | 'rtl';
export function languageDirection(locale: string): TextDirection {
  return /^ar(?:-|$)/i.test(locale) ? 'rtl' : 'ltr';
}
export function firstStrongDirection(text: string, fallback: TextDirection = 'ltr'): TextDirection {
  for (const character of text) {
    if (!/\p{Letter}/u.test(character)) continue;
    return /[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(character) ? 'rtl' : 'ltr';
  }
  return fallback;
}
export function needsSystemFont(text: string, locale = ''): boolean {
  return /^(ar|hi|ja|ko|vi)(?:-|$)/i.test(locale) || /[\p{Script=Arabic}\p{Script=Devanagari}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}
export function contentTextStyle(text: string, fallback: TextDirection = 'ltr') {
  const direction = firstStrongDirection(text, fallback);
  return { textAlign: direction === 'rtl' ? 'right' as const : 'left' as const, writingDirection: direction, ...(needsSystemFont(text) ? { fontFamily: undefined, includeFontPadding: true } : {}) };
}
/** Isolate substituted names, URLs, filenames and user text within RTL UI copy. */
export function isolateDisplayValues(values: Record<string, unknown> | undefined, language: string) {
  if (!values || languageDirection(language) !== 'rtl') return values;
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'string' && value ? `\u2068${value}\u2069` : value]));
}
const MIRRORED_ICONS: Readonly<Record<string, string>> = {
  'arrow-back': 'arrow-forward', 'arrow-back-outline': 'arrow-forward-outline',
  'arrow-forward': 'arrow-back', 'arrow-forward-outline': 'arrow-back-outline',
  'chevron-back': 'chevron-forward', 'chevron-back-outline': 'chevron-forward-outline',
  'chevron-forward': 'chevron-back', 'chevron-forward-outline': 'chevron-back-outline',
};
/** Only navigation opts in; playback, physical crop and drag controls stay physical. */
export function navigationIconName<T extends string>(name: T, direction: TextDirection): T {
  return (direction === 'rtl' && Object.hasOwn(MIRRORED_ICONS, name) ? MIRRORED_ICONS[name] : name) as T;
}
