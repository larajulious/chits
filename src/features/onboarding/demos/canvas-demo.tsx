import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useDirection, useLocale } from '@/localization/provider';
import { canvasFont } from '@/features/whiteboard/canvas-font.native';
import { newCanvas } from '@/features/whiteboard/document';
import { workspaceHTML } from '@/features/whiteboard/workspace-html';
import { ot } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { DemoReset, type DemoProps } from './demo-kit';

const source = { html: workspaceHTML };

/** The real drawing surface, with a document that never leaves this demo. */
export function CanvasDemo({ surfaces, active, mascot }: DemoProps) {
  "use no memo";
  const locale = useLocale();
  const { rowStyle } = useDirection();
  const fonts = useWelcomeFonts();
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const [pinned, setPinned] = useState(false);
  const objectCount = useRef(0);
  const command = useCallback((message: object) => web.current?.injectJavaScript(`window.command(${JSON.stringify(message).replace(/</g, '\\u003c')});true;`), []);
  const reset = useCallback(() => {
    objectCount.current = 0;
    setPinned(false);
    command({ type: 'load', doc: { ...newCanvas(), guideDone: true }, notes: { 'thought:sample': { title: ot('tour.boards.card.trip') } } });
    command({ type: 'tool', tool: 'pen' });
  }, [command]);
  useEffect(() => {
    if (!ready) return;
    command({ type: 'notes', notes: { 'thought:sample': { title: ot('tour.boards.card.trip') } } });
    let alive = true;
    void canvasFont().then(font => { if (alive) command({ type: 'appearance', font }); }).catch(() => undefined);
    return () => { alive = false; };
  }, [ready, locale, command]);

  return <View style={styles.root}>
    <View style={[styles.surface, { borderColor: surfaces.track }]}>
      <WebView ref={web} source={source} originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} bounces={false} allowFileAccess={false}
        accessibilityLabel={ot('tour.canvas.title')}
        onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
        onContentProcessDidTerminate={() => { setReady(false); web.current?.reload(); }}
        onMessage={event => {
          const message = JSON.parse(event.nativeEvent.data);
          if (message.type === 'ready') { reset(); setReady(true); }
          if (message.type === 'change') {
            if (active && message.doc.objects.length > objectCount.current) mascot.cheer(ot('tour.canvas.say'));
            objectCount.current = message.doc.objects.length;
          }
        }} style={styles.web} />
    </View>
    <View style={[styles.tools, rowStyle]}>
      <Pressable accessibilityRole="button" accessibilityLabel={ot('tour.canvas.draw')} onPress={() => command({ type: 'tool', tool: 'pen' })} style={({ pressed }) => [styles.tool, rowStyle, { backgroundColor: surfaces.control }, pressed && styles.pressed]}>
        <Icon name="pencil-outline" size={20} color={surfaces.ink} /><AppText family={fonts.textBold} style={[styles.label, { color: surfaces.ink }]}>{ot('tour.canvas.draw')}</AppText>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: pinned || !ready }} disabled={pinned || !ready} accessibilityLabel={ot('tour.canvas.pin')} onPress={() => { setPinned(true); command({ type: 'pin', kind: 'thought', id: 'sample' }); command({ type: 'fit' }); }} style={({ pressed }) => [styles.tool, rowStyle, { backgroundColor: surfaces.control }, pressed && styles.pressed]}>
        <Icon name={pinned ? 'checkmark-circle-outline' : 'pin-outline'} size={20} color={surfaces.ink} /><AppText family={fonts.textBold} style={[styles.label, { color: surfaces.ink }]}>{ot('tour.canvas.pin')}</AppText>
      </Pressable>
    </View>
    <DemoReset label={ot('tour.tryAgain')} surfaces={surfaces} onPress={() => { reset(); mascot.rest(); }} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 280, paddingTop: 8, gap: 8 },
  surface: { flex: 1, minHeight: 180, borderWidth: 1.5, borderRadius: 16, overflow: 'hidden', backgroundColor: 'white' },
  web: { flex: 1, backgroundColor: 'white' },
  tools: { alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  tool: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: { fontSize: 13, lineHeight: 19, flexShrink: 1 },
  pressed: { opacity: 0.65 },
});
