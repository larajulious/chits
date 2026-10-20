import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
import { AppHeader, HeaderIcon, Icon, IconButton, Screen, Surface } from '@/components/ui/primitives';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { useTheme } from '@/components/theme-provider';
import { FocusAction, FocusCompanion, FocusText as AppText } from '@/features/focus/focus-ui';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { createCustomSpinRepository } from '@/db/spin-custom-repository';
import { createSpinRepository } from '@/db/spin-repository';
import { CUSTOM_SPIN_LABEL_LIMIT, CUSTOM_SPIN_LIMIT, selectCustomSpin, validCustomSpinLabel, type CustomSpinItem } from '@/services/spin-custom';
import { spinLanding } from '@/services/spin-engine';
import { subscribeToSpinChanges } from '@/services/spin-changes';
import { SpinWheel } from './spin-wheel';
import { SpinCelebration } from './spin-celebration';

export function CustomSpinScreen({ modeAction, modeNotice, onBusyChange }: { modeAction: ReactNode; modeNotice: ReactNode; onBusyChange: (busy: boolean) => void }) {
  'use no memo';
  useLocale();
  const db = useSQLiteContext();
  const repo = useMemo(() => createCustomSpinRepository(db), [db]);
  const { tokens, styleTokens } = useTheme();
  const { rowStyle } = useDirection();
  const reduced = useReducedMotion();
  const sound = useAudioPlayer(require('../../../assets/sounds/spin-land.wav'));
  const [items, setItems] = useState<CustomSpinItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<CustomSpinItem | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CustomSpinItem | 'all' | null>(null);
  const [editId, setEditId] = useState<string | undefined>(undefined);
  const [label, setLabel] = useState('');
  const [error, setError] = useState(false);
  const [celebration, setCelebration] = useState(0);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [rotation] = useState(() => new Animated.Value(0));
  const angle = useRef(0);
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  const sheet = useRef<FormSheetHandle>(null);
  const input = useRef<TextInput>(null);
  useEffect(() => { onBusyChange(busy); return () => onBusyChange(false); }, [busy, onBusyChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; animation.current?.stop(); }; }, []);
  const load = useCallback(async () => {
    const next = await repo.items();
    if (!mounted.current) return;
    setItems(next); setLoading(false);
    setResult(previous => previous ? next.find(item => item.id === previous.id) ?? null : null);
  }, [repo]);
  useFocusEffect(useCallback(() => {
    let active = true;
    void load().catch(() => { if (active) { setError(true); setLoading(false); } });
    const stop = subscribeToSpinChanges(() => { if (active && !locked.current) void load().catch(() => setError(true)); });
    const app = AppState.addEventListener('change', state => {
      if (state !== 'active') animation.current?.stop();
      else if (active && !locked.current) void load().catch(() => setError(true));
    });
    return () => { active = false; stop(); app.remove(); animation.current?.stop(); };
  }, [load]));
  const run = async (operation: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(false);
    try { await operation(); } catch { if (mounted.current) setError(true); }
    finally { locked.current = false; if (mounted.current) { setBusy(false); setSpinning(false); } }
  };
  const spin = () => void run(async () => {
    const fresh = await repo.items();
    const chosen = selectCustomSpin(fresh);
    setItems(fresh); setResult(null); setCelebration(0);
    if (!chosen) return;
    const preferences = await createSpinRepository(db).preferences();
    setSpinning(true);
    const target = spinLanding(angle.current, fresh.findIndex(item => item.id === chosen.id), fresh.length);
    if (!reduced) await new Promise<void>(resolve => {
      animation.current = Animated.timing(rotation, { toValue: target, duration: 3400, easing: Easing.bezier(0.4,0,0.12,1), useNativeDriver: true });
      animation.current.start(() => resolve());
    });
    animation.current = null;
    angle.current = target % 360; rotation.setValue(angle.current);
    if (!mounted.current) return;
    setResult(chosen); setSpinning(false);
    AccessibilityInfo.announceForAccessibility(chosen.label);
    if (AppState.currentState === 'active') {
      if (!reduced) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (preferences.celebrations && !reduced) setCelebration(value => value+1);
      if (preferences.sound) { try { await sound.seekTo(0); sound.play(); } catch { /* Optional feedback. */ } }
    }
  });
  const save = () => void run(async () => {
    await repo.save(label, editId); Keyboard.dismiss(); setLabel(''); setEditId(undefined); await load();
  });
  const requestDelete = (target: CustomSpinItem | 'all') => {
    Keyboard.dismiss(); setPendingDelete(target); setError(false); sheet.current?.scrollTo({y:0,animated:true});
  };
  const confirmDelete = () => void run(async () => {
    if (!pendingDelete) return;
    if (pendingDelete === 'all') await repo.clear();
    else await repo.remove(pendingDelete.id);
    if (pendingDelete === 'all' || editId === pendingDelete.id) { setEditId(undefined); setLabel(''); }
    setPendingDelete(null); await load();
  });
  const manage = () => { setEditing(true); setEditId(undefined); setLabel(''); setPendingDelete(null); };
  return <Screen edges={['top','left','right','bottom']}>
    <AppHeader actionWidth={88} title={tr('spin.title')} subtitle={tr('spin.mode.custom')} leading={<IconButton label={tr('search.goBack')} disabled={busy} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<View style={[styles.headerActions,rowStyle]}>{modeAction}<IconButton label={tr('spin.custom.items')} disabled={busy} onPress={manage}><HeaderIcon name="create-outline" size={22} /></IconButton></View>} />
    <View style={styles.viewport}>
      {modeNotice}
      <FocusCompanion small message={tr(spinning ? 'spin.mascot.spinning' : result ? 'spin.mascot.result' : 'spin.custom.help')} />
      {error && !editing ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('spin.error')}</AppText> : null}
      {!result ? <>
        <View style={styles.wheel} onLayout={({ nativeEvent }) => setBounds({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
          {bounds.height > 0 ? <SpinWheel size={Math.max(48,Math.min(340,bounds.width-8,bounds.height-8))} rotation={rotation} categories={items.map(item => item.id)} labels={items.map(item => item.label)} spinning={spinning} /> : null}
        </View>
        <Surface fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} shadow={false} edge={false} style={styles.panel}>
          {items.length ? <ScrollView style={styles.legend} contentContainerStyle={styles.legendContent}>{items.map((item,index) => <AppText key={item.id} style={styles.body}>{index+1} · {item.label}</AppText>)}</ScrollView> : <AppText style={styles.body}>{tr('spin.custom.empty')}</AppText>}
          <FocusAction disabled={busy || loading} onPress={manage}>{tr('spin.custom.items')} · {items.length}</FocusAction>
          <FocusAction primary disabled={busy || loading || !items.length} onPress={spin}>{tr(spinning ? 'spin.spinning' : 'spin.spin')}</FocusAction>
        </Surface>
      </> : <Surface fill={tokens.surface} border={tokens.borderSubtle} radius={styleTokens.radius.panel} shadow={false} edge={false} style={styles.panel}>
        <AppText style={[styles.body,{ color: tokens.accentStrong }]}>{tr('spin.mode.custom')}</AppText>
        <ScrollView style={styles.resultScroll}><AppText accessibilityRole="header" weight="700" style={styles.title}>{result.label}</AppText></ScrollView>
        <FocusAction primary disabled={busy} onPress={spin}>{tr('spin.again')}</FocusAction>
        <FocusAction disabled={busy} onPress={() => { setResult(null); setCelebration(0); manage(); }}>{tr('spin.custom.items')}</FocusAction>
      </Surface>}
      {celebration > 0 && result && !reduced ? <SpinCelebration key={celebration} /> : null}
    </View>
    <FormSheet ref={sheet} visible={editing} maxHeightPercent={85} accessibilityViewIsModal onRequestClose={() => { if (!busy) { Keyboard.dismiss(); setEditing(false); } }} closeAccessibilityLabel={tr('attachments.close')}
      contentContainerStyle={styles.editor} header={<View style={[styles.sheetHeader,rowStyle]}><AppText weight="700" style={styles.flex}>{tr('spin.custom.items')}</AppText><IconButton label={tr('attachments.close')} disabled={busy} onPress={() => { Keyboard.dismiss(); setEditing(false); }}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton></View>}>
      <AppText style={styles.body}>{tr('spin.custom.help')}</AppText>
      {pendingDelete ? <Surface fill={tokens.surfaceElevated} border={tokens.borderSubtle} radius={styleTokens.radius.control} edge={false} shadow={false} style={styles.confirmBox}>
        <AppText weight="700">{tr(pendingDelete === 'all' ? 'spin.custom.clear' : 'id.delete')}</AppText>
        <AppText style={styles.body}>{pendingDelete === 'all' ? tr('spin.custom.clearHelp') : pendingDelete.label}</AppText>
        <FocusAction primary disabled={busy} onPress={confirmDelete}>{tr(pendingDelete === 'all' ? 'spin.custom.clear' : 'id.delete')}</FocusAction>
        <FocusAction quiet disabled={busy} onPress={() => setPendingDelete(null)}>{tr('chat.cancel')}</FocusAction>
      </Surface> : <>
      <TextInput ref={input} accessibilityLabel={tr('spin.custom.itemLabel')} placeholder={tr('spin.custom.itemLabel')} placeholderTextColor={tokens.textMuted} maxLength={CUSTOM_SPIN_LABEL_LIMIT} value={label} onChangeText={setLabel} onFocus={() => sheet.current?.requestVisible(input)} editable={!busy} selectionColor={tokens.accent} style={[styles.input,{ color: tokens.textPrimary, backgroundColor: tokens.surfaceElevated, borderColor: tokens.borderSubtle, borderRadius: styleTokens.radius.control }]} />
      <FocusAction primary disabled={busy || !validCustomSpinLabel(label) || (!editId && items.length >= CUSTOM_SPIN_LIMIT)} onPress={save}>{tr(editId ? 'editcontent.save' : 'spin.custom.add')}</FocusAction>
      {editId ? <FocusAction quiet disabled={busy} onPress={() => { setEditId(undefined); setLabel(''); }}>{tr('chat.cancel')}</FocusAction> : null}
      </>}
      {error ? <AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{tr('spin.error')}</AppText> : null}
      {items.length >= CUSTOM_SPIN_LIMIT ? <AppText style={styles.body}>{tr('spin.custom.limit', { count: CUSTOM_SPIN_LIMIT })}</AppText> : null}
      {items.map((item,index) => <View key={item.id} style={[styles.itemRow,rowStyle,{ borderBottomColor: tokens.borderSubtle }]}>
        <AppText style={[styles.body,styles.flex]}>{index+1} · {item.label}</AppText>
        <IconButton label={`${tr('id.edit')}: ${item.label}`} disabled={busy || pendingDelete !== null} onPress={() => { setEditId(item.id); setLabel(item.label); sheet.current?.scrollTo({y:0,animated:true}); }}><Icon name="create-outline" size={20} color={tokens.textSecondary} /></IconButton>
        <IconButton label={`${tr('id.delete')}: ${item.label}`} disabled={busy || pendingDelete !== null} onPress={() => requestDelete(item)}><Icon name="trash-outline" size={20} color={tokens.danger} /></IconButton>
      </View>)}
      {items.length ? <FocusAction quiet disabled={busy || pendingDelete !== null} onPress={() => requestDelete('all')}>{tr('spin.custom.clear')}</FocusAction> : null}
    </FormSheet>
  </Screen>;
}
const styles = StyleSheet.create({
  headerActions: { alignItems: 'center', flexWrap: 'nowrap' },
  viewport: { flex: 1, minHeight: 0, width: '100%', maxWidth: 620, alignSelf: 'center', padding: 16, paddingTop: 8, gap: 10 },
  wheel: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' },
  panel: { flexShrink: 1, minHeight: 0, padding: 12, gap: 8 },
  legend: { maxHeight: 110, flexGrow: 0, flexShrink: 1 }, legendContent: { gap: 4 },
  body: { fontSize: 13, lineHeight: 19 }, title: { fontSize: 21, lineHeight: 28 },
  resultScroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  sheetHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  editor: { padding: 16, gap: 10 }, flex: { flex: 1 },
  confirmBox: { padding: 12, gap: 8 },
  input: { minHeight: 48, padding: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  itemRow: { alignItems: 'center', gap: 4, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
