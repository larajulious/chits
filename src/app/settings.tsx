import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme, type AppAppearance } from '@/components/theme-provider';
import { IconButton } from '@/components/ui/primitives';
import { type ChatThemeKey } from '@/constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Sheet = 'appearance' | 'backup' | null;
const appearanceNames = { system: 'System', light: 'Light', dark: 'Dark' };

function SettingsRow({ label, value, description, onPress, disabled }: { label: string; value?: string; description?: string; onPress?: () => void; disabled?: boolean }) {
  const { tokens } = useTheme();
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress || disabled} onPress={onPress} style={({ pressed }) => [styles.row, { borderBottomColor: tokens.borderSubtle }, pressed && styles.pressed]}>
    <View style={styles.rowCopy}><Text style={[styles.label, { color: tokens.textPrimary }]}>{label}</Text>{description ? <Text style={[styles.description, { color: tokens.textSecondary }]}>{description}</Text> : null}</View>
    {value ? <Text style={[styles.value, { color: tokens.textSecondary }]}>{value}</Text> : null}
    {onPress ? <Ionicons accessible={false} name="chevron-forward" size={17} color={tokens.textMuted} /> : null}
  </Pressable>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return <View style={styles.section}><Text accessibilityRole="header" style={[styles.sectionLabel, { color: tokens.textSecondary }]}>{title}</Text>{children}</View>;
}

export default function SettingsScreen() {
  const { openDrawer } = useAppDrawer();
  const { appearance, setAppearance, themeKey, setThemeKey, themes, tokens } = useTheme();
  const database = useSQLiteContext();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const backup = await database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'last_backup_at');
      setLastBackup(backup?.value ?? null);
    } catch { setError('Some settings could not be loaded. Reopen Settings to try again.'); }
  }, [database]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const change = async (action: () => Promise<void>, close = false) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); if (close) setSheet(null); }
    catch { setError('That setting could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };
  const closeSheet = () => { if (!busy) setSheet(null); };
  const links = Constants.expoConfig?.extra ?? {};
  const externalRows = [['Support', links.supportUrl], ['Privacy Policy', links.privacyPolicyUrl], ['Terms', links.termsUrl]] as const;
  const validLink = (value: unknown): value is string => typeof value === 'string' && /^(https:\/\/|mailto:)/.test(value);
  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <View style={styles.header}><IconButton label="Open navigation" onPress={openDrawer}><Ionicons accessible={false} name="reorder-two-outline" size={24} color={tokens.textPrimary} /></IconButton><Text accessibilityRole="header" style={[styles.headerTitle, { color: tokens.textPrimary }]}>Settings</Text><View style={styles.headerBalance} /></View>
    <ScrollView contentContainerStyle={styles.content}>
      {error && !sheet ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
      <Section title="APPEARANCE">
        <SettingsRow label="App appearance" value={appearanceNames[appearance]} onPress={() => setSheet('appearance')} />
        <View style={styles.paletteBlock}>
          <Text style={[styles.label, { color: tokens.textPrimary }]}>App color theme</Text>
          <Text style={[styles.description, { color: tokens.textSecondary }]}>Used for controls and accents throughout Chits.</Text>
          <View style={[styles.preview, { backgroundColor: themeKey === 'light' ? tokens.accentSoft : tokens.accent }]}><Text style={{ color: themeKey === 'light' ? tokens.textPrimary : tokens.accentText }}>My thought</Text></View>
          <View style={styles.palette}>{(Object.keys(themes) as ChatThemeKey[]).map((key) => {
            const selected = themeKey === key;
            const color = key === 'light' ? '#E9E9E9' : themes[key].light.accent;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={themes[key].name} accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={() => void change(() => setThemeKey(key))} style={({ pressed }) => [styles.swatchTarget, { borderColor: selected ? tokens.textPrimary : 'transparent' }, pressed && styles.pressed]}>
              <View style={[styles.swatch, { backgroundColor: color }]}>{selected ? <Ionicons accessible={false} name="checkmark" size={18} color={key === 'light' ? '#0D0D0D' : '#FFFFFF'} /> : null}</View>
            </Pressable>;
          })}</View>
          <Text accessibilityLiveRegion="polite" style={[styles.description, { color: tokens.textSecondary }]}>{themes[themeKey].name}</Text>
        </View>
      </Section>
      <Section title="DATA"><SettingsRow label="Backup & Restore" description={lastBackup && !Number.isNaN(new Date(Number(lastBackup)).getTime()) ? 'Last backup: ' + new Date(Number(lastBackup)).toLocaleDateString() : 'Last backup: Never'} onPress={() => setSheet('backup')} /></Section>

    </ScrollView>
    <Modal visible={sheet !== null} transparent animationType="slide" onRequestClose={closeSheet}>
      <View style={styles.backdrop}>
        <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: tokens.surface }]}>
          <View style={styles.sheetHeader}><Text accessibilityRole="header" style={[styles.sheetTitle, { color: tokens.textPrimary }]}>{sheet === 'appearance' ? 'App appearance' : 'Backup & Restore'}</Text><IconButton label="Close settings sheet" disabled={busy} onPress={closeSheet}><Ionicons name="close-outline" size={22} color={tokens.textSecondary} /></IconButton></View>
          <ScrollView contentContainerStyle={styles.sheetContent}>
            {sheet === 'appearance' ? (['system', 'light', 'dark'] as AppAppearance[]).map((mode) => <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ selected: appearance === mode, disabled: busy }} disabled={busy} onPress={() => void change(() => setAppearance(mode), true)} style={styles.choice}><Text style={[styles.label, { color: tokens.textPrimary }]}>{appearanceNames[mode]}</Text>{appearance === mode ? <Ionicons name="checkmark" size={22} color={tokens.accent} /> : null}</Pressable>) : null}
            {sheet === 'backup' ? <><Text style={[styles.body, { color: tokens.textPrimary }]}>Backup & Restore is not available in this build.</Text><Text style={[styles.body, { color: tokens.textSecondary }]}>Your data remains on this device. No backup file has been created by opening this screen.</Text></> : null}
            {busy ? <ActivityIndicator accessibilityLabel="Saving setting" color={tokens.accent} /> : null}
            {error ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' }, headerBalance: { width: 44 },
  content: { paddingHorizontal: 20, paddingBottom: 28 }, section: { marginTop: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 4 },
  row: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1 }, label: { fontSize: 16 }, description: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  value: { fontSize: 14, flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
  paletteBlock: { paddingTop: 12, paddingBottom: 2 }, palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  swatchTarget: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  preview: { alignSelf: 'flex-end', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginVertical: 8 },
  pressed: { opacity: 0.65 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 8 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '600' }, sheetContent: { paddingHorizontal: 20, paddingBottom: 20 },
  choice: { minHeight: 50, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { fontSize: 15, lineHeight: 22, marginVertical: 8 },
});
