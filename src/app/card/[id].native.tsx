import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { AttachmentContent } from '@/components/chat/message-row';
import { MessageContentRenderer } from '@/components/chat/message-note-cards';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { radii, spacing, type ThemeTokens } from '@/constants/theme';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import type { Message } from '@/db/types';

type Detail = { id: string; title: string | null; explicitTitle: string | null; boardId: string; boardName: string; columnId: string; columnName: string; createdAt: number; pinned: number };
const messageFallback = (message: Message) => {
  const attachment = message.attachments[0];
  if (attachment?.type === 'file') return attachment.originalName || 'Attachment';
  if (attachment?.type === 'photo') return 'Photo';
  if (attachment?.type === 'video') return 'Video';
  if (attachment?.type === 'audio') return 'Audio note';
  return `${message.type[0].toUpperCase()}${message.type.slice(1)} attachment`;
};

export default function CardDetailScreen() {
  const database = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const repository = useMemo(() => createBoardRepository(database), [database]);
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { tokens: theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [detail, setDetail] = useState<Detail | null | undefined>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [contentDraft, setContentDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const [nextDetail, nextMessages] = await Promise.all([
      repository.getCardDetail(id),
      repository.listCardMessages(id),
    ]);
    setDetail(nextDetail);
    setTitleDraft(nextDetail?.explicitTitle ?? '');
    setMessages(nextMessages);
    if (nextDetail) void repository.markOpened('card', id);
  }, [id, repository]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const startTitleEdit = () => {
    setTitleDraft(detail?.explicitTitle ?? '');
    setTitleEditing(true);
    setEditingMessageId(null);
    setNotice(null);
  };

  const saveTitle = async () => {
    if (savingEdit) return;
    setSavingEdit(true);
    setNotice(null);
    try {
      const title = titleDraft.trim();
      await repository.updateCardTitle(id, title || null);
      setTitleEditing(false);
      await load();
    } catch {
      setNotice('Chits could not save the card title.');
    } finally {
      setSavingEdit(false);
    }
  };

  const startContentEdit = (message: Message) => {
    if (!message.text && !message.attachments.length) return;
    setContentDraft(message.text ?? '');
    setEditingMessageId(message.id);
    setTitleEditing(false);
    setNotice(null);
  };

  const saveContent = async () => {
    if (!editingMessageId || savingEdit) return;
    const text = contentDraft.trim();
    const editingMessage = messages.find((message) => message.id === editingMessageId);
    if (!text && !editingMessage?.attachments.length) { setNotice('Card content cannot be empty.'); return; }
    setSavingEdit(true);
    setNotice(null);
    try {
      const updatedAt = await messageRepository.updateText(editingMessageId, text);
      setMessages((current) => current.map((message) => message.id === editingMessageId ? { ...message, text, updatedAt } : message));
      setEditingMessageId(null);
    } catch {
      setNotice('Chits could not save the card content.');
    } finally {
      setSavingEdit(false);
    }
  };

  const archive = () => Alert.alert('Archive card?', 'Your original messages remain in Chat.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Archive', onPress: () => void (async () => { await repository.archiveCard(id); router.back(); })() },
  ]);

  const destroy = () => Alert.alert('Delete card?', 'Removing this card does not delete your original messages.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete card', style: 'destructive', onPress: () => void (async () => { await repository.deleteCard(id); router.back(); })() },
  ]);

  if (detail === undefined) return <Screen><Text style={styles.loading}>Loading card…</Text></Screen>;
  if (!detail) return <Screen>
    <AppHeader title="Card details" leading={<IconButton label="Go back" onPress={() => router.back()}><Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} /></IconButton>} />
    <EmptyState title="Card unavailable" description="It may have been archived or deleted." />
  </Screen>;

  const detailDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp);
  const createdLabel = detailDate(detail.createdAt);
  const editedAt = messages.reduce<number | null>((latest, message) => message.updatedAt !== message.createdAt ? Math.max(latest ?? 0, message.updatedAt) : latest, null);
  const firstMessageTitle = messages[0] ? messages[0].text?.trim().slice(0, 120) || messageFallback(messages[0]) : null;
  const displayTitle = messages.length === 1 && detail.explicitTitle?.trim() === firstMessageTitle ? null : detail.explicitTitle;

  return <Screen>
    <AppHeader
      title="Card details"
      leading={<IconButton label="Go back" onPress={() => router.back()}><Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} /></IconButton>}
      trailing={<IconButton label="Open in Chat" onPress={() => router.push(messages[0] ? `/?messageId=${messages[0].id}` : '/')}><Ionicons accessible={false} name="chatbubble-outline" size={22} color={theme.textPrimary} /></IconButton>}
    />
    <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {titleEditing ? <View style={styles.editor}>
          <TextInput autoFocus accessibilityLabel="Card title" value={titleDraft} onChangeText={setTitleDraft} placeholder="Card title" placeholderTextColor={theme.textMuted} maxLength={120} returnKeyType="done" onSubmitEditing={() => void saveTitle()} style={styles.titleInput} />
          <View style={styles.editActions}>
            <Pressable accessibilityRole="button" disabled={savingEdit} onPress={() => void saveTitle()} style={[styles.editSave, { backgroundColor: theme.accent }, savingEdit && styles.disabled]}><Text style={[styles.editSaveText, { color: theme.accentText }]}>{savingEdit ? 'Saving…' : 'Save title'}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={savingEdit} onPress={() => { setTitleDraft(detail.explicitTitle ?? ''); setTitleEditing(false); }} style={styles.editCancel}><Text style={styles.editCancelText}>Cancel</Text></Pressable>
          </View>
        </View> : displayTitle ? <Pressable accessibilityRole="button" accessibilityLabel="Edit card title" onPress={startTitleEdit} style={({ pressed }) => [styles.titleBlock, pressed && styles.pressed]}>
          <Text style={styles.title}>{displayTitle}</Text>
          <View style={styles.editLabel}><Ionicons accessible={false} name="create-outline" size={15} color={theme.accent} /><Text style={styles.editHint}>Edit title</Text></View>
        </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={detail.explicitTitle ? 'Edit card title' : 'Add a card title'} onPress={startTitleEdit} style={({ pressed }) => [styles.addTitle, pressed && styles.pressed]}><Ionicons accessible={false} name={detail.explicitTitle ? 'create-outline' : 'add'} size={17} color={theme.accent} /><Text style={styles.editHint}>{detail.explicitTitle ? 'Edit title' : 'Add title'}</Text></Pressable>}
      </View>

      {notice ? <View accessibilityRole="alert" style={styles.noticePanel}>
        <Ionicons accessible={false} name="information-circle-outline" size={19} color={theme.accent} />
        <View style={styles.noticeCopy}><Text style={styles.notice}>{notice}</Text></View>
      </View> : null}

      <View style={styles.sectionHeader}>
        <View><Text accessibilityRole="header" style={styles.sectionTitle}>CONTENT</Text><Text style={styles.sectionHint}>Changes here also update the original thought in Chat.</Text></View>
        {messages.length > 1 ? <View style={styles.countBadge}><Text style={styles.countText}>{messages.length}</Text></View> : null}
      </View>

      <View style={styles.thoughtList}>
        {messages.map((message, index) => <View key={message.id} style={styles.thought}>
          {messages.length > 1 || (message.text && editingMessageId !== message.id) ? <View style={styles.thoughtHeader}>
            {messages.length > 1 ? <Text style={styles.thoughtLabel}>THOUGHT {index + 1}</Text> : <View />}
            {message.text && editingMessageId !== message.id ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit thought ${index + 1}`} hitSlop={8} onPress={() => startContentEdit(message)} style={styles.inlineEdit}><Ionicons accessible={false} name="create-outline" size={16} color={theme.accent} /><Text style={styles.inlineEditText}>Edit</Text></Pressable> : null}
          </View> : null}
          {editingMessageId === message.id ? <View style={styles.editor}>
            {message.attachments.length ? <View style={styles.attachmentList}>{message.attachments.map((attachment) => <View key={attachment.id} style={styles.cardAttachment}><AttachmentContent attachment={attachment} variant="detail" /></View>)}</View> : null}
            <TextInput autoFocus accessibilityLabel="Card content" multiline value={contentDraft} onChangeText={setContentDraft} placeholder="Write card content" placeholderTextColor={theme.textMuted} textAlignVertical="top" style={styles.contentInput} />
            <View style={styles.editActions}>
              <Pressable accessibilityRole="button" disabled={savingEdit || (!contentDraft.trim() && !message.attachments.length)} onPress={() => void saveContent()} style={[styles.editSave, { backgroundColor: theme.accent }, (savingEdit || (!contentDraft.trim() && !message.attachments.length)) && styles.disabled]}><Text style={[styles.editSaveText, { color: theme.accentText }]}>{savingEdit ? 'Saving…' : 'Save changes'}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={savingEdit} onPress={() => { setEditingMessageId(null); setContentDraft(''); }} style={styles.editCancel}><Text style={styles.editCancelText}>Cancel</Text></Pressable>
            </View>
          </View> : <>
            <MessageContentRenderer message={message} mode="detail" renderAttachments={() => <View style={styles.attachmentList}>{message.attachments.map((attachment) => <View key={attachment.id} style={styles.cardAttachment}><AttachmentContent attachment={attachment} variant="detail" /></View>)}</View>} />
            {!message.text && message.attachments.length ? <Pressable accessibilityRole="button" accessibilityLabel={`Add a description to ${messageFallback(message)}`} onPress={() => startContentEdit(message)} style={styles.addDescription}><Ionicons accessible={false} name="add" size={16} color={theme.accent} /><Text style={styles.inlineEditText}>Add description</Text></Pressable> : null}
          </>}
          {index < messages.length - 1 ? <View style={styles.thoughtDivider} /> : null}
        </View>)}
      </View>

      <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>DETAILS</Text></View>
      <View style={styles.details}>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Board</Text><Text style={styles.detailValue}>{detail.boardName}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Column</Text><Text style={styles.detailValue}>{detail.columnName}</Text></View>
        <View style={styles.detailRow}><Text style={styles.detailLabel}>Created</Text><Text style={styles.detailValue}>{createdLabel}</Text></View>
        {editedAt ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Edited</Text><Text style={styles.detailValue}>{detailDate(editedAt)}</Text></View> : null}
        {detail.pinned ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Pinned</Text><Text style={styles.detailValue}>Yes</Text></View> : null}
      </View>

      <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>CARD ACTIONS</Text></View>
      <View style={styles.cardActions}>
        <Pressable accessibilityRole="button" onPress={archive} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.actionIcon}><Ionicons accessible={false} name="archive-outline" size={20} color={theme.textSecondary} /></View>
          <View style={styles.flexCopy}><Text style={styles.actionTitle}>Archive card</Text><Text style={styles.actionCopy}>Hide it while keeping it recoverable.</Text></View>
          <Ionicons accessible={false} name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        <View style={styles.actionDivider} />
        <Pressable accessibilityRole="button" onPress={destroy} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.dangerIcon}><Ionicons accessible={false} name="trash-outline" size={20} color={theme.danger} /></View>
          <View style={styles.flexCopy}><Text style={styles.deleteTitle}>Delete card</Text><Text style={styles.actionCopy}>Original thoughts remain available in Chat.</Text></View>
          <Ionicons accessible={false} name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
      </View>
    </ScrollView>

  </Screen>;
}

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  loading: { flex: 1, textAlign: 'center', textAlignVertical: 'center', color: tokens.textSecondary },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  hero: { paddingTop: spacing.xs, paddingBottom: spacing.md },
  titleBlock: { alignSelf: 'flex-start' },
  title: { color: tokens.textPrimary, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  editLabel: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  editHint: { color: tokens.accent, fontSize: 12, fontWeight: '700' },
  addTitle: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  editor: { gap: spacing.sm },
  titleInput: { minHeight: 52, borderBottomWidth: 1, borderColor: tokens.accent, color: tokens.textPrimary, fontSize: 24, fontWeight: '700' },
  contentInput: { minHeight: 140, paddingHorizontal: 0, paddingVertical: spacing.xs, borderBottomWidth: 1, borderColor: tokens.accent, color: tokens.textPrimary, fontSize: 17, lineHeight: 27 },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  editSave: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 11 },
  editSaveText: { fontWeight: '700' },
  editCancel: { minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  editCancelText: { color: tokens.textSecondary, fontWeight: '600' },
  noticePanel: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.sm, borderRadius: 12, backgroundColor: tokens.accentSoft },
  noticeCopy: { flex: 1, gap: 4 },
  notice: { color: tokens.textSecondary, fontSize: 13, lineHeight: 18 },
  sectionHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { color: tokens.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  sectionHint: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  countBadge: { minWidth: 28, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 12, backgroundColor: tokens.surfaceElevated },
  countText: { color: tokens.textSecondary, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  flexCopy: { flex: 1, minWidth: 0 },
  thoughtList: { gap: 0 },
  thought: { paddingTop: spacing.sm },
  thoughtHeader: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  thoughtLabel: { color: tokens.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  inlineEdit: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs },
  inlineEditText: { color: tokens.accent, fontSize: 12, fontWeight: '700' },
  attachmentList: { gap: spacing.sm },
  cardAttachment: { overflow: 'hidden', borderRadius: radii.contentCard, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.borderSubtle, backgroundColor: tokens.surface },
  addDescription: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4 },
  thoughtDivider: { height: StyleSheet.hairlineWidth, marginTop: spacing.lg, backgroundColor: tokens.borderSubtle },
  details: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: tokens.borderSubtle },
  detailRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: tokens.borderSubtle },
  detailLabel: { width: 72, color: tokens.textMuted, fontSize: 12, fontWeight: '600' },
  detailValue: { flex: 1, color: tokens.textSecondary, fontSize: 14, lineHeight: 20 },
  cardActions: { overflow: 'hidden', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.borderSubtle, backgroundColor: tokens.surface },
  actionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  actionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: tokens.surfaceElevated },
  dangerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: tokens.surfaceElevated },
  actionTitle: { color: tokens.textPrimary, fontSize: 15, fontWeight: '600' },
  deleteTitle: { color: tokens.danger, fontSize: 15, fontWeight: '700' },
  actionCopy: { color: tokens.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  actionDivider: { height: StyleSheet.hairlineWidth, marginLeft: 66, backgroundColor: tokens.borderSubtle },
  pressed: { opacity: 0.62 },
  disabled: { opacity: 0.55 },
});
