import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { Icon } from '@/components/ui/icon';
import { surfaceStyle } from '@/components/ui/surface';

/**
 * How the Chat button looks in the active style, filling its parent: a round
 * accent button with a chat glyph (Classic), or an outlined speech bubble
 * with three dots (Sticky). Shared by the nav and the transition's
 * travelling clone so the two always match (the clone flies without Classic's shadow).
 */
export function ChatButtonFace({ travelling = false }: { travelling?: boolean }) {
  const { tokens, styleTokens, styleColors } = useTheme();
  const chat = styleTokens.chat;
  const bubble = styleTokens.chatButton === 'bubble';
  return <View style={[styles.face, surfaceStyle(styleTokens, styleColors, { fill: bubble ? styleColors.accentFill : tokens.accent, radius: chat.radius, shadow: travelling ? false : 'chat', outline: chat.outline || false, edge: chat.edge || false })]}>
    {bubble
      ? <View accessible={false} style={styles.dots}>{[0, 1, 2].map((dot) => <View key={dot} style={[styles.dot, { backgroundColor: styleColors.onAccent }]} />)}</View>
      : <Icon name="chatbox" size={chat.iconSize} color={tokens.accentText} />}
  </View>;
}

const styles = StyleSheet.create({
  face: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 8 / 2 },
});
