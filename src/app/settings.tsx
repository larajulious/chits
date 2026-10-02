import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme, type AppAppearance } from '@/components/theme-provider';
import { AppText, HeaderIcon, Icon, IconButton, SegmentedControl, Surface, TopBarBackground, useHeaderInk, MenuIcon } from '@/components/ui/primitives';
import { HeaderChromeContext } from '@/components/ui/controls';
import { EditNoteSpaceNameSheet } from '@/components/settings/edit-notespace-name-sheet';
import { ChatAppearanceSettings } from '@/components/settings/chat-appearance-settings';
import { type ChatThemeKey } from '@/constants/theme';
import { CHITS_THEMES } from '@/constants/chits-themes';
import { APP_STYLE_NAMES, APP_STYLES, type AppStyle } from '@/constants/style-tokens';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ORGANIZATION_ENABLED_KEY } from '@/services/chits-organization';

type Sheet = 'appearance' | null;
const appearanceNames = { system: 'System', light: 'Light', dark: 'Dark' };
const STYLE_OPTIONS = APP_STYLES.map((key: AppStyle) => ({ key, label: APP_STYLE_NAMES[key], accessibilityLabel: `${APP_STYLE_NAMES[key]} style` }));

function SettingsRow({ label, value, description, onPress, disabled }: { label: string; value?: string; description?: string; onPress?: () => void; disabled?: boolean }) {
  const { tokens } = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress || disabled} onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
    <View style={styles.rowCopy}><AppText style={[styles.label, { color: tokens.textPrimary }]}>{label}</AppText>{description ? <AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{description}</AppText> : null}</View>
    {value ? <AppText style={[styles.value, { color: tokens.textSecondary }]}>{value}</AppText> : null}
    {onPress ? <Icon name="chevron-forward" size={17} color={tokens.textMuted} /> : null}
  </Pressable>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return <View style={styles.section}><AppText accessibilityRole="header" weight="600" style={[styles.sectionLabel, { color: tokens.textSecondary }]}>{title}</AppText>{children}</View>;
}

