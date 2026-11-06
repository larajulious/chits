import { WidgetPrivacySettings } from '@/features/anywhere/privacy-settings';
import { PlanSettingsSection } from '@/features/plan/plan-settings';
import { LanguagePicker } from '@/components/settings/language-picker';
import { useDirection, useLanguage } from '@/localization/provider';
import { getFormattingLocale, LANGUAGE_NAMES, tr } from '@/localization/runtime';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme, type AppAppearance } from '@/components/theme-provider';
import { AppText, HeaderIcon, HeaderTitleTag, Icon, IconButton, SegmentedControl, Surface, TopBarBackground, useHeaderInk, useStickySheet, MenuIcon } from '@/components/ui/primitives';
import { PAPER_INK, PaperDesk, useDesk } from '@/components/desk/paper-desk';
import { AppearancePreview } from '@/components/settings/appearance-preview';
import { SettingsRow, SettingsSection, SettingsToggleRow } from '@/components/settings/settings-rows';
import { endTour, startTour } from '@/features/onboarding/tour';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { HeaderChromeContext } from '@/components/ui/controls';
import { EditNoteSpaceNameSheet } from '@/components/settings/edit-notespace-name-sheet';
import { ChatAppearanceSettings } from '@/components/settings/chat-appearance-settings';
import { type ChatThemeKey } from '@/constants/theme';
import { CHITS_THEMES } from '@/constants/chits-themes';
import { APP_STYLE_NAMES, APP_STYLES, type AppStyle } from '@/constants/style-tokens';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSpinRepository } from '@/db/spin-repository';
import { ORGANIZATION_ENABLED_KEY } from '@/services/chits-organization';
import { MascotSettings } from '@/components/settings/mascot-settings';

type Sheet = 'appearance' | 'language' | 'style' | 'accent' | null;
const appearanceNames = { get system() { return tr('settings.systemDefault'); }, get light() { return tr('settings.light'); }, get dark() { return tr('settings.dark'); } };
const styleOptions = () => APP_STYLES.map((key: AppStyle) => ({ key, label: APP_STYLE_NAMES[key], accessibilityLabel: tr("settings.valueStyle", { value1: APP_STYLE_NAMES[key] }) }));

