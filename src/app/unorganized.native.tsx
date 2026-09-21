import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { spacing, type ThemeTokens } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Board, Message } from '@/db/types';

function preview(message: Message) {
  if (message.text?.trim()) return message.text;
  const attachment = message.attachments[0];
  if (attachment?.type === 'file') return attachment.originalName?.trim() || 'Attachment';
  if (attachment?.type === 'photo') return 'Photo';
  if (attachment?.type === 'video') return 'Video';
  if (attachment?.type === 'audio') return 'Audio note';
  return 'Attachment';
}

export default function UnorganizedScreen() {
  const database = useSQLiteContext();
  const { tokens: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { addToCard, messageId } = useLocalSearchParams<{ addToCard?: string; messageId?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [chooseBoardOpen, setChooseBoardOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeBoard, setMergeBoard] = useState<Board | null>(null);
  const [mergeColumns, setMergeColumns] = useState<{ id: string; name: string }[]>([]);
  const [mergeColumnId, setMergeColumnId] = useState<string | null>(null);
  const [mergeTitle, setMergeTitle] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [nextMessages, nextBoards] = await Promise.all([createMessageRepository(database).listUnorganized({ limit: 100 }), createBoardRepository(database).listActive()]);
    setMessages(nextMessages); setBoards(nextBoards); setSelected((current) => {
      const valid = current.filter((id) => nextMessages.some((message) => message.id === id));
      return messageId && nextMessages.some((message) => message.id === messageId) && !valid.includes(messageId) ? [...valid, messageId] : valid;
    });
  }, [database, messageId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const archive = async () => {
    setWorking(true); setError(null);
    try { await createMessageRepository(database).archiveMany(selected); await load(); }
    catch { setError('Chits could not archive those thoughts.'); }
    finally { setWorking(false); }
  };
  const organize = async (boardId: string) => {
    setWorking(true); setError(null);
    try { await createBoardRepository(database).organizeMessages(boardId, selected); setChooseBoardOpen(false); await load(); router.replace(`/board/${boardId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not add those thoughts to this board.'); }
    finally { setWorking(false); }
  };
  const addToExistingCard = async () => {
    if (!addToCard) return;
    setWorking(true); setError(null);
    try { await createBoardRepository(database).addMessagesToCard(addToCard, selected); await load(); router.replace(`/card/${addToCard}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not add those thoughts to this card.'); }
    finally { setWorking(false); }
  };
  const chooseMergeBoard = async (board: Board) => {
    const columns = await createBoardRepository(database).listColumns(board.id);
    setMergeBoard(board); setMergeColumns(columns); setMergeColumnId(columns[0]?.id ?? null);
  };
  const merge = async () => {
    if (!mergeBoard || !mergeColumnId) return;
    setWorking(true); setError(null);
    try { const cardId = await createBoardRepository(database).mergeMessages({ boardId: mergeBoard.id, columnId: mergeColumnId, messageIds: selected, title: mergeTitle }); setMergeOpen(false); await load(); router.replace(`/card/${cardId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Chits could not merge those thoughts.'); }
    finally { setWorking(false); }
  };
  return <Screen>
    <AppHeader title="Unorganized" leading={<IconButton label="Go back" onPress={() => router.back()}><Text style={styles.back}>‹</Text></IconButton>} />
    {messages.length ? <><ScrollView contentContainerStyle={styles.list}><Text style={styles.intro}>{addToCard ? 'Select thoughts to attach to this card. Your original chat remains exactly as it is.' : selected.length ? `${selected.length} selected` : 'Select thoughts to put on a board or archive. Your original chat remains exactly as it is.'}</Text>{messages.map((message) => { const isSelected = selected.includes(message.id); const messagePreview = preview(message); return <Pressable key={message.id} accessibilityRole="checkbox" accessibilityLabel={`${messagePreview}. ${new Date(message.createdAt).toLocaleDateString()}`} accessibilityState={{ checked: isSelected }} onPress={() => toggle(message.id)} style={({ pressed }) => [styles.message, isSelected && styles.messageSelected, pressed && styles.messagePressed]}><View style={[styles.check, isSelected && styles.checked]}>{isSelected ? <Text style={styles.checkText}>✓</Text> : null}</View><View style={styles.messageCopy}><Text numberOfLines={1} ellipsizeMode="tail" style={styles.messageText}>{messagePreview}</Text><Text numberOfLines={1} style={styles.messageMeta}>{message.pinned ? 'Pinned · ' : ''}{new Date(message.createdAt).toLocaleDateString()}</Text></View></Pressable>; })}</ScrollView>{selected.length ? <View style={styles.actionBar}><Text style={styles.selectedCount}>{selected.length} selected</Text><Pressable disabled={working} onPress={() => { if (addToCard) void addToExistingCard(); else setChooseBoardOpen(true); }} style={[styles.addButton, working && styles.disabled]}><Text style={styles.addText}>{addToCard ? 'Add to card' : 'Add'}</Text></Pressable>{!addToCard ? <Pressable disabled={selected.length < 2 || working} accessibilityRole="button" onPress={() => { setMergeBoard(null); setMergeColumnId(null); setMergeTitle(''); setMergeOpen(true); }} style={[styles.mergeButton, (selected.length < 2 || working) && styles.disabled]}><Text style={styles.mergeText}>Merge</Text></Pressable> : null}<Pressable disabled={working} onPress={() => void archive()} style={styles.archiveButton}><Text style={[styles.archiveText, working && styles.muted]}>Archive</Text></Pressable></View> : null}</> : <EmptyState title="Nothing waiting" description="New chat thoughts will appear here until you add them to a board." />}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Modal visible={chooseBoardOpen} transparent animationType="fade" onRequestClose={() => !working && setChooseBoardOpen(false)}><View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => !working && setChooseBoardOpen(false)} /><View style={styles.modal}><Text style={styles.modalTitle}>Add to board</Text>{boards.length ? boards.map((board) => <Pressable key={board.id} disabled={working} onPress={() => void organize(board.id)} style={styles.board}><View style={[styles.boardDot, { backgroundColor: board.accent ?? theme.accent }]} /><Text style={styles.boardName}>{board.name}</Text><Text style={styles.arrow}>›</Text></Pressable>) : <><Text style={styles.modalCopy}>Create a board first, then come back to organize these thoughts.</Text><Pressable onPress={() => { setChooseBoardOpen(false); router.push('/boards'); }} style={styles.createButton}><Text style={styles.addText}>Create a board</Text></Pressable></>}</View></View></Modal>
    <Modal visible={mergeOpen} transparent animationType="slide" onRequestClose={() => !working && setMergeOpen(false)}><View style={styles.modalBackdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => !working && setMergeOpen(false)} /><View style={styles.modal}><Text style={styles.modalTitle}>Merge {selected.length} related thoughts</Text>{!mergeBoard ? <><Text style={styles.modalCopy}>Choose a board.</Text>{boards.map((board) => <Pressable key={board.id} onPress={() => void chooseMergeBoard(board)} style={styles.board}><View style={[styles.boardDot, { backgroundColor: board.accent ?? theme.accent }]} /><Text style={styles.boardName}>{board.name}</Text><Text style={styles.arrow}>›</Text></Pressable>)}</> : <><Text style={styles.modalCopy}>{mergeBoard.name} · choose a column and an optional title.</Text><View style={styles.columnChoices}>{mergeColumns.map((column) => <Pressable key={column.id} onPress={() => setMergeColumnId(column.id)} style={[styles.columnChoice, mergeColumnId === column.id && styles.columnChoiceSelected]}><Text style={styles.columnChoiceText}>{column.name}</Text></Pressable>)}</View><TextInput value={mergeTitle} onChangeText={setMergeTitle} placeholder="Title (optional)" placeholderTextColor={theme.textMuted} style={styles.titleInput} /><Pressable disabled={!mergeColumnId || working} onPress={() => void merge()} style={[styles.createButton, (!mergeColumnId || working) && styles.disabled]}><Text style={styles.addText}>{working ? 'Merging…' : 'Create merged card'}</Text></Pressable></>}</View></View></Modal>
  </Screen>;
}

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  back: { color: tokens.textPrimary, fontSize: 30, lineHeight: 30 }, list: { padding: spacing.md, gap: spacing.xs }, intro: { color: tokens.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm }, message: { height: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: tokens.borderSubtle, borderRadius: 14, backgroundColor: tokens.surface }, messageSelected: { borderColor: tokens.accent, backgroundColor: tokens.surfaceElevated }, messagePressed: { opacity: 0.68 }, check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: tokens.textMuted, alignItems: 'center', justifyContent: 'center' }, checked: { borderColor: tokens.accent, backgroundColor: tokens.accent }, checkText: { color: tokens.accentText, fontWeight: '700' }, messageCopy: { flex: 1, minWidth: 0, justifyContent: 'center' }, messageText: { color: tokens.textPrimary, fontSize: 15, lineHeight: 20 }, messageMeta: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 3 }, actionBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle, backgroundColor: tokens.surface }, selectedCount: { flex: 1, color: tokens.textSecondary, fontSize: 13 }, addButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.sm, backgroundColor: tokens.accent, borderRadius: 9 }, addText: { color: tokens.accentText, fontWeight: '700', fontSize: 13 }, mergeButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.xs }, mergeText: { color: tokens.textSecondary, fontWeight: '600', fontSize: 13 }, archiveButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.xs }, archiveText: { color: tokens.danger, fontWeight: '600', fontSize: 13 }, disabled: { opacity: 0.42 }, muted: { color: tokens.textMuted }, error: { color: '#fff', backgroundColor: tokens.danger, padding: spacing.sm, textAlign: 'center' }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: 'rgba(24,24,23,0.3)' }, modal: { width: '100%', maxWidth: 420, padding: spacing.lg, borderRadius: 18, backgroundColor: tokens.surface }, modalTitle: { color: tokens.textPrimary, fontSize: 19, fontWeight: '700', marginBottom: spacing.md }, modalCopy: { color: tokens.textSecondary, lineHeight: 20, marginBottom: spacing.md }, board: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle }, boardDot: { width: 12, height: 12, borderRadius: 6 }, boardName: { flex: 1, color: tokens.textPrimary, fontSize: 16 }, arrow: { color: tokens.textMuted, fontSize: 25 }, createButton: { alignSelf: 'flex-start', backgroundColor: tokens.accent, borderRadius: 9, paddingHorizontal: spacing.md, minHeight: 42, justifyContent: 'center' }, columnChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, columnChoice: { paddingHorizontal: spacing.sm, minHeight: 36, justifyContent: 'center', borderRadius: 9, backgroundColor: tokens.surfaceElevated }, columnChoiceSelected: { backgroundColor: tokens.surfaceElevated, borderWidth: 1, borderColor: tokens.accent }, columnChoiceText: { color: tokens.textPrimary, fontSize: 13, fontWeight: '600' }, titleInput: { minHeight: 44, borderWidth: 1, borderColor: tokens.borderSubtle, borderRadius: 9, paddingHorizontal: spacing.sm, color: tokens.textPrimary },
});
