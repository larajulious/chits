// Local-only rendering fixture: temporarily copy into src/app for disposable-device QA.
import { FlatList, Pressable, View, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { MessageRow } from '@/components/chat/message-row';
import type { Message, Attachment } from '@/db/types';

const photo = (messageId: string, id: string): Attachment => ({ id, messageId, type: 'photo', storagePath: 'chits-attachments/chat/style-qa.png', originalName: 'QA.png', mimeType: 'image/png', size: 2000, duration: null, width: 512, height: 384, createdAt: 1 });
const messages: Message[] = Array.from({ length: 90 }, (_, index) => {
  const id = `style-qa-${index}`;
  const attachments = [photo(id, `${id}-a`), photo(id, `${id}-b`)];
  return { id, text: `QA ${index}`, type: 'photo', createdAt: 1, updatedAt: 1, archivedAt: null, pinned: false, isHiddenContent: false, deletedAt: null, attachments: index % 3 === 0 ? attachments : [attachments[0]], organization: index % 3 === 2 ? { boardId: 'qa-board', boardName: 'QA Board', columnId: 'qa-column', columnName: 'QA Column', cardId: 'qa-card', attachmentCount: 2, attachmentPreview: attachments } : null, content: index % 3 === 0 ? [{ type: 'text', text: `Inline ${index}` }, { type: 'image', attachmentId: attachments[0].id }, { type: 'text', text: 'Between' }, { type: 'image', attachmentId: attachments[1].id }] : null };
});
export default function ImageStyleQA() {
  const { style, setStyle, scheme, setAppearance, tokens } = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  return <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
    <View style={{ flexDirection: 'row', padding: 8, gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle style QA" onPress={() => void setStyle(style === 'classic' ? 'sticky' : 'classic')}><AppText>{style}</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle dark QA" onPress={() => void setAppearance(scheme === 'light' ? 'dark' : 'light')}><AppText>{scheme}</AppText></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open settings QA" onPress={() => router.push('/settings')}><AppText>Settings</AppText></Pressable>
    </View>
    <FlatList data={messages} keyExtractor={(message) => message.id} maintainVisibleContentPosition={{ minIndexForVisible: 0 }} renderItem={({ item }) => <MessageRow message={item} onLongPress={() => {}} onReveal={() => {}} onHideAgain={() => {}} />} />
    <TextInput accessibilityLabel="QA input" value={text} onChangeText={setText} style={{ minHeight: 44, color: tokens.textPrimary }} />
  </SafeAreaView>;
}
