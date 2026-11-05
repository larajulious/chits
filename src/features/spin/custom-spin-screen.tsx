import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, AppState, Keyboard, type ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';
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
import { SpinWheel, spinTo } from './spin-wheel';
import { PaperTab, useDesk } from '@/components/desk/paper-desk';
import { spinPaper } from './spin-paper';
import { SpinEmpty } from './spin-empty';
import { SpinActions, SpinResultCard } from './spin-result';
import { SpinStage, useSpinEntrance, useSpinWheelLayout } from './spin-stage';
import { SpinWorkspace } from './spin-workspace';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';

export function CustomSpinScreen({ modeAction, modeNotice, onBusyChange }: { modeAction: ReactNode; modeNotice: ReactNode; onBusyChange: (busy: boolean) => void }) {
  'use no memo';
  useLocale();
  const db = useSQLiteContext();
  const repo = useMemo(() => createCustomSpinRepository(db), [db]);
  const { tokens, styleTokens } = useTheme();
  const desk = useDesk();
  const { rowStyle } = useDirection();
  const { fontScale } = useWindowDimensions();
  const accessibleLayout = fontScale > 1.3;
  const wheelLayout = useSpinWheelLayout();
  const entrance = useSpinEntrance();
  const scroll = useRef<ScrollView>(null);
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
  const [revealId, setRevealId] = useState<string | null>(null);
  const [landing, setLanding] = useState({ count: 0, repeat: false, celebrate: true });
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
    setItems(fresh);
    if (!chosen) { setResult(null); return; }
    const preferences = await createSpinRepository(db).preferences();
    // The last result stays on the page until this one lands.
    const repeat = result?.id === chosen.id;
    scroll.current?.scrollTo({ y: 0, animated: !reduced });
    setSpinning(true);
    const target = spinLanding(angle.current, fresh.findIndex(item => item.id === chosen.id), fresh.length);
    if (!reduced) await new Promise<void>(resolve => {
      animation.current = spinTo(rotation, target, fresh.length);
      animation.current.start(() => resolve());
    });
    animation.current = null;
    angle.current = target % 360; rotation.setValue(angle.current);
    if (!mounted.current) return;
    setRevealId(chosen.id); setResult(chosen); setSpinning(false);
    setLanding(value => ({ count: value.count + 1, repeat, celebrate: preferences.celebrations }));
    AccessibilityInfo.announceForAccessibility(chosen.label);
    if (AppState.currentState === 'active') {
      if (!reduced) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
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
  const labelsKey = items.map(item => item.label).join('\n');
  const wheelLabels = useMemo(() => labelsKey ? labelsKey.split('\n') : [], [labelsKey]);
  const wheelPapers = useMemo(() => wheelLabels.map((_, index) => spinPaper(index)), [wheelLabels]);
  const spinRef = useRef(spin);
  useLayoutEffect(() => { spinRef.current = spin; });
  const spinFromWheel = useCallback(() => spinRef.current(), []);
  const empty = !loading && !items.length;
  const disabled = busy || loading || !items.length;
  const actions = result ? <SpinActions primary={{ label: tr('spin.again'), disabled: busy, onPress: spin }} secondary={[{ label: tr('spin.custom.items'), disabled: busy, onPress: () => { setResult(null); manage(); } }]} animate={revealId === result.id && accessibleLayout} stacked={accessibleLayout} /> : null;
  return <Screen edges={['top','left','right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader actionWidth={100} title={tr('spin.title')} subtitle={tr('spin.mode.custom')} leading={<IconButton label={tr('search.goBack')} disabled={busy} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} trailing={<View style={[styles.headerActions,rowStyle]}>{modeAction}<IconButton label={tr('spin.custom.items')} disabled={busy} onPress={manage}><HeaderIcon name="create-outline" size={22} /></IconButton></View>} />
    <SpinStage scrollRef={scroll} title={tr(result && !spinning ? 'spin.mascot.result' : empty ? 'spin.custom.empty' : 'spin.hero.title')} body={tr(result && !spinning ? 'spin.hero.resultBody' : 'spin.custom.help')} moment={result ? 'result' : empty ? 'empty' : 'idle'} spinning={spinning} landing={landing.count} repeat={landing.repeat} celebrate={landing.celebrate} entrance={entrance} footer={!accessibleLayout ? actions : null} footerFresh={!!result && revealId === result.id}>
      {modeNotice}
      {error && !editing ? <AppText accessibilityRole="alert" weight="600" style={[styles.deskText,{ color: desk.danger }]}>{tr('spin.error')}</AppText> : null}
      <SpinWorkspace size={wheelLayout.size} compactSize={wheelLayout.compactSize} showResult={!!result} fresh={!!result && revealId === result.id} entrance={entrance} waiting={spinning}
        wheel={empty ? <SpinEmpty title={tr('spin.say.empty')} help={tr('spin.custom.help')} primary={{ label: tr('spin.custom.add'), onPress: manage }} />
          : <SpinWheel size={wheelLayout.size} rotation={rotation} labels={wheelLabels} papers={wheelPapers} spinning={spinning} highlight={!spinning && landed >= 0 ? landed : null} onSpin={spinFromWheel} spinDisabled={disabled} />}
        controls={<View style={[styles.tabs,rowStyle]}><PaperTab paper={spinPaper(1)} tilt={-1.5} icon="create-outline" label={`${tr('spin.custom.items')} · ${items.length}`} accessibilityRole="button" disabled={busy || loading} onPress={manage} /></View>}
        result={result ? <View style={styles.result}><SpinResultCard key={result.id} paper={spinPaper(Math.max(0, landed))} title={result.label} animate={revealId === result.id} />{accessibleLayout ? actions : null}</View> : null} />
    </SpinStage>
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
  headerActions: { alignItems: 'center', flexWrap: 'nowrap', gap: 8 },
  deskText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  tabs: { flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  result: { gap: 10 },
  body: { fontSize: 13, lineHeight: 19 },
  sheetHeader: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  editor: { padding: 16, gap: 10 }, flex: { flex: 1 },
  confirmBox: { padding: 12, gap: 8 },
  input: { minHeight: 48, padding: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  itemRow: { alignItems: 'center', gap: 4, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
