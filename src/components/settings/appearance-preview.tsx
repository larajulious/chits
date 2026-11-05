import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { ChatBackgroundLayer } from '@/components/chat/background-layer';
import { useChatBackground } from '@/components/chat/chat-background-context';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { ChitsPeekMascot } from '@/features/onboarding/welcome/chits-peek-mascot';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

const HEIGHT = 92;
const MASCOT_UNIT = 0.1;

/**
 * The appearance settings at work, drawn from the live theme rather than a copy
 * of it. Chits holds still here, and reacts only when something actually changes,
 * once the sheet that changed it has closed.
 */
export function AppearancePreview({ paused }: { paused: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, styleTokens, identity, themeKey, style, scheme } = useTheme();
  const { background } = useChatBackground();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState(true);
  const rig = useMascotRig(1, { entrance: false, idle: false });
  const { tap } = rig;
  const sheetTop = useDerivedValue(() => HEIGHT);
  const zoom = useDerivedValue(() => 1);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));

  const look = [identity, themeKey, style, scheme, background?.storagePath ?? ''].join('|');
  const reacted = useRef(look);
  useEffect(() => {
    if (paused || !focused || reacted.current === look) return;
    reacted.current = look;
    tap(0);
  }, [focused, look, paused, tap]);

  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} style={[styles.preview, { backgroundColor: tokens.chatBackground }]}>
    <ChatBackgroundLayer background={background} />
    {width > 0 ? <ChitsPeekMascot values={rig.values} unit={MASCOT_UNIT} screenWidth={width} sheetTop={sheetTop} zoom={zoom} shadowColor="transparent" label="" hint="" onPress={noop} onLongPress={noop} onPressOut={noop}>{null}</ChitsPeekMascot> : null}
    <View style={styles.sample}>
      <View style={[styles.bubble, { backgroundColor: tokens.bubble, borderRadius: styleTokens.radius.bubble }]}><AppText numberOfLines={1} style={[styles.bubbleText, { color: tokens.bubbleText }]}>{tr('settings.myThought')}</AppText></View>
      <View style={[styles.card, { backgroundColor: tokens.cardPaper, borderColor: tokens.borderSubtle }]}>
        <View style={[styles.line, styles.lineLong, { backgroundColor: tokens.textMuted }]} />
        <View style={[styles.line, styles.lineShort, { backgroundColor: tokens.accent }]} />
      </View>
    </View>
  </View>;
}

const noop = () => undefined;

const styles = StyleSheet.create({
  preview: { height: HEIGHT, overflow: 'hidden' },
  sample: { position: 'absolute', left: 14, top: 12, bottom: 12, justifyContent: 'center', gap: 7, maxWidth: '62%' },
  bubble: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 6 },
  bubbleText: { fontSize: 13, lineHeight: 17 },
  card: { width: 104, gap: 5, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  line: { height: 4, borderRadius: 2 },
  lineLong: { width: '100%', opacity: 0.55 },
  lineShort: { width: '58%' },
});
