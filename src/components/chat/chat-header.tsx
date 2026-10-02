import { forwardRef } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';
import { useFontStyle } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useStickySurface } from '@/components/ui/surface';
import { useChatTransition } from '@/components/navigation/chat-transition';

// Short, restrained cross-fade — no bounce — used whenever the row swaps between
// its default and expanded-search layouts.
const HEADER_TRANSITION = LayoutAnimation.create(180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity);

type Props = {
  searchOpen: boolean;
  searchQuery: string;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearchChange: (value: string) => void;
  onOpenSettings: () => void;
};

// Identity + return navigation, plus inline Chat search — naming lives in
// Settings → Edit NoteSpace name, not here. Closes back to wherever Chat was
// opened from (Boards, normally). "More" opens Settings, the closest existing
// destination to a chat-level overflow menu.
export const ChatHeader = forwardRef<TextInput, Props>(function ChatHeader({ searchOpen, searchQuery, onOpenSearch, onCloseSearch, onSearchChange, onOpenSettings }, searchInputRef) {
  const { closeChat } = useChatTransition();
  const openSearch = () => { LayoutAnimation.configureNext(HEADER_TRANSITION); onOpenSearch(); };
  const closeSearch = () => { LayoutAnimation.configureNext(HEADER_TRANSITION); onCloseSearch(); };
  return <ChatHeaderSurface ref={searchInputRef} searchOpen={searchOpen} searchQuery={searchQuery} onBack={searchOpen ? closeSearch : closeChat} onOpenSearch={openSearch} onSearchChange={onSearchChange} onOpenSettings={onOpenSettings} />;
});

export const ChatHeaderSurface = forwardRef<TextInput, Omit<Props, 'onCloseSearch'> & { onBack: () => void; preview?: boolean }>(function ChatHeaderSurface({ searchOpen, searchQuery, onBack, onOpenSearch, onSearchChange, onOpenSettings, preview = false }, searchInputRef) {
  const { tokens, styleTokens, styleColors } = useTheme();
  const sticky = useStickySurface();
  const inputFont = useFontStyle('body');
  // Sticky: the header's buttons are outlined tiles, the search an outlined field.
  const tile = (pressed: boolean) => sticky({ fill: styleColors.controlFill, radius: styleTokens.header.iconButton.radius, edge: styleTokens.header.iconButton.edge }, pressed);
  return <View style={styles.row}>
    {searchOpen ? (
      <Pressable accessibilityRole="button" accessibilityLabel="Close search" onPress={onBack} style={({ pressed }) => [styles.iconButton, { backgroundColor: tokens.surface }, pressed && { backgroundColor: tokens.surfaceElevated }, tile(pressed)]}>
        <Icon name="arrow-back" size={20} color={tokens.textPrimary} />
      </Pressable>
    ) : (
      <Pressable accessibilityRole="button" accessibilityLabel="Back" accessibilityHint="Closes Chat and returns to where you came from" onPress={onBack} style={({ pressed }) => [styles.iconButton, { backgroundColor: tokens.surface }, pressed && { backgroundColor: tokens.surfaceElevated }, tile(pressed)]}>
        <Icon name="arrow-back" size={20} color={tokens.textPrimary} />
      </Pressable>
    )}
    <View style={[styles.searchField, { backgroundColor: tokens.surfaceElevated }, sticky({ fill: styleColors.controlFill, radius: styleTokens.radius.control, edge: false })]}>
      <Icon name="search-outline" size={17} color={tokens.textMuted} />
      <TextInput
        ref={searchInputRef}
        editable={!preview}
        accessibilityLabel="Search your notes"
        value={searchQuery}
        onChangeText={onSearchChange}
        onFocus={onOpenSearch}
        placeholder="Search your notes..."
        placeholderTextColor={tokens.textMuted}
        selectionColor={tokens.accent}
        cursorColor={tokens.accent}
        returnKeyType="search"
        style={[styles.searchInput, inputFont, { color: tokens.textPrimary }]}
      />
      {searchQuery ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => onSearchChange('')}><Icon name="close-circle" size={16} color={tokens.textMuted} /></Pressable> : null}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Settings" onPress={onOpenSettings} style={({ pressed }) => [styles.iconButton, { backgroundColor: tokens.surface }, pressed && { backgroundColor: tokens.surfaceElevated }, tile(pressed)]}>
      <Icon name="ellipsis-horizontal" size={20} color={tokens.textPrimary} />
    </Pressable>
  </View>;
});

const styles = StyleSheet.create({
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchField: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 20 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
});
