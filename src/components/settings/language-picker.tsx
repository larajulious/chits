import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { SearchField } from '@/components/ui/search-field';
import { useTheme } from '@/components/theme-provider';
import { useDirection } from '@/localization/provider';
import { filterLanguageOptions } from '@/localization/language-search';
import { tr, type LanguagePreference } from '@/localization/runtime';

export function LanguagePicker({ preference, busy, onSelect }: { preference: LanguagePreference; busy: boolean; onSelect: (language: LanguagePreference) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const [query, setQuery] = useState('');
  const { tokens } = useTheme();
  const { rowStyle } = useDirection();
  const options = filterLanguageOptions(query);
  const row = (id: LanguagePreference, name: string) => <Pressable key={id} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ selected: preference === id, disabled: busy }} disabled={busy} onPress={() => onSelect(id)} style={[{ minHeight: 52, paddingVertical: 12, gap: 12, alignItems: 'center' }, rowStyle]}>
    <AppText accessibilityLanguage={id === 'system' ? undefined : id} style={{ color: tokens.textPrimary, flex: 1, fontSize: 16 }}>{name}</AppText>
    {preference === id ? <Icon name="checkmark" size={22} color={tokens.accent} /> : null}
  </Pressable>;
  return <View style={{ flex: 1, minHeight: 0, paddingHorizontal: 20, paddingBottom: 20 }}>
    {row('system', tr('settings.systemDefault'))}
    <SearchField value={query} onChangeText={setQuery} placeholder={tr('settings.searchLanguages')} accessibilityLabel={tr('settings.searchLanguages')} />
    <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
    {options.map(option => row(option.id as LanguagePreference, option.name))}
    {!options.length ? <AppText accessibilityLiveRegion="polite" style={{ color: tokens.textSecondary, paddingVertical: 16 }}>{tr('settings.noLanguages')}</AppText> : null}
    </ScrollView>
  </View>;
}
