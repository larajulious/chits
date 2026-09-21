import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { deleteAsync } from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageActions } from '@/components/chat/message-actions';
import { AttachmentDraftPreview } from '@/components/chat/attachment-draft-preview';
import { AttachmentPicker, type AttachmentDraft, type AttachmentPickerHandle } from '@/components/chat/attachment-picker';
import { MessageRow } from '@/components/chat/message-row';
import { EmptyState, Screen } from '@/components/ui/primitives';
import { ChatHeader } from '@/components/chat/chat-header';
import { GlassSurface } from '@/components/ui/glass-surface';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { createMessageRepository } from '@/db/repositories';
import type { Message, TimelineCursor, TimelineEvent, TimelineItem } from '@/db/types';

const PAGE_SIZE = 50;
const MIN_COMPOSER_INPUT_HEIGHT = 40;
const MAX_COMPOSER_INPUT_HEIGHT = 112;
type FeedItem = TimelineItem;

function timelineKey(item: TimelineItem) {
  return `${item.kind}:${item.kind === 'message' ? item.message.id : item.event.id}`;
}

function timelineSortId(item: TimelineItem) {
  return `${item.kind === 'message' ? 'm' : 'e'}:${item.kind === 'message' ? item.message.id : item.event.id}`;
}

function compareTimeline(left: TimelineItem, right: TimelineItem) {
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return timelineSortId(left).localeCompare(timelineSortId(right));
}

function mergeTimeline(current: TimelineItem[], additions: TimelineItem[]) {
  const merged: TimelineItem[] = [];
  let currentIndex = 0;
  let additionIndex = 0;
  while (currentIndex < current.length || additionIndex < additions.length) {
    const existing = current[currentIndex];
    const incoming = additions[additionIndex];
    if (!existing) { merged.push(incoming); additionIndex += 1; continue; }
    if (!incoming) { merged.push(existing); currentIndex += 1; continue; }
    if (timelineKey(existing) === timelineKey(incoming)) { merged.push(incoming); currentIndex += 1; additionIndex += 1; continue; }
    if (compareTimeline(existing, incoming) < 0) { merged.push(existing); currentIndex += 1; } else { merged.push(incoming); additionIndex += 1; }
  }
  return merged;
}

function eventCopy(event: TimelineEvent) {
  const metadata = event.metadata ?? {};
  const boardName = typeof metadata.boardName === 'string' ? metadata.boardName : null;
  const columnName = typeof metadata.columnName === 'string' ? metadata.columnName : null;
  if (event.type === 'column_created') return { icon: 'list-outline' as const, text: columnName ? `Column created · ${columnName}${boardName ? `\nin ${boardName}` : ''}` : 'Column created' };
  return { icon: 'folder-outline' as const, text: boardName ? `Board created · ${boardName}` : 'Board created' };
}

function ChitsRow({ event, onPress }: { event: TimelineEvent; onPress: () => void }) { const { tokens: theme } = useTheme(); const copy = eventCopy(event); return <View style={styles.chitsWrap}><Pressable accessibilityRole="button" accessibilityLabel={`Chits: ${copy.text.replace(/\n/g, '. ')}. ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(event.createdAt)}`} onPress={onPress} style={({ pressed }) => [styles.chitsBubble, { backgroundColor: theme.surfaceElevated }, pressed && styles.chitsPressed]}><Ionicons accessible={false} name={copy.icon} size={16} color={theme.textSecondary} /><View style={styles.chitsCopy}><Text style={[styles.chitsText, { color: theme.textSecondary }]}>{copy.text}</Text><Text style={[styles.chitsTime, { color: theme.textMuted }]}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(event.createdAt)}</Text></View></Pressable></View>; }

