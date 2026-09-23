import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { deleteAsync } from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, BackHandler, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedStyle } from 'react-native-reanimated';

import { AttachmentDraftPreview } from '@/components/chat/attachment-draft-preview';
import { AttachmentPicker, type AttachmentDraft, type AttachmentPickerHandle } from '@/components/chat/attachment-picker';
import { ChatHeader } from '@/components/chat/chat-header';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { MessageActions, getCopyableMessageText } from '@/components/chat/message-actions';
import { MessageRow } from '@/components/chat/message-row';
import { useTheme } from '@/components/theme-provider';
import { CONTENT_RANGE, COMPOSER_RANGE, useChatTransition } from '@/components/navigation/chat-transition';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { GlassSurface } from '@/components/ui/glass-surface';
import { EmptyState, Screen, Toast } from '@/components/ui/primitives';
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

function searchResultPreview(message: Message) {
  if (message.text?.trim()) return message.text.trim();
  const attachment = message.attachments[0];
  if (!attachment) return 'Thought';
  if (attachment.type === 'photo') return 'Photo';
  if (attachment.type === 'video') return 'Video';
  if (attachment.type === 'audio') return 'Audio note';
  return attachment.originalName?.trim() || 'File';
}

function searchResultKind(message: Message): string | null {
  const attachment = message.attachments[0];
  if (!attachment || !message.text?.trim()) return null;
  if (attachment.type === 'photo') return 'Photo';
  if (attachment.type === 'video') return 'Video';
  if (attachment.type === 'audio') return 'Audio note';
  return 'File';
}

function searchResultDateLabel(timestamp: number) {
  return `${dateLabel(timestamp)} · ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp)}`;
}

