import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/components/theme-provider';
import type { Message } from '@/db/types';

function pinnedPreview(message: Message) {
  if (message.text?.trim()) return message.text.trim();
  const attachment = message.attachments[0];
  return attachment ? `${attachment.type[0].toUpperCase()}${attachment.type.slice(1)} attachment` : 'Untitled thought';
}

// Return navigation only — no NoteSpace name shown here (naming lives in
// Settings → Edit NoteSpace name; see edit-notespace-name-sheet.tsx). Closes back
// to wherever Chat was opened from (Boards, normally).
export function ChatHeader({ onHeight, pinned, onOpenPinned }: { onHeight: (height: number) => void; pinned: Message[]; onOpenPinned: (message: Message) => void }) {
  const { tokens } = useTheme();
  const close = () => { if (router.canGoBack()) router.back(); else router.navigate('/'); };
  return <View pointerEvents="box-none" style={styles.overlay} onLayout={({ nativeEvent }) => onHeight(Math.ceil(nativeEvent.layout.height))}>
    {pinned.length ? <View style={[styles.pinnedArea, { borderColor: tokens.borderSubtle, backgroundColor: tokens.background }]}><Text style={[styles.pinnedLabel, { color: tokens.textMuted }]}>PINNED</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pinnedScroller} contentContainerStyle={styles.pinnedList}>{pinned.map((message) => <Pressable key={message.id} accessibilityRole="button" accessibilityLabel={`Pinned thought: ${pinnedPreview(message)}. Opens this thought in Chat.`} onPress={() => onOpenPinned(message)} style={({ pressed }) => [styles.pinnedItem, { backgroundColor: tokens.surfaceElevated, borderColor: tokens.borderSubtle }, pressed && styles.pinnedItemPressed]}><Ionicons accessible={false} name="pin-outline" size={14} color={tokens.accentStrong} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pinnedText, { color: tokens.textPrimary }]}>{pinnedPreview(message)}</Text></Pressable>)}</ScrollView></View> : null}
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" accessibilityHint="Closes Chat and returns to where you came from" onPress={close} style={({ pressed }) => [styles.closeButton, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }, pressed && { backgroundColor: tokens.surfaceElevated }]}>
        <Ionicons accessible={false} name="close" size={22} color={tokens.textPrimary} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16 },
  row: { height: 56, justifyContent: 'center' },
  closeButton: { position: 'absolute', top: 6, right: 16, width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  pinnedArea: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  pinnedLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  pinnedScroller: { flex: 1 },
  pinnedList: { flexDirection: 'row', gap: 6, paddingRight: 16 },
  pinnedItem: { maxWidth: 210, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  pinnedItemPressed: { opacity: 0.65 },
  pinnedText: { maxWidth: 168, fontSize: 12, fontWeight: '600' },
});
