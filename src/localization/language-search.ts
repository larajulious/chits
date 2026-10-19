import languages from './languages.json';
/** Folding is for searching the language list only, never note content. */
export function languageSearchText(text: string) {
  return text.normalize('NFKD').replace(/\p{Mark}/gu, '').replace(/ı/g, 'i').toLowerCase().trim();
}
export function filterLanguageOptions(query: string) {
  const words = languageSearchText(query).split(/\s+/).filter(Boolean);
  return languages.filter(language => {
    const haystack = languageSearchText(`${language.id} ${language.name} ${language.englishName}`);
    return words.every(word => haystack.includes(word));
  });
}
