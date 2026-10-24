import { WidgetPrivacySettings } from '@/features/anywhere/privacy-settings';
import { navigationIconName } from '@/localization/text-layout';
import { LanguagePicker } from '@/components/settings/language-picker';
import { useDirection, useLanguage, useLocale } from '@/localization/provider';
import { getFormattingLocale, LANGUAGE_NAMES, tr } from '@/localization/runtime';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme, type AppAppearance } from '@/components/theme-provider';
import { AppText, HeaderIcon, Icon, IconButton, SegmentedControl, Surface, TopBarBackground, useHeaderInk, useStickySheet, MenuIcon } from '@/components/ui/primitives';
import { DeskPage, PaperDesk, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { HeaderChromeContext } from '@/components/ui/controls';
import { EditNoteSpaceNameSheet } from '@/components/settings/edit-notespace-name-sheet';
import { ChatAppearanceSettings } from '@/components/settings/chat-appearance-settings';
import { type ChatThemeKey } from '@/constants/theme';
import { CHITS_THEMES } from '@/constants/chits-themes';
import { APP_STYLE_NAMES, APP_STYLES, type AppStyle } from '@/constants/style-tokens';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Children, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSpinRepository } from '@/db/spin-repository';
import { ORGANIZATION_ENABLED_KEY } from '@/services/chits-organization';

type Sheet = 'appearance' | 'language' | 'style' | 'accent' | null;
const appearanceNames = { get system() { return tr('settings.systemDefault'); }, get light() { return tr('settings.light'); }, get dark() { return tr('settings.dark'); } };
const styleOptions = () => APP_STYLES.map((key: AppStyle) => ({ key, label: APP_STYLE_NAMES[key], accessibilityLabel: tr("settings.valueStyle", { value1: APP_STYLE_NAMES[key] }) }));

