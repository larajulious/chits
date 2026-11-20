import { useState } from 'react';
import { I18nManager, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDesk } from '@/components/desk/paper-desk';
import { floatingCompanionBottom } from '@/components/navigation/floating-chat-layout';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { StickerStitch } from '@/components/boards/card-list-row.native';
import { PAPER_INK, PAPER_YELLOW } from '@/constants/paper';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

const BUTTON = 42;
/** Chat stays on the right in every language, so this keeps the opposite corner: `left` follows the writing direction under RTL. */
const PHYSICAL_LEFT = I18nManager.isRTL ? 'right' : 'left';

function ControlButton({ icon, label, onPress, ink }: { icon: IconName; label: string; onPress: () => void; ink: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={2} onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
    <Icon name={icon} size={20} color={ink} />
  </Pressable>;
}

/** One small button in the bottom left, level with Chat, that opens upward into the camera's controls. */
export function CanvasCameraControls({ paper, miniMap, onZoomIn, onZoomOut, onFit, onReset, onToggleMiniMap }: { paper: string; miniMap: boolean; onZoomIn: () => void; onZoomOut: () => void; onFit: () => void; onReset: () => void; onToggleMiniMap: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return <View pointerEvents="box-none" style={[styles.anchor, { [PHYSICAL_LEFT]: Math.max(spacing.md, insets.left + spacing.sm), bottom: floatingCompanionBottom(insets.bottom, styleTokens.chat.height, BUTTON + 2) }]}>
    <View style={[styles.panel, { backgroundColor: paper, borderRadius: styleTokens.button.radius, boxShadow: `0px 3px 10px ${desk.shadow}` }]}>
      {open ? <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)}>
        <ControlButton icon="add" label={tr('notesCanvas.zoomIn')} onPress={onZoomIn} ink={desk.ink} />
        <ControlButton icon="remove" label={tr('notesCanvas.zoomOut')} onPress={onZoomOut} ink={desk.ink} />
        <ControlButton icon="scan-outline" label={tr('notesCanvas.fitAll')} onPress={onFit} ink={desk.ink} />
        <ControlButton icon="locate-outline" label={tr('notesCanvas.resetView')} onPress={onReset} ink={desk.ink} />
        <ControlButton icon={miniMap ? 'map' : 'map-outline'} label={tr(miniMap ? 'notesCanvas.hideMap' : 'notesCanvas.showMap')} onPress={onToggleMiniMap} ink={desk.ink} />
        <View style={[styles.rule, { backgroundColor: desk.rule }]} />
      </Animated.View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={tr('notesCanvas.controls')} accessibilityState={{ expanded: open }} hitSlop={2} onPress={() => setOpen((value) => !value)} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Icon name={open ? 'close' : 'options-outline'} size={20} color={desk.ink} />
      </Pressable>
    </View>
  </View>;
}

/** A board button in the same paper as the rest of the board's controls: icon and word, or the icon alone. */
export function BoardPill({ icon, label, onPress, paper, tone = 'plain', iconOnly = false, selected }: { icon: IconName; label: string; onPress: () => void; paper: string; tone?: 'plain' | 'primary' | 'danger'; iconOnly?: boolean; selected?: boolean }) {
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const primary = tone === 'primary';
  const ink = primary ? paper : tone === 'danger' ? desk.danger : desk.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={selected === undefined ? undefined : { selected }} hitSlop={4} onPress={onPress}
    style={({ pressed }) => [styles.pill, iconOnly && styles.pillIcon, { backgroundColor: primary ? desk.ink : paper, borderRadius: styleTokens.button.radius, boxShadow: `0px 3px 10px ${desk.shadow}` }, pressed && styles.pressed]}>
    <Icon name={icon} size={17} color={ink} />
    {iconOnly ? null : <AppText family={fonts.text} weight="700" numberOfLines={1} style={[styles.pillText, { color: ink }]}>{label}</AppText>}
  </Pressable>;
}

/** The peeled corner's size, and the sticker's white die-cut rim. */
const PEEL = 11;
const STICKER_RIM = 3;

/**
 * A board button drawn as one of the stickers Decorate hands out: paper in a white
 * die-cut rim, the notes' dashed stitch, a slight lean and a peeled corner. Plain
 * Views only, like the notes. The corner is one border triangle in the sticker's
 * pale back, folded over the tip; nothing is cut away, so it looks right over the
 * board or over a note.
 */
function StickerPill({ icon, label, accessibilityLabel = label, paper, tilt, onPress }: { icon: IconName; label: string; accessibilityLabel?: string; paper: string; tilt: number; onPress: () => void }) {
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const radius = styleTokens.button.radius;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} hitSlop={4} onPress={onPress}
    style={({ pressed }) => [styles.sticker, { transform: [{ rotate: `${tilt}deg` }, { scale: pressed ? 0.95 : 1 }] }]}>
    <View style={[styles.stickerRim, { borderRadius: radius + STICKER_RIM, boxShadow: `0px 3px 8px ${desk.shadow}` }]}>
      <View style={[styles.stickerPaper, { backgroundColor: paper, borderRadius: radius }]}>
        <StickerStitch paper={paper} radius={radius} />
        <Icon name={icon} size={17} color={PAPER_INK} />
        <AppText family={fonts.text} weight="700" numberOfLines={1} style={[styles.pillText, { color: PAPER_INK }]}>{label}</AppText>
      </View>
    </View>
    <View pointerEvents="none" style={styles.peelFlap} />
  </Pressable>;
}

