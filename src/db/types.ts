import type { SpaceId } from '../constants/spaces';

export type MessageType = 'text' | 'photo' | 'video' | 'audio' | 'file';

export interface MessageReminderState {
  messageId: string;
  reminderAt: number | null;
  cardId: string | null;
  cardReminderAt: number | null;
}

export interface Message {
  id: string; text: string | null; type: MessageType; createdAt: number; updatedAt: number;
  archivedAt: number | null; pinned: boolean; isHiddenContent: boolean; deletedAt: number | null; attachments: Attachment[];
  // The thought's own pending reminder, including overdue reminders.
  reminderAt?: number | null;
  // organization.reminderAt: the upcoming reminder on the card this thought belongs to (null when none).
  // attachmentCount: every attachment on that card (all its thoughts' plus its own) —
  // the same total the Board card and Card Details show. attachmentPreview: the first
  // few of those, in Card Details' order, for Chat's attachment mosaic.
  organization?: { boardId: string; boardName: string; columnId: string; columnName: string; cardId?: string; reminderAt?: number | null; attachmentCount?: number; attachmentPreview?: AttachmentLike[] } | null;
}

// The fields every attachment-shaped thing has in common, regardless of what it's
// attached to — AttachmentContent (message-row.native.tsx) renders off this shape
// alone, so both a message's Attachment and a card's CardAttachment can share that
// one rendering/viewer implementation.
export interface AttachmentLike {
  id: string; type: MessageType; storagePath: string; originalName: string | null;
  mimeType: string | null; size: number | null; duration: number | null; width: number | null;
  height: number | null; createdAt: number;
}

export interface Attachment extends AttachmentLike { messageId: string; }

// A file the user attached directly inside Card Details — supporting material for
// the card, not a copy of (or replacement for) the original linked thought's own
// "source" attachment. Deliberately narrower than MessageType: card attachments are
// always photo/video/file, never audio or text.
export interface CardAttachment extends Omit<AttachmentLike, 'type'> {
  type: 'photo' | 'video' | 'file';
  cardId: string;
  updatedAt: number;
}

export interface Board {
  id: string; name: string; icon: string | null; accent: string | null; createdAt: number;
  updatedAt: number; archivedAt: number | null; showColumnNavigator: boolean;
}

// A row in the global, cross-board Cards view (Boards | Cards switcher).
// `kind: 'card'` is an organized card — board/column context flattened in
// since it can't be shown there without knowing where it lives, and
// `title`/`preview` already resolve the same fallback chain the board-scoped
// card queries use (CARD_TITLE_SQL). `kind: 'thought'` is a chat thought
// that's pinned but not yet organized into any board/card — it has no
// board/column (both null) but still belongs in the Pinned section, since a
// pin in Chat should surface here too rather than being invisible until the
// user files it away.
export interface CardListItem {
  id: string; kind: 'card' | 'thought'; title: string; preview: string | null;
  boardId: string | null; boardName: string | null; boardAccent: string | null;
  columnId: string | null; columnName: string | null;
  createdAt: number; updatedAt: number; pinned: boolean;
  // True when a thought on this card (or this thought itself) is hidden in
  // Chat: the list shows a covered note instead of its text or media.
  hidden: boolean;
  // Upcoming reminder shown by this list (ms), or null. Chat thought reminders
  // use message_reminders and appear in Calendar.
  reminderAt: number | null;
  photoCount: number; videoCount: number; fileCount: number;
  // The single, deterministic media preview for this card/thought — resolved
  // once, in SQL, by priority (photo > video > audio) across BOTH a card's
  // linked Chat message attachments and its own card_attachments, so the UI
  // never needs to know or care which source it came from (see PHASE: MEDIA
  // THUMBNAILS IN BOARDS > CARDS TAB). `mediaCount` is the total number of
  // photo/video/audio items considered, so the UI can show a "+N" overflow
  // indicator for everything beyond the one shown.
  previewMediaType: 'photo' | 'video' | 'audio' | null;
  thumbnailPath: string | null;
  mediaDuration: number | null;
  mediaCount: number;
}

