import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Keyboard, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import Reanimated, { FadeIn, FadeInDown, FadeOutDown, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import { AppHeader, HeaderIcon, Icon, IconButton, Screen, Surface } from '@/components/ui/primitives';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { useTheme } from '@/components/theme-provider';
import { FocusAction, FocusText as AppText } from '@/features/focus/focus-ui';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { createCustomSpinRepository } from '@/db/spin-custom-repository';
import { createSpinRepository } from '@/db/spin-repository';
import { CUSTOM_SPIN_LABEL_LIMIT, CUSTOM_SPIN_LIMIT, selectCustomSpin, validCustomSpinLabel, type CustomSpinItem } from '@/services/spin-custom';
import { spinLanding } from '@/services/spin-engine';
import { subscribeToSpinChanges } from '@/services/spin-changes';
import { SPIN_DURATION, SPIN_EASING, SpinWheel } from './spin-wheel';
import { PAPER_INK, PAPER_INK_MUTED, PaperAction, PaperNote, PaperTab, PaperDesk, DeskMessage, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { spinPaper } from './spin-paper';
import { SpinCelebration } from './spin-celebration';

export function CustomSpinScreen({ modeAction, modeNotice, onBusyChange }: { modeAction: ReactNode; modeNotice: ReactNode; onBusyChange: (busy: boolean) => void }) {
  'use no memo';
  useLocale();
  const db = useSQLiteContext();
  const repo = useMemo(() => createCustomSpinRepository(db), [db]);
  const { tokens, styleTokens } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const { rowStyle } = useDirection();
  const reduced = useReducedMotion();
  const sound = useAudioPlayer(require('../../../assets/sounds/spin-land.wav'));
  // The wheel's items are one settings row: read them before the first frame.
  const [initial] = useState(() => { try { return repo.itemsSync(); } catch { return null; } });
  const [items, setItems] = useState<CustomSpinItem[]>(initial ?? []);
  const [loading, setLoading] = useState(initial === null);
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
      animation.current = Animated.timing(rotation, { toValue: target, duration: SPIN_DURATION, easing: SPIN_EASING, useNativeDriver: true });
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
  const landed = result ? items.findIndex(item => item.id === result.id) : -1;
  // One fixed layout: on a result the wheel springs smaller and the result
  // slides in over the faded controls, as transforms and opacity only.
  const wheelSize = Math.max(48, Math.min(360, bounds.width - 16, bounds.height - 16));
  const compactSize = Math.min(200, wheelSize);
  const compact = useSharedValue(0);
  useEffect(() => { const to = result ? 1 : 0; compact.set(reduced ? to : withSpring(to, { damping: 22, stiffness: 150, mass: 1 })); }, [compact, reduced, result]);
  const wheelMotion = useAnimatedStyle(() => ({ transform: [
    { translateY: (compactSize / 2 - (bounds.height - 10) / 2) * compact.get() },
    { scale: 1 + (compactSize / wheelSize - 1) * compact.get() },
  ] }));
  const controlsMotion = useAnimatedStyle(() => ({ opacity: 1 - compact.get(), transform: [{ translateY: 28 * compact.get() }] }));
  const labelsKey = items.map(item => item.label).join('\n');
  const wheelLabels = useMemo(() => labelsKey ? labelsKey.split('\n') : [], [labelsKey]);
  const wheelPapers = useMemo(() => wheelLabels.map((_, index) => spinPaper(index)), [wheelLabels]);
  const spinRef = useRef(spin);
  useLayoutEffect(() => { spinRef.current = spin; });
  const spinFromWheel = useCallback(() => spinRef.current(), []);
  // A fresh result drops onto the desk.
  const drop = reduced ? undefined : FadeInDown.springify().damping(14).mass(0.8);
  return <Screen edges={['top','left','right','bottom']} style={{ backgroundColor: desk.desk }}>
    <AppHeader actionWidth={88} title={tr('spin.title')} subtitle={tr('spin.mode.custom')} leading={<IconButton label={tr('search.goBack')} disabled={busy} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<View style={[styles.headerActions,rowStyle]}>{modeAction}<IconButton label={tr('spin.custom.items')} disabled={busy} onPress={manage}><HeaderIcon name="create-outline" size={22} /></IconButton></View>} />
    <PaperDesk>
    <View style={styles.viewport}>
      {modeNotice}
      <DeskMessage message={tr(spinning ? 'spin.mascot.spinning' : result ? 'spin.mascot.result' : !loading && !items.length ? 'spin.custom.empty' : 'spin.custom.help')} />
      {error && !editing ? <AppText accessibilityRole="alert" weight="600" style={[styles.deskText,{ color: desk.danger }]}>{tr('spin.error')}</AppText> : null}
      <View style={styles.workspace}>
        <View style={styles.wheel} onLayout={({ nativeEvent }) => { const { width, height } = nativeEvent.layout; setBounds(old => old.width === width && old.height === height ? old : { width, height }); }}>
          {bounds.height > 0 ? <Reanimated.View style={wheelMotion}><SpinWheel size={wheelSize} rotation={rotation} labels={wheelLabels} papers={wheelPapers} spinning={spinning} highlight={!spinning && landed >= 0 ? landed : null} onSpin={spinFromWheel} spinDisabled={busy || loading || !items.length} /></Reanimated.View> : null}
        </View>
        <Reanimated.View style={[styles.panel, controlsMotion]} pointerEvents={result ? 'none' : 'auto'} accessibilityElementsHidden={!!result} importantForAccessibility={result ? 'no-hide-descendants' : 'auto'}>
          <View style={[styles.tabs,rowStyle]}>
            <PaperTab paper={spinPaper(1)} tilt={-1.5} icon="create-outline" label={`${tr('spin.custom.items')} · ${items.length}`} accessibilityRole="button" disabled={busy || loading} onPress={manage} />
          </View>
          <PaperAction primary label={tr(spinning ? 'spin.spinning' : 'spin.spin')} accessibilityState={{ disabled: busy || loading || !items.length, busy: spinning }} disabled={busy || loading || !items.length} onPress={spin} />
        </Reanimated.View>
        {result ? <Reanimated.View entering={reduced ? undefined : FadeIn.duration(240)} exiting={reduced ? undefined : FadeOutDown.duration(220)} style={[styles.resultOverlay, { top: compactSize + 28 }]}>
          <ScrollView style={styles.flexShrink} contentContainerStyle={styles.resultContent}>
            <Reanimated.View entering={drop}>
              <PaperNote paper={spinPaper(Math.max(0, landed))} tilt={-1} pin style={styles.resultNote}>
                <AppText weight="700" style={styles.resultCategory}>{tr('spin.mode.custom')}</AppText>
                <AppText accessibilityRole="header" style={[handBold, styles.resultTitle]}>{result.label}</AppText>
              </PaperNote>
            </Reanimated.View>
          </ScrollView>
          <View style={styles.actions}>
            <PaperAction primary label={tr('spin.again')} disabled={busy} onPress={spin} />
            <PaperAction label={tr('spin.custom.items')} disabled={busy} onPress={() => { setResult(null); setCelebration(0); manage(); }} />
          </View>
        </Reanimated.View> : null}
      </View>
      {celebration > 0 && result && !reduced ? <SpinCelebration key={celebration} /> : null}
    </View>
    </PaperDesk>
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
  viewport: { flex: 1, minHeight: 0, width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 12 },
  deskText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  wheel: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  workspace: { flex: 1, minHeight: 0, gap: 14 },
  resultOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14 },
  panel: { gap: 18 },
  tabs: { flexWrap: 'wrap', justifyContent: 'center', gap: 10, paddingTop: 6 },
  flexShrink: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  resultContent: { paddingTop: 14, paddingBottom: 8, paddingHorizontal: 4 },
  resultNote: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 18, gap: 4 },
  resultCategory: { color: PAPER_INK_MUTED, fontSize: 12, lineHeight: 16, letterSpacing: 0.6, textTransform: 'uppercase' },
  resultTitle: { color: PAPER_INK, fontSize: 30, lineHeight: 38 },
  actions: { gap: 12, paddingBottom: 4 },
  body: { fontSize: 13, lineHeight: 19 },
  sheetHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  editor: { padding: 16, gap: 10 }, flex: { flex: 1 },
  confirmBox: { padding: 12, gap: 8 },
  input: { minHeight: 48, padding: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  itemRow: { alignItems: 'center', gap: 4, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