/** Opens Decorate, as a yellow sticker. */
export function CanvasStickerButton({ onPress }: { onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <StickerPill icon="happy-outline" label={tr('notesDecor.stickers')} accessibilityLabel={tr('notesDecor.decorate')} paper={PAPER_YELLOW} tilt={-3} onPress={onPress} />;
}

/** Opens the board over the whole screen, then brings it back. A plain paper button, icon only; the label is for screen readers. */
export function CanvasFullscreenButton({ fullscreen, paper, onPress }: { fullscreen: boolean; paper: string; onPress: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <BoardPill icon={fullscreen ? 'contract-outline' : 'expand-outline'} label={tr(fullscreen ? 'notesCanvas.exitFullScreen' : 'notesCanvas.fullScreen')} paper={paper} iconOnly onPress={onPress} />;
}

/** The one instruction the board gives, once. */
export function CanvasHint({ bottom, paper, onDismiss }: { bottom: number; paper: string; onDismiss: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  return <Animated.View entering={FadeIn.delay(500).duration(240)} exiting={FadeOut.duration(160)} pointerEvents="box-none" style={[styles.hintAnchor, { bottom }]}>
    <View style={[styles.hint, { backgroundColor: paper, borderRadius: styleTokens.button.radius, boxShadow: `0px 3px 10px ${desk.shadow}` }]}>
      <Icon name="hand-left-outline" size={17} color={desk.inkMuted} />
      <AppText family={fonts.text} numberOfLines={2} style={[styles.hintText, { color: desk.ink }]}>{tr('notesCanvas.hint')}</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={tr('notesCanvas.dismissHint')} hitSlop={10} onPress={onDismiss} style={({ pressed }) => pressed && styles.pressed}>
        <Icon name="close" size={16} color={desk.inkMuted} />
      </Pressable>
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute' },
  panel: { width: BUTTON + 2, overflow: 'hidden' },
  button: { width: BUTTON + 2, height: BUTTON + 2, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  rule: { height: StyleSheet.hairlineWidth, marginHorizontal: 8 },
  pill: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  pillIcon: { width: 40, paddingHorizontal: 0, justifyContent: 'center' },
  pillText: { flexShrink: 1, fontSize: 13, lineHeight: 17 },
  sticker: { alignSelf: 'flex-start' },
  stickerRim: { padding: STICKER_RIM, backgroundColor: '#FFFFFF' },
  stickerPaper: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 14, overflow: 'hidden' },
  // The corner peels the same way in every language.
  peelFlap: { position: 'absolute', top: 0, right: PEEL, width: 0, height: 0, borderBottomWidth: PEEL, borderRightWidth: PEEL, borderBottomColor: '#EFE8DA', borderRightColor: 'transparent', transform: [{ translateX: PEEL }] },
  hintAnchor: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-start' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: BUTTON, paddingHorizontal: 12, paddingVertical: 8 },
  hintText: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
});