export default function SettingsScreen() {
  const { openDrawer } = useAppDrawer();
  const { appearance, setAppearance, identity, themeKey, setThemeKey, themes, tokens, style, setStyle, styleTokens } = useTheme();
  const leftTitle = styleTokens.header.align === 'left';
  const headerInk = useHeaderInk();
  const database = useSQLiteContext();
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
      const [backup, titleRow, suggestionRow] = await Promise.all([
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'last_backup_at'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title'),
        database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ORGANIZATION_ENABLED_KEY),
      ]);
      setLastBackup(backup?.value ?? null);
      setNoteSpaceName(titleRow?.value.trim() || 'Chits');
      setOrganizationSuggestionsEnabled(suggestionRow?.value !== 'false');
    } catch { setError('Some settings could not be loaded. Reopen Settings to try again.'); }
  }, [database]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  const saveNoteSpaceName = async (name: string) => {
    await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_title', name, Date.now());
    setNoteSpaceName(name);
    setToast('NoteSpace name updated');
  };
  const change = async (action: () => Promise<void>, close = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); if (close) setSheet(null); }
    catch { setError('That setting could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };
  const closeSheet = () => { if (!busy) setSheet(null); };
  const toggleOrganizationSuggestions = async (enabled: boolean) => {
    if (busy) return;
    setOrganizationSuggestionsEnabled(enabled);
    setBusy(true); setError(null);
    try { await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', ORGANIZATION_ENABLED_KEY, enabled ? 'true' : 'false', Date.now()); }
    catch { setOrganizationSuggestionsEnabled(!enabled); setError('That setting could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <HeaderChromeContext.Provider value={leftTitle}>
      <View style={[styles.header, { minHeight: styleTokens.header.minHeight }, leftTitle && styles.headerLeft]}><TopBarBackground /><IconButton label="Open navigation" onPress={openDrawer}><MenuIcon /></IconButton><AppText accessibilityRole="header" variant="title" numberOfLines={1} style={[styles.headerTitle, { color: headerInk.ink, fontSize: styleTokens.header.titleSize, lineHeight: styleTokens.header.titleLineHeight }, leftTitle && styles.headerTitleLeft]}>Settings</AppText><IconButton label="Close settings" onPress={() => router.canGoBack() ? router.back() : router.navigate('/')}><HeaderIcon name="close" size={24} /></IconButton></View>
    </HeaderChromeContext.Provider>
    <ScrollView contentContainerStyle={styles.content}>
      {error && !sheet ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
      <Section title="NOTESPACE">
        <SettingsRow label="Edit NoteSpace name" description="Change the name shown across your NoteSpace" onPress={() => setEditNameOpen(true)} />
      </Section>
      <Section title="APPEARANCE">
        <Pressable accessibilityRole="button" accessibilityLabel={`Theme, ${CHITS_THEMES[identity].name}`} onPress={() => router.push('/appearance-theme')} style={({ pressed }) => [styles.row, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
          <View style={styles.rowCopy}><AppText style={[styles.label, { color: tokens.textPrimary }]}>Theme</AppText><AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>The personality Chits wears</AppText></View>
          <View accessible={false} style={styles.themeSwatches}>{[tokens.chatBackground, tokens.bubble, tokens.accent].map((color, index) => <View key={index} style={[styles.themeSwatch, { backgroundColor: color, borderColor: tokens.borderSubtle }]} />)}</View>
          <AppText style={[styles.value, { color: tokens.textSecondary }]}>{CHITS_THEMES[identity].name}</AppText>
          <Icon name="chevron-forward" size={17} color={tokens.textMuted} />
        </Pressable>
        {/* Style: shape and type, independent of the theme's colors. */}
        <View style={[styles.styleBlock, { borderBottomColor: tokens.borderSubtle }]}>
          <AppText style={[styles.label, { color: tokens.textPrimary }]}>Style</AppText>
          <AppText variant="paragraph" style={[styles.description, styles.styleDescription, { color: tokens.textSecondary }]}>Classic, or outlined like a sticky note. Works with every theme.</AppText>
          <View accessibilityRole="radiogroup" accessibilityLabel="Style">
            <SegmentedControl options={STYLE_OPTIONS} value={style} onChange={(next) => { if (next !== style) void change(() => setStyle(next)); }} />
          </View>
        </View>
        <SettingsRow label="App appearance" value={appearanceNames[appearance]} onPress={() => setSheet('appearance')} />
        {identity === 'default' ? <View style={styles.paletteBlock}>
          <AppText style={[styles.label, { color: tokens.textPrimary }]}>Accent color</AppText>
          <AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>Used for controls and accents in the Default theme.</AppText>
          <View style={[styles.preview, { backgroundColor: tokens.bubble, borderRadius: styleTokens.radius.bubble }]}><AppText style={{ color: tokens.bubbleText }}>My thought</AppText></View>
          <View style={styles.palette}>{(Object.keys(themes) as ChatThemeKey[]).map((key) => {
            const selected = themeKey === key;
            const color = key === 'light' ? '#E9E9E9' : themes[key].light.accent;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={themes[key].name} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => void change(() => setThemeKey(key))} style={({ pressed }) => [styles.swatchTarget, { borderColor: selected ? tokens.textPrimary : 'transparent' }, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: color }]}>{selected ? <Icon name="checkmark" size={18} color={key === 'light' ? '#0D0D0D' : themes[key].light.accentText} /> : null}</View>
            </Pressable>;
          })}</View>
          <AppText accessibilityLiveRegion="polite" variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>{themes[themeKey].name}</AppText>
        </View> : null}
      </Section>
      <ChatAppearanceSettings />
      <Section title="CHITS">
        <View style={[styles.row, { borderBottomColor: tokens.borderSubtle }]}>
          <View style={styles.rowCopy}><AppText style={[styles.label, { color: tokens.textPrimary }]}>Chits Suggestions</AppText><AppText variant="paragraph" style={[styles.description, { color: tokens.textSecondary }]}>Let Chits occasionally suggest Boards or Spaces for your notes.</AppText></View>
          <Switch accessibilityLabel="Chits Suggestions" accessibilityRole="switch" value={organizationSuggestionsEnabled} disabled={busy} onValueChange={(value) => void toggleOrganizationSuggestions(value)} trackColor={{ true: tokens.accent, false: tokens.borderSubtle }} thumbColor={tokens.surface} />
        </View>
      </Section>
      <Section title="DATA"><SettingsRow label="Backup & Restore" description={lastBackup && !Number.isNaN(new Date(Number(lastBackup)).getTime()) ? 'Last backup: ' + new Date(Number(lastBackup)).toLocaleDateString() : 'Last backup: Never'} onPress={() => router.push('/backup')} /></Section>

    </ScrollView>
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: tokens.surface, borderTopLeftRadius: styleTokens.radius.sheet, borderTopRightRadius: styleTokens.radius.sheet }]}>
          <View style={styles.sheetHeader}><AppText accessibilityRole="header" variant="display" weight="600" style={[styles.sheetTitle, { color: tokens.textPrimary }]}>App appearance</AppText><IconButton label="Close settings sheet" disabled={busy} onPress={closeSheet}><Icon name="close-outline" size={22} color={tokens.textSecondary} /></IconButton></View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {sheet === 'appearance' ? (['system', 'light', 'dark'] as AppAppearance[]).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: appearance === mode, disabled: busy }} disabled={busy} onPress={() => void change(() => setAppearance(mode), true)} style={styles.choice}><AppText style={[styles.label, { color: tokens.textPrimary }]}>{appearanceNames[mode]}</AppText>{appearance === mode ? <Icon name="checkmark" size={22} color={tokens.accent} /> : null}</Pressable>) : null}
            {busy ? <ActivityIndicator accessibilityLabel="Saving setting" color={tokens.accent} /> : null}
            {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText> : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    <EditNoteSpaceNameSheet visible={editNameOpen} currentName={noteSpaceName} onClose={() => setEditNameOpen(false)} onSave={saveNoteSpaceName} />
    {toast ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.toastWrap}><Surface fill={tokens.textPrimary} radius={styleTokens.radius.toast} shadow="toast" outline={false} edge={false} style={styles.toast}><AppText weight="600" style={[styles.toastText, { color: tokens.background }]}>{toast}</AppText></Surface></View> : null}
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }, headerLeft: { gap: 10 },
  headerTitle: { flex: 1, textAlign: 'center' }, headerTitleLeft: { textAlign: 'left' },
  content: { paddingHorizontal: 20, paddingBottom: 28 }, section: { marginTop: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 0.8, marginBottom: 4 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1 }, label: { fontSize: 16 }, description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  value: { fontSize: 14, flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
  themeSwatches: { flexDirection: 'row' }, themeSwatch: { width: 14, height: 14, borderRadius: 14 / 2, marginLeft: -4, borderWidth: StyleSheet.hairlineWidth },
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