function SettingsRow({ label, value, description, onPress, disabled }: { label: string; value?: string; description?: string; onPress?: () => void; disabled?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle, direction } = useDirection();
  const { tokens } = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress || disabled} onPress={onPress} style={({ pressed }) => [styles.row, rowStyle, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
    <View style={styles.rowCopy}><AppText style={[styles.label, { color: tokens.textPrimary }]}>{label}</AppText>{description ? <AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{description}</AppText> : null}</View>
    {value ? <AppText style={[styles.value, { color: tokens.textSecondary }]}>{value}</AppText> : null}
    {onPress ? <Icon name={navigationIconName("chevron-forward", direction)} size={17} color={tokens.textMuted} /> : null}
  </Pressable>;
}
function Section({ title, children, padded = false }: { title: string; children: ReactNode; padded?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const rows = Children.toArray(children);
  // A section is a handwritten heading on the desk over a page of the theme's
  // own paper, so every setting control keeps its theme ink.
  return <View style={styles.section}>
    <AppText accessibilityRole="header" style={[handBold, styles.sectionLabel, { color: desk.ink }]}>{title}</AppText>
    <DeskPage>
      {padded ? <View style={styles.sectionPadding}>{children}</View> : rows.map((child,index) => <View key={index} style={[styles.sectionRow,index < rows.length-1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.borderSubtle }]}>{child}</View>)}
    </DeskPage>
  </View>;
}

export default function SettingsScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const { preference, setLanguage } = useLanguage();
  const { openDrawer } = useAppDrawer();
  const { appearance, setAppearance, identity, themeKey, setThemeKey, themes, tokens, style, setStyle, styleTokens } = useTheme();
  const leftTitle = styleTokens.header.align === 'left';
  const desk = useDesk();
  const stickySheet = useStickySheet();
  const headerInk = useHeaderInk();
  const database = useSQLiteContext();
  const spinRepository = useMemo(() => createSpinRepository(database), [database]);
  const [showSpin, setShowSpin] = useState(true);
  const [spinVisibilityLoaded, setSpinVisibilityLoaded] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [organizationSuggestionsEnabled, setOrganizationSuggestionsEnabled] = useState(true);
  // Same single source of truth as Chat's header, Boards' header, and the drawer —
  // all independently read this same app_settings key, refetched here on focus so
  // a rename made elsewhere is reflected without restarting the app.
  const [noteSpaceName, setNoteSpaceName] = useState('Chits');
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [backup, titleRow, suggestionRow, spinVisible] = await Promise.all([
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'last_backup_at'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ORGANIZATION_ENABLED_KEY),
        spinRepository.visibility(),
      ]);
      setShowSpin(spinVisible); setSpinVisibilityLoaded(true);
      setLastBackup(backup?.value ?? null);
      setNoteSpaceName(titleRow?.value.trim() || 'Chits');
      setOrganizationSuggestionsEnabled(suggestionRow?.value !== 'false');
    } catch { setError(tr("settings.someSettingsCouldNotBeLoadedReopenSettings")); }
  }, [database, spinRepository]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  const saveNoteSpaceName = async (name: string) => {
    await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_title', name, Date.now());
    setNoteSpaceName(name);
    setToast(tr("settings.notespaceNameUpdated"));
  };
  const change = async (action: () => Promise<void>, close = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); if (close) setSheet(null); }
    catch { setError(tr("settings.thatSettingCouldNotBeSavedPleaseTry")); }
    finally { setBusy(false); }
  };
  const closeSheet = () => { if (!busy) setSheet(null); };
  const toggleOrganizationSuggestions = async (enabled: boolean) => {
    if (busy) return;
    setOrganizationSuggestionsEnabled(enabled);
    setBusy(true); setError(null);
    try { await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ORGANIZATION_ENABLED_KEY, enabled ? 'true' : 'false', Date.now()); }
    catch { setOrganizationSuggestionsEnabled(!enabled); setError(tr("settings.thatSettingCouldNotBeSavedPleaseTry")); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={[styles.screen, { backgroundColor: desk.desk }]}>
    <HeaderChromeContext.Provider value={leftTitle}>
      <View style={[styles.header, rowStyle, { minHeight: styleTokens.header.minHeight }, leftTitle && styles.headerLeft]}><TopBarBackground /><IconButton label={tr("archive.openNavigation")} onPress={openDrawer}><MenuIcon /></IconButton><AppText accessibilityRole="header" variant="title" numberOfLines={1} style={[styles.headerTitle, { color: headerInk.ink, fontSize: styleTokens.header.titleSize, lineHeight: styleTokens.header.titleLineHeight }, leftTitle && styles.headerTitleLeft]}>{tr("settings.settings")}</AppText><IconButton label={tr("settings.closeSettings")} onPress={() => router.canGoBack() ? router.back() : router.navigate('/')}><HeaderIcon name="close" size={24} /></IconButton></View>
    </HeaderChromeContext.Provider>
    <PaperDesk>
    <ScrollView contentContainerStyle={styles.content}>
      {error && !sheet ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
      <Section title={tr('settings.general')}>
        <SettingsRow label={tr('settings.language')} value={preference === 'system' ? tr('settings.systemDefault') : LANGUAGE_NAMES[preference]} onPress={() => setSheet('language')} />
        <SettingsRow label={tr('settings.editNotespaceName')} value={noteSpaceName} onPress={() => setEditNameOpen(true)} />
      </Section>
      <Section title="CHITS">
        <SettingsRow label={tr('spin.title')} onPress={() => router.push('/spin')} />
        <View style={[styles.row, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
          <View style={styles.rowCopy}><AppText style={[styles.label, { color: tokens.textPrimary }]}>{tr('settings.showChitsSpin')}</AppText><AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{tr('settings.showChitsSpinHelp')}</AppText></View>
          <Switch accessibilityLabel={tr('settings.showChitsSpin')} accessibilityHint={tr('settings.showChitsSpinHelp')} accessibilityRole="switch" value={showSpin} disabled={busy || !spinVisibilityLoaded} onValueChange={value => void change(async () => { await spinRepository.setVisibility(value); setShowSpin(value); })} trackColor={{ true: tokens.accent, false: tokens.borderSubtle }} thumbColor={tokens.surface} />
        </View>
        <View style={[styles.row, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
          <View style={styles.rowCopy}><AppText style={[styles.label, { color: tokens.textPrimary }]}>{tr("settings.chitsSuggestions")}</AppText><AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{tr("settings.letChitsOccasionallySuggestBoardsOrSpacesFor")}</AppText></View>
          <Switch accessibilityLabel={tr("settings.chitsSuggestions")} accessibilityRole="switch" value={organizationSuggestionsEnabled} disabled={busy} onValueChange={(value) => void toggleOrganizationSuggestions(value)} trackColor={{ true: tokens.accent, false: tokens.borderSubtle }} thumbColor={tokens.surface} />
        </View>
        <SettingsRow label={tr('focus.settings')} onPress={() => router.push('/focus-settings')} />
        <SettingsRow label={tr('focus.history')} onPress={() => router.push('/focus-history')} />
      </Section>
      <Section title={tr('settings.appearance')}>
        <SettingsRow label={tr('appearancetheme.theme')} value={CHITS_THEMES[identity].name} onPress={() => router.push('/appearance-theme')} />
        <SettingsRow label={tr('settings.style')} value={APP_STYLE_NAMES[style]} disabled={busy} onPress={() => setSheet('style')} />
        <SettingsRow label={tr('settings.appAppearance')} value={appearanceNames[appearance]} onPress={() => setSheet('appearance')} />
        {identity === 'default' ? <SettingsRow label={tr('settings.accentColor')} value={themes[themeKey].name} disabled={busy} onPress={() => setSheet('accent')} /> : null}
        <ChatAppearanceSettings compact />
      </Section>
      <Section title={tr('anywhere.privacy')} padded><WidgetPrivacySettings /></Section>
      <Section title={tr('settings.data')}><SettingsRow label={tr('backup.backupRestore')} description={lastBackup && !Number.isNaN(new Date(Number(lastBackup)).getTime()) ? tr('settings.lastBackup', { date: new Date(Number(lastBackup)).toLocaleDateString(getFormattingLocale()) }) : tr('settings.noBackup')} onPress={() => router.push('/backup')} /></Section>

    </ScrollView>
    </PaperDesk>
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, sheet === 'language' && { height: '85%' }, { backgroundColor: tokens.surface, borderTopLeftRadius: styleTokens.radius.sheet, borderTopRightRadius: styleTokens.radius.sheet }, stickySheet()]}>
          <View style={[styles.sheetHeader, rowStyle]}><AppText accessibilityRole="header" variant="display" weight="600" style={[styles.sheetTitle, { color: tokens.textPrimary }]}>{sheet === 'language' ? tr('settings.language') : sheet === 'style' ? tr('settings.style') : sheet === 'accent' ? tr('settings.accentColor') : tr('settings.appAppearance')}</AppText><IconButton label={tr("settings.closeSettingsSheet")} disabled={busy} onPress={closeSheet}><Icon name="close-outline" size={22} color={tokens.textSecondary} /></IconButton></View>
          {sheet === 'language' ? <LanguagePicker preference={preference} busy={busy} onSelect={language => void change(() => setLanguage(language), true)} /> : <ScrollView contentContainerStyle={styles.sheetContent}>
            {sheet === 'style' ? <View style={[styles.styleBlock, { borderBottomColor: tokens.borderSubtle }]}>
          <AppText variant="paragraph" style={[styles.description, styles.styleDescription, { color: tokens.textSecondary }]}>{tr("settings.classicOrOutlinedLikeAStickyNoteWorks")}</AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel={tr("settings.style")}>
            <SegmentedControl options={styleOptions()} value={style} onChange={(next) => { if (next !== style) void change(() => setStyle(next)); }} />
          </View>
        </View> : null}
            {sheet === 'accent' ? <View style={styles.paletteBlock}>
          <AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{tr("settings.usedForControlsAndAccentsInTheDefault")}</AppText>
          <View style={[styles.preview, { backgroundColor: tokens.bubble, borderRadius: styleTokens.radius.bubble }]}><AppText style={{ color: tokens.bubbleText }}>{tr("settings.myThought")}</AppText></View>
          <View style={styles.palette}>{(Object.keys(themes) as ChatThemeKey[]).map((key) => {
            const selected = themeKey === key;
            const color = key === 'light' ? '#E9E9E9' : themes[key].light.accent;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={themes[key].name} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => void change(() => setThemeKey(key))} style={({ pressed }) => [styles.swatchTarget, { borderColor: selected ? tokens.textPrimary : 'transparent' }, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: color }]}>{selected ? <Icon name="checkmark" size={18} color={key === 'light' ? '#0D0D0D' : themes[key].light.accentText} /> : null}</View>
            </Pressable>;
          })}</View>
          <AppText accessibilityLiveRegion="polite" variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{themes[themeKey].name}</AppText>
        </View> : null}
            {sheet === 'appearance' ? (['system', 'light', 'dark'] as AppAppearance[]).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: appearance === mode, disabled: busy }} disabled={busy} onPress={() => void change(() => setAppearance(mode), true)} style={styles.choice}><AppText style={[styles.label, { color: tokens.textPrimary }]}>{appearanceNames[mode]}</AppText>{appearance === mode ? <Icon name="checkmark" size={22} color={tokens.accent} /> : null}</Pressable>) : null}
            {busy ? <ActivityIndicator accessibilityLabel={tr("settings.savingSetting")} color={tokens.accent} /> : null}
            {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
          </ScrollView>}
          {sheet === 'language' && busy ? <ActivityIndicator accessibilityLabel={tr("settings.savingSetting")} color={tokens.accent} /> : null}
          {sheet === 'language' && error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
    <EditNoteSpaceNameSheet visible={editNameOpen} currentName={noteSpaceName} onClose={() => setEditNameOpen(false)} onSave={saveNoteSpaceName} />
    {toast ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.toastWrap}><Surface fill={tokens.textPrimary} radius={styleTokens.radius.toast} shadow="toast" outline={false} edge={false} style={styles.toast}><AppText weight="600" style={[styles.toastText, { color: tokens.background }]}>{toast}</AppText></Surface></View> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, headerLeft: { gap: 10 },
  headerTitle: { flex: 1, textAlign: 'center' }, headerTitleLeft: { textAlign: 'left' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28, gap: 22 }, section: { gap: 8 },
  sectionRow: { paddingHorizontal: 12 }, sectionPadding: { padding: 12 },
  sectionLabel: { fontSize: 22, lineHeight: 29, paddingHorizontal: 4 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rowCopy: { flex: 1, minWidth: 0 }, label: { fontSize: 15, lineHeight: 21 }, description: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  value: { fontSize: 14, flexShrink: 1, maxWidth: '45%', textAlign: 'auto' },
  styleBlock: { paddingTop: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth }, styleDescription: { marginBottom: 10 },
  paletteBlock: { paddingTop: 12, paddingBottom: 2 }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  swatchTarget: { width: 44, height: 44, borderRadius: 44 / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 32 / 2, alignItems: 'center', justifyContent: 'center' },
  preview: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 8, marginVertical: 8 },
  pressed: { opacity: 0.65 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { maxHeight: '85%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 8 },
  sheetTitle: { flex: 1, fontSize: 18 }, sheetContent: { paddingHorizontal: 20, paddingBottom: 20 },
  choice: { minHeight: 50, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toastWrap: { position: 'absolute', right: 0, bottom: 32, left: 0, alignItems: 'center' },
  toast: { paddingHorizontal: 16, paddingVertical: 8 },
  toastText: { fontSize: 14 },
});