export default function SettingsScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { rowStyle } = useDirection();
  const { preference, setLanguage } = useLanguage();
  const { openDrawer } = useAppDrawer();
  const { appearance, setAppearance, identity, themeKey, setThemeKey, themes, tokens, style, setStyle, styleTokens } = useTheme();
  const leftTitle = styleTokens.header.align === 'left';
  const desk = useDesk();
  const fonts = useWelcomeFonts();
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
  const lastBackupSeen = useRef<number | null>(null);
  const refresh = useCallback(async () => {
    try {
      const [backup, titleRow, suggestionRow, spinVisible] = await Promise.all([
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'last_backup_at'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ORGANIZATION_ENABLED_KEY),
        spinRepository.visibility(),
      ]);
      setShowSpin(spinVisible); setSpinVisibilityLoaded(true);
      // last_backup_at is only written once a backup has really been saved.
      const saved = Number(backup?.value ?? 0);
      if (lastBackupSeen.current !== null && saved > lastBackupSeen.current) setToast(tr('backup.backupSaved'));
      lastBackupSeen.current = saved;
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
  // Only starts a tour, as Getting started's Replay does: nothing else is touched.
  const replayTour = () => change(async () => { await endTour(database); await startTour(database, 'replay'); router.push('/onboarding/welcome'); });
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
    <HeaderChromeContext.Provider value>
      <View style={[styles.header, rowStyle, { minHeight: styleTokens.header.minHeight }, leftTitle && styles.headerLeft]}><TopBarBackground /><IconButton label={tr("archive.openNavigation")} onPress={openDrawer}><MenuIcon /></IconButton><View style={[styles.headerTitle, leftTitle && styles.headerTitleLeft]}><HeaderTitleTag><AppText accessibilityRole="header" variant="title" family={fonts.display} numberOfLines={1} style={{ color: headerInk.banded ? PAPER_INK : headerInk.ink, fontSize: styleTokens.header.titleSize, lineHeight: styleTokens.header.titleLineHeight }}>{tr("settings.settings")}</AppText></HeaderTitleTag></View><IconButton label={tr("settings.closeSettings")} onPress={() => router.canGoBack() ? router.back() : router.navigate('/')}><HeaderIcon name="close" size={24} /></IconButton></View>
    </HeaderChromeContext.Provider>
    <PaperDesk faint>
    <ScrollView contentContainerStyle={styles.content}>
      {error && !sheet ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
      <SettingsSection title={tr('settings.general')}>
        <SettingsRow icon="language-outline" label={tr('settings.language')} value={preference === 'system' ? tr('settings.systemDefault') : LANGUAGE_NAMES[preference]} onPress={() => setSheet('language')} />
        <SettingsRow icon="create-outline" label={tr('settings.editNotespaceName')} value={noteSpaceName} onPress={() => setEditNameOpen(true)} />
      </SettingsSection>
      <SettingsSection title="Chits">
        <SettingsRow icon="sync-outline" label={tr('spin.title')} onPress={() => router.push('/spin')} />
        <SettingsToggleRow icon="eye-outline" label={tr('settings.showChitsSpin')} description={tr('settings.showChitsSpinHelp')} value={showSpin} disabled={busy || !spinVisibilityLoaded} onChange={(value) => void change(async () => { await spinRepository.setVisibility(value); setShowSpin(value); })} />
        <SettingsToggleRow icon="bulb-outline" label={tr("settings.chitsSuggestions")} description={tr("settings.letChitsOccasionallySuggestBoardsOrSpacesFor")} value={organizationSuggestionsEnabled} disabled={busy} onChange={(value) => void toggleOrganizationSuggestions(value)} />
        <SettingsRow icon="timer-outline" label={tr('focus.settings')} onPress={() => router.push('/focus-settings')} />
        <SettingsRow icon="time-outline" label={tr('focus.history')} onPress={() => router.push('/focus-history')} />
        <SettingsRow icon="refresh" label={tr('onboarding.hub.replay')} description={tr('onboarding.hub.replay.detail')} disabled={busy} onPress={() => void replayTour()} />
      </SettingsSection>
      <MascotSettings />
      <SettingsSection title={tr('settings.appearance')}>
        <AppearancePreview paused={sheet !== null} />
        <SettingsRow icon="color-palette-outline" label={tr('appearancetheme.theme')} value={CHITS_THEMES[identity].name} onPress={() => router.push('/appearance-theme')} />
        <SettingsRow icon="shapes-outline" label={tr('settings.style')} value={APP_STYLE_NAMES[style]} disabled={busy} onPress={() => setSheet('style')} />
        <SettingsRow icon="contrast-outline" label={tr('settings.appAppearance')} value={appearanceNames[appearance]} onPress={() => setSheet('appearance')} />
        {identity === 'default' ? <SettingsRow icon="brush-outline" label={tr('settings.accentColor')} value={themes[themeKey].name} swatch={tokens.accent} disabled={busy} onPress={() => setSheet('accent')} /> : null}
        <View style={styles.inset}><ChatAppearanceSettings compact /></View>
      </SettingsSection>
      <PlanSettingsSection />
      <SettingsSection title={tr('anywhere.privacy')}><WidgetPrivacySettings /></SettingsSection>
      <SettingsSection title={tr('settings.data')}><SettingsRow icon="archive-outline" label={tr('backup.backupRestore')} description={lastBackup && !Number.isNaN(new Date(Number(lastBackup)).getTime()) ? tr('settings.lastBackup', { date: new Date(Number(lastBackup)).toLocaleDateString(getFormattingLocale()) }) : tr('settings.noBackup')} onPress={() => router.push('/backup')} /></SettingsSection>

    </ScrollView>
    </PaperDesk>
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, sheet === 'language' && { height: '85%' }, { backgroundColor: tokens.surface, borderTopLeftRadius: styleTokens.radius.sheet, borderTopRightRadius: styleTokens.radius.sheet }, stickySheet()]}>
          <View style={[styles.sheetHeader, rowStyle]}><AppText accessibilityRole="header" variant="display" weight="600" family={fonts.display} style={[styles.sheetTitle, { color: tokens.textPrimary }]}>{sheet === 'language' ? tr('settings.language') : sheet === 'style' ? tr('settings.style') : sheet === 'accent' ? tr('settings.accentColor') : tr('settings.appAppearance')}</AppText><IconButton label={tr("settings.closeSettingsSheet")} disabled={busy} onPress={closeSheet}><Icon name="close-outline" size={22} color={tokens.textSecondary} /></IconButton></View>
          {sheet === 'language' ? <LanguagePicker preference={preference} busy={busy} onSelect={language => void change(() => setLanguage(language), true)} /> : <ScrollView contentContainerStyle={styles.sheetContent}>
            {sheet === 'style' ? <View style={[styles.styleBlock, { borderBottomColor: tokens.borderSubtle }]}>
          <AppText variant="paragraph" family={fonts.text} style={[styles.description, styles.styleDescription, { color: tokens.textSecondary }]}>{tr("settings.classicOrOutlinedLikeAStickyNoteWorks")}</AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel={tr("settings.style")}>
            <SegmentedControl options={styleOptions()} value={style} onChange={(next) => { if (next !== style) void change(() => setStyle(next)); }} />
          </View>
        </View> : null}
            {sheet === 'accent' ? <View style={styles.paletteBlock}>
          <AppText variant="paragraph" family={fonts.text} style={[styles.description, { color: tokens.textSecondary }]}>{tr("settings.usedForControlsAndAccentsInTheDefault")}</AppText>
          <View style={[styles.preview, { backgroundColor: tokens.bubble, borderRadius: styleTokens.radius.bubble }]}><AppText style={{ color: tokens.bubbleText }}>{tr("settings.myThought")}</AppText></View>
          <View style={styles.palette}>{(Object.keys(themes) as ChatThemeKey[]).map((key) => {
            const selected = themeKey === key;
            const color = key === 'light' ? '#E9E9E9' : themes[key].light.accent;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={themes[key].name} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => void change(() => setThemeKey(key))} style={({ pressed }) => [styles.swatchTarget, { borderColor: selected ? tokens.textPrimary : 'transparent' }, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: color }]}>{selected ? <Icon name="checkmark" size={18} color={key === 'light' ? '#0D0D0D' : themes[key].light.accentText} /> : null}</View>
            </Pressable>;
          })}</View>
          <AppText accessibilityLiveRegion="polite" variant="paragraph" family={fonts.text} style={[styles.description, { color: tokens.textSecondary }]}>{themes[themeKey].name}</AppText>
        </View> : null}
            {sheet === 'appearance' ? (['system', 'light', 'dark'] as AppAppearance[]).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: appearance === mode, disabled: busy }} disabled={busy} onPress={() => void change(() => setAppearance(mode), true)} style={styles.choice}><AppText family={fonts.text} style={[styles.label, { color: tokens.textPrimary }]}>{appearanceNames[mode]}</AppText>{appearance === mode ? <Icon name="checkmark" size={22} color={tokens.accent} /> : null}</Pressable>) : null}
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
  headerTitle: { flex: 1, alignItems: 'center' }, headerTitleLeft: { alignItems: 'flex-start' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 24, paddingBottom: 32, gap: 24 },
  inset: { paddingHorizontal: 14 },
  label: { fontSize: 15, lineHeight: 21 }, description: { fontSize: 12, lineHeight: 17, marginTop: 3 },
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