function SearchResultRow({ item, onPress }: { item: TimelineItem; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  if (item.kind === 'event') {
    const copy = eventCopy(item.event);
    const flatText = copy.text.replace(/\n/g, ' ');
    return <Pressable accessibilityRole="button" accessibilityLabel={`Chits: ${flatText}. ${searchResultDateLabel(item.event.createdAt)}`} onPress={onPress} style={({ pressed }) => [styles.searchResultRow, pressed && styles.searchResultPressed]}>
      <Ionicons accessible={false} name={copy.icon} size={15} color={theme.textMuted} style={styles.searchResultIcon} />
      <View style={styles.searchResultCopy}>
        <Text numberOfLines={2} style={[styles.searchResultText, { color: theme.textMuted }]}>{flatText}</Text>
        <Text style={[styles.searchResultMeta, { color: theme.textMuted }]}>{searchResultDateLabel(item.event.createdAt)}</Text>
      </View>
    </Pressable>;
  }
  const message = item.message;
  const kind = searchResultKind(message);
  const preview = searchResultPreview(message);
  const accessibleKind = kind ? `${kind}. ` : !message.text?.trim() && message.attachments[0] ? `${searchResultPreview(message)}. ` : '';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${accessibleKind}${preview}. ${searchResultDateLabel(message.createdAt)}`} onPress={onPress} style={({ pressed }) => [styles.searchResultRow, pressed && styles.searchResultPressed]}>
    <View style={styles.searchResultCopy}>
      {kind ? <Text style={[styles.searchResultKind, { color: theme.accent }]}>{kind}</Text> : null}
      <Text numberOfLines={2} style={[styles.searchResultText, { color: theme.textPrimary }]}>{preview}</Text>
      <Text style={[styles.searchResultMeta, { color: theme.textMuted }]}>{searchResultDateLabel(message.createdAt)}</Text>
    </View>
  </Pressable>;
}

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
  const { tokens: theme } = useTheme();
  const { confirm } = useAppDialog();
  // Chat's own entrance reveal — see PHASE: REDESIGN CHAT TRANSITION — CONNECTED
  // FLOATING BUTTON. Header + message history read from the SAME shared
  // `progress` value the nav-button transition drives (CONTENT_RANGE), and the
  // composer reads its own, slightly later window (COMPOSER_RANGE) — the moment
  // the traveling Chat-button clone dissolves into it. Driven by `progress`
  // rather than a mount effect, since Chat is a persistent tab that only mounts
  // once ever — a mount effect would only ever play this once.
  const { progress, closeChat } = useChatTransition();
  const contentRevealStyle = useAnimatedStyle(() => {
    const t = interpolate(progress.get(), CONTENT_RANGE, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 8 }] };
  });
  const composerRevealStyle = useAnimatedStyle(() => {
    const t = interpolate(progress.get(), COMPOSER_RANGE, [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateY: (1 - t) * 14 }, { scale: 0.97 + t * 0.03 }] };
  });
  const listRef = useRef<FlatList<FeedItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentPickerRef = useRef<AttachmentPickerHandle>(null);
  const attachmentDraftRef = useRef<AttachmentDraft | null>(null);
  // Initial "land at latest" positioning is gated on three independent readiness
  // signals — data loaded, header measured, composer measured — because
  // contentContainerStyle's paddingBottom is driven by composerHeight: scrolling to
  // end before the composer's real height is known lands short of the true bottom
  // once that height later settles, and nothing re-corrects it afterward. Each
  // signal's own onLayout/onContentSizeChange calls the same gated function, so
  // whichever fires last performs the (single) actual scroll.
  const hasPositionedRef = useRef(false);
  const headerMeasuredRef = useRef(false);
  const composerMeasuredRef = useRef(false);
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
  // Local SQLite hydration is normally too fast to perceive — only show the loader
  // if it genuinely runs long, never for older-history paging or sending (those stay
  // on their own existing, subtler indicators).
  const showInitialLoader = useChitsLoading(isInitialLoading);
  const [showOlderLoading, setShowOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [selected, setSelected] = useState<Message | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [inputMaxed, setInputMaxed] = useState(false);
  const [composerHeight, setComposerHeight] = useState(64);
  const [headerHeight, setHeaderHeight] = useState(72);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TimelineItem[]>([]);
  const [searching, setSearching] = useState(false);
  // Debounced (see handleSearchChange) so this never flashes for an instant query.
  const showSearchLoader = useChitsLoading(searching, { delay: 150, minDuration: 200 });

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

  // Chat is now reached via a push from Boards rather than staying permanently
  // mounted, so an in-progress draft would otherwise be lost every time the user
  // pops back — persist it like chat_title (ChatHeader) so the bottom Chat button
  // restores exactly where the user left off. A debounced write, not one per
  // keystroke; the effect's own cleanup cancels a stale pending write whenever the
  // draft changes again (including the moment a restored draft loads), so a
  // slower-resolving restore can never be clobbered by an earlier empty-draft write.
  useEffect(() => {
    let active = true;
    void database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'chat_draft_text')
      .then((row) => { if (active && row?.value) setDraft(row.value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [database]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_draft_text', draft, Date.now()).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [database, draft]);

  useEffect(() => () => { const pending = attachmentDraftRef.current; if (pending) void pending.remove().catch(() => undefined); }, []);
  useEffect(() => () => {
    if (focusedScrollRetry.current) clearTimeout(focusedScrollRetry.current);
    if (loadingIndicatorTimer.current) clearTimeout(loadingIndicatorTimer.current);
  }, []);

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 1800); return () => clearTimeout(timer); }, [toast]);

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
    const index = feed.findIndex((item) => (item.kind === 'message' && item.message.id === focusedId) || (item.kind === 'event' && item.event.id === focusedId));
    if (index < 0) return;
    focusedScrollAttempts.current = 0;
    if (focusedScrollRetry.current) clearTimeout(focusedScrollRetry.current);
    const frame = requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.45 }));
    return () => cancelAnimationFrame(frame);
  }, [feed, focusedId]);

  // The highlight is meant to be a brief "here it is" cue (search/pinned/deep-link
  // jumps all route through focusedId), not a permanent marker — fades on its own
  // regardless of which of those triggered it.
  useEffect(() => {
    if (!focusedId) return;
    const id = focusedId;
    const timer = setTimeout(() => setFocusedId((current) => current === id ? null : current), 1000);
    return () => clearTimeout(timer);
  }, [focusedId]);

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

  // maintainVisibleContentPosition (needed so loading older history doesn't jump the
  // view) can keep partially re-adjusting the offset for a few frames after an
  // explicit scroll command while content is still settling (row heights measuring,
  // images loading), leaving the newest item peeking out from behind the composer. A
  // single follow-up frame isn't always enough, so keep nudging to the true end
  // (instant, no visible re-animation) for a short chase instead of just once. This
  // is a fix for DYNAMIC settling; the STATIC target itself is fixed by the
  // ListFooterComponent spacer below (see bottomInset), which reserves real,
  // measured list geometry for the composer overlay rather than relying on
  // contentContainerStyle padding, which scrollToEnd doesn't always fully honor.
  const chaseScrollToEnd = useCallback((attempts = 5) => {
    let remaining = attempts;
    const step = () => {
      listRef.current?.scrollToEnd({ animated: false });
      remaining -= 1;
      if (remaining > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  // The one place anything scrolls to the true bottom — initial landing, the
  // down-arrow button, sending a message, and a new item arriving while already near
  // the bottom all route through this, so there's exactly one target calculation.
  const scrollToLatest = useCallback((animated: boolean) => {
    listRef.current?.scrollToEnd({ animated });
    chaseScrollToEnd();
  }, [chaseScrollToEnd]);

  // A message deep-link (opened via a card/board reference) has its own positioning
  // intent — land on that specific message, not the latest — handled entirely by the
  // focusedId scrollToIndex effect below. Skip the "land at latest" flow for it.
  const maybePerformInitialScroll = useCallback(() => {
    if (hasPositionedRef.current || messageId) return;
    if (isInitialLoading || !headerMeasuredRef.current || !composerMeasuredRef.current) return;
    hasPositionedRef.current = true;
    scrollToLatest(false);
  }, [isInitialLoading, messageId, scrollToLatest]);

  const jumpToLatest = useCallback(() => {
    scrollToLatest(!reduceMotion.current);
    nearBottom.current = true;
    setShowJumpToLatest(false);
  }, [scrollToLatest]);

  // Chat-header search: scoped to this Chat timeline only (see
  // repository.searchTimeline) — a separate concern from the global Search screen.
  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    try { setSearchResults(await repository.searchTimeline(term)); }
    catch { setSearchResults([]); }
    finally { setSearching(false); }
  }, [repository]);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = value.trim();
    // Empty query: keep the normal Chat timeline visible rather than showing a
    // "no results" state before the user has typed anything.
    if (!trimmed) { setSearchResults([]); setSearching(false); return; }
    searchTimer.current = setTimeout(() => { void runSearch(trimmed); }, 250);
  }, [runSearch]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSearching(false);
    if (searchTimer.current) { clearTimeout(searchTimer.current); searchTimer.current = null; }
    Keyboard.dismiss();
  }, []);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  // Android hardware back / gesture-nav back always closes search first if it's
  // open, otherwise closes Chat itself via the same transition the header's X
  // button uses — bottom-tabs' default `backBehavior` would otherwise silently
  // switch the active tab on its own, bypassing closeChat() entirely and leaving
  // its shared `progress` value stuck at "open" (see chat-transition.tsx).
  // useFocusEffect, not a plain effect: Chat is a persistent tab that stays
  // mounted even while it isn't the visible one, so a plain effect's listener
  // would keep firing (and wrongly closing/navigating) while the user is on
  // Boards or Archive.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (searchOpen) closeSearch(); else closeChat();
      return true;
    });
    return () => subscription.remove();
  }, [searchOpen, closeSearch, closeChat]));

  const openSearchResult = useCallback((item: TimelineItem) => {
    closeSearch();
    const id = item.kind === 'message' ? item.message.id : item.event.id;
    // Closing search brings the composer back, which re-lays-out timelineLayer —
    // its onLayout auto-snaps to the latest message whenever nearBottom is still
    // true, which it is here (the list never scrolled while search was open). That
    // would silently override this jump the instant it happens, so mark the list
    // as not-near-bottom first: we're intentionally landing on a point in history,
    // not necessarily the latest message.
    nearBottom.current = false;
    // closeSearch also just triggered a keyboard-dismiss animation (the search
    // TextInput unmounting) and the composer's reappearance — both resize the
    // visible viewport over the next couple hundred ms. Scrolling in the same tick
    // races that resize: depending on device/OS animation timing, the target
    // sometimes lands correctly and sometimes doesn't, purely by chance. Waiting
    // for it to settle first makes the landing consistent instead of racy.
    setTimeout(() => {
      // The matched item is already fully loaded (it came straight from the
      // search query) — merge it in directly rather than re-fetching a
      // surrounding range; the existing loadOlder-on-scroll-up keeps backfilling
      // from there as normal.
      setFeed((current) => mergeTimeline(current, [item]));
      setFocusedId(id);
    }, 320);
  }, [closeSearch]);

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
  const copyChat = (message: Message) => {
    const text = getCopyableMessageText(message);
    setSelected(null);
    if (!text) return;
    void Clipboard.setStringAsync(text).then(() => { void Haptics.selectionAsync(); setToast('Copied to clipboard'); }).catch(() => setError('Couldn’t copy. Try again.'));
  };
  const togglePin = (message: Message) => { const pinned = !message.pinned; void runAction(async () => { await repository.setPinned(message.id, pinned); setFeed((current) => current.map((item) => item.kind === 'message' && item.message.id === message.id ? { ...item, message: { ...item.message, pinned } } : item)); await refreshPinned(); void Haptics.selectionAsync(); }, message); };
  const archive = () => { if (!selected) return; const message = selected; void runAction(async () => { await repository.archive(message.id); setFeed((current) => current.filter((item) => item.kind !== 'message' || item.message.id !== message.id)); await refreshPinned(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, message); };
  // Already organized: jump straight to where it lives instead of routing back
  // through "add to board" (which would just re-organize the same thought).
  const addToBoard = () => { if (!selected) return; const message = selected; setSelected(null); if (message.organization) { router.push(`/board/${message.organization.boardId}`); return; } router.push(`/unorganized?messageId=${message.id}`); };
  const openPinned = useCallback((message: Message) => { setFocusedId(message.id); setFeed((current) => mergeTimeline(current, [{ kind: 'message', message, createdAt: message.createdAt }])); }, []);
  const remove = () => {
    if (!selected) return;
    const message = selected;
    confirm({
      type: 'destructive',
      icon: 'trash-outline',
      title: 'Delete thought?',
      message: 'This removes it from Chits and from any cards. This can’t be undone.',
      confirmText: 'Delete thought',
      onConfirm: () => runAction(async () => {
        const removableUris = await repository.deletePermanently(message.id);
        setFeed((current) => current.filter((item) => item.kind !== 'message' || item.message.id !== message.id));
        await refreshPinned();
        await Promise.all(removableUris.map((uri) => deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
      }, message),
    });
  };
  const openEvent = useCallback((event: TimelineEvent) => { if (event.relatedBoardId) router.push(`/board/${event.relatedBoardId}`); }, [router]);
  const renderFeedItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => <View>{(index === 0 || dayStart(feed[index - 1].createdAt) !== dayStart(item.createdAt)) && <Text style={[styles.dateDivider, { color: theme.textMuted }]}>{dateLabel(item.createdAt)}</Text>}{item.kind === 'message' ? <MessageRow message={item.message} focused={item.message.id === focusedId} onLongPress={setSelected} /> : <ChitsRow event={item.event} onPress={() => openEvent(item.event)} />}</View>, [feed, focusedId, openEvent, theme.textMuted]);
  const hasDraft = Boolean(draft.trim());
  const canSend = hasDraft || Boolean(attachmentDraft) || Boolean(editing?.attachments.length);
  const composerExpanded = composerFocused || Boolean(attachmentDraft) || Boolean(editing) || isRecordingAudio;
  // Content size is only consulted to decide whether the (already auto-growing,
  // min/max-height-bound) input needs internal scrolling — it never drives the
  // input's own height. Feeding a live content measurement back into an explicit
  // `height` style is what previously caused the iOS expand/collapse loop: the
  // focus-triggered compact<->expanded padding change alters the input's wrap
  // width, onContentSizeChange reports a new size, that resized the input, which
  // reported another size, forever. A hysteresis band (not just equality) also
  // guards against flapping right at the boundary, since toggling scrollEnabled
  // itself can nudge iOS's reported content size by a few pixels either way.
  const handleContentSizeChange = useCallback((height: number) => {
    setInputMaxed((current) => {
      if (!current && height >= MAX_COMPOSER_INPUT_HEIGHT) return true;
      if (current && height <= MAX_COMPOSER_INPUT_HEIGHT - 8) return false;
      return current;
    });
  }, []);
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
        <View style={styles.timelineLayer} onLayout={() => { maybePerformInitialScroll(); if (hasPositionedRef.current && nearBottom.current) scrollToLatest(false); }}><Animated.View style={[styles.flex, contentRevealStyle]}>{isInitialLoading ? (showInitialLoader ? <View style={styles.initialLoader}><ChitsLoader /></View> : null) : feed.length === 0 ? <EmptyState title="What’s on your mind?" description="Send yourself anything. You can organize it later." /> : <FlatList
          ref={listRef} data={feed} keyExtractor={(item) => `${item.kind}-${item.kind === 'message' ? item.message.id : item.event.id}`}
          renderItem={renderFeedItem}
          // The feed is oldest-first, so a small default render window mounts the
          // wrong end first; render the whole initial page up front so the newest
          // (bottom) rows are already measured by the time we try to land on them.
          initialNumToRender={PAGE_SIZE}
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListHeaderComponent={showOlderLoading ? <View accessibilityLabel="Loading older messages" style={styles.olderStatus}><ActivityIndicator size="small" color={theme.textMuted} /></View> : olderError ? <Pressable accessibilityRole="button" accessibilityLabel="Couldn’t load older messages. Retry" onPress={() => void loadOlder()} style={styles.olderStatus}><Text style={[styles.olderError, { color: theme.textSecondary }]}>Couldn’t load older messages. Tap to retry.</Text></Pressable> : null}
          // The floating composer overlays the list rather than reserving space in
          // the normal layout flow, so the list's own scrollable content must reserve
          // that space itself — as a real footer cell, not contentContainerStyle
          // padding, which scrollToEnd doesn't always fully honor (especially
          // together with maintainVisibleContentPosition). composerHeight already
          // includes the composer's own safe-area bottom padding (it's baked into
          // that view's own measured box), so it isn't added again here — just a
          // small breathing-room gap on top of it.
          ListFooterComponent={<View style={{ height: composerHeight + spacing.md }} />}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScroll={({ nativeEvent }) => {
            const distance = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y;
            nearBottom.current = distance < 120;
            const shouldShowJump = distance > 320;
            setShowJumpToLatest((current) => current === shouldShowJump ? current : shouldShowJump);
            if (nativeEvent.contentOffset.y < 240) void loadOlder();
          }} scrollEventThrottle={50} contentContainerStyle={[styles.list, { paddingTop: headerHeight }]}
          onContentSizeChange={() => {
            maybePerformInitialScroll();
            if (pendingScrollToLatest.current) { scrollToLatest(!reduceMotion.current); pendingScrollToLatest.current = false; return; }
            // FlatList only mounts `initialNumToRender` rows at first — since the feed
            // is oldest-first, that default window renders the OLDEST rows, not the
            // newest ones scrollToEnd actually needs. The remaining rows (including the
            // real bottom) mount and measure over the next several renders, each firing
            // this event again; keep re-anchoring to the end through that settle while
            // the user hasn't scrolled away, or the initial landing falls short.
            if (hasPositionedRef.current && nearBottom.current) listRef.current?.scrollToEnd({ animated: false });
          }}
        />}</Animated.View>
        {searchOpen && searchQuery.trim() ? <View style={[styles.searchOverlay, { backgroundColor: theme.background }]}>
          {showSearchLoader ? <View style={styles.initialLoader}><ChitsLoader size="small" /></View>
          : searchResults.length === 0 ? <View style={[styles.noResults, { paddingTop: headerHeight }]}><Text style={[styles.noResultsText, { color: theme.textSecondary }]}>No matching Chits.</Text></View>
          : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.searchResultsList, { paddingTop: headerHeight }]}>
              {searchResults.map((item) => <SearchResultRow key={timelineKey(item)} item={item} onPress={() => openSearchResult(item)} />)}
            </ScrollView>}
        </View> : null}
        {!searchOpen ? <LinearGradient pointerEvents="none" accessible={false} colors={[`${theme.background}00`, `${theme.background}10`, `${theme.background}80`, `${theme.background}EF`, theme.background]} locations={[0, 0.2, 0.5, 0.8, 1]} style={[styles.bottomFade, { height: Math.min(composerHeight, MIN_COMPOSER_INPUT_HEIGHT + spacing.sm) }]} /> : null}
        {!searchOpen && showJumpToLatest ? <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest message" onPress={jumpToLatest} style={({ pressed }) => [styles.jumpToLatest, { bottom: composerHeight + (editing ? 52 : spacing.md), backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, pressed && styles.sendPressed]}><Ionicons accessible={false} name="arrow-down" size={20} color={theme.textPrimary} /></Pressable> : null}
        {!searchOpen && editing && <View style={[styles.editing, { bottom: composerHeight + spacing.xs, backgroundColor: theme.surfaceElevated }]}><Text style={[styles.editingText, { color: theme.textSecondary }]}>{editing.attachments.length ? 'Editing description' : 'Editing thought'}</Text><Pressable accessibilityRole="button" onPress={() => { setEditing(null); setDraft(''); }}><Text style={[styles.cancel, { color: theme.accent }]}>Cancel</Text></Pressable></View>}
        {!searchOpen ? <Animated.View onLayout={({ nativeEvent }) => { const next = Math.ceil(nativeEvent.layout.height); setComposerHeight((current) => (current === next ? current : next)); composerMeasuredRef.current = true; maybePerformInitialScroll(); }} style={[styles.composerDock, { paddingBottom: keyboardVisible ? spacing.xs : spacing.sm }, composerRevealStyle]}>
          {error ? <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: theme.surfaceElevated, borderColor: theme.danger }]}><Ionicons accessible={false} name="alert-circle-outline" size={18} color={theme.danger} /><Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text></View> : null}
          <GlassSurface style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, composerExpanded && styles.composerExpanded, composerFocused && { borderColor: theme.accentBorder }]}>
            {!isRecordingAudio && attachmentDraft ? <AttachmentDraftPreview draft={attachmentDraft} compact={composerFocused} onRemove={removeAttachmentDraft} /> : null}
            {!isRecordingAudio ? <TextInput ref={inputRef} accessibilityLabel={attachmentDraft || editing?.attachments.length ? 'Attachment description' : 'Message note'} value={draft} onChangeText={setDraft} onFocus={focusComposer} onContentSizeChange={({ nativeEvent }) => handleContentSizeChange(nativeEvent.contentSize.height)} placeholder={attachmentDraft || editing?.attachments.length ? 'Add a description...' : editing ? 'Edit thought...' : 'Message note...'} placeholderTextColor={theme.textMuted} selectionColor={theme.accent} cursorColor={theme.accent} multiline maxLength={10000} scrollEnabled={!composerFocused || inputMaxed} style={[styles.input, composerExpanded ? styles.inputExpanded : styles.inputCompact, composerExpanded ? styles.inputAutoGrow : styles.inputFixed, { color: theme.textPrimary }]} textAlignVertical={composerExpanded ? 'top' : 'center'} /> : null}
            <View pointerEvents={composerExpanded ? 'auto' : 'box-none'} style={[styles.composerActions, isRecordingAudio ? styles.composerActionsRecording : composerExpanded ? styles.composerActionsExpanded : styles.composerActionsCompact]}><AttachmentPicker ref={attachmentPickerRef} disabled={Boolean(attachmentDraft) || Boolean(editing) || isSaving} onSelected={attachmentSelected} onError={setError} onRecordingChange={recordingChanged} />{!isRecordingAudio ? <Pressable accessibilityRole="button" accessibilityLabel={canSend ? 'Send message' : 'Record audio'} accessibilityState={{ disabled: isSaving }} disabled={isSaving} onPress={() => { if (canSend) void send(); else attachmentPickerRef.current?.startAudio(); }} style={({ pressed }) => [styles.sendButton, { backgroundColor: isSaving ? theme.surfaceElevated : theme.accent }, pressed && styles.sendPressed]}><Ionicons accessible={false} name={canSend ? 'arrow-up' : 'mic-outline'} size={20} color={theme.accentText} /></Pressable> : null}</View>
          </GlassSurface>
        </Animated.View> : null}
        <Animated.View style={[styles.headerWrap, contentRevealStyle]}>
          <ChatHeader
            ref={searchInputRef}
            onHeight={(height) => { setHeaderHeight(height); headerMeasuredRef.current = true; maybePerformInitialScroll(); }}
            pinned={pinnedMessages}
            onOpenPinned={openPinned}
            searchOpen={searchOpen}
            searchQuery={searchQuery}
            onOpenSearch={openSearch}
            onCloseSearch={closeSearch}
            onSearchChange={handleSearchChange}
          />
        </Animated.View>
        </View>
      <MessageActions message={selected} onDismiss={() => setSelected(null)} onCopy={copyChat} onEdit={beginEdit} onPin={togglePin} onAddToBoard={addToBoard} onArchive={archive} onDelete={remove} />
      <Toast message={toast} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, timelineLayer: { flex: 1 }, headerWrap: { position: 'absolute', top: 0, left: 0, right: 0 }, initialLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' }, list: { paddingVertical: spacing.sm },
  // Overlays the (still-mounted) FlatList rather than replacing it in the tree —
  // unmounting/remounting the list mid-search would drop its layout cache right
  // when a result tap needs scrollToIndex to work reliably.
  searchOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  searchResultsList: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  searchResultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'transparent' },
  searchResultPressed: { opacity: 0.6 },
  searchResultIcon: { marginTop: 2 },
  searchResultCopy: { flex: 1, minWidth: 0 },
  searchResultKind: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 2 },
  searchResultText: { fontSize: 15, lineHeight: 21 },
  searchResultMeta: { fontSize: 12, marginTop: 3 },
  noResults: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  noResultsText: { fontSize: 14, fontWeight: '500' }, bottomFade: { position: 'absolute', right: 0, bottom: 0, left: 0 }, olderStatus: { minHeight: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md }, olderError: { fontSize: 12, lineHeight: 18, textAlign: 'center' }, jumpToLatest: { position: 'absolute', right: spacing.lg, width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }, dateDivider: { fontSize: 12, fontWeight: '600', textAlign: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs }, chitsWrap: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, alignItems: 'flex-start' }, chitsBubble: { maxWidth: '88%', flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 14 }, chitsPressed: { opacity: 0.58 }, chitsCopy: { flexShrink: 1 }, chitsText: { fontSize: 15, lineHeight: 21 }, chitsTime: { fontSize: 11, marginTop: spacing.xxs }, errorBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 }, errorText: { flex: 1, fontSize: 13, lineHeight: 18 }, editing: { position: 'absolute', right: spacing.md, left: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 10 }, editingText: { fontSize: 13 }, cancel: { fontSize: 14, fontWeight: '600' }, composerDock: { position: 'absolute', right: 0, bottom: 0, left: 0, paddingHorizontal: spacing.md, paddingTop: spacing.xs }, composer: { alignItems: 'stretch', minHeight: 56, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 24, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 }, composerExpanded: { borderRadius: 20, paddingHorizontal: spacing.sm }, composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, composerActionsCompact: { position: 'absolute', top: spacing.xs, right: spacing.xs, left: spacing.xs }, composerActionsExpanded: { marginTop: spacing.xs }, composerActionsRecording: { minHeight: 56 }, input: { fontSize: 16, lineHeight: 22, paddingVertical: spacing.xs }, inputCompact: { paddingHorizontal: 48 }, inputExpanded: { paddingHorizontal: spacing.xs }, inputFixed: { height: MIN_COMPOSER_INPUT_HEIGHT }, inputAutoGrow: { minHeight: MIN_COMPOSER_INPUT_HEIGHT, maxHeight: MAX_COMPOSER_INPUT_HEIGHT }, sendButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 }, sendPressed: { opacity: 0.7 },
});
