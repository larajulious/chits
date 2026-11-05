// Native smoke surface: in-memory settings and note draft, no app repositories.
// Load with indian-localization-entry.js, then open chits:///locale-qa?lang=ta&mode=dark.
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SQLiteProvider, type SQLiteDatabase } from 'expo-sqlite';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { LanguageProvider, useLanguage } from '@/localization/provider';
import { LANGUAGE_NAMES, LANGUAGES, tr, type Language } from '@/localization/runtime';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Button, Chip, ChipRow } from '@/components/ui/controls';
import { LanguagePicker } from '@/components/settings/language-picker';

function Content() {
  "use no memo"; // Match production's mutable global translator boundary.
  const { language, setLanguage } = useLanguage();
  const { tokens, setAppearance } = useTheme();
  const [page, setPage] = useState('copy');
  const [draft, setDraft] = useState('');
  useEffect(() => {
    const open = async (url: string) => {
      const params = new URL(url).searchParams;
      const locale = params.get('lang');
      if (LANGUAGES.includes(locale as Language)) await setLanguage(locale as Language);
      await setAppearance(params.get('mode') === 'dark' ? 'dark' : 'light');
      setPage(params.get('page') ?? 'copy');
    };
    const subscription = Linking.addEventListener('url', event => { void open(event.url); });
    return () => subscription.remove();
  }, [setLanguage, setAppearance]);
  if (page === 'picker') return <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}><LanguagePicker preference={language} busy={false} onSelect={next => { void setLanguage(next); }} /></SafeAreaView>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}><ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
    <AppText variant="title" style={{ fontSize: 28, color: tokens.textPrimary }}>{LANGUAGE_NAMES[language]}</AppText>
    <AppText style={{ fontSize: 16, color: tokens.textPrimary }}>{tr('onboarding.mascot.say.room')}</AppText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{['index.notes', 'settings.settings', 'attachments.photos'].map(key => <AppText key={key} weight="700" style={{ fontSize: 16, color: tokens.textPrimary }}>{tr(key)}</AppText>)}</View>
    <AppTextInput accessibilityLabel={tr('plan.input')} placeholder={tr('plan.input')} placeholderTextColor={tokens.textMuted} value={draft} onChangeText={setDraft} multiline style={{ fontSize: 18, lineHeight: 27, minHeight: 72, borderWidth: 1, borderColor: tokens.borderSubtle, color: tokens.textPrimary, padding: 12 }} />
    <ChipRow>{['attachments.all', 'attachments.photos', 'attachments.videos', 'attachments.files'].map(key => <Chip key={key} label={tr(key)} selected={key === 'attachments.all'} accessibilityLabel={tr(key)} onPress={() => {}} />)}</ChipRow>
    <AppText style={{ fontSize: 18, color: tokens.textPrimary }}>{tr('plan.heading')}</AppText>
    <AppText style={{ fontSize: 16, color: tokens.textSecondary }}>{tr('plan.progress', { done: 2, total: 3 })}</AppText>
    <Button label={tr('plan.start')} onPress={() => {}} />
    <AppText style={{ fontSize: 18, color: tokens.textPrimary }}>{tr('focus.title')} · {tr('spin.title')}</AppText>
    <AppText style={{ fontSize: 16, color: tokens.textSecondary }}>{tr('anywhere.description')}</AppText>
    <Button label={tr('plan.wrapAction')} onPress={() => {}} />
  </ScrollView></SafeAreaView>;
}
export default function IndianLocalizationQA() {
  const init = useCallback(async (db: SQLiteDatabase) => {
    await db.execAsync('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
    await db.runAsync('INSERT INTO app_settings VALUES (?, ?, 0)', 'app_language', 'ta');
    await db.runAsync('INSERT INTO app_settings VALUES (?, ?, 0)', 'app_style', 'sticky');
  }, []);
  return <SafeAreaProvider><SQLiteProvider databaseName=":memory:" options={{ useNewConnection: true }} onInit={init}><LanguageProvider><ThemeProvider><Content /></ThemeProvider></LanguageProvider></SQLiteProvider></SafeAreaProvider>;
}
