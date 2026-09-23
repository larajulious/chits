import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';

import { AttachmentContent } from '@/components/chat/message-row';
import { MessageContentRenderer } from '@/components/chat/message-note-cards';
import { AddCardAttachmentSheet } from '@/components/boards/add-card-attachment-sheet';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, EmptyState, IconButton, Screen, Toast } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { radii, spacing, type ThemeTokens } from '@/constants/theme';
import { tintWithAccent } from '@/constants/board-appearance';
import { createBoardRepository } from '@/db/repositories';
import { persistCardAttachment, removeCardAttachmentFile } from '@/services/card-attachment-storage';
import type { CardAttachment, Message } from '@/db/types';

type Detail = { id: string; title: string | null; explicitTitle: string | null; boardId: string; boardName: string; boardAccent: string | null; columnId: string; columnName: string; createdAt: number; pinned: number; attachmentCount: number };
type Comment = { id: string; cardId: string; text: string; createdAt: number; updatedAt: number };

// The same visible "•••" actions trigger Chat already uses on its own
// attachments (see MediaMetadata / MessageMetadata in message-row.native.tsx
// and message-note-cards.native.tsx) — reused here rather than introduced
// fresh, so card attachments gain a discoverable way into the (already
// existing) Share/Delete menu without a second, drifted control. `onLongPress`
// on AttachmentContent already opens the same menu; this is purely about
// making that entry point visible, matching the established pattern.
function AttachmentActionsButton({ onPress, style, iconColor }: { onPress: () => void; style: StyleProp<ViewStyle>; iconColor: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Attachment actions" hitSlop={8} onPress={onPress} style={style}>
    <Ionicons accessible={false} name="ellipsis-horizontal" size={17} color={iconColor} />
  </Pressable>;
}
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
  const { tokens: theme } = useTheme();
  const { confirm, actionSheet } = useAppDialog();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [detail, setDetail] = useState<Detail | null | undefined>();
  const showCardLoader = useChitsLoading(detail === undefined);
  const [messages, setMessages] = useState<Message[]>([]);
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState('');
  const [cardAttachments, setCardAttachments] = useState<CardAttachment[]>([]);
  const [addAttachmentOpen, setAddAttachmentOpen] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const showAttachmentLoader = useChitsLoading(attachmentBusy);
  const [toast, setToast] = useState<string | null>(null);
  // Computed once at mount, not on every render — a direct Date.now() call inside
  // render is flagged as impure, and "Today" doesn't need to tick live anyway.
  const [renderedAt] = useState(() => Date.now());
  const scrollRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 1800); return () => clearTimeout(timer); }, [toast]);

  const load = useCallback(async () => {
    if (!id) return;
    const [nextDetail, nextMessages, nextComments, nextAttachments] = await Promise.all([
      repository.getCardDetail(id),
      repository.listCardMessages(id),
      repository.listCardComments(id),
      repository.listCardAttachments(id),
    ]);
    setDetail(nextDetail);
    setTitleDraft(nextDetail?.explicitTitle ?? '');
    setMessages(nextMessages);
    setComments(nextComments);
    setCardAttachments(nextAttachments);
    if (nextDetail) void repository.markOpened('card', id);
  }, [id, repository]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const startTitleEdit = () => {
    setTitleDraft(detail?.explicitTitle ?? '');
    setTitleEditing(true);
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

  // Opens the dedicated full-screen editor (see PHASE: FULL-SCREEN CONTENT
  // EDITOR) rather than editing inline — Card Details stays a reading/viewing
  // surface. The edited message reloads its own content by id, so nothing
  // beyond its id needs to travel through the route; the focus-triggered
  // `load()` above picks up the saved change automatically on return.
  const openContentEditor = (message: Message) => {
    if (!message.text && !message.attachments.length) return;
    setNotice(null);
    router.push(`/card/edit-content?messageId=${message.id}`);
  };

  const sendComment = async () => {
    const text = commentDraft.trim();
    if (!text || savingComment) return;
    setSavingComment(true);
    setNotice(null);
    try {
      const comment = await repository.addComment(id, text);
      setComments((current) => [...current, comment]);
      setCommentDraft('');
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    } catch {
      setNotice('Chits could not save that comment.');
    } finally {
      setSavingComment(false);
    }
  };

  // Editing reuses the same sticky composer input rather than opening a second one
  // inline in the list — only its value/handler swap, so there's ever one input.
  const startCommentEdit = (comment: Comment) => { setCommentEditDraft(comment.text); setEditingCommentId(comment.id); setTitleEditing(false); setNotice(null); requestAnimationFrame(() => commentInputRef.current?.focus()); };
  const cancelCommentEdit = () => { setEditingCommentId(null); setCommentEditDraft(''); };

  const saveCommentEdit = async () => {
    if (!editingCommentId || savingComment) return;
    const text = commentEditDraft.trim();
    if (!text) { setNotice('Comment cannot be empty.'); return; }
    setSavingComment(true);
    setNotice(null);
    try {
      const updatedAt = await repository.updateComment(editingCommentId, text);
      setComments((current) => current.map((comment) => comment.id === editingCommentId ? { ...comment, text, updatedAt } : comment));
      setEditingCommentId(null);
    } catch {
      setNotice('Chits could not save that comment.');
    } finally {
      setSavingComment(false);
    }
  };

  const copyComment = async (comment: Comment) => {
    try {
      await Clipboard.setStringAsync(comment.text);
      void Haptics.selectionAsync();
      setToast('Copied to clipboard');
    } catch {
      setNotice('Couldn’t copy. Try again.');
    }
  };

  const deleteComment = (comment: Comment) => {
    const previous = comments;
    setComments((current) => current.filter((item) => item.id !== comment.id));
    void repository.deleteComment(comment.id).catch(() => { setComments(previous); setNotice('Chits could not delete that comment.'); });
  };

  const confirmDeleteComment = (comment: Comment) => confirm({
    type: 'destructive',
    icon: 'trash-outline',
    title: 'Delete comment?',
    message: 'This can’t be undone.',
    confirmText: 'Delete comment',
    onConfirm: () => deleteComment(comment),
  });

  const openCommentActions = (comment: Comment) => actionSheet({
    title: 'Comment',
    options: [
      { label: 'Edit', icon: 'create-outline', onPress: () => startCommentEdit(comment) },
      { label: 'Copy', icon: 'copy-outline', onPress: () => void copyComment(comment) },
      { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => confirmDeleteComment(comment) },
    ],
  });

  // Supporting material for the card itself — never a Chat message, never a Chits
  // talk-back event, and never touches the linked thought's own source attachment.
  const openAddAttachment = () => { setNotice(null); setAddAttachmentOpen(true); };

  const pickCardAttachment = async (kind: 'photo' | 'video' | 'file') => {
    setAddAttachmentOpen(false);
    if (attachmentBusy) return;
    setAttachmentBusy(true);
    setNotice(null);
    try {
      let sourceUri: string;
      let details: { type: 'photo' | 'video' | 'file'; originalName: string | null; mimeType: string | null; size: number | null; width: number | null; height: number | null; duration: number | null };
      if (kind === 'file') {
        const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (!asset?.uri) { setNotice('That file could not be read. Please try another one.'); return; }
        sourceUri = asset.uri;
        details = { type: 'file', originalName: asset.name, mimeType: asset.mimeType ?? null, size: asset.size ?? null, width: null, height: null, duration: null };
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) { setNotice(`${kind === 'photo' ? 'Photo' : 'Video'} library access is needed to attach that item.`); return; }
        const result = await ImagePicker.launchImageLibraryAsync(kind === 'photo' ? {
          mediaTypes: ['images'], quality: 0.82,
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        } : {
          mediaTypes: ['videos'],
          preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
          shouldDownloadFromNetwork: true,
          videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
          videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
        });
        if (result.canceled) return;
        const asset = result.assets?.[0];
        if (!asset?.uri) { setNotice('That media item could not be read. Please try another one.'); return; }
        sourceUri = asset.uri;
        details = { type: kind, originalName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, size: asset.fileSize ?? null, duration: asset.duration ?? null, width: asset.width || null, height: asset.height || null };
      }
      const staged = await persistCardAttachment(id, sourceUri, details);
      try {
        const saved = await repository.addCardAttachment(id, staged.attachment);
        setCardAttachments((current) => [...current, saved]);
      } catch (dbError) {
        await staged.remove();
        throw dbError;
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'That attachment could not be added.');
    } finally {
      setAttachmentBusy(false);
    }
  };

  const shareCardAttachment = async (attachment: CardAttachment) => {
    try {
      if (!await Sharing.isAvailableAsync()) throw new Error();
      await Sharing.shareAsync(attachment.localUri, { mimeType: attachment.mimeType ?? undefined });
    } catch {
      setNotice('This attachment could not be shared.');
    }
  };

  const deleteCardAttachmentNow = async (attachment: CardAttachment) => {
    const previous = cardAttachments;
    setCardAttachments((current) => current.filter((item) => item.id !== attachment.id));
    try {
      await repository.deleteCardAttachment(attachment.id);
      await removeCardAttachmentFile(attachment.localUri);
    } catch {
      setCardAttachments(previous);
      setNotice('Chits could not delete that attachment.');
    }
  };

  const confirmDeleteCardAttachment = (attachment: CardAttachment) => confirm({
    type: 'destructive',
    icon: 'trash-outline',
    title: 'Delete attachment?',
    message: 'This attachment will be removed from this card.',
    confirmText: 'Delete attachment',
    onConfirm: () => void deleteCardAttachmentNow(attachment),
  });

  const openCardAttachmentActions = (attachment: CardAttachment) => actionSheet({
    title: attachment.type === 'file' ? (attachment.originalName ?? 'File') : attachment.type === 'photo' ? 'Photo' : 'Video',
    options: [
      { label: 'Share', icon: 'share-outline', onPress: () => void shareCardAttachment(attachment) },
      { label: 'Delete', icon: 'trash-outline', destructive: true, onPress: () => confirmDeleteCardAttachment(attachment) },
    ],
  });

  const isSameDay = (a: number, b: number) => { const da = new Date(a); const db = new Date(b); return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate(); };
  const commentTimeLabel = (timestamp: number) => {
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);
    return isSameDay(timestamp, renderedAt) ? `Today · ${time}` : `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp)} · ${time}`;
  };

  const archive = () => confirm({
    type: 'default',
    icon: 'archive-outline',
    title: 'Archive card?',
    message: 'You can restore it later from Archive. Your original messages remain in Chat.',
    confirmText: 'Archive card',
    accentColor: detail?.boardAccent ?? null,
    onConfirm: async () => { await repository.archiveCard(id); router.back(); },
  });

  const destroy = () => confirm({
    type: 'destructive',
    icon: 'trash-outline',
    title: 'Delete card?',
    message: 'Removing this card does not delete your original messages — they remain in Chat.',
    confirmText: 'Delete card',
    onConfirm: async () => {
      const removableUris = await repository.deleteCard(id);
      await Promise.all(removableUris.map((uri) => removeCardAttachmentFile(uri)));
      router.back();
    },
  });

  if (detail === undefined) return <Screen>{showCardLoader ? <View style={styles.cardLoader}><ChitsLoader label="Loading card…" /></View> : null}</Screen>;
  if (!detail) return <Screen>
    <AppHeader title="Card details" leading={<IconButton label="Go back" onPress={() => router.back()}><Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} /></IconButton>} />
    <EmptyState title="Card unavailable" description="It may have been archived or deleted." />
  </Screen>;

  const detailDate = (timestamp: number) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(timestamp);
  const createdLabel = detailDate(detail.createdAt);
  const editedAt = messages.reduce<number | null>((latest, message) => message.updatedAt !== message.createdAt ? Math.max(latest ?? 0, message.updatedAt) : latest, null);
  const firstMessageTitle = messages[0] ? messages[0].text?.trim().slice(0, 120) || messageFallback(messages[0]) : null;
  const displayTitle = messages.length === 1 && detail.explicitTitle?.trim() === firstMessageTitle ? null : detail.explicitTitle;

  const singleThoughtEditable = messages.length === 1 && Boolean(messages[0]?.text);

  // The Content card takes its color from the card's own board — same source of
  // truth as the board detail screen — rather than the generic theme accent, so
  // it stays visually tied to where the card lives.
  const contentAccentTint = detail.boardAccent ? tintWithAccent(theme.background, detail.boardAccent, 0.08) : theme.accentSoft;
  const contentAccentBorder = detail.boardAccent ?? theme.accentBorder;
  const contentAccentStrong = detail.boardAccent ?? theme.accentStrong;
  // For solid fills (Save buttons) and the focused-input underline — the full
  // accent rather than the softer "strong" variant, matching what these already
  // used before they followed the board's color (tokens.accent, not accentStrong).
  const contentAccentSolid = detail.boardAccent ?? theme.accent;
  const contentAccentOn = detail.boardAccent ? '#FFFFFF' : theme.accentText;

  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader
      title="Card details"
      leading={<IconButton label="Go back" onPress={() => router.back()}><Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} /></IconButton>}
      trailing={<IconButton label="Open in Chat" onPress={() => router.push(messages[0] ? `/chat?messageId=${messages[0].id}` : '/chat')}><Ionicons accessible={false} name="chatbubble-outline" size={22} color={theme.textPrimary} /></IconButton>}
    />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView ref={scrollRef} style={styles.flex} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          {titleEditing ? <View style={styles.editor}>
            <TextInput autoFocus accessibilityLabel="Card title" value={titleDraft} onChangeText={setTitleDraft} placeholder="Card title" placeholderTextColor={theme.textMuted} maxLength={120} returnKeyType="done" onSubmitEditing={() => void saveTitle()} style={[styles.titleInput, { borderColor: contentAccentSolid }]} />
            <View style={styles.editActions}>
              <Pressable accessibilityRole="button" disabled={savingEdit} onPress={() => void saveTitle()} style={[styles.editSave, { backgroundColor: contentAccentSolid }, savingEdit && styles.disabled]}><Text style={[styles.editSaveText, { color: contentAccentOn }]}>{savingEdit ? 'Saving…' : 'Save title'}</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={savingEdit} onPress={() => { setTitleDraft(detail.explicitTitle ?? ''); setTitleEditing(false); }} style={styles.editCancel}><Text style={styles.editCancelText}>Cancel</Text></Pressable>
            </View>
          </View> : displayTitle ? <Pressable accessibilityRole="button" accessibilityLabel="Edit card title" onPress={startTitleEdit} style={({ pressed }) => [styles.titleRow, pressed && styles.pressed]}>
            <Text style={styles.title}>{displayTitle}</Text>
            <View style={styles.titleEditButton}><Ionicons accessible={false} name="create-outline" size={17} color={contentAccentStrong} /></View>
          </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={detail.explicitTitle ? 'Edit card title' : 'Add a card title'} onPress={startTitleEdit} style={({ pressed }) => [styles.addTitle, pressed && styles.pressed]}><Ionicons accessible={false} name={detail.explicitTitle ? 'create-outline' : 'add'} size={17} color={contentAccentStrong} /><Text style={[styles.editHint, { color: contentAccentStrong }]}>{detail.explicitTitle ? 'Edit title' : 'Add title'}</Text></Pressable>}
        </View>

        {notice ? <View accessibilityRole="alert" style={styles.noticePanel}>
          <Ionicons accessible={false} name="information-circle-outline" size={19} color={theme.accent} />
          <View style={styles.noticeCopy}><Text style={styles.notice}>{notice}</Text></View>
        </View> : null}

        <View style={[styles.contentCard, { backgroundColor: contentAccentTint, borderColor: contentAccentBorder }]}>
          <View style={styles.contentCardHeader}>
            <View style={styles.contentCardTitleRow}>
              <View style={[styles.contentIconMark, { backgroundColor: theme.surface }]}><Ionicons accessible={false} name="document-text-outline" size={14} color={contentAccentStrong} /></View>
              <Text accessibilityRole="header" style={[styles.contentSectionTitle, { color: contentAccentStrong }]}>CONTENT</Text>
            </View>
            {singleThoughtEditable ? <Pressable accessibilityRole="button" accessibilityLabel="Edit content" hitSlop={8} onPress={() => openContentEditor(messages[0])} style={styles.sectionEditButton}><Ionicons accessible={false} name="create-outline" size={16} color={contentAccentStrong} /></Pressable>
              : messages.length > 1 ? <View style={[styles.countBadge, { backgroundColor: theme.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: contentAccentBorder }]}><Text style={styles.countText}>{messages.length}</Text></View> : null}
          </View>
          <Text style={styles.contentSectionHint}>Changes here also update the original thought in Chat.</Text>

          <View style={styles.thoughtList}>
            {messages.map((message, index) => <View key={message.id} style={index > 0 && styles.thought}>
              {messages.length > 1 ? <View style={styles.thoughtHeader}>
                <Text style={styles.thoughtLabel}>THOUGHT {index + 1}</Text>
                {message.text ? <Pressable accessibilityRole="button" accessibilityLabel={`Edit thought ${index + 1}`} hitSlop={8} onPress={() => openContentEditor(message)} style={styles.inlineEdit}><Ionicons accessible={false} name="create-outline" size={16} color={theme.accent} /><Text style={styles.inlineEditText}>Edit</Text></Pressable> : null}
              </View> : null}
              <MessageContentRenderer message={message} mode="detail" accentColor={detail.boardAccent ?? undefined} renderAttachments={() => <View style={styles.attachmentList}>{message.attachments.map((attachment) => <View key={attachment.id} style={styles.cardAttachment}><AttachmentContent attachment={attachment} variant="detail" accentColor={detail.boardAccent ?? undefined} /></View>)}</View>} />
              {!message.text && message.attachments.length ? <Pressable accessibilityRole="button" accessibilityLabel={`Add a description to ${messageFallback(message)}`} onPress={() => openContentEditor(message)} style={styles.addDescription}><Ionicons accessible={false} name="add" size={16} color={theme.accent} /><Text style={styles.inlineEditText}>Add description</Text></Pressable> : null}
              {index < messages.length - 1 ? <View style={styles.thoughtDivider} /> : null}
            </View>)}
          </View>
        </View>

        <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>DETAILS</Text></View>
        <View style={styles.detailsCard}>
          <View style={styles.detailGroup}>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Board</Text><Text style={styles.detailValue}>{detail.boardName}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Column</Text><Text style={styles.detailValue}>{detail.columnName}</Text></View>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailGroup}>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Created</Text><Text style={styles.detailValue}>{createdLabel}</Text></View>
            {editedAt ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Edited</Text><Text style={styles.detailValue}>{detailDate(editedAt)}</Text></View> : null}
            {detail.pinned ? <View style={styles.detailRow}><Text style={styles.detailLabel}>Pinned</Text><Text style={styles.detailValue}>Yes</Text></View> : null}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>ATTACHMENTS</Text>
          {cardAttachments.length ? <View style={styles.countBadge}><Text style={styles.countText}>{cardAttachments.length}</Text></View> : null}
        </View>
        {cardAttachments.length === 0 ? <View style={styles.commentsEmpty}>
          <Text style={styles.commentsEmptyTitle}>No attachments yet.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Add attachment" disabled={attachmentBusy} onPress={openAddAttachment} style={styles.addDescription}>
            {showAttachmentLoader ? <ChitsLoader size="small" /> : <Ionicons accessible={false} name="add" size={16} color={contentAccentStrong} />}
            <Text style={[styles.inlineEditText, { color: contentAccentStrong }]}>Add attachment</Text>
          </Pressable>
        </View> : <>
          {cardAttachments.some((attachment) => attachment.type !== 'file') ? <View style={styles.attachmentGrid}>
            {cardAttachments.filter((attachment) => attachment.type !== 'file').map((attachment) => <View key={attachment.id} style={[styles.cardAttachment, styles.attachmentGridItem]}><AttachmentContent attachment={attachment} variant="board" accentColor={detail.boardAccent ?? undefined} onLongPress={() => openCardAttachmentActions(attachment)} overlay={<AttachmentActionsButton onPress={() => openCardAttachmentActions(attachment)} style={styles.attachmentActionsOverlay} iconColor="#FFFFFF" />} /></View>)}
          </View> : null}
          {cardAttachments.some((attachment) => attachment.type === 'file') ? <View style={[styles.attachmentList, styles.attachmentFileList]}>
            {cardAttachments.filter((attachment) => attachment.type === 'file').map((attachment) => <View key={attachment.id} style={styles.cardAttachment}><AttachmentContent attachment={attachment} variant="detail" accentColor={detail.boardAccent ?? undefined} onLongPress={() => openCardAttachmentActions(attachment)} overlay={<AttachmentActionsButton onPress={() => openCardAttachmentActions(attachment)} style={styles.attachmentActionsInline} iconColor={theme.textMuted} />} /></View>)}
          </View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Add attachment" disabled={attachmentBusy} onPress={openAddAttachment} style={styles.addAttachmentRow}>
            {showAttachmentLoader ? <ChitsLoader size="small" /> : <Ionicons accessible={false} name="add" size={16} color={contentAccentStrong} />}
            <Text style={[styles.inlineEditText, { color: contentAccentStrong }]}>Add attachment</Text>
          </Pressable>
        </>}

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>COMMENTS</Text>
          {comments.length ? <View style={styles.countBadge}><Text style={styles.countText}>{comments.length}</Text></View> : null}
        </View>
        {comments.length === 0 ? <View style={styles.commentsEmpty}>
          <Text style={styles.commentsEmptyTitle}>No comments yet.</Text>
          <Text style={styles.commentsEmptyCopy}>Add context, updates, or notes here.</Text>
        </View> : <View style={styles.commentList}>
          {comments.map((comment, index) => { const isBeingEdited = editingCommentId === comment.id; return <View key={comment.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Comment. ${comment.text} ${commentTimeLabel(comment.createdAt)}${comment.updatedAt !== comment.createdAt ? '. Edited' : ''}.${isBeingEdited ? ' Currently editing.' : ''}`}
              accessibilityHint={isBeingEdited ? undefined : 'Hold for edit, copy, and delete options'}
              onLongPress={isBeingEdited ? undefined : () => openCommentActions(comment)}
              delayLongPress={350}
              style={({ pressed }) => [styles.commentBody, isBeingEdited && styles.commentBeingEdited, pressed && !isBeingEdited && styles.pressed]}
            >
              <Text style={styles.commentText}>{comment.text}</Text>
              <View style={styles.commentMetaRow}>
                <Text style={styles.commentMeta}>{isBeingEdited ? 'Editing…' : `${commentTimeLabel(comment.createdAt)}${comment.updatedAt !== comment.createdAt ? ' · Edited' : ''}`}</Text>
                {isBeingEdited ? null : <Pressable accessibilityRole="button" accessibilityLabel="Comment options" hitSlop={8} onPress={() => openCommentActions(comment)} style={styles.commentMore}><Ionicons accessible={false} name="ellipsis-horizontal" size={16} color={theme.textMuted} /></Pressable>}
              </View>
            </Pressable>
            {index < comments.length - 1 ? <View style={styles.thoughtDivider} /> : null}
          </View>; })}
        </View>}

        <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.sectionTitle}>CARD ACTIONS</Text></View>
        <View style={styles.cardActions}>
          <Pressable accessibilityRole="button" onPress={archive} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
            <Ionicons accessible={false} name="archive-outline" size={18} color={theme.textSecondary} />
            <View style={styles.flexCopy}><Text style={styles.actionTitle}>Archive card</Text><Text style={styles.actionCopy}>Hide it while keeping it recoverable.</Text></View>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable accessibilityRole="button" onPress={destroy} style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
            <Ionicons accessible={false} name="trash-outline" size={18} color={theme.danger} />
            <View style={styles.flexCopy}><Text style={styles.deleteTitle}>Delete card</Text><Text style={styles.actionCopy}>Original thoughts remain available in Chat.</Text></View>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.stickyComposer, { paddingBottom: insets.bottom + spacing.xs, backgroundColor: theme.background, borderTopColor: theme.borderSubtle }]}>
        {editingCommentId ? <View style={styles.composerEditBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel edit" hitSlop={8} onPress={cancelCommentEdit} style={styles.composerEditCancel}><Ionicons accessible={false} name="close" size={16} color={theme.textMuted} /><Text style={styles.composerEditCancelText}>Cancel</Text></Pressable>
          <Text style={styles.composerEditLabel}>Editing comment</Text>
        </View> : null}
        <View style={styles.stickyComposerRow}>
          <TextInput
            ref={commentInputRef}
            accessibilityLabel={editingCommentId ? 'Edit comment' : 'Add a comment'}
            value={editingCommentId ? commentEditDraft : commentDraft}
            onChangeText={editingCommentId ? setCommentEditDraft : setCommentDraft}
            placeholder="Add a comment..."
            placeholderTextColor={theme.textMuted}
            multiline
            style={styles.commentInput}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editingCommentId ? 'Save comment' : 'Send comment'}
            accessibilityState={{ disabled: !(editingCommentId ? commentEditDraft : commentDraft).trim() || savingComment }}
            disabled={!(editingCommentId ? commentEditDraft : commentDraft).trim() || savingComment}
            onPress={() => void (editingCommentId ? saveCommentEdit() : sendComment())}
            style={({ pressed }) => [styles.commentSend, { backgroundColor: (editingCommentId ? commentEditDraft : commentDraft).trim() ? theme.accent : theme.surfaceElevated }, pressed && Boolean((editingCommentId ? commentEditDraft : commentDraft).trim()) && styles.pressed]}
          >
            <Ionicons accessible={false} name={editingCommentId ? 'checkmark' : 'arrow-up'} size={18} color={(editingCommentId ? commentEditDraft : commentDraft).trim() ? theme.accentText : theme.textMuted} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
    <AddCardAttachmentSheet visible={addAttachmentOpen} onClose={() => setAddAttachmentOpen(false)} onPick={(kind) => void pickCardAttachment(kind)} />
    <Toast message={toast} />
  </Screen>;
}

const createStyles = (tokens: ThemeTokens) => StyleSheet.create({
  flex: { flex: 1 },
  loading: { flex: 1, textAlign: 'center', textAlignVertical: 'center', color: tokens.textSecondary },
  cardLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  hero: { paddingTop: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm, alignSelf: 'stretch' },
  title: { flex: 1, color: tokens.textPrimary, fontSize: 30, lineHeight: 37, fontWeight: '800' },
  titleEditButton: { width: 32, height: 32, marginTop: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: tokens.surfaceElevated },
  editHint: { color: tokens.accent, fontSize: 12, fontWeight: '700' },
  addTitle: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  editor: { gap: spacing.sm },
  titleInput: { minHeight: 52, borderBottomWidth: 1, borderColor: tokens.accent, color: tokens.textPrimary, fontSize: 24, fontWeight: '700' },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  editSave: { minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 11 },
  editSaveText: { fontWeight: '700' },
  editCancel: { minHeight: 42, justifyContent: 'center', paddingHorizontal: spacing.sm },
  editCancelText: { color: tokens.textSecondary, fontWeight: '600' },
  noticePanel: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, padding: spacing.sm, marginTop: spacing.md, borderRadius: 12, backgroundColor: tokens.accentSoft },
  noticeCopy: { flex: 1, gap: 4 },
  notice: { color: tokens.textSecondary, fontSize: 13, lineHeight: 18 },
  // Section rhythm: generous gap ABOVE each new section (it's a new object), tight
  // gap between a heading and its own content (they read as one unit).
  sectionHeader: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.xl },
  sectionTitle: { color: tokens.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  sectionEditButton: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.xxs },
  // Content is the one section that should catch the eye first — a tinted card of
  // its own (rather than the plain-on-background treatment every other section
  // uses) with a stronger, iconed label, so it reads as the primary surface on the
  // screen without going as far as a heavy dashboard widget.
  contentCard: { marginTop: spacing.md, padding: spacing.md, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  contentCardHeader: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  contentCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  contentIconMark: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  contentSectionTitle: { color: tokens.textPrimary, fontSize: 13, fontWeight: '800', letterSpacing: 0.6 },
  contentSectionHint: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 3, opacity: 0.85 },
  countBadge: { minWidth: 26, height: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 11, backgroundColor: tokens.surfaceElevated },
  countText: { color: tokens.textSecondary, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  flexCopy: { flex: 1, minWidth: 0 },
  thoughtList: { gap: 0, marginTop: spacing.sm },
  thought: { paddingTop: spacing.sm },
  thoughtHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  thoughtLabel: { color: tokens.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  inlineEdit: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.xs },
  inlineEditText: { color: tokens.accent, fontSize: 12, fontWeight: '700' },
  attachmentList: { gap: spacing.sm },
  cardAttachment: { overflow: 'hidden', borderRadius: radii.contentCard, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.borderSubtle, backgroundColor: tokens.surface },
  // 2-column grid for photo/video thumbnails; file rows stay full-width below
  // (a compact document row doesn't suit a half-width tile).
  attachmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  attachmentGridItem: { width: '47%' },
  attachmentFileList: { marginTop: spacing.sm },
  // Matches Chat's own attachment "•••" trigger exactly (see mediaActions in
  // message-row.native.tsx and `more` in message-note-cards.native.tsx) — an
  // overlay pill for media thumbnails, a plain inline button for file rows.
  attachmentActionsOverlay: { position: 'absolute', top: spacing.xs, right: spacing.xs, width: 36, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.58)' },
  attachmentActionsInline: { width: 36, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  addAttachmentRow: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm },
  addDescription: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 4 },
  thoughtDivider: { height: StyleSheet.hairlineWidth, marginTop: spacing.lg, backgroundColor: tokens.borderSubtle },
  // One compact card, two groups: Board/Column (what it belongs to — more
  // important) separated from Created/Edited (metadata) by a single divider
  // rather than a border under every row, which reads as a settings list.
  detailsCard: { marginTop: spacing.sm, borderRadius: 14, backgroundColor: tokens.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.borderSubtle, paddingHorizontal: spacing.md },
  detailGroup: { paddingVertical: spacing.xxs },
  detailDivider: { height: StyleSheet.hairlineWidth, backgroundColor: tokens.borderSubtle },
  detailRow: { minHeight: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  detailLabel: { width: 72, color: tokens.textMuted, fontSize: 12, fontWeight: '600' },
  detailValue: { flex: 1, color: tokens.textSecondary, fontSize: 14, lineHeight: 20 },
  // Deliberately quieter than the card's own content: no icon chips, smaller
  // type, a plain bordered list rather than a prominent surfaced card.
  cardActions: { marginTop: spacing.sm, overflow: 'hidden', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.borderSubtle },
  actionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  actionTitle: { color: tokens.textPrimary, fontSize: 14, fontWeight: '600' },
  deleteTitle: { color: tokens.danger, fontSize: 14, fontWeight: '600' },
  actionCopy: { color: tokens.textMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  actionDivider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md + 18 + spacing.sm, backgroundColor: tokens.borderSubtle },
  commentsEmpty: { marginTop: spacing.sm, gap: 3 },
  commentsEmptyTitle: { color: tokens.textSecondary, fontSize: 14, fontWeight: '600' },
  commentsEmptyCopy: { color: tokens.textMuted, fontSize: 13, lineHeight: 18 },
  commentList: { marginTop: spacing.sm },
  commentBody: { paddingVertical: spacing.sm, borderRadius: 10 },
  commentBeingEdited: { backgroundColor: tokens.accentSoft, marginHorizontal: -spacing.xs, paddingHorizontal: spacing.xs },
  commentText: { color: tokens.textPrimary, fontSize: 15, lineHeight: 21 },
  commentMetaRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  commentMeta: { color: tokens.textMuted, fontSize: 12 },
  commentMore: { width: 28, height: 24, alignItems: 'center', justifyContent: 'center' },
  // Persistent footer, not scrollable content — a plain flex sibling of the
  // ScrollView inside the KeyboardAvoidingView, so it can never be covered by
  // (or need manual padding to avoid) the keyboard or its own height. Editing an
  // existing comment reuses this same input/row (see composerEditBar) instead of
  // opening a second one inline in the list.
  stickyComposer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  // Cancel sits on the LEFT, deliberately away from Send/Save (bottom-right of the
  // row below) so they're never stacked close enough to mis-tap between them.
  composerEditBar: { minHeight: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxs },
  composerEditCancel: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 28, paddingRight: spacing.xs },
  composerEditCancelText: { color: tokens.textMuted, fontSize: 12, fontWeight: '600' },
  composerEditLabel: { color: tokens.accent, fontSize: 12, fontWeight: '700' },
  stickyComposerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
  commentInput: { flex: 1, minHeight: 36, maxHeight: 120, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 18, backgroundColor: tokens.surfaceElevated, color: tokens.textPrimary, fontSize: 15, lineHeight: 20 },
  commentSend: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  pressed: { opacity: 0.62 },
  disabled: { opacity: 0.55 },
});
