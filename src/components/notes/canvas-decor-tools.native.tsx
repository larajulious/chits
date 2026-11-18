import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput } from '@/components/ui/app-text-input';
import { Icon } from '@/components/ui/icon';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { DECOR_TEXT_MAX, type DecorPiece } from '@/services/canvas-decor';
import { BoardPill } from './canvas-camera-controls';
import { DECOR_ART, DECOR_INK, DECOR_INKS, DECOR_SETS, decorXml, type DecorArt, type DecorKind } from './canvas-decor-art';

/**
 * The top row while decorating. With nothing selected: Add and Done. With a
 * piece selected: its word or ink, under or over the notes, duplicate, remove.
 */
export function DecorToolbar({ paper, selected, onAdd, onDone, onText, onInk, onToggleBehind, onDuplicate, onRemove }: {
  paper: string;
  selected: DecorPiece | null;
  onAdd: () => void;
  onDone: () => void;
  onText: (text: string) => void;
  onInk: (ink: string) => void;
  onToggleBehind: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const art = selected ? DECOR_ART.get(selected.key) : undefined;
  const chrome = { backgroundColor: paper, borderRadius: styleTokens.button.radius, boxShadow: `0px 3px 10px ${desk.shadow}` };
  return <View pointerEvents="box-none" style={styles.toolbar}>
    {selected && art ? <>
      {art.textKey ? <AppTextInput
        // Uncontrolled, and new for each piece, so typing never fights the stored word.
        key={selected.id}
        defaultValue={selected.text}
        onChangeText={onText}
        maxLength={DECOR_TEXT_MAX}
        accessibilityLabel={tr('notesDecor.labelText')}
        placeholder={tr('notesDecor.labelText')}
        placeholderTextColor={desk.inkMuted}
        returnKeyType="done"
        style={[styles.field, chrome, { color: desk.ink, fontFamily: fonts.text }]}
      /> : null}
      {art.inks ? <View accessibilityRole="radiogroup" accessibilityLabel={tr('notesDecor.ink')} style={[styles.swatches, chrome]}>
        {DECOR_INKS.map((ink, index) => {
          const on = (selected.ink ?? DECOR_INK) === ink;
          return <Pressable key={ink} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${tr('notesDecor.ink')} ${index + 1}`} hitSlop={4} onPress={() => onInk(ink)}
            style={[styles.swatch, { backgroundColor: ink, borderColor: on ? desk.ink : '#FFFFFF' }]} />;
        })}
      </View> : null}
      <BoardPill icon="layers-outline" label={tr(selected.behind ? 'notesDecor.onTop' : 'notesDecor.behind')} paper={paper} onPress={onToggleBehind} />
      <BoardPill icon="copy-outline" label={tr('notesDecor.duplicate')} paper={paper} iconOnly onPress={onDuplicate} />
      <BoardPill icon="trash-outline" label={tr('notesDecor.remove')} paper={paper} tone="danger" iconOnly onPress={onRemove} />
    </> : <BoardPill icon="add" label={tr('notesDecor.add')} paper={paper} onPress={onAdd} />}
    <BoardPill icon="checkmark" label={tr('notesDecor.done')} paper={paper} tone="primary" onPress={onDone} />
  </View>;
}

function TrayTile({ art, size, label, onPress }: { art: DecorArt; size: number; label: string; onPress: () => void }) {
  const desk = useDesk();
  const inner = size - 18;
  const fit = Math.min(inner / art.w, inner / art.h);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.tile, { width: size, height: size, backgroundColor: desk.rule }, pressed && styles.tilePressed]}>
    <SvgXml xml={decorXml(art, { id: `tile${art.key}`, text: art.textKey ? tr(art.textKey) : undefined, ink: DECOR_INK })} width={art.w * fit} height={art.h * fit} />
  </Pressable>;
}

/** The scrapbook set: one sheet over the board, a tab per kind, tap a piece to place it. */
export function DecorTray({ visible, paper, bottomInset, onClose, onPick }: { visible: boolean; paper: string; bottomInset: number; onClose: () => void; onPick: (key: string) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<DecorKind>('sticker');
  const set = DECOR_SETS.find((item) => item.id === kind) ?? DECOR_SETS[0];
  const columns = width >= 600 ? 6 : 4;
  const tile = Math.floor((Math.min(width, 720) - 32 - 10 * (columns - 1)) / columns);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
    <View style={styles.modal}>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('notesDecor.close')} style={styles.backdrop} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: paper, paddingBottom: bottomInset + 12 }]}>
        <View style={styles.sheetHead}>
          <AppText accessibilityRole="header" family={fonts.display} style={[styles.sheetTitle, { color: desk.ink }]}>{tr('notesDecor.decorate')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('notesDecor.close')} hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.close, { backgroundColor: desk.rule }, pressed && styles.tilePressed]}>
            <Icon name="close" size={18} color={desk.ink} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityRole="tablist">
          {DECOR_SETS.map((item) => {
            const on = item.id === kind;
            return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setKind(item.id)}
              style={[styles.tab, { borderColor: desk.rule, backgroundColor: on ? desk.ink : 'transparent' }]}>
              <AppText family={fonts.text} weight="700" style={[styles.tabText, { color: on ? paper : desk.ink }]}>{tr(item.labelKey)}</AppText>
            </Pressable>;
          })}
        </ScrollView>
        <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
          {set.items.map((art, index) => <TrayTile key={art.key} art={art} size={tile} label={`${tr(set.labelKey)} ${index + 1}`} onPress={() => onPick(art.key)} />)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  toolbar: { position: 'absolute', top: 10, left: 12, right: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  field: { height: 36, minWidth: 110, maxWidth: 150, paddingHorizontal: 10, fontSize: 13 },
  swatches: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,12,12,0.32)' },
  sheet: { maxHeight: '62%', borderTopLeftRadius: 22, borderTopRightRadius: 22, boxShadow: '0px -6px 24px rgba(0,0,0,0.18)', alignItems: 'center' },
  sheetHead: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sheetTitle: { fontSize: 18, lineHeight: 24 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabs: { gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  tab: { height: 34, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
  tabText: { fontSize: 13, lineHeight: 17 },
  gridScroll: { alignSelf: 'stretch', maxWidth: 720, width: '100%', alignContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  tile: { borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tilePressed: { opacity: 0.6 },
});
