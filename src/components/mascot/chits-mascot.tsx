import { useCallback, useEffect, useImperativeHandle, useState, type Ref } from 'react';
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { SvgXml } from 'react-native-svg';
import WebView from 'react-native-webview';
import { useDerivedValue } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import { ChitsPeekMascot } from '@/features/onboarding/welcome/chits-peek-mascot';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import type { MascotContext, MascotReaction } from './mascot-gestures';
import { useMascotReducedMotion } from './use-mascot-accessibility';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { mascotSvg } from './bandana-art';
import { MascotStill } from './mascot-still';
import { useMascotPreference } from './mascot-provider';
import type { MascotVariant } from './mascot-variants';

export { useMascotReducedMotion } from './use-mascot-accessibility';

const MASCOT = require('@/assets/images/chits-mascot-animated.svg');
let svgPromise: Promise<string> | null = null;
function loadSvg() {
  svgPromise ??= Asset.fromModule(MASCOT).downloadAsync()
    .then((asset) => FileSystem.readAsStringAsync(asset.localUri ?? asset.uri))
    .catch((error) => { svgPromise = null; throw error; });
  return svgPromise;
}

export type MascotInteractionHandle = { tap: () => boolean; play: (gesture: MascotReaction) => void };
type Props = {
  size: number; style?: StyleProp<ViewStyle>; accessible?: boolean; still?: boolean; variant?: MascotVariant;
  interactive?: boolean; enableIdleAnimation?: boolean; context?: MascotContext;
  controlRef?: Ref<MascotInteractionHandle>; onGestureComplete?: (gesture: MascotReaction) => void;
};
function InteractiveMascot({ size, variant, interactive = true, enableIdleAnimation = true, context = 'general', controlRef, onGestureComplete }: Props) {
  const rig = useMascotRig(0, { entrance: false, idle: enableIdleAnimation, compact: size < 100, restTilt: 0, context, onGestureComplete });
  const sheetTop = useDerivedValue(() => 0);
  const zoom = useDerivedValue(() => 1);
  useImperativeHandle(controlRef, () => ({ tap: rig.tap, play: rig.react }), [rig.react, rig.tap]);
  return <ChitsPeekMascot standalone interactive={interactive} variant={variant} values={rig.values} unit={size / 1250} screenWidth={size} sheetTop={sheetTop} zoom={zoom} shadowColor="transparent" label={tr('onboarding.chitsMascot')} hint={tr('boardsHero.hint')} onPress={rig.tap} onLongPress={rig.hold} onPressOut={rig.release}>{null}</ChitsPeekMascot>;
}

/** Original SVG and animations; only the optional costume is layered into it. */
export function ChitsMascot({ size, style, accessible = true, still = false, variant: preview, interactive, enableIdleAnimation = true, context = 'general', controlRef, onGestureComplete }: Props) {
  'use no memo';
  useLocale();
  const preference = useMascotPreference();
  const variant = preview ?? preference.variant;
  const reduced = useMascotReducedMotion();
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false); }, []));
  useEffect(() => { const subscription = AppState.addEventListener('change', next => setForeground(next === 'active')); return () => subscription.remove(); }, []);
  const live = !still && ((interactive ?? accessible) || Boolean(controlRef));
  const quiet = still || reduced || !focused || !foreground || !enableIdleAnimation;
  const [svg, setSvg] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const key = `${variant}:${quiet}`;
  useEffect(() => {
    let active = true;
    if (live) return;
    void loadSvg().then((next) => { if (active) setSvg(next); }).catch(() => undefined);
    return () => { active = false; };
  }, [live]);
  const ready = readyKey === key;
  const html = svg && !quiet ? `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{display:block;width:100%;height:100%}</style></head><body>${mascotSvg(svg, variant)}</body></html>` : null;
  return <View accessible={live ? false : accessible} accessibilityRole={live ? undefined : 'image'} accessibilityLabel={live ? undefined : tr('onboarding.chitsMascot')} pointerEvents={live ? "box-none" : "none"} style={[{ width: size, height: size, overflow: 'hidden' }, style]}>
    {live ? <InteractiveMascot size={size} variant={variant} interactive={interactive ?? accessible} enableIdleAnimation={enableIdleAnimation} context={context} controlRef={controlRef} onGestureComplete={onGestureComplete} /> : quiet || !ready ? svg ? <SvgXml xml={mascotSvg(svg, variant, true)} width={size} height={size} /> : <MascotStill size={size} variant={variant} /> : null}
    {!live && html ? <WebView key={key} source={{ html }} originWhitelist={['*']} javaScriptEnabled={false} scrollEnabled={false} bounces={false} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      onLoadStart={() => setReadyKey(null)} onLoad={() => setReadyKey(key)} onError={() => setReadyKey(null)} style={[styles.webview, !ready && styles.hidden]} containerStyle={[styles.webview, !ready && styles.hidden]} /> : null}
  </View>;
}
const styles = StyleSheet.create({
  webview: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' },
  hidden: { opacity: 0 },
});