function dayStart(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function dateLabel(timestamp: number) {
  const difference = (dayStart(Date.now()) - dayStart(timestamp)) / 86_400_000;
  if (difference === 0) return 'Today';
  if (difference === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

export default function ChatScreen() {
  const database = useSQLiteContext();
  const repository = useMemo(() => createMessageRepository(database), [database]);
  const { messageId } = useLocalSearchParams<{ messageId?: string }>();
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { tokens: theme } = useTheme();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<FeedItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const attachmentPickerRef = useRef<AttachmentPickerHandle>(null);
  const attachmentDraftRef = useRef<AttachmentDraft | null>(null);
  const initialLoad = useRef(true);
  const pendingScrollToLatest = useRef(false);
  const nearBottom = useRef(true);
  const loadingMore = useRef(false);
  const hasMoreRef = useRef(true);
  const oldestCursorRef = useRef<TimelineCursor | null>(null);
  const loadingIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotion = useRef(false);
  const loadedOnce = useRef(false);
  const feedRef = useRef<FeedItem[]>([]);
  const focusedScrollRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusedScrollAttempts = useRef(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [showOlderLoading, setShowOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [inputHeight, setInputHeight] = useState(MIN_COMPOSER_INPUT_HEIGHT);
  const [composerHeight, setComposerHeight] = useState(64);
  const [headerHeight, setHeaderHeight] = useState(72);

  const refreshPinned = useCallback(async () => {
    const pinned = await repository.listPinned();
    setPinnedMessages(pinned);
  }, [repository]);

  const loadInitial = useCallback(async () => {
    try {
      const [page, pinned] = await Promise.all([repository.listTimeline({ limit: PAGE_SIZE }), repository.listPinned()]);
      setFeed([...page.items].reverse());
      setPinnedMessages(pinned);
      oldestCursorRef.current = page.nextCursor;
      hasMoreRef.current = page.hasMore;
      setOlderError(false);
    } catch {
      setError('Your thoughts could not be loaded. Please reopen Chits.');
    } finally {
      loadedOnce.current = true;
      setIsInitialLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void loadInitial());
    return () => cancelAnimationFrame(frame);
  }, [loadInitial]);

  useEffect(() => { feedRef.current = feed; }, [feed]);

  useFocusEffect(useCallback(() => {
    if (!loadedOnce.current) return;
    let active = true;
    void Promise.all([repository.listTimeline({ limit: PAGE_SIZE }), repository.listPinned()]).then(([page, pinned]) => {
      if (!active) return;
      setPinnedMessages(pinned);
      const latest = [...page.items].reverse();
      const loadedKeys = new Set(feedRef.current.map(timelineKey));
      if (!latest.some((item) => !loadedKeys.has(timelineKey(item)))) return;
      if (nearBottom.current) pendingScrollToLatest.current = true;
      else setShowJumpToLatest(true);
      setFeed((current) => mergeTimeline(current, latest));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [repository]));

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { reduceMotion.current = enabled; });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => { reduceMotion.current = enabled; });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => {
      setKeyboardVisible(true);
      if (nearBottom.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => { setKeyboardVisible(false); setComposerFocused(false); });
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, []);

  useEffect(() => () => { const pending = attachmentDraftRef.current; if (pending) void pending.remove().catch(() => undefined); }, []);
  useEffect(() => () => {
    if (focusedScrollRetry.current) clearTimeout(focusedScrollRetry.current);
    if (loadingIndicatorTimer.current) clearTimeout(loadingIndicatorTimer.current);
  }, []);

  useEffect(() => {
    if (!messageId) return;
    void repository.getActiveById(messageId).then((message) => {
      if (!message) { setError('That thought is no longer available in Chat.'); return; }
      setFocusedId(message.id);
      setFeed((current) => mergeTimeline(current, [{ kind: 'message' as const, message, createdAt: message.createdAt }]));
    }).catch(() => setError('That thought could not be opened.'));
  }, [messageId, repository]);

  useEffect(() => {
    if (!focusedId) return;
    const index = feed.findIndex((item) => item.kind === 'message' && item.message.id === focusedId);
    if (index < 0) return;
    focusedScrollAttempts.current = 0;
    if (focusedScrollRetry.current) clearTimeout(focusedScrollRetry.current);
    const frame = requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 }));
    return () => cancelAnimationFrame(frame);
  }, [feed, focusedId]);

  const handleScrollToIndexFailed = useCallback(({ index, averageItemLength }: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    const estimatedOffset = Math.max(0, averageItemLength * index);
    listRef.current?.scrollToOffset({ offset: estimatedOffset, animated: false });
    if (focusedScrollAttempts.current >= 2) return;
    focusedScrollAttempts.current += 1;
    if (focusedScrollRetry.current) clearTimeout(focusedScrollRetry.current);
    focusedScrollRetry.current = setTimeout(() => {
      focusedScrollRetry.current = null;
      listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 });
    }, 120);
  }, []);

  const loadOlder = useCallback(async () => {
    if (!hasMoreRef.current || loadingMore.current || !oldestCursorRef.current) return;
    loadingMore.current = true;
    setOlderError(false);
    loadingIndicatorTimer.current = setTimeout(() => setShowOlderLoading(true), 180);
    try {
      const page = await repository.listTimeline({ limit: PAGE_SIZE, before: oldestCursorRef.current });
      if (page.items.length) setFeed((current) => mergeTimeline(current, [...page.items].reverse()));
      oldestCursorRef.current = page.nextCursor ?? oldestCursorRef.current;
      hasMoreRef.current = page.hasMore;
    } catch {
      setOlderError(true);
    } finally {
      loadingMore.current = false;
      if (loadingIndicatorTimer.current) clearTimeout(loadingIndicatorTimer.current);
      loadingIndicatorTimer.current = null;
      setShowOlderLoading(false);
    }
  }, [repository]);

  const scrollToLatest = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: !reduceMotion.current });
    nearBottom.current = true;
    setShowJumpToLatest(false);
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    const canEditEmptyDescription = Boolean(editing?.attachments.length);
    if ((!text && !attachmentDraft && !canEditEmptyDescription) || isSaving) return;
    setIsSaving(true); setError(null);
    try {
      if (editing) {
        const updatedAt = await repository.updateText(editing.id, text);
        setFeed((current) => current.map((item) => item.kind === 'message' && item.message.id === editing.id ? { ...item, message: { ...item.message, text, updatedAt } } : item));
        setEditing(null);
      } else if (attachmentDraft) {
        const staged = attachmentDraft;
        const message = await repository.createAttachmentMessage(staged.attachment, text || null);
        setFeed((current) => mergeTimeline(current, [{ kind: 'message', message, createdAt: message.createdAt }]));
        if (attachmentDraftRef.current === staged) { attachmentDraftRef.current = null; setAttachmentDraft(null); }
        if (nearBottom.current) pendingScrollToLatest.current = true;
      } else {
        const message = await repository.createText(text);
        setFeed((current) => mergeTimeline(current, [{ kind: 'message', message, createdAt: message.createdAt }]));
        if (nearBottom.current) pendingScrollToLatest.current = true;
      }
      setDraft('');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch { setError(editing ? 'Your edit was not saved. Please try again.' : 'Your thought was not saved. Please try again.'); } finally { setIsSaving(false); }
  }, [attachmentDraft, draft, editing, isSaving, repository]);

  const attachmentSelected = useCallback((next: AttachmentDraft) => {
    attachmentDraftRef.current = next;
    setAttachmentDraft(next);
    setComposerFocused(true);
    setError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const removeAttachmentDraft = useCallback(() => {
    const pending = attachmentDraftRef.current;
    attachmentDraftRef.current = null;
    setAttachmentDraft(null);
    if (pending) void pending.remove().catch(() => setError('The temporary attachment could not be removed.'));
  }, []);

  const runAction = useCallback(async (action: (message: Message) => Promise<void>, message: Message) => {
    setSelected(null); setError(null);
    try { await action(message); } catch { setError('That change could not be saved. Please try again.'); }
  }, []);

  const beginEdit = () => { if (!selected) return; if (attachmentDraft) { setSelected(null); setError('Send or remove the attachment draft before editing another thought.'); return; } setDraft(selected.text ?? ''); setEditing(selected); setSelected(null); setComposerFocused(true); requestAnimationFrame(() => inputRef.current?.focus()); };
  const togglePin = (message: Message) => { const pinned = !message.pinned; void runAction(async () => { await repository.setPinned(message.id, pinned); setFeed((current) => current.map((item) => item.kind === 'message' && item.message.id === message.id ? { ...item, message: { ...item.message, pinned } } : item)); await refreshPinned(); void Haptics.selectionAsync(); }, message); };
  const archive = () => { if (!selected) return; const message = selected; void runAction(async () => { await repository.archive(message.id); setFeed((current) => current.filter((item) => item.kind !== 'message' || item.message.id !== message.id)); await refreshPinned(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, message); };
  const addToBoard = () => { if (!selected) return; const message = selected; setSelected(null); router.push(`/unorganized?messageId=${message.id}`); };
  const openPinned = useCallback((message: Message) => { setFocusedId(message.id); setFeed((current) => mergeTimeline(current, [{ kind: 'message', message, createdAt: message.createdAt }])); }, []);
  const remove = () => { if (!selected) return; const message = selected; Alert.alert('Delete thought?', 'This removes it from Chits and from any cards. This can’t be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void runAction(async () => { const removableUris = await repository.deletePermanently(message.id); setFeed((current) => current.filter((item) => item.kind !== 'message' || item.message.id !== message.id)); await refreshPinned(); await Promise.all(removableUris.map((uri) => deleteAsync(uri, { idempotent: true }).catch(() => undefined))); }, message) }]); };
  const openEvent = useCallback((event: TimelineEvent) => { if (event.relatedBoardId) router.push(`/board/${event.relatedBoardId}`); }, [router]);
  const renderFeedItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => <View>{(index === 0 || dayStart(feed[index - 1].createdAt) !== dayStart(item.createdAt)) && <Text style={[styles.dateDivider, { color: theme.textMuted }]}>{dateLabel(item.createdAt)}</Text>}{item.kind === 'message' ? <MessageRow message={item.message} focused={item.message.id === focusedId} onLongPress={setSelected} /> : <ChitsRow event={item.event} onPress={() => openEvent(item.event)} />}</View>, [feed, focusedId, openEvent, theme.textMuted]);
  const hasDraft = Boolean(draft.trim());
  const canSend = hasDraft || Boolean(attachmentDraft) || Boolean(editing?.attachments.length);
  const composerExpanded = composerFocused || Boolean(attachmentDraft) || Boolean(editing) || isRecordingAudio;
  const visibleInputHeight = composerFocused ? inputHeight : MIN_COMPOSER_INPUT_HEIGHT;
  const updateInputHeight = useCallback((height: number) => setInputHeight(Math.max(MIN_COMPOSER_INPUT_HEIGHT, Math.min(MAX_COMPOSER_INPUT_HEIGHT, Math.ceil(height) + spacing.xs))), []);
  const focusComposer = useCallback(() => {
    setComposerFocused(true);
    if (nearBottom.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, []);
  const recordingChanged = useCallback((recording: boolean) => {
    setIsRecordingAudio(recording);
    if (!recording) return;
    inputRef.current?.blur();
    Keyboard.dismiss();
    setComposerFocused(false);
  }, []);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: theme.background }}>
        <View style={styles.timelineLayer} onLayout={() => { if (nearBottom.current) listRef.current?.scrollToEnd({ animated: false }); }}>{!isInitialLoading && feed.length === 0 ? <EmptyState title="What’s on your mind?" description="Send yourself anything. You can organize it later." /> : <FlatList
          ref={listRef} data={feed} keyExtractor={(item) => `${item.kind}-${item.kind === 'message' ? item.message.id : item.event.id}`}
          renderItem={renderFeedItem}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListHeaderComponent={showOlderLoading ? <View accessibilityLabel="Loading older messages" style={styles.olderStatus}><ActivityIndicator size="small" color={theme.textMuted} /></View> : olderError ? <Pressable accessibilityRole="button" accessibilityLabel="Couldn’t load older messages. Retry" onPress={() => void loadOlder()} style={styles.olderStatus}><Text style={[styles.olderError, { color: theme.textSecondary }]}>Couldn’t load older messages. Tap to retry.</Text></Pressable> : null}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScroll={({ nativeEvent }) => { const distance = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y; nearBottom.current = distance < 120; const shouldShowJump = distance > 320; setShowJumpToLatest((current) => current === shouldShowJump ? current : shouldShowJump); if (nativeEvent.contentOffset.y < 240) void loadOlder(); }} scrollEventThrottle={50} contentContainerStyle={[styles.list, { paddingTop: headerHeight, paddingBottom: composerHeight + spacing.lg }]}
          onContentSizeChange={() => { if (initialLoad.current) { listRef.current?.scrollToEnd({ animated: false }); initialLoad.current = false; } else if (pendingScrollToLatest.current) { listRef.current?.scrollToEnd({ animated: !reduceMotion.current }); pendingScrollToLatest.current = false; } }}
        />}
        <LinearGradient pointerEvents="none" accessible={false} colors={[`${theme.background}00`, `${theme.background}10`, `${theme.background}80`, `${theme.background}EF`, theme.background]} locations={[0, 0.2, 0.5, 0.8, 1]} style={[styles.bottomFade, { height: Math.min(composerHeight, MIN_COMPOSER_INPUT_HEIGHT + spacing.sm) }]} />
        {showJumpToLatest ? <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest message" onPress={scrollToLatest} style={({ pressed }) => [styles.jumpToLatest, { bottom: composerHeight + (editing ? 52 : spacing.md), backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, pressed && styles.sendPressed]}><Ionicons accessible={false} name="arrow-down" size={20} color={theme.textPrimary} /></Pressable> : null}
        {editing && <View style={[styles.editing, { bottom: composerHeight + spacing.xs, backgroundColor: theme.surfaceElevated }]}><Text style={[styles.editingText, { color: theme.textSecondary }]}>{editing.attachments.length ? 'Editing description' : 'Editing thought'}</Text><Pressable accessibilityRole="button" onPress={() => { setEditing(null); setDraft(''); }}><Text style={[styles.cancel, { color: theme.accent }]}>Cancel</Text></Pressable></View>}
        <View onLayout={({ nativeEvent }) => setComposerHeight(Math.ceil(nativeEvent.layout.height))} style={[styles.composerDock, { paddingBottom: keyboardVisible ? spacing.xs : Math.max(spacing.sm, insets.bottom + spacing.xxs) }]}>
          {error ? <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: theme.surfaceElevated, borderColor: theme.danger }]}><Ionicons accessible={false} name="alert-circle-outline" size={18} color={theme.danger} /><Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text></View> : null}
          <GlassSurface style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, composerExpanded && styles.composerExpanded, composerFocused && { borderColor: theme.accentBorder }]}> 
            {!isRecordingAudio && attachmentDraft ? <AttachmentDraftPreview draft={attachmentDraft} compact={composerFocused} onRemove={removeAttachmentDraft} /> : null}
            {!isRecordingAudio ? <TextInput ref={inputRef} accessibilityLabel={attachmentDraft || editing?.attachments.length ? 'Attachment description' : 'Message yourself'} value={draft} onChangeText={setDraft} onFocus={focusComposer} onContentSizeChange={({ nativeEvent }) => updateInputHeight(nativeEvent.contentSize.height)} placeholder={attachmentDraft || editing?.attachments.length ? 'Add a description...' : editing ? 'Edit thought...' : 'Message yourself...'} placeholderTextColor={theme.textMuted} selectionColor={theme.accent} cursorColor={theme.accent} multiline maxLength={10000} scrollEnabled={!composerFocused || inputHeight >= MAX_COMPOSER_INPUT_HEIGHT} style={[styles.input, composerExpanded ? styles.inputExpanded : styles.inputCompact, { height: visibleInputHeight, color: theme.textPrimary }]} textAlignVertical={composerExpanded ? 'top' : 'center'} /> : null}
            <View pointerEvents={composerExpanded ? 'auto' : 'box-none'} style={[styles.composerActions, isRecordingAudio ? styles.composerActionsRecording : composerExpanded ? styles.composerActionsExpanded : styles.composerActionsCompact]}><AttachmentPicker ref={attachmentPickerRef} disabled={Boolean(attachmentDraft) || Boolean(editing) || isSaving} onSelected={attachmentSelected} onError={setError} onRecordingChange={recordingChanged} />{!isRecordingAudio ? <Pressable accessibilityRole="button" accessibilityLabel={canSend ? 'Send message' : 'Record audio'} accessibilityState={{ disabled: isSaving }} disabled={isSaving} onPress={() => { if (canSend) void send(); else attachmentPickerRef.current?.startAudio(); }} style={({ pressed }) => [styles.sendButton, { backgroundColor: isSaving ? theme.surfaceElevated : theme.accent }, pressed && styles.sendPressed]}><Ionicons accessible={false} name={canSend ? 'arrow-up' : 'mic-outline'} size={20} color={theme.accentText} /></Pressable> : null}</View>
          </GlassSurface>
        </View>
        <ChatHeader openDrawer={openDrawer} onHeight={setHeaderHeight} pinned={pinnedMessages} onOpenPinned={openPinned} />
        </View>
      <MessageActions message={selected} onDismiss={() => setSelected(null)} onEdit={beginEdit} onPin={togglePin} onAddToBoard={addToBoard} onArchive={archive} onDelete={remove} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, timelineLayer: { flex: 1 }, list: { paddingVertical: spacing.sm }, bottomFade: { position: 'absolute', right: 0, bottom: 0, left: 0 }, olderStatus: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, olderError: { fontSize: 12, lineHeight: 18, textAlign: 'center' }, jumpToLatest: { position: 'absolute', right: spacing.lg, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }, dateDivider: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs }, chitsWrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignItems: 'flex-start' }, chitsBubble: { maxWidth: '88%', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 14 }, chitsPressed: { opacity: 0.58 }, chitsCopy: { flexShrink: 1 }, chitsText: { fontSize: 15, lineHeight: 21 }, chitsTime: { fontSize: 11, marginTop: spacing.xxs }, errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 }, errorText: { flex: 1, fontSize: 13, lineHeight: 18 }, editing: { position: 'absolute', right: spacing.md, left: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 10 }, editingText: { fontSize: 13 }, cancel: { fontSize: 14, fontWeight: '600' }, composerDock: { position: 'absolute', right: 0, bottom: 0, left: 0, paddingHorizontal: spacing.md, paddingTop: spacing.xs }, composer: { alignItems: 'stretch', minHeight: 56, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, composerExpanded: { borderRadius: 20, paddingHorizontal: spacing.sm }, composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, composerActionsCompact: { position: 'absolute', top: spacing.xs, right: spacing.xs, left: spacing.xs }, composerActionsExpanded: { marginTop: spacing.xs }, composerActionsRecording: { minHeight: 56 }, input: { minHeight: MIN_COMPOSER_INPUT_HEIGHT, fontSize: 16, lineHeight: 22, paddingVertical: spacing.xs }, inputCompact: { paddingHorizontal: 48 }, inputExpanded: { paddingHorizontal: spacing.xs }, sendButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 }, sendPressed: { opacity: 0.7 },
});
