import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton, PrimaryButton, SecondaryButton, HeaderIcon } from '@/components/ui/primitives';
import { QuickThoughtBubble, StructuredNoteCard } from '@/components/chat/message-note-cards';
import { ChatHeaderSurface } from './chat-header';
import { ChatComposerSurface } from './chat-composer-surface';
import { ChatBackgroundLayer } from './background-layer';
import { BackgroundStyleControls } from './background-style-controls';
import { BackgroundReadabilityProvider } from './background-readability';
import { useChatBackground } from './chat-background-context';
import { DEFAULT_BACKGROUND_DIM, type ChatBackgroundImage } from '@/services/chat-background';
import type { Message } from '@/db/types';

const noAction = () => undefined;
function sampleMessage(id: string, text: string, createdAt: number): Message {
  return { id, text, createdAt, updatedAt: createdAt, type: 'text', archivedAt: null, pinned: false, isHiddenContent: false, deletedAt: null, attachments: [] };
}

export function ChatBackgroundPreview({ image, onCancel, onApplied }: { image: ChatBackgroundImage; onCancel: () => void; onApplied: () => void }) {
  const { tokens } = useTheme();
  const { height } = useWindowDimensions();
  const { background, applyBackground } = useChatBackground();
  const current = background?.storagePath === image.storagePath;
  const [dim, setDim] = useState(current ? background.dim : DEFAULT_BACKGROUND_DIM);
  const [blur, setBlur] = useState(current ? background.blur : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [samples] = useState(() => [sampleMessage('preview-quick', 'A little space for my thoughts.', Date.now() - 600000), sampleMessage('preview-list', 'For a quieter morning\n- Take a short walk\n- Write down one good idea', Date.now() - 240000), sampleMessage('preview-last', 'Keep the good moments close.', Date.now() - 60000)]);
  const apply = async () => {
    if (busy || imageFailed) return;
    setBusy(true); setError(null);
    try { await applyBackground({ ...image, dim, blur }); onApplied(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'This background could not be saved.'); }
    finally { setBusy(false); }
  };
  return <SafeAreaView style={[styles.screen, { backgroundColor: tokens.background }]}>
    <AppHeader title="Chat Background Preview" leading={<IconButton label="Cancel preview" disabled={busy} onPress={onCancel}><HeaderIcon name="close" size={23} /></IconButton>} />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={[styles.chat, { height: Math.max(250, Math.min(400, height * 0.42)), backgroundColor: tokens.background, borderColor: tokens.borderSubtle }]}>
        <ChatBackgroundLayer background={{ ...image, dim, blur }} onError={() => setImageFailed(true)} />
        <BackgroundReadabilityProvider active><View style={styles.scene}>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <ChatHeaderSurface preview searchOpen={false} searchQuery="" onBack={noAction} onOpenSearch={noAction} onSearchChange={noAction} onOpenSettings={noAction} /></View>
          <ScrollView style={styles.sampleScroll} showsVerticalScrollIndicator={false} nestedScrollEnabled><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.notes}>
            <Text style={[styles.day, { color: tokens.textSecondary, backgroundColor: tokens.surfaceElevated }]}>Today · Example notes</Text>
            <QuickThoughtBubble message={samples[0]} focused={false} onActions={noAction} />
            <StructuredNoteCard message={samples[1]} focused={false} onActions={noAction} />
            <QuickThoughtBubble message={samples[2]} focused={false} onActions={noAction} />
          </View></ScrollView>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.composerWrap}><ChatComposerSurface><View style={styles.composerRow}><Ionicons name="add" size={22} color={tokens.textSecondary} /><Text style={[styles.placeholder, { color: tokens.textMuted }]}>Message note...</Text><View style={[styles.send, { backgroundColor: tokens.accent }]}><Ionicons name="mic-outline" size={19} color={tokens.accentText} /></View></View></ChatComposerSurface></View>
        </View></BackgroundReadabilityProvider>
      </View>
      {current ? <Text style={[styles.indicator, { color: tokens.textSecondary }]}>Current Chat Background</Text> : null}
      <Text accessibilityRole="header" style={[styles.title, { color: tokens.textPrimary }]}>Background Style</Text>
      <BackgroundStyleControls dim={dim} blur={blur} onDimChange={setDim} onBlurChange={setBlur} disabled={busy} />
    </ScrollView>
    <View style={[styles.actions, { borderColor: tokens.borderSubtle, backgroundColor: tokens.background }]}>
      {error || imageFailed ? <Text accessibilityRole="alert" style={{ color: tokens.danger }}>{error ?? 'This photo could not be loaded. Choose another photo.'}</Text> : null}
      {busy ? <ActivityIndicator color={tokens.accent} /> : null}
      <PrimaryButton label="Use as Background" disabled={busy || imageFailed} onPress={() => void apply()} />
      <SecondaryButton label="Cancel" disabled={busy} onPress={onCancel} />
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, scene: { flex: 1 }, sampleScroll: { flex: 1 }, content: { padding: 16, paddingTop: 8, gap: 8 }, chat: { borderRadius: 24, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth }, notes: { padding: 16, gap: 8 }, day: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, fontSize: 11, borderRadius: 12, marginBottom: 4 }, composerWrap: { paddingHorizontal: 16, paddingVertical: 12 }, composerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }, placeholder: { flex: 1, fontSize: 15 }, send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 17, fontWeight: '700', marginTop: 12 }, indicator: { fontSize: 12, textAlign: 'center' }, actions: { paddingHorizontal: 16, paddingVertical: 8, gap: 6, borderTopWidth: StyleSheet.hairlineWidth } });
