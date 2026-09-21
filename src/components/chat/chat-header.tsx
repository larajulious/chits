import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSQLiteContext } from 'expo-sqlite';
import { IconButton } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import type { Message } from '@/db/types';

function pinnedPreview(message: Message) {
  if (message.text?.trim()) return message.text.trim();
  const attachment = message.attachments[0];
  return attachment ? `${attachment.type[0].toUpperCase()}${attachment.type.slice(1)} attachment` : 'Untitled thought';
}

export function ChatHeader({ openDrawer, onHeight, pinned, onOpenPinned }: { openDrawer: () => void; onHeight: (height: number) => void; pinned: Message[]; onOpenPinned: (message: Message) => void }) {
  const database = useSQLiteContext();
  const { tokens } = useTheme();
  const [title, setTitle] = useState('Chits');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  useEffect(() => {
    let active = true;
    void database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_title')
      .then((row) => { if (active) { setTitle(row?.value.trim() || 'Chits'); setReady(true); } })
      .catch(() => { if (active) { setError('Could not load your title. Reopen Chat to try again.'); } });
    return () => { active = false; };
  }, [database]);
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError(null);
    const value = draft.trim() || 'Chits';
    try {
      await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_title', value, Date.now());
      setTitle(value); setEditing(false);
    } catch { setError('Title was not saved. Please try again.'); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return <View pointerEvents="box-none" style={styles.overlay} onLayout={({ nativeEvent }) => onHeight(Math.ceil(nativeEvent.layout.height))}>
    {pinned.length ? <View style={[styles.pinnedArea, { borderColor: tokens.borderSubtle, backgroundColor: tokens.background }]}><Text style={[styles.pinnedLabel, { color: tokens.textMuted }]}>PINNED</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pinnedScroller} contentContainerStyle={styles.pinnedList}>{pinned.map((message) => <Pressable key={message.id} accessibilityRole="button" accessibilityLabel={`Pinned thought: ${pinnedPreview(message)}. Opens this thought in Chat.`} onPress={() => onOpenPinned(message)} style={({ pressed }) => [styles.pinnedItem, { backgroundColor: tokens.surfaceElevated, borderColor: tokens.borderSubtle }, pressed && styles.pinnedItemPressed]}><Ionicons accessible={false} name="pin-outline" size={14} color={tokens.accentStrong} /><Text numberOfLines={1} ellipsizeMode="tail" style={[styles.pinnedText, { color: tokens.textPrimary }]}>{pinnedPreview(message)}</Text></Pressable>)}</ScrollView></View> : null}
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={editing ? 'Cancel title edit' : 'Open navigation'} accessibilityState={{ disabled: saving }} disabled={saving} onPress={editing ? () => { setEditing(false); setError(null); } : openDrawer} style={({ pressed }) => [styles.menuButton, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }, pressed && { backgroundColor: tokens.surfaceElevated }, saving && { opacity: 0.5 }]}><Ionicons accessible={false} name={editing ? 'close-outline' : 'reorder-two-outline'} size={24} color={tokens.textPrimary} /></Pressable>
      <View style={styles.titleSlot}>
        {editing ? <TextInput autoFocus accessibilityLabel="Chat title" value={draft} onChangeText={setDraft} editable={!saving} maxLength={40} placeholder="Chits" placeholderTextColor={tokens.textMuted} selectionColor={tokens.accent} returnKeyType="done" onSubmitEditing={() => void save()} style={[styles.title, styles.input, { color: tokens.textPrimary, backgroundColor: tokens.surface, borderColor: tokens.accent }]} /> : <Pressable accessibilityRole="button" accessibilityLabel={`${title}. Edit chat title`} disabled={!ready} onPress={() => { setDraft(title); setEditing(true); setError(null); }} style={({ pressed }) => [styles.titleButton, { backgroundColor: pressed ? tokens.surfaceElevated : tokens.surface, borderColor: tokens.borderSubtle }]}><Text numberOfLines={1} style={[styles.title, { color: tokens.textPrimary }]}>{title}</Text><Ionicons accessible={false} name="pencil-outline" size={14} color={tokens.textSecondary} /></Pressable>}
      </View>
      {editing ? <IconButton label="Save chat title" disabled={saving} onPress={() => void save()}><Ionicons accessible={false} name="checkmark-outline" size={24} color={tokens.accent} /></IconButton> : null}
    </View>
    {error ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingBottom: 16 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  titleSlot: { flex: 1, alignItems: 'flex-end', justifyContent: 'center' },
  titleButton: { maxWidth: '100%', minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  input: { width: '100%', minHeight: 44, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8 },
  menuButton: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  pinnedArea: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  pinnedLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  pinnedScroller: { flex: 1 },
  pinnedList: { flexDirection: 'row', gap: 6, paddingRight: 16 },
  pinnedItem: { maxWidth: 210, minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  pinnedItemPressed: { opacity: 0.65 },
  pinnedText: { maxWidth: 168, fontSize: 12, fontWeight: '600' },
  error: { paddingHorizontal: 24, fontSize: 13 },
});
