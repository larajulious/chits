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
  hintAnchor: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-start' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: BUTTON, paddingHorizontal: 12, paddingVertical: 8 },
  hintText: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
});
