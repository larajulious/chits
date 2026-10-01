import { useEffect, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import WebView from 'react-native-webview';

const MASCOT = require('@/assets/images/chits-mascot-animated.svg');
let htmlPromise: Promise<string> | null = null;

function loadMascotHtml(): Promise<string> {
  htmlPromise ??= Asset.fromModule(MASCOT).downloadAsync()
    .then((asset) => FileSystem.readAsStringAsync(asset.localUri ?? asset.uri))
    .then((svg) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{display:block;width:100%;height:100%}</style></head><body>${svg}</body></html>`)
    .catch((error) => { htmlPromise = null; throw error; });
  return htmlPromise;
}

/** The supplied SVG's own CSS animation plays locally, with a still SVG fallback. */
export function OnboardingMascot({ size, style, accessible = true }: { size: number; style?: StyleProp<ViewStyle>; accessible?: boolean }) {
  const [html, setHtml] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void loadMascotHtml().then((next) => { if (mounted) setHtml(next); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  return <View accessible={accessible} accessibilityRole="image" accessibilityLabel="Sticky, Chits mascot" pointerEvents="none" style={[{ width: size, height: size }, style]}>
    {!ready ? <Image source={MASCOT} contentFit="contain" style={StyleSheet.absoluteFill} /> : null}
    {html ? <WebView
      source={{ html }}
      originWhitelist={['*']}
      javaScriptEnabled={false}
      scrollEnabled={false}
      bounces={false}
      pointerEvents="none"
      onLoad={() => setReady(true)}
      onError={() => setReady(false)}
      style={[styles.webview, !ready && styles.hidden]}
      containerStyle={[styles.webview, !ready && styles.hidden]}
    /> : null}
  </View>;
}

const styles = StyleSheet.create({
  webview: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'transparent' },
  hidden: { opacity: 0 },
});
