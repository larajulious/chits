import { forwardRef } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTheme } from '@/components/theme-provider';
import type { Message } from '@/db/types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
// Short, restrained cross-fade — no bounce — used whenever the row swaps between
// its default and expanded-search layouts.
const HEADER_TRANSITION = LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

function pinnedPreview(message: Message) {
  if (message.text?.trim()) return message.text.trim();
  const attachment = message.attachments[0];
  return attachment ? `${attachment.type[0].toUpperCase()}${attachment.type.slice(1)} attachment` : 'Untitled thought';
}

type Props = {
  onHeight: (height: number) => void;
  pinned: Message[];
  onOpenPinned: (message: Message) => void;
  searchOpen: boolean;
  searchQuery: string;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearchChange: (value: string) => void;
};

// Identity + return navigation, plus (this phase) inline Chat search — naming
// lives in Settings → Edit NoteSpace name, not here. Closes back to wherever Chat
// was opened from (Boards, normally). The row's own height never changes between
// its default and expanded-search layouts, so nothing else on screen shifts.
export const ChatHeader = forwardRef<TextInput, Props>(function ChatHeader({ onHeight, pinned, onOpenPinned, searchOpen, searchQuery, onOpenSearch, onCloseSearch, onSearchChange }, searchInputRef) {
  const { tokens } = useTheme();
  const close = () => { if (router.canGoBack()) router.back(); else router.navigate('/'); };
  const openSearch = () => { LayoutAnimation.configureNext(HEADER_TRANSITION); onOpenSearch(); };
  const closeSearch = () => { LayoutAnimation.configureNext(HEADER_TRANSITION); onCloseSearch(); };
  return <View style={[styles.overlay, { backgroundColor: tokens.background }]} onLayout={({ nativeEvent }) => onHeight(Math.ceil(nativeEvent.layout.height))}>
    <View style={styles.row}>
      {searchOpen ? <>
        <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={closeSearch} style={({ pressed }) => [styles.iconButton, { backgroundColor: tokens.surface }, pressed && { backgroundColor: tokens.surfaceElevated }]}>
          <Ionicons accessible={false} name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <View style={[styles.searchField, { backgroundColor: tokens.surfaceElevated }]}>
          <TextInput
            ref={searchInputRef}
            accessibilityLabel="Search your Chits"
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search your Chits..."
            placeholderTextColor={tokens.textMuted}
            selectionColor={tokens.accent}
            cursorColor={tokens.accent}
            returnKeyType="search"
            autoFocus
            style={[styles.searchInput, { color: tokens.textPrimary }]}
          />
          {searchQuery ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onSearchChange('')}><Ionicons accessible={false} name="close-circle" size={18} color={tokens.textMuted} /></Pressable> : null}
        </View>
      </> : <>
        <Pressable accessibilityRole="button" accessibilityLabel="Search Chat" onPress={openSearch} style={({ pressed }) => [styles.iconButton, { backgroundColor: tokens.surface }, pressed && { backgroundColor: tokens.surfaceElevated }]}>
          <Ionicons accessible={false} name="search-outline" size={22} color={tokens.textPrimary} />
        </Pressable>
        {/* Pinned items fill the same row as the search/close icons, inline
            between them, rather than a separate banner above or below. */}
        {pinned.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pinnedScroller} contentContainerStyle={styles.pinnedList}>{pinned.map((message) => <Pressable key={message.id} accessibilityRole="button" accessibilityLabel={`Pinned thought: ${pinnedPreview(message)}. Opens this thought in Chat.`} onPress={() => onOpenPinned(message)} style={({ pressed }) => [styles.pinnedItem, { backgroundColor: tokens.surfaceElevated }, pressed && styles.pinnedItemPressed]}><Ionicons accessible={false} name="pin-outline" size={13} color={tokens.accentStrong} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pinnedText, { color: tokens.textPrimary }]}>{pinnedPreview(message)}</Text></Pressable>)}</ScrollView> : <View style={styles.spacer} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" accessibilityHint="Closes Chat and returns to where you came from" onPress={close} style={({ pressed }) => [styles.iconButton, { backgroundColor: tokens.surface }, pressed && { backgroundColor: tokens.surfaceElevated }]}>
          <Ionicons accessible={false} name="close" size={22} color={tokens.textPrimary} />
        </Pressable>
      </>}
    </View>
  </View>;
});

const styles = StyleSheet.create({
  // Full-width, opaque, and stacked above the scrolling timeline (zIndex for
  // reliable Android layering, no elevation — that also draws a shadow) — so
  // content scrolling underneath never peeks through the header's own footprint,
  // not even in the empty gap below the row.
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 4, zIndex: 10 },
  row: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  spacer: { flex: 1 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchField: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 20 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  pinnedScroller: { flex: 1 },
  pinnedList: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pinnedItem: { maxWidth: 180, height: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 16 },
  pinnedItemPressed: { opacity: 0.65 },
  pinnedText: { maxWidth: 138, fontSize: 12, fontWeight: '600' },
});