// A single attachment surfaced in the global Attachments library, regardless of
// whether it lives in `attachments` (linked to a Chat message, optionally
// organized into a card) or `card_attachments` (added directly in Card
// Details) — createAttachmentRepository().list() flattens both sources into
// this one shape so the Attachments screen never needs to know which table an
// item came from. `cardId`/`cardTitle`/`boardName`/`columnName` are null when
// the attachment's source message hasn't been organized into any card yet.
export type AttachmentFilterType = 'photo' | 'video' | 'audio' | 'file';
export interface AttachmentSummary {
  id: string; source: 'message' | 'card'; type: MessageType; storagePath: string;
  originalName: string | null; mimeType: string | null; size: number | null;
  duration: number | null; width: number | null; height: number | null; createdAt: number;
  messageId: string | null; cardId: string | null; cardTitle: string | null;
  boardId: string | null; boardName: string | null; columnId: string | null; columnName: string | null;
}
export interface AttachmentPageOptions { type?: AttachmentFilterType; searchTerm?: string; limit?: number; offset?: number; }
export interface AttachmentPage { items: AttachmentSummary[]; hasMore: boolean; }

export interface PageOptions { limit?: number; offset?: number; }
export interface TimelineCursor { createdAt: number; sortId: string; }
export interface TimelinePageOptions { limit?: number; before?: TimelineCursor | null; }

export const CHAT_TIMELINE_EVENT_TYPES = ['board_created', 'column_created'] as const;
export type TimelineEventType = typeof CHAT_TIMELINE_EVENT_TYPES[number];
export interface TimelineEvent { id: string; type: TimelineEventType; createdAt: number; relatedMessageId: string | null; relatedCardId: string | null; relatedBoardId: string | null; metadata: Record<string, unknown> | null; }
export type TimelineItem = { kind: 'message'; message: Message; createdAt: number } | { kind: 'event'; event: TimelineEvent; createdAt: number };
export interface TimelinePage { items: TimelineItem[]; hasMore: boolean; nextCursor: TimelineCursor | null; }

// A note stuck on a space (Fridge, Desk…). `kind` says which table `noteId`
// is in — a Chat thought or a board card, the same two kinds the Cards view
// shows. x/y are fractions of the room the sticky can move in (see spaces.ts).
export type SpaceNoteKind = 'thought' | 'card';
export interface SpacePlacement {
  id: string; kind: SpaceNoteKind; noteId: string; spaceId: SpaceId;
  x: number; y: number; rotation: number; color: string; zIndex: number; pinnedAt: number;
}
// What a sticky draws. `text` is null while the note is hidden in Chat, so
// neither the board nor a shared image can ever show it; `title` is a card's
// own title, when it has one. `boardId` is a card's board, or for a thought the board it was organized into. `media` is set
// when the note leads with a photo or video (a print) or a recording (a cassette), not a sticky.
export interface PinnedNote extends SpacePlacement { title: string | null; text: string | null; hidden: boolean; boardId: string | null; media: SpaceNoteMedia | null; }
// A note's first photo, video or voice recording, and the words typed with it (null when it was sent alone).
export interface SpaceNoteMedia { attachment: AttachmentLike & { type: 'photo' | 'video' | 'audio' }; messageId: string; caption: string | null; }
// The whole of a stuck note, for the view sheet: where it lives and every
// thought on it (empty while it's hidden in Chat).
// `caption` is a thought's own words, without the "Photo"/"Video" stand-in `text` falls back to.
export interface SpaceNoteDetail { context: string | null; thoughts: { messageId: string; text: string; caption: string | null }[]; }
// A note that can be stuck on a space: a card or an unorganized thought.
export interface SpaceCandidate { kind: SpaceNoteKind; id: string; title: string; context: string | null; hidden: boolean; updatedAt: number; }
